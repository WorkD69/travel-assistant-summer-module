const crypto = require('node:crypto');

const express = require('express');

const { ApiError } = require('../../errors');
const { ACTIONS, assertCan, loadTripAccess } = require('../../access/trip-access');
const { createOpaqueToken } = require('../../security/tokens');
const { documentVisible } = require('../../services/document-tokens');
const { accessibleTripWhere, messageVisible } = require('../bot');

function siteTrip(trip, userId) {
  const membership = trip.ownerId === userId
    ? { role: 'organizer', status: 'active' }
    : trip.participants?.find((item) => item.userId === userId) || trip.participants?.[0];
  return {
    id: trip.id,
    title: trip.title,
    route: trip.route || '',
    startDate: trip.startDate?.toISOString().slice(0, 10) || null,
    endDate: trip.endDate?.toISOString().slice(0, 10) || null,
    timezone: trip.timezone,
    type: trip.type,
    status: trip.status,
    role: membership?.role || 'participant',
    membershipStatus: membership?.status === 'active' ? 'member' : membership?.status,
  };
}

function validDate(value, field) {
  const date = new Date(`${String(value || '')}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) || Number.isNaN(date.getTime())) {
    throw new ApiError(422, 'validation_error', `Некорректное поле ${field}.`);
  }
  return date;
}

function validDateTime(value, field) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) throw new ApiError(422, 'validation_error', `Некорректное поле ${field}.`);
  return date;
}

function routePoints(input, tripId) {
  if (input === undefined) return null;
  if (!Array.isArray(input) || input.length < 2 || input.length > 12) {
    throw new ApiError(422, 'validation_error', 'Маршрут должен содержать от 2 до 12 подтверждённых городов.');
  }

  const points = input.map((point, index) => {
    const name = String(point?.name || '').trim();
    const canonicalName = String(point?.canonicalName || '').trim();
    const latitude = Number(point?.latitude);
    const longitude = Number(point?.longitude);
    const sortOrder = Number(point?.sortOrder);
    const source = String(point?.source || 'nominatim').trim();
    if (
      !name || name.length > 180 || !canonicalName || canonicalName.length > 300 ||
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      !Number.isInteger(sortOrder) || sortOrder !== index ||
      !source || source.length > 80
    ) {
      throw new ApiError(422, 'validation_error', `Некорректная подтверждённая точка маршрута ${index + 1}.`);
    }
    return { tripId, name, canonicalName, latitude, longitude, sortOrder, source };
  });

  return points;
}

function tripEvents(input, tripId) {
  if (input === undefined) return null;
  if (!Array.isArray(input) || input.length > 100) {
    throw new ApiError(422, 'validation_error', 'Некорректный список сегментов поездки.');
  }
  return input.map((event, index) => {
    const startsAt = validDateTime(event?.startsAt, `events[${index}].startsAt`);
    const endsAt = event?.endsAt ? validDateTime(event.endsAt, `events[${index}].endsAt`) : null;
    if (endsAt && endsAt < startsAt) throw new ApiError(422, 'validation_error', 'Окончание сегмента раньше его начала.');
    const title = String(event?.title || '').trim();
    if (!title || title.length > 180) throw new ApiError(422, 'validation_error', 'Некорректное название сегмента.');
    return {
      tripId,
      type: String(event?.type || 'other').slice(0, 80),
      title,
      startsAt,
      endsAt,
      status: String(event?.status || 'scheduled').slice(0, 80),
      departure: event?.departure ? String(event.departure).slice(0, 180) : null,
      arrival: event?.arrival ? String(event.arrival).slice(0, 180) : null,
      detail: event?.detail ? String(event.detail).slice(0, 2000) : null,
      source: event?.source ? String(event.source).slice(0, 80) : null,
      reference: event?.reference ? String(event.reference).slice(0, 180) : null,
      sortOrder: Number.isInteger(event?.sortOrder) && event.sortOrder >= 0 ? event.sortOrder : index,
    };
  });
}

function createSiteTripsRouter({ config, prisma, now = () => new Date() }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const userId = req.siteUser.id;
    const rows = await prisma.trip.findMany({
      where: accessibleTripWhere(userId),
      include: { participants: { where: { userId, status: 'active' } } },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    });
    res.json({ items: rows.map((trip) => siteTrip(trip, userId)) });
  });

  router.post('/', async (req, res) => {
    const title = String(req.body?.title || '').trim();
    const route = String(req.body?.route || '').trim();
    if (title.length < 2 || title.length > 160 || route.length > 300) {
      throw new ApiError(422, 'validation_error', 'Проверьте название и маршрут поездки.');
    }
    const startDate = validDate(req.body?.startDate, 'startDate');
    const endDate = validDate(req.body?.endDate, 'endDate');
    if (endDate < startDate) throw new ApiError(422, 'validation_error', 'Дата окончания раньше даты начала.');
    const tripId = `trip-${crypto.randomUUID()}`;
    const events = tripEvents(req.body?.events, tripId) || [];
    const points = routePoints(req.body?.routePoints, tripId) || [];
    const trip = await prisma.$transaction(async (tx) => {
      const created = await tx.trip.create({
        data: {
          id: tripId,
          title,
          route,
          startDate,
          endDate,
          timezone: String(req.body?.timezone || 'Europe/Moscow').slice(0, 100),
          type: req.body?.type === 'personal' ? 'personal' : 'group',
          status: req.body?.status === 'draft' ? 'draft' : 'active',
          ownerId: req.siteUser.id,
        },
        include: { participants: true },
      });
      if (points.length) await tx.routePoint.createMany({ data: points });
      if (events.length) await tx.tripEvent.createMany({ data: events });
      return created;
    });
    res.status(201).json({ trip: siteTrip(trip, req.siteUser.id) });
  });

  router.get('/:trip_id', async (req, res) => {
    const userId = req.siteUser.id;
    const access = await loadTripAccess(prisma, userId, req.params.trip_id);
    const [participants, points, events, allDocuments, allMessages, monitoring, plans, sos] = await Promise.all([
      prisma.participant.findMany({ where: { tripId: access.trip.id, status: 'active' }, include: { user: true }, orderBy: { joinedAt: 'asc' } }),
      prisma.routePoint.findMany({ where: { tripId: access.trip.id }, orderBy: { sortOrder: 'asc' } }),
      prisma.tripEvent.findMany({ where: { tripId: access.trip.id }, orderBy: [{ sortOrder: 'asc' }, { startsAt: 'asc' }] }),
      prisma.document.findMany({ where: { tripId: access.trip.id, status: { not: 'deleted' } }, orderBy: { createdAt: 'desc' } }),
      prisma.message.findMany({ where: { tripId: access.trip.id, ...(access.role === 'organizer' ? {} : { status: 'published' }) }, include: { author: true }, orderBy: { createdAt: 'desc' } }),
      prisma.monitoringSignal.findMany({ where: { tripId: access.trip.id }, orderBy: { occurredAt: 'desc' } }),
      prisma.tripPlan.findMany({ where: { tripId: access.trip.id, ...(access.role === 'organizer' ? {} : { visibility: 'published' }) }, orderBy: { rank: 'asc' } }),
      prisma.sosTicket.findMany({ where: { tripId: access.trip.id, ...(access.role === 'organizer' ? {} : { authorUserId: userId }) }, orderBy: { createdAt: 'desc' } }),
    ]);
    const tripRecord = { ...access.trip, participants: access.membership ? [access.membership] : [] };
    res.json({
      trip: siteTrip(tripRecord, userId),
      routePoints: points.map((item) => ({
        id: item.id, name: item.name, canonicalName: item.canonicalName,
        latitude: item.latitude, longitude: item.longitude, sortOrder: item.sortOrder, source: item.source,
      })),
      participants: participants.map((item) => ({
        id: item.id, userId: item.userId, name: item.displayName || item.user?.name || '', role: item.role, status: item.status,
      })),
      events: events.map((item) => ({
        id: item.id, type: item.type, title: item.title, startsAt: item.startsAt, endsAt: item.endsAt,
        departure: item.departure, arrival: item.arrival, status: item.status, detail: item.detail,
        source: item.source, reference: item.reference, sortOrder: item.sortOrder,
      })),
      documents: allDocuments.filter((item) => documentVisible(item, userId, access.role)).map((item) => ({
        id: item.id, title: item.name, type: item.type, visibility: item.visibility, status: item.status,
        segment: item.segment, uploadedAt: item.createdAt,
      })),
      messages: allMessages.filter((item) => messageVisible(item, userId, access.role)).map((item) => ({
        id: item.id, title: item.title || '', text: item.content, authorName: item.author?.name || '',
        status: item.status, publishedAt: item.publishedAt, isPlanB: Boolean(item.planId),
      })),
      monitoring: monitoring.map((item) => ({
        id: item.id, type: item.type, label: item.label, detail: item.detail, severity: item.severity,
        status: item.status, occurredAt: item.occurredAt,
      })),
      plans: plans.map((item) => ({
        id: item.id, rank: item.rank, strategy: item.strategy, title: item.title, summary: item.summary,
        steps: item.steps, pros: item.pros, cons: item.cons, status: item.status, visibility: item.visibility,
      })),
      sos: sos.map((item) => ({
        id: item.id, number: item.number, category: item.category, description: item.description,
        status: item.status, authorUserId: item.authorUserId, createdAt: item.createdAt,
      })),
    });
  });

  router.patch('/:trip_id', async (req, res) => {
    const access = await loadTripAccess(prisma, req.siteUser.id, req.params.trip_id);
    assertCan(access, ACTIONS.EDIT_TRIP);
    const data = {};
    if (req.body?.title !== undefined) {
      const title = String(req.body.title).trim();
      if (title.length < 2 || title.length > 160) throw new ApiError(422, 'validation_error', 'Некорректное название.');
      data.title = title;
    }
    if (req.body?.route !== undefined) data.route = String(req.body.route).trim().slice(0, 300);
    if (req.body?.startDate !== undefined) data.startDate = validDate(req.body.startDate, 'startDate');
    if (req.body?.endDate !== undefined) data.endDate = validDate(req.body.endDate, 'endDate');
    if (req.body?.status !== undefined && ['draft', 'active', 'completed'].includes(req.body.status)) data.status = req.body.status;
    const events = tripEvents(req.body?.events, access.trip.id);
    const points = routePoints(req.body?.routePoints, access.trip.id);
    const trip = events === null && points === null
      ? await prisma.trip.update({ where: { id: access.trip.id }, data, include: { participants: true } })
      : await prisma.$transaction(async (tx) => {
        const updated = await tx.trip.update({ where: { id: access.trip.id }, data, include: { participants: true } });
        if (points !== null) {
          await tx.routePoint.deleteMany({ where: { tripId: access.trip.id } });
          await tx.routePoint.createMany({ data: points });
        }
        if (events !== null) {
          await tx.tripEvent.deleteMany({ where: { tripId: access.trip.id, startsAt: { gte: now() } } });
          const futureEvents = events.filter((event) => event.startsAt >= now());
          if (futureEvents.length) await tx.tripEvent.createMany({ data: futureEvents });
        }
        return updated;
      });
    res.json({ trip: siteTrip(trip, req.siteUser.id) });
  });

  router.delete('/:trip_id', async (req, res) => {
    const access = await loadTripAccess(prisma, req.siteUser.id, req.params.trip_id);
    assertCan(access, ACTIONS.DELETE_TRIP);
    await prisma.trip.delete({ where: { id: access.trip.id } });
    res.status(204).end();
  });

  router.post('/:trip_id/telegram-link-token', async (req, res) => {
    const access = await loadTripAccess(prisma, req.siteUser.id, req.params.trip_id);
    assertCan(access, ACTIONS.READ_TRIP);
    const token = createOpaqueToken();
    await prisma.telegramLinkToken.create({
      data: {
        tokenHash: token.hash,
        siteUserId: req.siteUser.id,
        expiresAt: new Date(now().getTime() + config.linkTokenTtlSeconds * 1000),
      },
    });
    res.status(201).json({ token: token.raw, expiresIn: config.linkTokenTtlSeconds });
  });

  return router;
}

module.exports = { createSiteTripsRouter, routePoints, siteTrip, tripEvents, validDate, validDateTime };

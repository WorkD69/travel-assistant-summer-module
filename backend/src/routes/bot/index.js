const express = require('express');

const { ApiError } = require('../../errors');
const { ACTIONS, assertCan, loadTripAccess } = require('../../access/trip-access');
const { decodeCursor, pageResult } = require('../../pagination');
const {
  createServiceAuthMiddleware,
  createServiceOnlyMiddleware,
  createTelegramIdentityMiddleware,
} = require('../../security/service-auth');
const { hashToken } = require('../../security/tokens');
const { createDocumentToken, documentVisible, resolveDocumentToken } = require('../../services/document-tokens');
const { listPendingNotifications, markDelivered, markFailed, boundedLimit } = require('../../services/outbox');
const { createSos } = require('../../services/sos');
const {
  mapAssistantContext,
  mapBotUser,
  mapDocument,
  mapEvent,
  mapMessage,
  mapNotificationEvent,
  mapNotificationPreferences,
  mapSos,
  mapTrip,
} = require('./mappers');

const BOT_OPERATION_IDS = Object.freeze([
  'consumeTelegramLinkToken', 'unlinkTelegram', 'getBotMe', 'listBotTrips',
  'listBotTripHistory', 'getBotTrip', 'selectActiveBotTrip', 'getBotTripToday',
  'getBotTripNextEvent', 'listBotTripDocuments', 'createBotDocumentTemporaryLink',
  'listBotTripMessages', 'createBotSos', 'listMyBotSos', 'getMyBotSos',
  'getBotNotificationPreferences', 'updateBotNotificationPreferences',
  'listPendingBotNotifications', 'confirmBotNotificationDelivered',
  'markBotNotificationFailed', 'getBotAssistantContext',
]);

function accessibleTripWhere(userId) {
  return {
    OR: [
      { ownerId: userId },
      { participants: { some: { userId, status: 'active' } } },
    ],
  };
}

function membershipFor(trip, userId) {
  if (trip.ownerId === userId) return { role: 'organizer', status: 'active' };
  return trip.participants?.find((item) => item.userId === userId) || trip.participants?.[0];
}

function mapAccessibleTrip(trip, userId) {
  return mapTrip({ ...trip, membership: membershipFor(trip, userId) });
}

function cursorQuery(raw) {
  if (!raw) return {};
  const decoded = decodeCursor(raw);
  const id = typeof decoded === 'string' ? decoded : decoded?.id;
  if (!id) throw new ApiError(422, 'validation_error', 'Некорректный курсор пагинации.');
  return { cursor: { id }, skip: 1 };
}

function localDate(value, timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
}

function preferencePatch(body) {
  const mapping = {
    segment_reminders: 'segmentReminders', time_changes: 'timeChanges',
    departure_changes: 'departureChanges', delays_cancellations: 'delaysCancellations',
    transfer_changes: 'transferChanges', hotel_changes: 'hotelChanges',
    new_documents: 'newDocuments', invitations: 'invitations', own_sos: 'ownSos',
    violations: 'violations', plan_b: 'planB', organizer_messages: 'organizerMessages',
    quiet_hours_enabled: 'quietHoursEnabled', quiet_hours_start: 'quietHoursStart',
    quiet_hours_end: 'quietHoursEnd', timezone: 'timezone',
  };
  const data = {};
  for (const [key, value] of Object.entries(body || {})) {
    const target = mapping[key];
    if (!target) throw new ApiError(422, 'validation_error', 'Неизвестное поле настроек.');
    if (target === 'timezone') {
      if (typeof value !== 'string' || value.length < 1 || value.length > 100) {
        throw new ApiError(422, 'validation_error', 'Некорректный часовой пояс.');
      }
    } else if (target === 'quietHoursStart' || target === 'quietHoursEnd') {
      if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
        throw new ApiError(422, 'validation_error', 'Некорректное время тихих часов.');
      }
    } else if (typeof value !== 'boolean') {
      throw new ApiError(422, 'validation_error', 'Настройка должна быть логическим значением.');
    }
    data[target] = value;
  }
  return data;
}

function messageVisible(message, userId, role) {
  if (role === 'organizer') return true;
  const audience = message.audience;
  if (!audience || audience === 'all' || audience === 'participants') return true;
  if (Array.isArray(audience)) return audience.includes(userId);
  if (typeof audience === 'object') {
    return Boolean(
      audience.all === true ||
      audience.type === 'all-participants' ||
      audience.user_ids?.includes(userId) ||
      audience.participantIds?.includes(userId) ||
      audience.roles?.includes(role),
    );
  }
  return false;
}

function createBotRouter({ config, prisma, now = () => new Date() }) {
  const router = express.Router();
  const linked = createServiceAuthMiddleware(config, prisma);
  const telegramIdentity = createTelegramIdentityMiddleware(config);
  const serviceOnly = createServiceOnlyMiddleware(config);

  router.use((req, _res, next) => { req.botContract = true; next(); });

  router.post('/api/integrations/telegram/link-token/consume', telegramIdentity, async (req, res) => {
    const rawToken = String(req.body?.token || '');
    if (rawToken.length < 16 || rawToken.length > 256) {
      throw new ApiError(422, 'link_token_invalid', 'Код привязки недействителен.');
    }
    const result = await prisma.$transaction(async (tx) => {
      const token = await tx.telegramLinkToken.findUnique({
        where: { tokenHash: hashToken(rawToken) },
        include: { siteUser: true },
      });
      if (!token) throw new ApiError(422, 'link_token_invalid', 'Ссылка недействительна. Вернитесь на сайт и создайте новую ссылку подключения.');
      if (token.consumedAt) throw new ApiError(409, 'link_token_used', 'Эта ссылка уже была использована. Проверьте статус подключения на сайте или создайте новую ссылку.');
      if (token.expiresAt <= now()) throw new ApiError(422, 'link_token_expired', 'Ссылка устарела. Вернитесь на сайт и создайте новую ссылку подключения.');
      const [byTelegram, bySite] = await Promise.all([
        tx.telegramAccountLink.findUnique({ where: { telegramUserId: req.telegramUserId } }),
        tx.telegramAccountLink.findUnique({ where: { siteUserId: token.siteUserId } }),
      ]);
      if (byTelegram && !byTelegram.revokedAt && byTelegram.siteUserId !== token.siteUserId) {
        throw new ApiError(409, 'link_conflict', 'Telegram уже привязан к другому аккаунту.');
      }
      if (bySite && !bySite.revokedAt && bySite.telegramUserId !== req.telegramUserId) {
        throw new ApiError(409, 'link_conflict', 'Аккаунт уже привязан к другому Telegram.');
      }
      const claimedAt = now();
      const claimed = await tx.telegramLinkToken.updateMany({
        where: { id: token.id, consumedAt: null, expiresAt: { gt: claimedAt } },
        data: { consumedAt: claimedAt },
      });
      if (claimed.count !== 1) {
        throw new ApiError(409, 'link_token_used', 'Код привязки уже использован.');
      }
      const relinked = Boolean(byTelegram?.revokedAt || bySite?.revokedAt);
      if (byTelegram && byTelegram.siteUserId === token.siteUserId) {
        await tx.telegramAccountLink.update({ where: { id: byTelegram.id }, data: { revokedAt: null, linkedAt: now() } });
      } else if (bySite && bySite.telegramUserId === req.telegramUserId) {
        await tx.telegramAccountLink.update({ where: { id: bySite.id }, data: { revokedAt: null, linkedAt: now() } });
      } else {
        await tx.telegramAccountLink.create({ data: { telegramUserId: req.telegramUserId, siteUserId: token.siteUserId } });
      }
      return { site_user_id: token.siteUserId, name: token.siteUser.name, relinked };
    });
    res.json(result);
  });

  router.delete('/api/integrations/telegram', linked, async (req, res) => {
    await prisma.telegramAccountLink.update({
      where: { telegramUserId: req.telegramIdentity.telegramUserId },
      data: { revokedAt: now() },
    });
    res.status(204).end();
  });

  router.get('/api/bot/me', linked, async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.telegramIdentity.siteUser.id }, include: { botState: true },
    });
    res.json(mapBotUser(user));
  });

  async function listTrips(req, res, history) {
    const userId = req.telegramIdentity.siteUser.id;
    const limit = boundedLimit(req.query.limit ?? 20);
    const rows = await prisma.trip.findMany({
      where: {
        ...accessibleTripWhere(userId),
        status: history ? 'completed' : { not: 'completed' },
      },
      include: { participants: { where: { userId, status: 'active' } } },
      orderBy: [{ startDate: history ? 'desc' : 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...cursorQuery(req.query.cursor),
    });
    const page = pageResult(rows, limit, (row) => ({ id: row.id }));
    res.json({ items: page.items.map((trip) => mapAccessibleTrip(trip, userId)), next_cursor: page.next_cursor });
  }
  router.get('/api/bot/trips', linked, (req, res) => listTrips(req, res, false));
  router.get('/api/bot/trips/history', linked, (req, res) => listTrips(req, res, true));

  router.get('/api/bot/trips/:trip_id', linked, async (req, res) => {
    const userId = req.telegramIdentity.siteUser.id;
    const access = await loadTripAccess(prisma, userId, req.params.trip_id);
    res.json(mapAccessibleTrip({ ...access.trip, participants: access.membership ? [access.membership] : [] }, userId));
  });

  router.post('/api/bot/trips/:trip_id/select-active', linked, async (req, res) => {
    const userId = req.telegramIdentity.siteUser.id;
    const access = await loadTripAccess(prisma, userId, req.params.trip_id);
    if (access.role === 'viewer') throw new ApiError(403, 'access_denied', 'Недостаточно прав.');
    await prisma.botUserState.upsert({
      where: { siteUserId: userId },
      create: { siteUserId: userId, activeTripId: access.trip.id },
      update: { activeTripId: access.trip.id },
    });
    res.status(204).end();
  });

  router.get('/api/bot/trips/:trip_id/today', linked, async (req, res) => {
    const userId = req.telegramIdentity.siteUser.id;
    const access = await loadTripAccess(prisma, userId, req.params.trip_id);
    const events = await prisma.tripEvent.findMany({
      where: { tripId: access.trip.id }, include: { document: true }, orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    const date = localDate(now(), access.trip.timezone);
    res.json({ items: events.filter((event) => localDate(event.startsAt, access.trip.timezone) === date).map(mapEvent) });
  });

  router.get('/api/bot/trips/:trip_id/next', linked, async (req, res) => {
    const userId = req.telegramIdentity.siteUser.id;
    const access = await loadTripAccess(prisma, userId, req.params.trip_id);
    const event = await prisma.tripEvent.findFirst({
      where: { tripId: access.trip.id, startsAt: { gte: now() }, status: { not: 'cancelled' } },
      include: { document: true }, orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    res.json({ event: event ? mapEvent(event) : null });
  });

  router.get('/api/bot/trips/:trip_id/documents', linked, async (req, res) => {
    const userId = req.telegramIdentity.siteUser.id;
    const access = await loadTripAccess(prisma, userId, req.params.trip_id);
    const limit = boundedLimit(req.query.limit ?? 20);
    const rows = await prisma.document.findMany({
      where: { tripId: access.trip.id, status: { notIn: ['deleted', 'revoked'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: limit + 1, ...cursorQuery(req.query.cursor),
    });
    const visible = rows.filter((document) => documentVisible(document, userId, access.role));
    const page = pageResult(visible, limit, (row) => ({ id: row.id }));
    res.json({ items: page.items.map(mapDocument), next_cursor: page.next_cursor });
  });

  router.post('/api/bot/documents/:document_id/temporary-link', linked, async (req, res) => {
    const userId = req.telegramIdentity.siteUser.id;
    const document = await prisma.document.findUnique({ where: { id: req.params.document_id } });
    if (!document) throw new ApiError(404, 'not_found', 'Документ не найден.');
    const access = await loadTripAccess(prisma, userId, document.tripId);
    const raw = await createDocumentToken(prisma, {
      document, userId, role: access.role, ttlSeconds: config.documentTokenTtlSeconds, now: now(),
    });
    const baseUrl = config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
    res.json({ url: `${baseUrl}/api/documents/download/${raw}`, filename: document.name, title: document.name });
  });

  router.get('/api/documents/download/:token', async (req, res) => {
    const document = await resolveDocumentToken(prisma, req.params.token, now());
    const safeName = document.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'document';
    res.set('Content-Type', document.mimeType || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${safeName}"`);
    res.send(document.blob.bytes);
  });

  router.get('/api/bot/trips/:trip_id/messages', linked, async (req, res) => {
    const userId = req.telegramIdentity.siteUser.id;
    const access = await loadTripAccess(prisma, userId, req.params.trip_id);
    const limit = boundedLimit(req.query.limit ?? 20);
    const rows = await prisma.message.findMany({
      where: { tripId: access.trip.id, status: 'published' }, include: { author: true },
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }], take: limit + 1, ...cursorQuery(req.query.cursor),
    });
    const visible = rows.filter((message) => messageVisible(message, userId, access.role));
    const page = pageResult(visible, limit, (row) => ({ id: row.id }));
    res.json({ items: page.items.map(mapMessage), next_cursor: page.next_cursor });
  });

  router.post('/api/bot/trips/:trip_id/sos', linked, async (req, res) => {
    const userId = req.telegramIdentity.siteUser.id;
    const access = await loadTripAccess(prisma, userId, req.params.trip_id);
    assertCan(access, ACTIONS.CREATE_OWN_SOS);
    const ticket = await createSos(prisma, {
      userId,
      telegramUserId: req.telegramIdentity.telegramUserId,
      tripId: access.trip.id,
      category: req.body?.category,
      description: req.body?.description,
      segmentId: req.body?.segment_id,
      idempotencyKey: req.get('Idempotency-Key'),
    });
    res.status(201).json(mapSos(ticket));
  });

  router.get('/api/bot/trips/:trip_id/sos/mine', linked, async (req, res) => {
    const userId = req.telegramIdentity.siteUser.id;
    const access = await loadTripAccess(prisma, userId, req.params.trip_id);
    assertCan(access, ACTIONS.READ_OWN_SOS);
    const limit = boundedLimit(req.query.limit ?? 20);
    const rows = await prisma.sosTicket.findMany({
      where: { tripId: access.trip.id, authorUserId: userId }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit + 1, ...cursorQuery(req.query.cursor),
    });
    const page = pageResult(rows, limit, (row) => ({ id: row.id }));
    res.json({ items: page.items.map(mapSos), next_cursor: page.next_cursor });
  });

  router.get('/api/bot/sos/:sos_id', linked, async (req, res) => {
    const userId = req.telegramIdentity.siteUser.id;
    const ticket = await prisma.sosTicket.findFirst({ where: { id: req.params.sos_id, authorUserId: userId } });
    if (!ticket) throw new ApiError(404, 'not_found', 'SOS не найден.');
    await loadTripAccess(prisma, userId, ticket.tripId);
    res.json(mapSos(ticket));
  });

  router.get('/api/bot/notification-preferences', linked, async (req, res) => {
    const siteUserId = req.telegramIdentity.siteUser.id;
    const preferences = await prisma.notificationPreference.upsert({
      where: { siteUserId }, create: { siteUserId }, update: {},
    });
    res.json(mapNotificationPreferences(preferences));
  });

  router.patch('/api/bot/notification-preferences', linked, async (req, res) => {
    const siteUserId = req.telegramIdentity.siteUser.id;
    const data = preferencePatch(req.body);
    const preferences = await prisma.notificationPreference.upsert({
      where: { siteUserId }, create: { siteUserId, ...data }, update: data,
    });
    res.json(mapNotificationPreferences(preferences));
  });

  router.get('/api/bot/notifications/pending', serviceOnly, async (req, res) => {
    const page = await listPendingNotifications(prisma, { limit: req.query.limit, cursor: req.query.cursor, now: now() });
    res.json({ items: page.items.map(mapNotificationEvent), next_cursor: page.next_cursor });
  });
  router.post('/api/bot/notifications/:notification_id/delivered', serviceOnly, async (req, res) => {
    await markDelivered(prisma, req.params.notification_id, now());
    res.status(204).end();
  });
  router.post('/api/bot/notifications/:notification_id/failed', serviceOnly, async (req, res) => {
    const reason = String(req.body?.reason || '');
    if (reason.length > 500) throw new ApiError(422, 'validation_error', 'Причина слишком длинная.');
    await markFailed(prisma, req.params.notification_id, reason, now());
    res.status(204).end();
  });

  router.get('/api/bot/trips/:trip_id/assistant-context', linked, async (req, res) => {
    const userId = req.telegramIdentity.siteUser.id;
    const access = await loadTripAccess(prisma, userId, req.params.trip_id);
    assertCan(access, ACTIONS.USE_ASSISTANT);
    const documentWhere = { tripId: access.trip.id, status: { notIn: ['deleted', 'revoked'] } };
    const [events, allDocuments, allMessages, ownSos, changes] = await Promise.all([
      prisma.tripEvent.findMany({ where: { tripId: access.trip.id }, include: { document: true }, orderBy: { startsAt: 'asc' }, take: 100 }),
      prisma.document.findMany({ where: documentWhere, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.message.findMany({ where: { tripId: access.trip.id, status: 'published' }, include: { author: true }, orderBy: { publishedAt: 'desc' }, take: 100 }),
      prisma.sosTicket.findMany({ where: { tripId: access.trip.id, authorUserId: userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.monitoringSignal.findMany({ where: { tripId: access.trip.id, status: 'confirmed' }, orderBy: { occurredAt: 'desc' }, take: 20 }),
    ]);
    const trip = { ...access.trip, participants: access.membership ? [access.membership] : [] };
    res.json(mapAssistantContext({
      trip: { ...trip, membership: membershipFor(trip, userId) },
      events,
      documents: allDocuments.filter((document) => documentVisible(document, userId, access.role)),
      messages: allMessages.filter((message) => messageVisible(message, userId, access.role)),
      ownSos,
      recentChanges: changes.map((change) => change.detail || change.label),
    }));
  });

  return router;
}

module.exports = {
  BOT_OPERATION_IDS,
  accessibleTripWhere,
  createBotRouter,
  localDate,
  messageVisible,
  preferencePatch,
};

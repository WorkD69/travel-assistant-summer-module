const crypto = require('node:crypto');

const express = require('express');
const multer = require('multer');

const { ApiError } = require('../../errors');
const { ACTIONS, assertCan, loadTripAccess, scopeChildToTrip } = require('../../access/trip-access');
const { generatePlans } = require('../../services/plan-b');
const { createSos } = require('../../services/sos');
const { createOpaqueToken } = require('../../security/tokens');

const UPLOAD_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'text/plain']);
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: 5 * 1024 * 1024 } });

function requireText(value, min, max, message) {
  const text = String(value || '').trim();
  if (text.length < min || text.length > max) throw new ApiError(422, 'validation_error', message);
  return text;
}

async function activeTelegramRecipients(tx, tripId, excludedUserId) {
  const participants = await tx.participant.findMany({
    where: { tripId, status: 'active', userId: { not: excludedUserId } },
    include: { user: { include: { telegramLink: true } } },
  });
  return participants
    .map((item) => ({ userId: item.userId, link: item.user?.telegramLink }))
    .filter((item) => item.link && !item.link.revokedAt);
}

async function enqueuePublishedMessage(tx, trip, message, authorUserId) {
  const recipients = await activeTelegramRecipients(tx, trip.id, authorUserId);
  for (const recipient of recipients) {
    await tx.notificationEvent.create({
      data: {
        eventId: `message:${message.id}:${recipient.link.telegramUserId}`,
        recipientTelegramId: recipient.link.telegramUserId,
        recipientSiteUserId: recipient.userId,
        tripId: trip.id,
        type: message.planId ? 'plan_b_published' : 'organizer_message',
        payload: {
          trip_title: trip.title,
          title: message.title,
          what_changed: message.content,
          occurred_at: (message.publishedAt || message.createdAt).toISOString(),
          source: 'backend',
          deep_link_target: 'messages',
        },
      },
    });
  }
}

function createSiteOperationsRouter({ prisma, now = () => new Date() }) {
  const router = express.Router();

  router.post('/:trip_id/invitations', async (req, res) => {
    const access = await loadTripAccess(prisma, req.siteUser.id, req.params.trip_id);
    assertCan(access, ACTIONS.MANAGE_INVITATIONS);
    const email = requireText(req.body?.email, 3, 254, 'Некорректная почта.').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(422, 'validation_error', 'Некорректная почта.');
    const role = ['participant', 'viewer'].includes(req.body?.role) ? req.body.role : 'participant';
    const token = createOpaqueToken();
    const invitation = await prisma.invitation.create({
      data: {
        tripId: access.trip.id,
        email,
        role,
        tokenHash: token.hash,
        expiresAt: new Date(now().getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    res.status(201).json({ invitation: { id: invitation.id, email, role, status: invitation.status }, token: token.raw });
  });

  router.patch('/:trip_id/participants/:participant_id', async (req, res) => {
    const access = await loadTripAccess(prisma, req.siteUser.id, req.params.trip_id);
    assertCan(access, ACTIONS.MANAGE_PARTICIPANTS);
    const participant = scopeChildToTrip(
      await prisma.participant.findUnique({ where: { id: req.params.participant_id } }),
      access.trip.id,
      'not_found',
    );
    const data = {};
    if (req.body?.role !== undefined) {
      if (!['organizer', 'participant', 'viewer'].includes(req.body.role)) throw new ApiError(422, 'validation_error', 'Некорректная роль.');
      data.role = req.body.role;
    }
    if (req.body?.status !== undefined) {
      if (!['active', 'revoked'].includes(req.body.status)) throw new ApiError(422, 'validation_error', 'Некорректный статус.');
      data.status = req.body.status;
      data.revokedAt = req.body.status === 'revoked' ? now() : null;
    }
    const updated = await prisma.participant.update({ where: { id: participant.id }, data });
    res.json({ participant: updated });
  });

  router.post('/:trip_id/documents', upload.single('file'), async (req, res) => {
    const access = await loadTripAccess(prisma, req.siteUser.id, req.params.trip_id);
    assertCan(access, ACTIONS.MANAGE_DOCUMENTS);
    if (!req.file || !UPLOAD_MIME_TYPES.has(req.file.mimetype)) {
      throw new ApiError(422, 'validation_error', 'Поддерживаются PDF, JPEG, PNG и TXT до 5 МБ.');
    }
    const title = requireText(req.body?.title || req.file.originalname, 1, 180, 'Некорректное название документа.');
    const visibility = ['shared', 'personal', 'organizer_only'].includes(req.body?.visibility) ? req.body.visibility : 'shared';
    const isText = req.file.mimetype === 'text/plain';
    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const document = await prisma.$transaction(async (tx) => {
      const item = await tx.document.create({
        data: {
          tripId: access.trip.id,
          ownerUserId: req.siteUser.id,
          allowedUserId: visibility === 'personal' ? req.body?.allowedUserId || req.siteUser.id : null,
          name: title,
          type: String(req.body?.type || 'document').slice(0, 80),
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          visibility,
          status: isText ? 'confirmed' : 'pending',
          segment: req.body?.segment || null,
          ocrStatus: isText ? 'extracted' : 'manual_review',
          extractedText: isText ? req.file.buffer.toString('utf8').slice(0, 100_000) : null,
        },
      });
      await tx.documentBlob.create({ data: { documentId: item.id, bytes: req.file.buffer, sha256 } });
      return item;
    });
    res.status(201).json({ document: { id: document.id, title: document.name, status: document.status, ocrStatus: document.ocrStatus } });
  });

  router.delete('/:trip_id/documents/:document_id', async (req, res) => {
    const access = await loadTripAccess(prisma, req.siteUser.id, req.params.trip_id);
    assertCan(access, ACTIONS.MANAGE_DOCUMENTS);
    const document = scopeChildToTrip(
      await prisma.document.findUnique({ where: { id: req.params.document_id } }),
      access.trip.id,
      'not_found',
    );
    await prisma.document.update({ where: { id: document.id }, data: { status: 'deleted', deletedAt: now() } });
    res.status(204).end();
  });

  router.post('/:trip_id/monitoring/:signal_id/confirm', async (req, res) => {
    const access = await loadTripAccess(prisma, req.siteUser.id, req.params.trip_id);
    assertCan(access, ACTIONS.CONFIRM_INCIDENT);
    const signal = scopeChildToTrip(
      await prisma.monitoringSignal.findUnique({ where: { id: req.params.signal_id } }),
      access.trip.id,
      'not_found',
    );
    const updated = await prisma.monitoringSignal.update({
      where: { id: signal.id },
      data: { status: 'confirmed', confirmedByUserId: req.siteUser.id, confirmedAt: now() },
    });
    res.json({ signal: updated });
  });

  router.post('/:trip_id/monitoring/:signal_id/plans', async (req, res) => {
    const access = await loadTripAccess(prisma, req.siteUser.id, req.params.trip_id);
    assertCan(access, ACTIONS.GENERATE_PLANS);
    const plans = await generatePlans(prisma, { tripId: access.trip.id, incidentId: req.params.signal_id, userId: req.siteUser.id });
    res.status(201).json({ items: plans });
  });

  router.post('/:trip_id/plans/:plan_id/select', async (req, res) => {
    const access = await loadTripAccess(prisma, req.siteUser.id, req.params.trip_id);
    assertCan(access, ACTIONS.SELECT_PLAN);
    const plan = scopeChildToTrip(await prisma.tripPlan.findUnique({ where: { id: req.params.plan_id } }), access.trip.id, 'not_found');
    const selected = await prisma.$transaction(async (tx) => {
      await tx.tripPlan.updateMany({ where: { tripId: access.trip.id, status: 'selected' }, data: { status: 'candidate', selectedAt: null } });
      const item = await tx.tripPlan.update({ where: { id: plan.id }, data: { status: 'selected', selectedAt: now() } });
      await tx.trip.update({ where: { id: access.trip.id }, data: { selectedPlanId: plan.id } });
      return item;
    });
    res.json({ plan: selected });
  });

  router.post('/:trip_id/plans/:plan_id/publish', async (req, res) => {
    const access = await loadTripAccess(prisma, req.siteUser.id, req.params.trip_id);
    assertCan(access, ACTIONS.PUBLISH_MESSAGE);
    const message = await prisma.$transaction(async (tx) => {
      const plan = await tx.tripPlan.findFirst({ where: { id: req.params.plan_id, tripId: access.trip.id, status: 'selected' } });
      if (!plan) throw new ApiError(404, 'not_found', 'Выбранный план не найден.');
      const publishedAt = now();
      await tx.tripPlan.update({ where: { id: plan.id }, data: { status: 'published', visibility: 'published', publishedAt } });
      const item = await tx.message.create({
        data: {
          tripId: access.trip.id,
          authorUserId: req.siteUser.id,
          planId: plan.id,
          title: plan.title,
          content: plan.summary || plan.title,
          audience: 'participants',
          status: 'published',
          publishedAt,
        },
      });
      await enqueuePublishedMessage(tx, access.trip, item, req.siteUser.id);
      return item;
    });
    res.status(201).json({ message });
  });

  router.post('/:trip_id/messages', async (req, res) => {
    const access = await loadTripAccess(prisma, req.siteUser.id, req.params.trip_id);
    assertCan(access, ACTIONS.PUBLISH_MESSAGE);
    const title = requireText(req.body?.title, 1, 180, 'Укажите заголовок.');
    const content = requireText(req.body?.text, 1, 5000, 'Укажите текст сообщения.');
    const status = req.body?.status === 'draft' ? 'draft' : 'published';
    const message = await prisma.$transaction(async (tx) => {
      const item = await tx.message.create({
        data: {
          tripId: access.trip.id,
          authorUserId: req.siteUser.id,
          title,
          content,
          audience: req.body?.audience || 'participants',
          status,
          publishedAt: status === 'published' ? now() : null,
        },
      });
      if (status === 'published') await enqueuePublishedMessage(tx, access.trip, item, req.siteUser.id);
      return item;
    });
    res.status(201).json({ message });
  });

  router.post('/:trip_id/sos', async (req, res) => {
    const access = await loadTripAccess(prisma, req.siteUser.id, req.params.trip_id);
    assertCan(access, ACTIONS.CREATE_OWN_SOS);
    const ticket = await createSos(prisma, {
      userId: req.siteUser.id,
      tripId: access.trip.id,
      category: req.body?.category,
      description: req.body?.description,
      segmentId: req.body?.segmentId,
      idempotencyKey: req.get('Idempotency-Key'),
    });
    res.status(201).json({ ticket });
  });

  router.patch('/:trip_id/sos/:sos_id', async (req, res) => {
    const access = await loadTripAccess(prisma, req.siteUser.id, req.params.trip_id);
    assertCan(access, ACTIONS.VIEW_ALL_SOS);
    const ticket = scopeChildToTrip(await prisma.sosTicket.findUnique({ where: { id: req.params.sos_id } }), access.trip.id, 'not_found');
    const status = req.body?.status;
    if (!['acknowledged', 'resolved', 'rejected'].includes(status)) throw new ApiError(422, 'validation_error', 'Некорректный статус SOS.');
    const updated = await prisma.sosTicket.update({
      where: { id: ticket.id },
      data: {
        status,
        acknowledgedAt: status === 'acknowledged' ? now() : ticket.acknowledgedAt,
        resolvedAt: status === 'resolved' ? now() : ticket.resolvedAt,
      },
    });
    res.json({ ticket: updated });
  });

  return router;
}

module.exports = { UPLOAD_MIME_TYPES, activeTelegramRecipients, createSiteOperationsRouter, enqueuePublishedMessage };

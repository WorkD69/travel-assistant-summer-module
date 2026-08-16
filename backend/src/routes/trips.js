const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const ocr = require('../services/ocr');
const tripChanges = require('../services/tripChanges');
const config = require('../config');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function humanSize(bytes) {
  if (bytes == null) return null;
  if (bytes < 1024) return bytes + ' \u0411';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' \u041a\u0411';
  return (bytes / 1024 / 1024).toFixed(1).replace('.', ',') + ' \u041c\u0411';
}
function extFormat(name) { const m = String(name || '').match(/\.([a-z0-9]+)$/i); return m ? m[1].toUpperCase() : null; }
function fixName(name) { try { return Buffer.from(String(name || ''), 'latin1').toString('utf8'); } catch (e) { return String(name || ''); } }
function publicDoc(doc, hasFile) { const d = Object.assign({}, doc); if ('blob' in d) delete d.blob; d.hasFile = (hasFile !== undefined) ? hasFile : !!(doc && doc.blob); return d; }

async function runOcr(docId, buffer, mimeType, filename) {
  try {
    const r = await ocr.extractText(buffer, mimeType, filename);
    const text = (r && r.text) ? r.text : '';
    const fields = ocr.extractFields(text);
    const segment = ocr.buildSegment(fields);
    const data = {
      ocrStatus: text ? 'done' : (r && r.engine === 'error' ? 'failed' : 'empty'),
      ocrText: text ? text.slice(0, 20000) : null,
      ocrData: JSON.stringify(fields || {}),
    };
    if (segment) data.segment = segment;
    if (fields && fields.type) data.type = fields.type;
    await prisma.document.update({ where: { id: docId }, data: data });
  } catch (e) {
    try { await prisma.document.update({ where: { id: docId }, data: { ocrStatus: 'failed' } }); } catch (e2) {}
  }
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function jsonParse(v, fallback) {
  if (v === null || v === undefined) return fallback;
  try { return JSON.parse(v); } catch (e) { return fallback; }
}

function initialsFrom(name) {
  return String(name || '').trim().charAt(0).toUpperCase();
}

function invitationPayload(invitation) {
  const createdAt = new Date(invitation.createdAt);
  const expiresAt = invitation.expiresAt ? new Date(invitation.expiresAt) : null;
  const expiresInDays = expiresAt
    ? Math.round((expiresAt.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000))
    : null;
  return Object.assign({}, invitation, {
    expiresInDays: expiresInDays,
    link: config.frontendOrigin + '/invitation.html?token=' + encodeURIComponent(invitation.token),
  });
}

function tripSummary(trip, userId) {
  const counts = trip._count || {};
  const participantCount = counts.participants != null
    ? counts.participants
    : (trip.participants ? trip.participants.length : 0);
  const documentCount = counts.documents != null
    ? counts.documents
    : (trip.documents ? trip.documents.length : 0);
  const monitoringCount = counts.monitoringSignals != null
    ? counts.monitoringSignals
    : (trip.monitoringSignals ? trip.monitoringSignals.length : 0);
  const isOwner = userId != null && trip.ownerId === userId;
  return {
    id: trip.id,
    title: trip.title,
    route: trip.route,
    segments: jsonParse(trip.segments, []),
    startDate: trip.startDate,
    endDate: trip.endDate,
    status: trip.status,
    type: trip.type,
    ownerId: trip.ownerId,
    updatedAt: trip.updatedAt,
    participantCount: participantCount,
    documentCount: documentCount,
    monitoringCount: monitoringCount,
    monitoring: monitoringCount > 0 ? 'Активен' : 'Не настроен',
    role: isOwner ? 'Организатор' : 'Участник',
  };
}

async function loadAccessibleTrip(userId, tripId) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, include: { participants: true } });
  if (!trip) return { error: 404 };
  const isOwner = trip.ownerId === userId;
  const isParticipant = (trip.participants || []).some(function (p) { return p.userId === userId; });
  if (!isOwner && !isParticipant) return { error: 403 };
  return { trip: trip, isOwner: isOwner };
}

function accessError(res, code) {
  return res.status(code).json({ error: code === 404 ? 'Поездка не найдена' : 'Нет доступа к поездке' });
}

function ensureTripAccess(req, res, next) {
  loadAccessibleTrip(req.user.id, req.params.tripId)
    .then(function (acc) {
      if (acc.error) return accessError(res, acc.error);
      req.trip = acc.trip;
      req.isOwner = acc.isOwner;
      next();
    })
    .catch(function (e) { console.error(e); res.status(500).json({ error: 'Ошибка проверки доступа' }); });
}

// ---- Trips ----
router.get('/trips', requireAuth, async (req, res) => {
  try {
    const trips = await prisma.trip.findMany({
      where: { OR: [{ ownerId: req.user.id }, { participants: { some: { userId: req.user.id } } }] },
      include: { _count: { select: { participants: true, documents: true, monitoringSignals: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ trips: trips.map(function (t) { return tripSummary(t, req.user.id); }) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось загрузить поездки' }); }
});

router.post('/trips', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.title) return res.status(400).json({ error: 'Укажите название поездки' });
    const trip = await prisma.trip.create({
      data: {
        title: String(b.title),
        route: b.route ? String(b.route) : null,
        startDate: parseDate(b.startDate),
        endDate: parseDate(b.endDate),
        status: b.status ? String(b.status) : 'active',
        type: b.type ? String(b.type) : 'group',
        segments: b.segments != null ? String(b.segments) : null,
        ownerId: req.user.id,
        participants: { create: [{ userId: req.user.id, name: req.user.name, initials: req.user.initials || initialsFrom(req.user.name), role: 'organizer', access: 'Активен', telegram: req.user.telegram || 'none', tone: 'a' }] },
      },
      include: { participants: true, _count: { select: { participants: true, documents: true, monitoringSignals: true } } },
    });
    res.status(201).json({ trip: tripSummary(trip, req.user.id) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось создать поездку' }); }
});

router.get('/trips/:tripId', requireAuth, ensureTripAccess, async (req, res) => {
  try {
    const trip = await prisma.trip.findUnique({
      where: { id: req.params.tripId },
      include: {
        participants: true,
        invitations: true,
        documents: true,
        messages: { orderBy: { createdAt: 'desc' } },
        monitoringSignals: { orderBy: { createdAt: 'desc' } },
        offlineCopy: true,
        plans: { orderBy: { createdAt: 'desc' } },
      },
    });
    const offline = trip.offlineCopy ? Object.assign({}, trip.offlineCopy, { selectedDocuments: jsonParse(trip.offlineCopy.selectedDocuments, []) }) : null;
    const plans = (trip.plans || []).map(function (p) { return Object.assign({}, p, { steps: jsonParse(p.steps, []) }); });
    const activePlan = plans.filter(function (p) { return p.status === 'active'; })[0] || null;
    res.json({ trip: Object.assign({}, trip, { offlineCopy: offline, plans: plans, activePlan: activePlan, segments: jsonParse(trip.segments, []) }) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось загрузить поездку' }); }
});

router.patch('/trips/:tripId', requireAuth, ensureTripAccess, async (req, res) => {
  try {
    if (!req.isOwner) return res.status(403).json({ error: 'Только организатор может изменять поездку' });
    const b = req.body || {};
    const data = {};
    if (b.title !== undefined) data.title = String(b.title);
    if (b.route !== undefined) data.route = b.route ? String(b.route) : null;
    if (b.startDate !== undefined) data.startDate = parseDate(b.startDate);
    if (b.endDate !== undefined) data.endDate = parseDate(b.endDate);
    if (b.status !== undefined) data.status = String(b.status);
    if (b.type !== undefined) data.type = String(b.type);
    if (b.segments !== undefined) {
      data.segments = b.segments == null
        ? null
        : (typeof b.segments === 'string' ? b.segments : JSON.stringify(b.segments));
    }
    const before = req.trip;
    const trip = await prisma.$transaction(async function (tx) {
      const updated = await tx.trip.update({
        where: { id: req.params.tripId },
        data: data,
        include: { _count: { select: { participants: true, documents: true, monitoringSignals: true } } },
      });
      await tripChanges.recordTripChangeEvents(tx, {
        tripId: req.params.tripId,
        actorId: req.user.id,
        before: before,
        after: updated,
      });
      return updated;
    });
    res.json({ trip: tripSummary(trip, req.user.id) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось обновить поездку' }); }
});

router.delete('/trips/:tripId', requireAuth, ensureTripAccess, async (req, res) => {
  try {
    if (!req.isOwner) return res.status(403).json({ error: 'Только организатор может удалить поездку' });
    await prisma.trip.delete({ where: { id: req.params.tripId } });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось удалить поездку' }); }
});

// ---- Participants ----
router.get('/trips/:tripId/participants', requireAuth, ensureTripAccess, async (req, res) => {
  const participants = await prisma.participant.findMany({ where: { tripId: req.params.tripId }, orderBy: { joined: 'asc' } });
  res.json({ participants });
});

router.post('/trips/:tripId/participants', requireAuth, ensureTripAccess, async (req, res) => {
  try {
    if (!req.isOwner) return res.status(403).json({ error: 'Только организатор может добавлять участников' });
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: 'Укажите имя участника' });
    const p = await prisma.$transaction(async function (tx) {
      const created = await tx.participant.create({ data: {
        tripId: req.params.tripId,
        name: String(b.name),
        initials: b.initials || initialsFrom(b.name),
        shortLabel: b.shortLabel || null,
        role: b.role || 'participant',
        access: b.access || 'Активен',
        telegram: b.telegram || 'none',
        tone: b.tone || null,
      } });
      await tripChanges.recordCustomChangeEvent(tx, {
        tripId: req.params.tripId,
        actorId: req.user.id,
        tripTitle: req.trip.title,
        type: 'participant_changed',
        newValue: { participantId: created.id, action: 'added', name: created.name },
        deepLinkTarget: 'members',
      });
      return created;
    });
    res.status(201).json({ participant: p });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось добавить участника' }); }
});

router.patch('/trips/:tripId/participants/:pid', requireAuth, ensureTripAccess, async (req, res) => {
  try {
    if (!req.isOwner) return res.status(403).json({ error: 'Только организатор может изменять участников' });
    const b = req.body || {};
    const data = {};
    ['name', 'initials', 'shortLabel', 'role', 'access', 'telegram', 'tone'].forEach(function (k) { if (b[k] !== undefined) data[k] = b[k]; });
    const before = await prisma.participant.findUnique({ where: { id: req.params.pid } });
    if (!before || before.tripId !== req.params.tripId) return res.status(404).json({ error: 'Участник не найден' });
    const p = await prisma.$transaction(async function (tx) {
      const updated = await tx.participant.update({ where: { id: req.params.pid }, data: data });
      await tripChanges.recordCustomChangeEvent(tx, {
        tripId: req.params.tripId,
        actorId: req.user.id,
        tripTitle: req.trip.title,
        type: 'participant_changed',
        oldValue: before,
        newValue: updated,
        deepLinkTarget: 'members',
      });
      return updated;
    });
    res.json({ participant: p });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось обновить участника' }); }
});

router.delete('/trips/:tripId/participants/:pid', requireAuth, ensureTripAccess, async (req, res) => {
  try {
    if (!req.isOwner) return res.status(403).json({ error: 'Только организатор может удалять участников' });
    const before = await prisma.participant.findUnique({ where: { id: req.params.pid } });
    if (!before || before.tripId !== req.params.tripId) return res.status(404).json({ error: 'Участник не найден' });
    if (before.userId === req.user.id) return res.status(400).json({ error: 'Организатор не может удалить себя' });
    await prisma.$transaction(async function (tx) {
      await tx.participant.delete({ where: { id: req.params.pid } });
      await tripChanges.recordCustomChangeEvent(tx, {
        tripId: req.params.tripId,
        actorId: req.user.id,
        tripTitle: req.trip.title,
        type: 'participant_changed',
        oldValue: { participantId: before.id, action: 'removed', name: before.name },
        deepLinkTarget: 'members',
      });
    });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось удалить участника' }); }
});

// ---- Invitations ----
router.get('/trips/:tripId/invitations', requireAuth, ensureTripAccess, async (req, res) => {
  const invitations = await prisma.invitation.findMany({ where: { tripId: req.params.tripId }, orderBy: { createdAt: 'desc' } });
  res.json({ invitations: invitations.map(invitationPayload) });
});

router.post('/trips/:tripId/invitations', requireAuth, ensureTripAccess, async (req, res) => {
  try {
    if (!req.isOwner) return res.status(403).json({ error: 'Только организатор может создавать приглашения' });
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Укажите корректный email приглашённого пользователя' });
    }
    const days = b.expiresInDays == null ? 7 : Number(b.expiresInDays);
    if (![1, 3, 7].includes(days)) {
      return res.status(400).json({ error: 'Срок приглашения должен быть 1, 3 или 7 дней' });
    }
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const invitedUser = await prisma.user.findUnique({ where: { email: email }, include: { telegramLink: true } });
    const inv = await prisma.$transaction(async function (tx) {
      const created = await tx.invitation.create({ data: {
        tripId: req.params.tripId,
        email: email,
        role: b.role || 'participant',
        status: 'pending',
        active: true,
        expiresAt: expiresAt,
      } });
      await tx.tripChange.create({ data: {
        tripId: req.params.tripId,
        actorId: req.user.id,
        type: 'trip_invitation',
        newValue: JSON.stringify({ invitationId: created.id, email: email, expiresAt: expiresAt }),
      } });
      if (invitedUser && invitedUser.telegramLink) {
        await tx.telegramNotification.create({ data: {
          eventId: 'trip_invitation:' + created.id + ':' + crypto.randomUUID(),
          type: 'trip_invitation',
          telegramUserId: invitedUser.telegramLink.telegramUserId,
          tripId: req.params.tripId,
          tripTitle: req.trip.title,
          title: 'Приглашение в поездку',
          whatChanged: 'Вас пригласили в поездку',
          newValue: config.frontendOrigin + '/invitation.html?token=' + encodeURIComponent(created.token),
          deepLinkTarget: 'invitation',
          source: 'backend',
        } });
      }
      return created;
    });
    res.status(201).json({ invitation: invitationPayload(inv) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось создать приглашение' }); }
});

router.patch('/trips/:tripId/invitations/:iid', requireAuth, ensureTripAccess, async (req, res) => {
  try {
    if (!req.isOwner) return res.status(403).json({ error: 'Только организатор может изменять приглашения' });
    const b = req.body || {};
    const data = {};
    ['email', 'role', 'status', 'active'].forEach(function (k) { if (b[k] !== undefined) data[k] = b[k]; });
    const inv = await prisma.invitation.update({ where: { id: req.params.iid }, data: data });
    res.json({ invitation: invitationPayload(inv) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось обновить приглашение' }); }
});

router.delete('/trips/:tripId/invitations/:iid', requireAuth, ensureTripAccess, async (req, res) => {
  try {
    if (!req.isOwner) return res.status(403).json({ error: 'Только организатор может отзывать приглашения' });
    const existing = await prisma.invitation.findUnique({ where: { id: req.params.iid } });
    if (!existing || existing.tripId !== req.params.tripId) return res.status(404).json({ error: 'Приглашение не найдено' });
    const invitation = await prisma.invitation.update({ where: { id: req.params.iid }, data: { active: false, status: 'revoked' } });
    res.json({ ok: true, invitation: invitationPayload(invitation) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось отозвать приглашение' }); }
});

function unavailableInvitation(res, invitation) {
  if (!invitation) return res.status(404).json({ error: 'Приглашение не найдено', code: 'invitation_not_found' });
  if (!invitation.active || invitation.status !== 'pending') {
    return res.status(410).json({ error: 'Приглашение уже использовано или отозвано', code: 'invitation_inactive' });
  }
  if (invitation.expiresAt && new Date(invitation.expiresAt).getTime() <= Date.now()) {
    return res.status(410).json({ error: 'Срок приглашения истёк', code: 'invitation_expired' });
  }
  return null;
}

router.get('/invitations/resolve/:token', async (req, res) => {
  try {
    const invitation = await prisma.invitation.findUnique({
      where: { token: req.params.token },
      include: { trip: { select: { id: true, title: true, route: true, startDate: true, endDate: true } } },
    });
    const unavailable = unavailableInvitation(res, invitation);
    if (unavailable) return unavailable;
    res.json({ invitation: {
      token: invitation.token,
      email: invitation.email,
      role: invitation.role,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      trip: invitation.trip,
    } });
  } catch (error) {
    console.error('[invitation/resolve]', error);
    res.status(500).json({ error: 'Не удалось проверить приглашение' });
  }
});

router.post('/invitations/:token/accept', requireAuth, async (req, res) => {
  try {
    const invitation = await prisma.invitation.findUnique({
      where: { token: req.params.token },
      include: { trip: true },
    });
    if (!invitation) return res.status(404).json({ error: 'Приглашение не найдено', code: 'invitation_not_found' });
    if (!invitation.active || invitation.status !== 'pending') {
      return res.status(409).json({ error: 'Приглашение уже использовано или отозвано', code: 'invitation_used' });
    }
    if (invitation.expiresAt && new Date(invitation.expiresAt).getTime() <= Date.now()) {
      return res.status(410).json({ error: 'Срок приглашения истёк', code: 'invitation_expired' });
    }
    if (String(invitation.email).toLowerCase() !== String(req.user.email).toLowerCase()) {
      return res.status(403).json({ error: 'Приглашение предназначено другому пользователю', code: 'invitation_email_mismatch' });
    }
    const result = await prisma.$transaction(async function (tx) {
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, active: true, status: 'pending' },
        data: { active: false, status: 'accepted', acceptedAt: new Date(), acceptedById: req.user.id },
      });
      if (claimed.count !== 1) {
        const conflict = new Error('Приглашение уже использовано');
        conflict.code = 'INVITATION_CONFLICT';
        throw conflict;
      }
      let participant = await tx.participant.findFirst({ where: { tripId: invitation.tripId, userId: req.user.id } });
      if (!participant) {
        participant = await tx.participant.create({ data: {
          tripId: invitation.tripId,
          userId: req.user.id,
          name: req.user.name,
          initials: req.user.initials || initialsFrom(req.user.name),
          role: invitation.role || 'participant',
          access: 'active',
          telegram: req.user.telegram || 'none',
        } });
      }
      await tripChanges.recordCustomChangeEvent(tx, {
        tripId: invitation.tripId,
        actorId: req.user.id,
        tripTitle: invitation.trip.title,
        type: 'participant_changed',
        newValue: { participantId: participant.id, userId: req.user.id, action: 'joined' },
        deepLinkTarget: 'members',
      });
      return {
        invitation: await tx.invitation.findUnique({ where: { id: invitation.id } }),
        participant: participant,
      };
    });
    res.json({
      invitation: invitationPayload(result.invitation),
      participant: result.participant,
      trip: invitation.trip,
    });
  } catch (error) {
    if (error && error.code === 'INVITATION_CONFLICT') {
      return res.status(409).json({ error: error.message, code: 'invitation_used' });
    }
    console.error('[invitation/accept]', error);
    res.status(500).json({ error: 'Не удалось принять приглашение' });
  }
});

// ---- Documents ----
router.get('/trips/:tripId/documents', requireAuth, ensureTripAccess, async (req, res) => {
  const documents = await prisma.document.findMany({ where: { tripId: req.params.tripId }, orderBy: { uploadedAt: 'desc' }, include: { blob: { select: { id: true } } } });
  res.json({ documents: documents.map(function (d) { return publicDoc(d, !!d.blob); }) });
});

// \u0420\u0435\u0430\u043b\u044c\u043d\u0430\u044f \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0444\u0430\u0439\u043b\u0430 (multipart, \u043f\u043e\u043b\u0435 "file") + \u043e\u0444\u043b\u0430\u0439\u043d OCR.
router.post('/trips/:tripId/documents/upload', requireAuth, ensureTripAccess, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '\u0424\u0430\u0439\u043b \u043d\u0435 \u043f\u0435\u0440\u0435\u0434\u0430\u043d' });
    const f = req.file;
    const b = req.body || {};
    const filename = fixName(f.originalname);
    let doc = await prisma.$transaction(async function (tx) {
      const created = await tx.document.create({ data: {
        tripId: req.params.tripId,
        name: b.name ? String(b.name) : filename,
        type: b.type || null,
        format: extFormat(filename),
        mimeType: f.mimetype || null,
        sizeLabel: humanSize(f.size),
        sizeMb: f.size / (1024 * 1024),
        status: 'review',
        ocrConfirmed: false,
        ocrStatus: 'pending',
        visibility: b.visibility || 'shared',
        segment: b.segment || null,
        source: b.source || '\u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043d\u043e \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0435\u043c',
        uploadedById: req.user.id,
        blob: { create: { data: f.buffer } },
      } });
      await tripChanges.recordCustomChangeEvent(tx, {
        tripId: req.params.tripId,
        actorId: req.user.id,
        tripTitle: req.trip.title,
        type: 'document_added',
        newValue: { documentId: created.id, name: created.name },
        whatChanged: 'Добавлен документ: ' + created.name,
        deepLinkTarget: 'documents',
      });
      return created;
    });
    await runOcr(doc.id, f.buffer, f.mimetype, filename);
    doc = await prisma.document.findUnique({ where: { id: doc.id } });
    res.status(201).json({ document: publicDoc(doc, true) });
  } catch (e) {
    console.error('[upload]', e && e.message ? e.message : e);
    res.status(500).json({ error: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0444\u0430\u0439\u043b' });
  }
});

// \u041f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 / \u0441\u043a\u0430\u0447\u0438\u0432\u0430\u043d\u0438\u0435 \u0444\u0430\u0439\u043b\u0430. ?download=1 -> attachment. \u0411\u043e\u0442 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0435\u0442 \u044d\u0442\u043e\u0442 \u0436\u0435 \u044d\u043d\u0434\u043f\u043e\u0438\u043d\u0442 (Bearer).
router.get('/trips/:tripId/documents/:did/file', requireAuth, ensureTripAccess, async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({ where: { id: req.params.did }, include: { blob: true } });
    if (!doc || doc.tripId !== req.params.tripId) return res.status(404).json({ error: '\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
    if (!doc.blob || !doc.blob.data) return res.status(404).json({ error: '\u0424\u0430\u0439\u043b \u043d\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d' });
    const buf = Buffer.from(doc.blob.data);
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    const disp = req.query.download ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', disp + "; filename*=UTF-8''" + encodeURIComponent(doc.name || 'document'));
    res.setHeader('Content-Length', buf.length);
    return res.send(buf);
  } catch (e) { console.error(e); res.status(500).json({ error: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u0434\u0430\u0442\u044c \u0444\u0430\u0439\u043b' }); }
});

router.post('/trips/:tripId/documents', requireAuth, ensureTripAccess, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: 'Укажите название документа' });
    const doc = await prisma.$transaction(async function (tx) {
      const created = await tx.document.create({ data: {
        tripId: req.params.tripId,
        name: String(b.name),
        type: b.type || null,
        format: b.format || null,
        sizeLabel: b.sizeLabel || null,
        sizeMb: b.sizeMb !== undefined ? Number(b.sizeMb) : null,
        status: b.status || 'review',
        ocrConfirmed: !!b.ocrConfirmed,
        visibility: b.visibility || 'shared',
        segment: b.segment || null,
        source: b.source || null,
        uploadedById: req.user.id,
      } });
      await tripChanges.recordCustomChangeEvent(tx, {
        tripId: req.params.tripId,
        actorId: req.user.id,
        tripTitle: req.trip.title,
        type: 'document_added',
        newValue: { documentId: created.id, name: created.name },
        whatChanged: 'Добавлен документ: ' + created.name,
        deepLinkTarget: 'documents',
      });
      return created;
    });
    res.status(201).json({ document: doc });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось добавить документ' }); }
});

router.patch('/trips/:tripId/documents/:did', requireAuth, ensureTripAccess, async (req, res) => {
  try {
    const b = req.body || {};
    const data = {};
    ['name', 'type', 'format', 'sizeLabel', 'status', 'visibility', 'segment', 'source', 'ocrData', 'ocrText', 'ocrStatus'].forEach(function (k) { if (b[k] !== undefined) data[k] = b[k]; });
    if (b.sizeMb !== undefined) data.sizeMb = Number(b.sizeMb);
    if (b.ocrConfirmed !== undefined) data.ocrConfirmed = !!b.ocrConfirmed;
    if (b.status === 'confirmed') data.processedAt = new Date();
    const doc = await prisma.document.update({ where: { id: req.params.did }, data: data });
    res.json({ document: doc });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось обновить документ' }); }
});

router.delete('/trips/:tripId/documents/:did', requireAuth, ensureTripAccess, async (req, res) => {
  try {
    await prisma.document.delete({ where: { id: req.params.did } });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось удалить документ' }); }
});

// ---- Messages ----
router.get('/trips/:tripId/messages', requireAuth, ensureTripAccess, async (req, res) => {
  const messages = await prisma.message.findMany({ where: { tripId: req.params.tripId }, orderBy: { createdAt: 'desc' } });
  res.json({ messages });
});

router.post('/trips/:tripId/messages', requireAuth, ensureTripAccess, async (req, res) => {
  try {
    if (!req.isOwner) return res.status(403).json({ error: 'Только организатор может публиковать сообщения' });
    const b = req.body || {};
    const msg = await prisma.$transaction(async function (tx) {
      const created = await tx.message.create({ data: {
        tripId: req.params.tripId,
        channel: b.channel || 'system',
        kind: b.kind || 'draft',
        title: b.title || null,
        body: b.body || null,
        recipients: b.recipients ? (typeof b.recipients === 'string' ? b.recipients : JSON.stringify(b.recipients)) : null,
        status: b.status || null,
        planBLinked: !!b.planBLinked,
        authorId: req.user.id,
      } });
      const kind = String(created.kind || '').toLowerCase();
      const status = String(created.status || '').toLowerCase();
      const published = (kind && kind !== 'draft' && status !== 'draft') || created.planBLinked;
      if (published) {
        await tripChanges.recordCustomChangeEvent(tx, {
          tripId: req.params.tripId,
          actorId: req.user.id,
          tripTitle: req.trip.title,
          type: 'organizer_message',
          newValue: { messageId: created.id, title: created.title, body: (created.body || '').slice(0, 200) },
          deepLinkTarget: 'messages',
        });
      }
      return created;
    });
    res.status(201).json({ message: msg });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось создать сообщение' }); }
});

router.patch('/trips/:tripId/messages/:mid', requireAuth, ensureTripAccess, async (req, res) => {
  try {
    if (!req.isOwner) return res.status(403).json({ error: 'Только организатор может публиковать сообщения' });
    const b = req.body || {};
    const data = {};
    ['channel', 'kind', 'title', 'body', 'status'].forEach(function (k) { if (b[k] !== undefined) data[k] = b[k]; });
    if (b.recipients !== undefined) data.recipients = typeof b.recipients === 'string' ? b.recipients : JSON.stringify(b.recipients);
    if (b.planBLinked !== undefined) data.planBLinked = !!b.planBLinked;
    const before = await prisma.message.findUnique({ where: { id: req.params.mid } });
    if (!before || before.tripId !== req.params.tripId) return res.status(404).json({ error: 'Сообщение не найдено' });
    const msg = await prisma.$transaction(async function (tx) {
      const updated = await tx.message.update({ where: { id: req.params.mid }, data: data });
      const wasDraft = !before || String(before.kind || '').toLowerCase() === 'draft' || String(before.status || '').toLowerCase() === 'draft' || (!before.kind && !before.status);
      const kind = String(updated.kind || '').toLowerCase();
      const status = String(updated.status || '').toLowerCase();
      const nowPublished = (kind && kind !== 'draft' && status !== 'draft') || updated.planBLinked;
      if (wasDraft && nowPublished) {
        await tripChanges.recordCustomChangeEvent(tx, {
          tripId: req.params.tripId,
          actorId: req.user.id,
          tripTitle: req.trip.title,
          type: 'organizer_message',
          newValue: { messageId: updated.id, title: updated.title, body: (updated.body || '').slice(0, 200) },
          deepLinkTarget: 'messages',
        });
      }
      return updated;
    });
    res.json({ message: msg });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось обновить сообщение' }); }
});

router.delete('/trips/:tripId/messages/:mid', requireAuth, ensureTripAccess, async (req, res) => {
  try {
    await prisma.message.delete({ where: { id: req.params.mid } });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось удалить сообщение' }); }
});

// ---- Offline copy ----
router.get('/trips/:tripId/offline', requireAuth, ensureTripAccess, async (req, res) => {
  const oc = await prisma.offlineCopy.findUnique({ where: { tripId: req.params.tripId } });
  res.json({ offlineCopy: oc ? Object.assign({}, oc, { selectedDocuments: jsonParse(oc.selectedDocuments, []) }) : null });
});

router.put('/trips/:tripId/offline', requireAuth, ensureTripAccess, async (req, res) => {
  try {
    const b = req.body || {};
    const selected = Array.isArray(b.selectedDocuments) ? JSON.stringify(b.selectedDocuments) : (b.selectedDocuments || null);
    const base = {
      status: b.status || 'saved',
      savedAt: new Date(),
      size: b.size !== undefined ? Number(b.size) : null,
      includeRouteMap: b.includeRouteMap !== undefined ? !!b.includeRouteMap : true,
      includeObservations: b.includeObservations !== undefined ? !!b.includeObservations : true,
      includeDocuments: b.includeDocuments !== undefined ? !!b.includeDocuments : true,
      selectedDocuments: selected,
    };
    const oc = await prisma.offlineCopy.upsert({
      where: { tripId: req.params.tripId },
      update: base,
      create: Object.assign({ tripId: req.params.tripId }, base),
    });
    res.json({ offlineCopy: Object.assign({}, oc, { selectedDocuments: jsonParse(oc.selectedDocuments, []) }) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось сохранить офлайн-копию' }); }
});

module.exports = router;

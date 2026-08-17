const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const assistant = require('../services/assistant');
const config = require('../config');
const tripChanges = require('../services/tripChanges');
const { isLinkedActiveParticipant } = require('../services/tripAccess');

const router = express.Router();

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch (error) { return []; }
}

function serializeStructuredPlan(plan) {
  return Object.assign({}, plan, {
    segments: parseList(plan.segments),
    steps: parseList(plan.steps),
    risks: parseList(plan.risks),
    assumptions: parseList(plan.assumptions),
    requiredActions: parseList(plan.requiredActions),
  });
}

async function tripAccess(tripId, userId) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, include: { participants: true } });
  if (!trip) return { error: 404 };
  const isOwner = trip.ownerId === userId;
  const isParticipant = (trip.participants || []).some(function (participant) {
    return isLinkedActiveParticipant(participant, userId);
  });
  if (!isOwner && !isParticipant) return { error: 403 };
  return { trip: trip, isOwner: isOwner };
}

router.get('/trips/:tripId/monitoring', requireAuth, async (req, res) => {
  try {
    const access = await tripAccess(req.params.tripId, req.user.id);
    if (access.error) return res.status(access.error).json({ error: 'Нет доступа к поездке' });
    const signals = await prisma.monitoringSignal.findMany({
      where: { tripId: req.params.tripId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ signals });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Не удалось загрузить мониторинг' });
  }
});

// Создать сигнал мониторинга (в т.ч. из SOS-модалки). Бэкенд = источник правды.
router.post('/trips/:tripId/monitoring', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const access = await tripAccess(req.params.tripId, req.user.id);
    if (access.error) return res.status(access.error).json({ error: 'Нет доступа к поездке' });
    const signal = await prisma.$transaction(async function (tx) {
      const created = await tx.monitoringSignal.create({ data: {
        tripId: req.params.tripId,
        label: b.label != null ? String(b.label) : (b.type != null ? String(b.type) : 'Сигнал'),
        status: b.status != null ? String(b.status) : null,
        severity: b.severity != null ? String(b.severity) : null,
        segment: b.segment != null ? String(b.segment) : null,
        source: b.source != null ? String(b.source) : null,
        detail: b.detail != null ? String(b.detail) : (b.description != null ? String(b.description) : null),
        authorId: req.user.id,
        category: b.category != null ? String(b.category) : null,
      } });
      const isSos = String(b.category || '').toLowerCase() === 'sos' || /sos/i.test(String(created.label || ''));
      const isRisk = ['high', 'critical', 'warning'].includes(String(created.severity || '').toLowerCase()) ||
        /risk|риск|delay|задерж/i.test(String(created.label || ''));
      if (isSos || isRisk) {
        await tripChanges.recordCustomChangeEvent(tx, {
          tripId: req.params.tripId,
          actorId: req.user.id,
          tripTitle: access.trip.title,
          type: isSos ? 'sos_created' : 'risk_detected',
          newValue: { signalId: created.id, label: created.label, severity: created.severity, status: created.status },
          deepLinkTarget: isSos ? 'sos' : 'monitoring',
        });
      }
      return created;
    });
    res.status(201).json({ signal });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Не удалось сохранить сигнал' });
  }
});

router.patch('/trips/:tripId/monitoring/:signalId', requireAuth, async (req, res) => {
  try {
    const access = await tripAccess(req.params.tripId, req.user.id);
    if (access.error) return res.status(access.error).json({ error: 'Нет доступа к поездке' });
    if (!access.isOwner) return res.status(403).json({ error: 'Только организатор может менять статус сигнала' });
    const before = await prisma.monitoringSignal.findUnique({ where: { id: req.params.signalId } });
    if (!before || before.tripId !== req.params.tripId) return res.status(404).json({ error: 'Сигнал не найден' });
    const body = req.body || {};
    const data = {};
    ['status', 'severity', 'detail'].forEach(function (key) {
      if (body[key] !== undefined) data[key] = body[key] == null ? null : String(body[key]);
    });
    const signal = await prisma.$transaction(async function (tx) {
      const updated = await tx.monitoringSignal.update({ where: { id: before.id }, data: data });
      const isSos = String(before.category || '').toLowerCase() === 'sos' || /sos/i.test(String(before.label || ''));
      await tripChanges.recordCustomChangeEvent(tx, {
        tripId: req.params.tripId,
        actorId: req.user.id,
        tripTitle: access.trip.title,
        type: isSos ? 'sos_status_changed' : 'event_changed',
        oldValue: { signalId: before.id, status: before.status, severity: before.severity },
        newValue: { signalId: updated.id, status: updated.status, severity: updated.severity },
        deepLinkTarget: isSos ? 'sos' : 'monitoring',
      });
      return updated;
    });
    res.json({ signal: signal });
  } catch (error) {
    console.error('[monitoring/update]', error);
    res.status(500).json({ error: 'Не удалось обновить сигнал' });
  }
});

router.get('/trips/:tripId/monitoring/assistant/history', requireAuth, async (req, res) => {
  try {
    const access = await tripAccess(req.params.tripId, req.user.id);
    if (access.error) return res.status(access.error).json({ error: 'Нет доступа к поездке' });
    const history = await prisma.assistantMessage.findMany({
      where: { tripId: req.params.tripId, userId: req.user.id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    res.json({ history });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Не удалось загрузить историю' });
  }
});

router.post('/trips/:tripId/monitoring/assistant', requireAuth, async (req, res) => {
  const tripId = req.params.tripId;
  const body = req.body || {};
  const messages = body.messages || [];
  const mode = body.mode || 'dialog';
  try {
    const access = await tripAccess(tripId, req.user.id);
    if (access.error) return res.status(access.error).json({ error: 'Нет доступа к поездке' });
    const reversed = messages.slice().reverse();
    let lastUser = null;
    for (let i = 0; i < reversed.length; i++) {
      if (reversed[i] && reversed[i].role === 'user' && reversed[i].content) { lastUser = reversed[i]; break; }
    }
    async function saveMessage(role, content) {
      try {
        await prisma.assistantMessage.create({ data: { tripId, userId: req.user.id, role: role, content: String(content), mode } });
      } catch (saveErr) {
        console.warn('[assistant] history not saved (' + role + '): ' + (saveErr && (saveErr.code || saveErr.message)));
      }
    }

    if (lastUser) {
      await saveMessage('user', lastUser.content);
    }

    const result = mode === 'plans'
      ? await assistant.plans({ tripId, messages })
      : await assistant.chat({ tripId, messages });

    const assistantText = mode === 'plans' ? JSON.stringify(result) : result.reply;
    await saveMessage('assistant', assistantText);

    res.json(result);
  } catch (e) {
    console.error('[assistant]', e && e.message ? e.message : e);
    const dev = config.nodeEnv !== 'production';
    if (e.code === 'NO_KEY') {
      return res.status(503).json({ error: 'ИИ не настроен: добавьте AI_API_KEY (ключ Groq) в файл .env и перезапустите сервер.', code: 'NO_KEY' });
    }
    const raw = Number(e.status);
    const status = raw >= 400 && raw < 600 ? raw : 500;
    const base = e.code === 'RATE_LIMIT'
      ? 'Провайдер ИИ вернул лимит запросов (429).'
      : 'Ошибка ИИ-ассистента.';
    return res.status(status).json({
      error: dev ? (base + ' ' + (e.message || '')).slice(0, 800) : base,
      code: e.code || 'AI_ERROR',
    });
  }
});

// ---- Применённый план Б ----
router.get('/trips/:tripId/monitoring/plan', requireAuth, async (req, res) => {
  try {
    const access = await tripAccess(req.params.tripId, req.user.id);
    if (access.error) return res.status(access.error).json({ error: 'Нет доступа к поездке' });
    const plan = await prisma.tripPlan.findFirst({ where: { tripId: req.params.tripId, status: { in: ['applied', 'active'] } }, orderBy: { createdAt: 'desc' } });
    res.json({ plan: plan ? serializeStructuredPlan(plan) : null });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось загрузить план' }); }
});

router.get('/trips/:tripId/monitoring/plans', requireAuth, async (req, res) => {
  try {
    const access = await tripAccess(req.params.tripId, req.user.id);
    if (access.error) return res.status(access.error).json({ error: 'Нет доступа к поездке' });
    const plans = await prisma.tripPlan.findMany({ where: { tripId: req.params.tripId }, orderBy: { createdAt: 'desc' } });
    res.json({ plans: plans.map(serializeStructuredPlan) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось загрузить планы' }); }
});

// Deprecated unsafe boundary: canonical Trip mutation is available only through Plan B Core.
router.post('/trips/:tripId/monitoring/plan', requireAuth, function (req, res) {
  return res.status(410).json({
    error: 'Legacy Plan B apply is disabled; use Plan B Core',
    code: 'LEGACY_PLAN_B_DISABLED',
  });
});

router.patch('/trips/:tripId/monitoring/plan/:planId', requireAuth, async (req, res) => {
  const b = req.body || {};
  const data = {};
  if (b.status !== undefined) data.status = String(b.status);
  try {
    const access = await tripAccess(req.params.tripId, req.user.id);
    if (access.error) return res.status(access.error).json({ error: 'Нет доступа к поездке' });
    if (!access.isOwner) return res.status(403).json({ error: 'Только организатор может изменять Plan B' });
    const existing = await prisma.tripPlan.findUnique({ where: { id: req.params.planId } });
    if (!existing || existing.tripId !== req.params.tripId) return res.status(404).json({ error: 'Plan B не найден' });
    const plan = await prisma.tripPlan.update({ where: { id: req.params.planId }, data: data });
    res.json({ plan: serializeStructuredPlan(plan) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось обновить план' }); }
});

router.delete('/trips/:tripId/monitoring/plan/:planId', requireAuth, async (req, res) => {
  try {
    const access = await tripAccess(req.params.tripId, req.user.id);
    if (access.error) return res.status(access.error).json({ error: 'Нет доступа к поездке' });
    if (!access.isOwner) return res.status(403).json({ error: 'Только организатор может удалять Plan B' });
    const existing = await prisma.tripPlan.findUnique({ where: { id: req.params.planId } });
    if (!existing || existing.tripId !== req.params.tripId) return res.status(404).json({ error: 'Plan B не найден' });
    await prisma.tripPlan.delete({ where: { id: req.params.planId } });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось удалить план' }); }
});

module.exports = router;

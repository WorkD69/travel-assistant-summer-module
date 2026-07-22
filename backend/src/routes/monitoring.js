const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const assistant = require('../services/assistant');
const config = require('../config');

const router = express.Router();

function parseSteps(v) {
  if (!v) return [];
  try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}

async function ensureTrip(tripId, user, meta) {
  try {
    const existing = await prisma.trip.findUnique({ where: { id: tripId } });
    if (existing) return existing;
    meta = meta || {};
    const initials = user.initials || (user.name ? String(user.name).charAt(0).toUpperCase() : 'U');
    return await prisma.trip.create({
      data: {
        id: tripId,
        title: meta.title ? String(meta.title) : 'Моя поездка',
        route: meta.route ? String(meta.route) : null,
        status: 'active',
        type: 'group',
        ownerId: user.id,
        participants: { create: [{ userId: user.id, name: user.name, initials: initials, role: 'organizer', access: 'Активен', telegram: user.telegram || 'none', tone: 'a' }] },
      },
    });
  } catch (e) {
    console.warn('[ensureTrip] ' + (e && (e.code || e.message)));
    return null;
  }
}

router.get('/trips/:tripId/monitoring', requireAuth, async (req, res) => {
  try {
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
    await ensureTrip(req.params.tripId, req.user, {});
    const signal = await prisma.monitoringSignal.create({
      data: {
        tripId: req.params.tripId,
        label: b.label != null ? String(b.label) : (b.type != null ? String(b.type) : 'Сигнал'),
        status: b.status != null ? String(b.status) : null,
        severity: b.severity != null ? String(b.severity) : null,
        segment: b.segment != null ? String(b.segment) : null,
        source: b.source != null ? String(b.source) : null,
        detail: b.detail != null ? String(b.detail) : (b.description != null ? String(b.description) : null),
      },
    });
    res.status(201).json({ signal });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Не удалось сохранить сигнал' });
  }
});

router.get('/trips/:tripId/monitoring/assistant/history', requireAuth, async (req, res) => {
  try {
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
    await ensureTrip(tripId, req.user, body.tripMeta);
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
    const plan = await prisma.tripPlan.findFirst({ where: { tripId: req.params.tripId, status: 'active' }, orderBy: { createdAt: 'desc' } });
    res.json({ plan: plan ? Object.assign({}, plan, { steps: parseSteps(plan.steps) }) : null });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось загрузить план' }); }
});

router.get('/trips/:tripId/monitoring/plans', requireAuth, async (req, res) => {
  try {
    const plans = await prisma.tripPlan.findMany({ where: { tripId: req.params.tripId }, orderBy: { createdAt: 'desc' } });
    res.json({ plans: plans.map(function (p) { return Object.assign({}, p, { steps: parseSteps(p.steps) }); }) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось загрузить планы' }); }
});

router.post('/trips/:tripId/monitoring/plan', requireAuth, async (req, res) => {
  const tripId = req.params.tripId;
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'Не передан план для применения' });
  try {
    await ensureTrip(tripId, req.user, b.tripMeta);
    await prisma.tripPlan.updateMany({ where: { tripId: tripId, status: 'active' }, data: { status: 'archived' } });
    const email = b.emailDraft || {};
    const plan = await prisma.tripPlan.create({ data: {
      tripId: tripId,
      title: String(b.title),
      summary: b.summary ? String(b.summary) : null,
      steps: JSON.stringify(Array.isArray(b.steps) ? b.steps : []),
      pros: b.pros ? String(b.pros) : null,
      cons: b.cons ? String(b.cons) : null,
      whenToUse: b.whenToUse ? String(b.whenToUse) : null,
      emailTo: email.to || null,
      emailSubject: email.subject || null,
      emailBody: email.body || null,
      source: 'ai',
      status: 'active',
      appliedById: req.user.id,
    } });
    try {
      await prisma.monitoringSignal.create({ data: { tripId: tripId, label: 'Применён план Б: ' + plan.title, status: 'План применён', severity: 'info', source: 'ИИ-ассистент', detail: plan.summary || null } });
    } catch (sigErr) { console.warn('[plan] signal not saved: ' + (sigErr && (sigErr.code || sigErr.message))); }
    res.status(201).json({ plan: Object.assign({}, plan, { steps: parseSteps(plan.steps) }) });
  } catch (e) {
    console.error('[plan]', e && e.message ? e.message : e);
    if (e.code === 'P2003') return res.status(404).json({ error: 'Поездка не найдена в базе — нельзя применить план.', code: 'NO_TRIP' });
    res.status(500).json({ error: 'Не удалось применить план' });
  }
});

router.patch('/trips/:tripId/monitoring/plan/:planId', requireAuth, async (req, res) => {
  const b = req.body || {};
  const data = {};
  if (b.status !== undefined) data.status = String(b.status);
  try {
    const plan = await prisma.tripPlan.update({ where: { id: req.params.planId }, data: data });
    res.json({ plan: Object.assign({}, plan, { steps: parseSteps(plan.steps) }) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось обновить план' }); }
});

router.delete('/trips/:tripId/monitoring/plan/:planId', requireAuth, async (req, res) => {
  try {
    await prisma.tripPlan.delete({ where: { id: req.params.planId } });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось удалить план' }); }
});

module.exports = router;

const prisma = require('../db');
const ai = require('./ai');
const { validatePlansPayload } = require('./planValidation');
const { buildDemoAlternatives } = require('./mockGds');
const geoWeather = require('./geoWeather');

const NL = String.fromCharCode(10);

const SYSTEM_BASE = [
  'Ты — кризисный тревел-ассистент внутри приложения «Тревел-помощник».',
  'Отвечай ТОЛЬКО на русском языке.',
  'Пользователь находится в поездке и столкнулся с проблемой (поломка авто, задержка/отмена рейса, потеря документов, форс-мажор).',
  'Твоя задача:',
  '1) Если данных недостаточно — задай 1-3 коротких уточняющих вопроса (где именно находишься, тип транспорта, что случилось, есть ли крайний срок).',
  '2) Когда данных достаточно или пользователь просит план — предложи конкретные реалистичные шаги.',
  'Правила:',
  '- Пиши кратко, по делу, с эмпатией и спокойствием.',
  '- НЕ выдумывай точные факты (конкретные названия/адреса СТО, номера рейсов, цены, телефоны). Объясни, как и где их быстро проверить (2ГИС/Яндекс.Карты, сайт авиакомпании, номер на броне).',
  '- Учитывай контекст поездки: маршрут, даты, брони, участников — он дан ниже.',
  '- Помни про эффект домино: если сдвигается один сегмент (рейс), подскажи, что скорректировать дальше (трансфер, отель, следующий рейс) и как не потерять деньги.',
  '- Предлагай, при уместности, черновик письма (авиакомпании/отелю/страховой).',
].join(NL);

const PLANS_INSTRUCTIONS = [
  '',
  'Пользователю нужны ТРИ ПЛАНА Б. Это ВЗАИМОИСКЛЮЧАЮЩИЕ АЛЬТЕРНАТИВЫ решения ОДНОЙ и той же проблемы, а НЕ шаги одного плана и НЕ дополняющие друг друга действия.',
  'Пользователь выберет и применит РОВНО ОДИН из них, поэтому каждый план должен ПОЛНОСТЬЮ решать ситуацию сам по себе, без опоры на другие планы.',
  'Сделай планы действительно РАЗНЫМИ по стратегии — каждый по своей оси компромисса:',
  '  План 1 — «Быстро и дёшево»: минимум времени и денег, ты действуешь сам; допускается меньше комфорта/гарантий.',
  '  План 2 — «Надёжно и комфортно»: максимум гарантий и комфорта, обычно дороже или дольше; меньше риска.',
  '  План 3 — «Минимум усилий»: делегируешь решение (страховая, поддержка авиакомпании/отеля, тревел-агент, банк) — сам почти ничего не делаешь.',
  'В каждом плане title должен явно отражать его стратегию. В cons честно укажи, чем именно этот вариант хуже двух других, а в whenToUse — кому/когда он подходит больше всего. Планы не должны пересекаться по сути.',
  '',
  'СФОРМИРУЙ ИТОГОВЫЙ ОТВЕТ СТРОГО В ФОРМАТЕ JSON (без текста вокруг), по схеме:',
  '{',
  '  "summary": "1-2 предложения: как ты понял ситуацию",',
  '  "clarifyingQuestions": [],',
  '  "plans": [',
  '    { "title": "...", "strategy": "fast|reliable|delegate", "steps": ["..."], "pros": "...", "cons": "...", "whenToUse": "..." }',
  '  ],',
  '  "emailDraft": { "to": "...", "subject": "...", "body": "..." }',
  '}',
  'Ровно 3 элемента в plans, в порядке: быстро/дёшево, надёжно/комфортно, минимум усилий. Если данных не хватает — заполни clarifyingQuestions, иначе пустой массив. Если письмо неуместно — emailDraft: null.',
  'Весь текст внутри JSON — на русском. Верни ТОЛЬКО валидный JSON.',
].join(NL);

function fmtDate(d) {
  if (!d) return '-';
  try { return new Date(d).toISOString().slice(0, 10); } catch (e) { return String(d); }
}

async function buildLegacyTripContext(tripId) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { documents: true, participants: true, monitoringSignals: { orderBy: { createdAt: 'desc' }, take: 5 } },
  });
  if (!trip) return 'Контекст поездки недоступен.';
  const lines = [];
  lines.push('Поездка: ' + trip.title);
  lines.push('Маршрут: ' + (trip.route || '-'));
  lines.push('Даты: ' + fmtDate(trip.startDate) + ' - ' + fmtDate(trip.endDate));
  lines.push('Статус: ' + trip.status + '; тип: ' + trip.type);
  if (trip.documents && trip.documents.length) {
    lines.push('Брони и документы (сегменты):');
    trip.documents.forEach(function (d) {
      lines.push('  - ' + (d.type || 'Документ') + ': ' + (d.segment || d.name) + ' [' + d.status + ']');
    });
  }
  if (trip.participants && trip.participants.length) {
    lines.push('Участники: ' + trip.participants.map(function (p) { return p.name + ' (' + p.role + ')'; }).join(', '));
  }
  if (trip.monitoringSignals && trip.monitoringSignals.length) {
    lines.push('Последние сигналы мониторинга:');
    trip.monitoringSignals.forEach(function (s) {
      lines.push('  - [' + (s.severity || 'info') + '] ' + s.label + (s.segment ? ' - ' + s.segment : ''));
    });
  }
  return lines.join(NL);
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function safeOcrSummary(document) {
  const raw = parseJson(document.ocrData, {});
  const allowed = {};
  ['type', 'departure', 'arrival', 'departureDate', 'arrivalDate', 'departureTime', 'arrivalTime'].forEach(function (key) {
    if (raw && raw[key] != null) allowed[key] = raw[key];
  });
  return Object.keys(allowed).length ? allowed : null;
}

function planContext(plan) {
  return {
    id: plan.id,
    strategy: plan.strategy,
    title: plan.title,
    revisedRoute: plan.revisedRoute,
    segments: parseJson(plan.segments, []),
    totalDuration: plan.totalDuration,
    estimatedCost: plan.estimatedCost,
    currency: plan.currency,
    delayComparedToOriginal: plan.delayComparedToOriginal,
    transferCount: plan.transferCount,
    reliability: plan.reliability,
    risks: parseJson(plan.risks, []),
    assumptions: parseJson(plan.assumptions, []),
    requiredActions: parseJson(plan.requiredActions, []),
    hotelImpact: plan.hotelImpact,
    transferImpact: plan.transferImpact,
    activitiesImpact: plan.activitiesImpact,
    source: plan.source,
    isDemoData: plan.isDemoData,
    status: plan.status,
    appliedAt: plan.appliedAt,
  };
}

function nextTravelSegment(segments) {
  const now = Date.now();
  const ordered = (segments || []).filter(function (segment) {
    return Number.isFinite(new Date(segment.departureAt || segment.startAt || segment.date || '').getTime());
  }).sort(function (a, b) {
    return new Date(a.departureAt || a.startAt || a.date).getTime() - new Date(b.departureAt || b.startAt || b.date).getTime();
  });
  return ordered.find(function (segment) {
    return new Date(segment.departureAt || segment.startAt || segment.date).getTime() >= now;
  }) || ordered[0] || null;
}

async function buildTripContextData(tripId, options) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      documents: { orderBy: { uploadedAt: 'desc' }, take: 20 },
      participants: { orderBy: { joined: 'asc' } },
      messages: { orderBy: { createdAt: 'desc' }, take: 20 },
      monitoringSignals: { orderBy: { createdAt: 'desc' }, take: 20 },
      plans: { orderBy: { createdAt: 'desc' }, take: 10 },
      changes: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!trip) return null;
  const segments = parseJson(trip.segments, []);
  const weather = options && options.weather === false
    ? []
    : await geoWeather.weatherForRoute(trip.route, segments, options);
  const plans = (trip.plans || []).map(planContext);
  const selectedPlan = plans.find(function (plan) { return plan.status === 'applied'; }) || null;
  const sos = (trip.monitoringSignals || []).filter(function (signal) {
    return String(signal.category || '').toLowerCase() === 'sos' || /sos/i.test(String(signal.label || ''));
  });
  const risks = (trip.monitoringSignals || []).filter(function (signal) {
    return ['high', 'critical', 'warning'].includes(String(signal.severity || '').toLowerCase()) ||
      /risk|риск|delay|задерж/i.test(String(signal.label || ''));
  });
  const next = nextTravelSegment(segments);
  return {
    trip: {
      id: trip.id,
      title: trip.title,
      route: trip.route,
      startDate: trip.startDate,
      endDate: trip.endDate,
      status: trip.status,
      type: trip.type,
      updatedAt: trip.updatedAt,
    },
    segments: segments,
    timeline: segments,
    nextEvent: next,
    nextFlight: next && String(next.transportType || next.type || '').toLowerCase().includes('flight') ? next : null,
    boarding: next ? (next.boardingAt || next.boardingTime || null) : null,
    participants: (trip.participants || []).map(function (participant) {
      return { id: participant.id, name: participant.name, role: participant.role, access: participant.access };
    }),
    documents: (trip.documents || []).map(function (document) {
      return { id: document.id, name: document.name, type: document.type, status: document.status, ocrSummary: safeOcrSummary(document) };
    }),
    messages: (trip.messages || []).map(function (message) {
      return { id: message.id, title: message.title, body: message.body, status: message.status, createdAt: message.createdAt };
    }),
    monitoring: (trip.monitoringSignals || []).map(function (signal) {
      return { id: signal.id, label: signal.label, status: signal.status, severity: signal.severity, detail: signal.detail, createdAt: signal.createdAt };
    }),
    risks: risks.map(function (risk) { return { id: risk.id, label: risk.label, severity: risk.severity, detail: risk.detail }; }),
    plans: plans.slice(0, 3),
    selectedPlan: selectedPlan,
    sos: sos.map(function (signal) { return { id: signal.id, label: signal.label, status: signal.status, detail: signal.detail, createdAt: signal.createdAt }; }),
    recentChanges: (trip.changes || []).map(function (change) {
      return { id: change.id, type: change.type, oldValue: change.oldValue, newValue: change.newValue, createdAt: change.createdAt };
    }),
    weather: weather,
  };
}

async function buildTripContext(tripId) {
  const context = await buildTripContextData(tripId);
  if (!context) return 'Контекст поездки недоступен.';
  return 'АКТУАЛЬНЫЙ КОНТЕКСТ ПОЕЗДКИ (backend source of truth):' + NL + JSON.stringify(context, null, 2);
}

function toMessages(messages) {
  return (messages || [])
    .filter(function (m) { return m && m.content; })
    .map(function (m) { return { role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) }; });
}

async function chat(args) {
  const tripId = args.tripId; const messages = args.messages;
  const ctx = await buildTripContext(tripId);
  const system = SYSTEM_BASE + NL + NL + '=== КОНТЕКСТ ПОЕЗДКИ ===' + NL + ctx;
  const reply = await ai.generate({ system: system, messages: toMessages(messages) });
  return { mode: 'dialog', reply: reply };
}

async function plans(args) {
  const trip = await prisma.trip.findUnique({ where: { id: args.tripId } });
  if (!trip) {
    const error = new Error('Поездка не найдена');
    error.status = 404;
    throw error;
  }
  const payload = validatePlansPayload(buildDemoAlternatives(trip));
  return Object.assign({ mode: 'plans' }, payload);
}

module.exports = {
  chat: chat,
  plans: plans,
  buildTripContext: buildTripContext,
  buildTripContextData: buildTripContextData,
  safeOcrSummary: safeOcrSummary,
};

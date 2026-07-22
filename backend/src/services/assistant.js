const prisma = require('../db');
const ai = require('./ai');

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

async function buildTripContext(tripId) {
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
  const tripId = args.tripId; const messages = args.messages;
  const ctx = await buildTripContext(tripId);
  const system = SYSTEM_BASE + NL + NL + '=== КОНТЕКСТ ПОЕЗДКИ ===' + NL + ctx + NL + PLANS_INSTRUCTIONS;
  const raw = await ai.generate({ system: system, messages: toMessages(messages), json: true });
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const start = raw ? raw.indexOf('{') : -1;
    const end = raw ? raw.lastIndexOf('}') : -1;
    if (start !== -1 && end !== -1 && end > start) { parsed = JSON.parse(raw.slice(start, end + 1)); }
    else { parsed = { summary: raw, plans: [] }; }
  }
  return Object.assign({ mode: 'plans' }, parsed);
}

module.exports = { chat: chat, plans: plans, buildTripContext: buildTripContext };

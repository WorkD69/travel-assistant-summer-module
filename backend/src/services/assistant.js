const { z } = require('zod');

const { documentVisible } = require('./document-tokens');

const MAX_PROVIDER_BYTES = 256 * 1024;

const emailDraftSchema = z.object({
  subject: z.string().min(1).max(180),
  body: z.string().min(1).max(4000),
});

const planSchema = z.object({
  strategy: z.enum(['speed', 'comfort', 'budget']),
  title: z.string().min(3).max(120),
  summary: z.string().min(3).max(1000),
  steps: z.array(z.string().min(1).max(500)).min(1).max(8),
  pros: z.array(z.string().min(1).max(300)).min(1).max(8),
  cons: z.array(z.string().min(1).max(300)).min(1).max(8),
  whenToUse: z.string().min(1).max(700),
  timeImpact: z.string().min(1).max(200),
  priceImpact: z.string().min(1).max(200),
  affectedElements: z.array(z.string().min(1).max(200)).max(12),
  emailDraft: emailDraftSchema,
});

const planResponseSchema = z.object({ plans: z.array(planSchema).length(3) }).superRefine((value, context) => {
  if (new Set(value.plans.map((plan) => plan.strategy)).size !== 3) {
    context.addIssue({ code: 'custom', message: 'Plan strategies must be distinct' });
  }
});

function stripCodeFence(value) {
  return String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

function parsePlanResponse(value) {
  const parsed = planResponseSchema.parse(JSON.parse(stripCodeFence(value)));
  return parsed.plans.map((plan, index) => ({ ...plan, rank: index + 1, generationSource: 'groq' }));
}

function fallbackPlanCandidates(incident) {
  const reason = String(incident?.detail || incident?.label || 'изменение маршрута').slice(0, 500);
  return [
    {
      rank: 1,
      strategy: 'speed',
      title: 'Быстро восстановить маршрут',
      summary: `Минимизировать задержку после события: ${reason}`,
      steps: ['Связаться с перевозчиком или принимающей стороной', 'Забронировать ближайший подтверждённый вариант', 'Сообщить участникам новое время'],
      pros: ['Минимальная потеря времени'],
      cons: ['Стоимость может быть выше'],
      whenToUse: 'Когда критично продолжить поездку как можно быстрее',
      timeImpact: 'Минимально возможная задержка',
      priceImpact: 'Возможна доплата за срочную замену',
      affectedElements: ['транспорт', 'уведомления участникам'],
      emailDraft: { subject: 'Срочная замена маршрута', body: `Просим предложить ближайшую подтверждённую замену в связи с событием: ${reason}.` },
      generationSource: 'deterministic-fallback',
    },
    {
      rank: 2,
      strategy: 'comfort',
      title: 'Сохранить комфорт поездки',
      summary: `Выбрать надёжное решение с удобными пересадками после события: ${reason}`,
      steps: ['Проверить официальные альтернативы', 'Подтвердить места, багаж и правила возврата', 'Согласовать отель и трансфер'],
      pros: ['Ниже риск повторного сбоя', 'Удобнее для группы'],
      cons: ['Ожидание может быть дольше'],
      whenToUse: 'Когда важнее предсказуемость и комфорт участников',
      timeImpact: 'Умеренная задержка',
      priceImpact: 'Средняя доплата зависит от условий поставщика',
      affectedElements: ['транспорт', 'отель', 'трансфер'],
      emailDraft: { subject: 'Подтверждение комфортной альтернативы', body: `Просим подтвердить доступность мест и связанные услуги после события: ${reason}.` },
      generationSource: 'deterministic-fallback',
    },
    {
      rank: 3,
      strategy: 'budget',
      title: 'Снизить дополнительные расходы',
      summary: `Использовать возврат и бюджетные альтернативы после события: ${reason}`,
      steps: ['Зафиксировать право на возврат или обмен', 'Сравнить подтверждённые бюджетные варианты', 'Обновить маршрут после получения подтверждения'],
      pros: ['Минимальная дополнительная стоимость'],
      cons: ['Больше ожидания и ручной проверки'],
      whenToUse: 'Когда бюджет важнее скорости',
      timeImpact: 'Возможна значительная задержка',
      priceImpact: 'Минимальная доплата или возврат',
      affectedElements: ['билет', 'бюджет', 'расписание'],
      emailDraft: { subject: 'Запрос обмена или возврата', body: `Просим подтвердить варианты обмена или возврата в связи с событием: ${reason}.` },
      generationSource: 'deterministic-fallback',
    },
  ];
}

function buildSafeContext(input) {
  const trip = input.trip || {};
  return {
    trip: {
      id: trip.id,
      title: trip.title,
      route: trip.route,
      startDate: trip.startDate,
      endDate: trip.endDate,
      timezone: trip.timezone,
      status: trip.status,
    },
    routePoints: (input.routePoints || []).slice(0, 12).map((point) => ({ name: point.name, sortOrder: point.sortOrder })),
    events: (input.events || []).slice(0, 100).map((event) => ({
      title: event.title, type: event.type, startsAt: event.startsAt, endsAt: event.endsAt,
      status: event.status, departure: event.departure, arrival: event.arrival,
      detail: event.detail, source: event.source, reference: event.reference,
    })),
    documents: (input.documents || []).slice(0, 100).map((document) => ({
      id: document.id, name: document.name, type: document.type, status: document.status,
      visibility: document.visibility, segment: document.segment,
    })),
    messages: (input.messages || []).slice(0, 100).map((message) => ({
      title: message.title, content: message.content, status: message.status, publishedAt: message.publishedAt,
    })),
    sos: (input.sos || []).slice(0, 50).map((ticket) => ({
      status: ticket.status, category: ticket.category, description: ticket.description, createdAt: ticket.createdAt,
    })),
    monitoring: (input.monitoring || []).slice(0, 20).map((signal) => ({
      label: signal.label, detail: signal.detail, severity: signal.severity, status: signal.status,
    })),
    plans: (input.plans || []).slice(0, 10).map((plan) => ({
      title: plan.title, summary: plan.summary, steps: plan.steps, status: plan.status, visibility: plan.visibility,
    })),
    history: (input.history || []).slice(0, 20).map((message) => ({ role: message.role, content: message.content })),
  };
}

function assistantMessageVisible(message, userId, role) {
  if (role === 'organizer') return true;
  const audience = message.audience;
  if (!audience || audience === 'all' || audience === 'participants') return true;
  if (Array.isArray(audience)) return audience.includes(userId);
  if (typeof audience === 'object') {
    return Boolean(
      audience.all === true || audience.type === 'all-participants' ||
      audience.user_ids?.includes(userId) || audience.participantIds?.includes(userId) ||
      audience.roles?.includes(role)
    );
  }
  return false;
}

async function loadSafeContext(prisma, { access, userId }) {
  const tripId = access.trip.id;
  const [routePoints, events, documents, messages, sos, monitoring, plans, history] = await Promise.all([
    prisma.routePoint.findMany({ where: { tripId }, orderBy: { sortOrder: 'asc' }, take: 12 }),
    prisma.tripEvent.findMany({ where: { tripId }, orderBy: [{ sortOrder: 'asc' }, { startsAt: 'asc' }], take: 100 }),
    prisma.document.findMany({ where: { tripId, status: { notIn: ['deleted', 'revoked'] } }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.message.findMany({ where: { tripId, status: 'published' }, orderBy: { publishedAt: 'desc' }, take: 100 }),
    prisma.sosTicket.findMany({ where: { tripId, ...(access.role === 'organizer' ? {} : { authorUserId: userId }) }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.monitoringSignal.findMany({ where: { tripId, status: 'confirmed' }, orderBy: { occurredAt: 'desc' }, take: 20 }),
    prisma.tripPlan.findMany({ where: { tripId, status: { in: ['selected', 'published'] }, ...(access.role === 'organizer' ? {} : { visibility: 'published' }) }, orderBy: { updatedAt: 'desc' }, take: 10 }),
    prisma.assistantMessage.findMany({ where: { tripId, userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  return buildSafeContext({
    trip: access.trip,
    routePoints,
    events,
    documents: documents.filter((document) => documentVisible(document, userId, access.role)),
    messages: messages.filter((message) => assistantMessageVisible(message, userId, access.role)),
    sos,
    monitoring,
    plans,
    history: history.reverse(),
  });
}

function completionUrl(baseUrl) {
  const normalized = String(baseUrl || 'https://api.groq.com/openai/v1').replace(/\/+$/, '') + '/';
  return new URL('chat/completions', normalized);
}

async function chatCompletion(messages, { ai, fetchImpl = fetch, model, json = false }) {
  let response;
  try {
    response = await fetchImpl(completionUrl(ai.baseUrl), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${ai.apiKey}` },
      body: JSON.stringify({ model, messages, temperature: json ? 0.2 : 0.3, max_tokens: json ? 3500 : 1200, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
      signal: AbortSignal.timeout(ai.timeoutMs || 15_000),
    });
  } catch {
    throw new Error('ai_unavailable');
  }
  if (!response.ok) throw new Error('ai_unavailable');
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_PROVIDER_BYTES) throw new Error('ai_unavailable');
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error('ai_unavailable'); }
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('ai_unavailable');
  return content.trim();
}

function aiModels(ai) {
  return [...new Set([ai?.model, ai?.fallbackModel].filter(Boolean))];
}

async function generatePlanCandidates(incident, context, options = {}) {
  const ai = options.ai || {};
  if (!ai.apiKey) return fallbackPlanCandidates(incident);
  const messages = [
    { role: 'system', content: 'Ты помощник организатора поездки. Верни только JSON с plans: ровно speed, comfort, budget. Не выбирай и не публикуй план.' },
    { role: 'user', content: JSON.stringify({ incident: { label: incident?.label, detail: incident?.detail }, context }) },
  ];
  for (const model of aiModels(ai)) {
    try {
      return parsePlanResponse(await chatCompletion(messages, { ...options, ai, model, json: true }));
    } catch {
      // Try the already configured fallback model before deterministic output.
    }
  }
  return fallbackPlanCandidates(incident);
}

async function generateAssistantAnswer(question, context, options = {}) {
  const safeQuestion = String(question || '').trim().slice(0, 2000);
  const ai = options.ai || {};
  if (ai.apiKey && safeQuestion) {
    const messages = [
      { role: 'system', content: 'Отвечай кратко по-русски только по переданному безопасному контексту поездки. Не выдумывай факты и не раскрывай скрытые документы.' },
      { role: 'user', content: JSON.stringify({ question: safeQuestion, context }) },
    ];
    for (const model of aiModels(ai)) {
      try {
        const answer = await chatCompletion(messages, { ...options, ai, model });
        if (answer.length <= 6000) return { answer, source: 'groq' };
      } catch {
        // Try the configured fallback model.
      }
    }
  }
  const tripTitle = context?.trip?.title || 'поездки';
  return {
    answer: `Сейчас доступна сохранённая информация по ${tripTitle}. Проверьте опубликованные сообщения, маршрут и ближайшие события; при угрозе безопасности используйте SOS.`,
    source: 'deterministic-fallback',
  };
}

module.exports = {
  MAX_PROVIDER_BYTES,
  buildSafeContext,
  chatCompletion,
  fallbackPlanCandidates,
  generateAssistantAnswer,
  generatePlanCandidates,
  loadSafeContext,
  parsePlanResponse,
};

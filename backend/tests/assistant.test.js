const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  buildSafeContext,
  generateAssistantAnswer,
  generatePlanCandidates,
  parsePlanResponse,
} = require('../src/services/assistant');

const ai = {
  baseUrl: 'https://api.groq.com/openai/v1',
  apiKey: 'server-secret-key',
  model: 'primary-model',
  fallbackModel: 'fallback-model',
  timeoutMs: 15_000,
};

function response(content) {
  return {
    ok: true,
    status: 200,
    async text() { return JSON.stringify({ choices: [{ message: { content } }] }); },
  };
}

function validPlanPayload() {
  return JSON.stringify({ plans: [
    {
      strategy: 'speed', title: 'Самый быстрый путь', summary: 'Сократить задержку', steps: ['Позвонить перевозчику'],
      pros: ['Быстро'], cons: ['Дороже'], whenToUse: 'Критично время', timeImpact: '+1 час', priceImpact: '+5000 ₽',
      affectedElements: ['рейс'], emailDraft: { subject: 'Запрос на замену', body: 'Просим подтвердить замену.' },
    },
    {
      strategy: 'comfort', title: 'Комфортный путь', summary: 'Сохранить удобство', steps: ['Подтвердить отель'],
      pros: ['Удобно'], cons: ['Дольше'], whenToUse: 'Важен комфорт', timeImpact: '+3 часа', priceImpact: '+2000 ₽',
      affectedElements: ['отель'], emailDraft: { subject: 'Перенос заселения', body: 'Просим перенести заселение.' },
    },
    {
      strategy: 'budget', title: 'Экономный путь', summary: 'Снизить доплату', steps: ['Проверить возврат'],
      pros: ['Дешевле'], cons: ['Ожидание'], whenToUse: 'Ограничен бюджет', timeImpact: '+6 часов', priceImpact: '0 ₽',
      affectedElements: ['билет'], emailDraft: { subject: 'Запрос возврата', body: 'Просим оформить возврат.' },
    },
  ] });
}

describe('safe site assistant', () => {
  test('builds role-filtered context without document contents or foreign SOS', () => {
    const context = buildSafeContext({
      trip: { id: 't-1', title: 'Trip', route: 'A → B', ownerId: 'private-owner-id' },
      routePoints: [{ name: 'A', latitude: 1, longitude: 2 }],
      events: [{ title: 'Flight', startsAt: new Date('2026-08-01T10:00:00Z'), document: { extractedText: 'passport secret' } }],
      documents: [{ id: 'd-1', name: 'Ticket', type: 'ticket', extractedText: 'passport secret', extractedData: { number: 'SECRET' }, blob: { bytes: 'SECRET' } }],
      messages: [{ title: 'Plan B', content: 'Published decision', status: 'published' }],
      sos: [{ id: 's-own', authorUserId: 'u-1', description: 'Need help' }],
      monitoring: [{ label: 'Delay', detail: 'Two hours', status: 'confirmed' }],
      plans: [{ title: 'Published plan', summary: 'Use train', visibility: 'published' }],
    });
    const serialized = JSON.stringify(context);
    assert.match(serialized, /Published decision/);
    assert.match(serialized, /Need help/);
    assert.doesNotMatch(serialized, /passport secret|SECRET|private-owner-id|extractedText|extractedData|blob/);
  });

  test('accepts only exactly three validated distinct Plan B strategies', () => {
    const plans = parsePlanResponse(validPlanPayload());
    assert.equal(plans.length, 3);
    assert.deepEqual(plans.map((plan) => plan.rank), [1, 2, 3]);
    assert.throws(() => parsePlanResponse(JSON.stringify({ plans: JSON.parse(validPlanPayload()).plans.slice(0, 2) })));
    const duplicate = JSON.parse(validPlanPayload());
    duplicate.plans[2].strategy = 'speed';
    assert.throws(() => parsePlanResponse(JSON.stringify(duplicate)));
  });

  test('uses Groq server-side and never puts its key into generated content', async () => {
    let request;
    const plans = await generatePlanCandidates(
      { label: 'Delay', detail: 'Four hours' },
      { trip: { title: 'Trip' } },
      { ai, fetchImpl: async (url, options) => { request = { url, options }; return response(validPlanPayload()); } },
    );
    assert.equal(plans.length, 3);
    assert.equal(plans[0].generationSource, 'groq');
    assert.equal(request.options.headers.Authorization, `Bearer ${ai.apiKey}`);
    assert.doesNotMatch(JSON.stringify(plans), new RegExp(ai.apiKey));
  });

  test('falls back to exactly three deterministic plans for malformed or unavailable AI', async () => {
    const plans = await generatePlanCandidates(
      { label: 'Delay', detail: 'Four hours' },
      { trip: { title: 'Trip' } },
      { ai, fetchImpl: async () => response('{broken') },
    );
    assert.equal(plans.length, 3);
    assert.deepEqual(plans.map((plan) => plan.strategy), ['speed', 'comfort', 'budget']);
    assert.ok(plans.every((plan) => plan.generationSource === 'deterministic-fallback'));
  });

  test('persists a bounded ordinary answer contract with a deterministic fallback', async () => {
    const answer = await generateAssistantAnswer('Что изменилось?', { messages: [{ content: 'Plan B опубликован' }] }, {
      ai,
      fetchImpl: async () => response('Опубликован новый Plan B.'),
    });
    assert.equal(answer.source, 'groq');
    assert.match(answer.answer, /Plan B/);
    const fallback = await generateAssistantAnswer('Что изменилось?', { trip: { title: 'Trip' } }, {
      ai: { ...ai, apiKey: '' },
    });
    assert.equal(fallback.source, 'deterministic-fallback');
    assert.ok(fallback.answer.length > 10);
  });
});

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const request = require('supertest');

const { createApp } = require('../src/app');
const { COOKIE_NAME, issueSession } = require('../src/security/site-auth');

const user = { id: 'u-1', name: 'Anna', email: 'anna@example.test' };
const config = {
  isProduction: false,
  allowedOrigins: [],
  jwtSecret: 'j'.repeat(32),
  serviceToken: 's'.repeat(32),
  sessionTtlSeconds: 3600,
  documentTokenTtlSeconds: 300,
  linkTokenTtlSeconds: 600,
  ai: { baseUrl: 'https://api.groq.com/openai/v1', apiKey: '', model: 'primary', fallbackModel: 'fallback', timeoutMs: 15000 },
};

function fixture(role = 'participant') {
  const writes = [];
  const prisma = {
    user: { async findUnique() { return user; } },
    trip: { async findUnique() { return {
      id: 't-1', title: 'Trip', route: 'Moscow → Antalya', ownerId: role === 'organizer' ? 'u-1' : 'u-owner',
      startDate: new Date('2026-08-01'), endDate: new Date('2026-08-08'), timezone: 'Europe/Moscow', status: 'active',
      participants: role === 'organizer' ? [] : [{ userId: 'u-1', role, status: 'active' }],
    }; } },
    participant: {},
    routePoint: { async findMany() { return [{ name: 'Moscow', sortOrder: 0 }, { name: 'Antalya', sortOrder: 1 }]; } },
    tripEvent: { async findMany() { return [{ title: 'Flight', startsAt: new Date('2026-08-01T10:00:00Z'), status: 'scheduled' }]; } },
    document: { async findMany() { return [{ id: 'd-1', name: 'Ticket', type: 'ticket', status: 'confirmed', visibility: 'shared', extractedText: 'passport secret' }]; } },
    message: { async findMany() { return [{ title: 'Plan B', content: 'Published plan', status: 'published' }]; } },
    sosTicket: { async findMany() { return [{ authorUserId: 'u-1', category: 'other', description: 'Need help', status: 'open' }]; } },
    monitoringSignal: { async findMany() { return [{ label: 'Delay', detail: 'Two hours', status: 'confirmed' }]; } },
    tripPlan: { async findMany() { return [{ title: 'Published plan', visibility: 'published', status: 'published', steps: [] }]; } },
    assistantMessage: {
      async create(input) {
        writes.push(input.data);
        return { id: `a-${writes.length}`, ...input.data, createdAt: new Date('2026-07-22T10:00:00Z') };
      },
      async findMany(input) {
        prisma.historyQuery = input;
        return [{ id: 'a-1', role: 'assistant', content: 'Saved answer', mode: 'dialog', createdAt: new Date('2026-07-22T10:00:00Z') }];
      },
    },
    async $queryRaw() { return [{ ok: 1 }]; },
  };
  return { prisma, writes };
}

describe('site assistant routes', () => {
  test('answers through the safe trip context and persists role-owned history', async () => {
    const { prisma, writes } = fixture('participant');
    const cookie = `${COOKIE_NAME}=${issueSession(user, config)}`;
    const response = await request(createApp({ config, prisma }))
      .post('/api/site/trips/t-1/assistant')
      .set('Cookie', cookie)
      .send({ question: 'Что изменилось?' });
    assert.equal(response.status, 200);
    assert.equal(response.body.source, 'deterministic-fallback');
    assert.equal(writes.length, 2);
    assert.deepEqual(writes.map((item) => item.role), ['user', 'assistant']);
    assert.ok(writes.every((item) => item.userId === 'u-1' && item.tripId === 't-1'));
    assert.doesNotMatch(JSON.stringify(response.body), /passport secret/);
  });

  test('returns only the current user history for the current trip', async () => {
    const { prisma } = fixture('participant');
    const cookie = `${COOKIE_NAME}=${issueSession(user, config)}`;
    const response = await request(createApp({ config, prisma }))
      .get('/api/site/trips/t-1/assistant/history')
      .set('Cookie', cookie);
    assert.equal(response.status, 200);
    assert.equal(response.body.items[0].content, 'Saved answer');
    assert.deepEqual(prisma.historyQuery.where, { tripId: 't-1', userId: 'u-1' });
  });

  test('does not allow a participant to generate internal Plan B candidates', async () => {
    const { prisma } = fixture('participant');
    const cookie = `${COOKIE_NAME}=${issueSession(user, config)}`;
    const response = await request(createApp({ config, prisma }))
      .post('/api/site/trips/t-1/monitoring/sig-1/plans')
      .set('Cookie', cookie);
    assert.equal(response.status, 403);
  });
});

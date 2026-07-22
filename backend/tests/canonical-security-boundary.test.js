const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const jwt = require('jsonwebtoken');
const request = require('supertest');

const { createApp } = require('../src/app');
const { createMonitoringAccessGuard } = require('../src/middleware/canonical-site-guard');

function settings(overrides = {}) {
  return {
    nodeEnv: 'test', isProduction: false, allowedOrigins: [], jwtSecret: 'j'.repeat(32),
    serviceToken: 's'.repeat(32), telegramBotUsername: 'travel_helper_bot',
    linkTokenTtlSeconds: 600, documentTokenTtlSeconds: 300,
    ai: { apiKey: '', baseUrl: 'https://ai.example.test', model: 'test' },
    ...overrides,
  };
}

function cookie(userId, config) {
  return `token=${jwt.sign({ sub: userId, email: `${userId}@example.test` }, config.jwtSecret)}`;
}

function physicalFixture() {
  const writes = [];
  const users = new Map([
    ['owner', { id: 'owner', email: 'owner@example.test', name: 'Owner', passwordHash: 'x' }],
    ['attacker', { id: 'attacker', email: 'attacker@example.test', name: 'Attacker', passwordHash: 'x' }],
  ]);
  const trips = new Map([
    ['victim-trip', { id: 'victim-trip', title: 'Victim', ownerId: 'owner', participants: [], events: [] }],
    ['attacker-trip', { id: 'attacker-trip', title: 'Attacker', ownerId: 'attacker', participants: [], events: [] }],
  ]);
  const physical = {
    writes,
    user: { async findUnique({ where }) { return users.get(where.id) || null; } },
    trip: { async findUnique({ where }) { return trips.get(where.id) || null; } },
    participant: {
      async findUnique({ where }) {
        return where.id === 'victim-participant'
          ? { id: where.id, tripId: 'victim-trip', userId: 'owner' }
          : null;
      },
      async update(args) { writes.push(args); return { id: args.where.id, tripId: 'victim-trip' }; },
    },
    async $queryRaw() { return [{ ok: 1 }]; },
  };
  return physical;
}

function runMiddleware(middleware, req) {
  return new Promise((resolve) => middleware(req, {}, resolve));
}

describe('canonical route infrastructure security boundary', () => {
  test('blocks applying a Plan B to an unrelated trip before canonical logic runs', async () => {
    const config = settings();
    const physical = physicalFixture();
    const response = await request(createApp({ config, prisma: physical }))
      .post('/api/trips/victim-trip/monitoring/plan')
      .set('Cookie', cookie('attacker', config))
      .send({ title: 'Injected plan' });
    assert.equal(response.status, 404);
    assert.equal(physical.writes.length, 0);
  });

  test('blocks a child ID belonging to another trip', async () => {
    const config = settings();
    const physical = physicalFixture();
    const response = await request(createApp({ config, prisma: physical }))
      .patch('/api/trips/attacker-trip/participants/victim-participant')
      .set('Cookie', cookie('attacker', config))
      .send({ name: 'Changed' });
    assert.equal(response.status, 404);
    assert.equal(physical.writes.length, 0);
  });

  test('preserves canonical bootstrap POST semantics for a missing trip', async () => {
    const guard = createMonitoringAccessGuard({ prisma: physicalFixture() });
    const result = await runMiddleware(guard, {
      method: 'POST', path: '/plan', params: { tripId: 'new-trip' }, user: { id: 'owner' },
    });
    assert.equal(result, undefined);
  });

  test('preserves canonical empty read semantics for a missing trip', async () => {
    const guard = createMonitoringAccessGuard({ prisma: physicalFixture() });
    const result = await runMiddleware(guard, {
      method: 'GET', path: '/plan', params: { tripId: 'new-trip' }, user: { id: 'owner' },
    });
    assert.equal(result, undefined);
  });

  test('still blocks non-bootstrap mutations for a missing trip', async () => {
    const guard = createMonitoringAccessGuard({ prisma: physicalFixture() });
    const result = await runMiddleware(guard, {
      method: 'PATCH', path: '/plan/plan-1', params: { tripId: 'new-trip' }, user: { id: 'owner' },
    });
    assert.equal(result.status, 404);
  });

  test('enforces the configured production browser Origin', async () => {
    const config = settings({ isProduction: true, allowedOrigins: ['https://preview.example.test'] });
    const response = await request(createApp({ config, prisma: physicalFixture() }))
      .post('/api/auth/register')
      .set('Origin', 'https://evil.example.test')
      .send({ name: 'Evil', email: 'evil@example.test', password: 'password' });
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'origin_denied');
  });
});

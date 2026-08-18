'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const test = require('node:test');
const { createPlanBRouter } = require('../src/routes/planB');

function trip(id, ownerId, participants) {
  return {
    id: id,
    ownerId: ownerId,
    title: id,
    route: 'SVO → LED',
    segments: JSON.stringify([{
      id: id + '-segment', transportType: 'flight', departurePlace: 'SVO', arrivalPlace: 'LED',
      departureAt: '2026-08-20T08:00:00+03:00', arrivalAt: '2026-08-20T09:00:00+03:00',
      serviceNumber: 'SU1', carrierName: 'Carrier', order: 0, transportOptionId: 'original', source: 'tutu-mcp', fetchedAt: '2026-08-17T08:00:00.000Z',
    }]),
    startDate: new Date('2026-08-20T08:00:00+03:00'),
    endDate: new Date('2026-08-20T09:00:00+03:00'),
    status: 'active', type: 'solo', participants: participants || [],
  };
}

function fakePrisma(trips) {
  return {
    trip: {
      async findUnique(input) {
        return trips.find(function (entry) { return entry.id === input.where.id; }) || null;
      },
    },
  };
}

function auth(req, res, next) {
  const userId = req.get('x-test-user');
  if (!userId) return res.status(401).json({ error: 'Authentication required' });
  req.user = { id: userId };
  next();
}

async function withServer(router, callback) {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  const server = http.createServer(app);
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  try {
    const address = server.address();
    await callback('http://127.0.0.1:' + address.port);
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }
}

async function request(baseUrl, path, userId, body, headers) {
  const response = await fetch(baseUrl + path, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, userId ? { 'x-test-user': userId } : {}, headers || {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('Plan B routes require authentication and deny cross-trip IDOR before service invocation', async () => {
  const calls = [];
  const service = {
    async createDemoDisruption(input) { calls.push(['disruption', input]); return { source: 'DEMO_SIMULATION', type: 'DELAYED' }; },
    async createPreview(input) { calls.push(['preview', input]); return { tripId: input.trip.id, candidates: [] }; },
    async apply(input) { calls.push(['apply', input]); return { applied: true, applyId: 'apply-a', trip: input.trip }; },
    async revert(input) { calls.push(['revert', input]); return { reverted: true, revertId: 'revert-a', trip: input.trip }; },
  };
  const router = createPlanBRouter({
    prisma: fakePrisma([
      trip('trip-a', 'user-a'),
      trip('trip-b', 'user-b'),
    ]),
    requireAuth: auth,
    adapter: { async search() { return []; } },
    service: service,
  });
  await withServer(router, async function (baseUrl) {
    const unauthenticated = await request(baseUrl, '/api/trips/trip-a/disruptions/demo', null, { type: 'DELAYED' });
    assert.equal(unauthenticated.status, 401);
    const denied = await request(baseUrl, '/api/trips/trip-b/disruptions/demo', 'user-a', { type: 'DELAYED' });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, 'PLAN_B_TRIP_ACCESS_DENIED');
    const missing = await request(baseUrl, '/api/trips/missing/plan-b/preview', 'user-a', { preferences: ['faster'] });
    assert.equal(missing.status, 404);
    assert.equal(calls.length, 0);
  });
});

test('active linked participant can preview but cannot apply or revert another owner\'s Trip', async () => {
  const calls = [];
  const participantTrip = trip('trip-a', 'user-a', [{ userId: 'user-p', access: 'active', role: 'participant' }]);
  const service = {
    async createDemoDisruption(input) { calls.push(['disruption', input]); return { source: 'DEMO_SIMULATION', type: 'DELAYED' }; },
    async createPreview(input) { calls.push(['preview', input]); return { tripId: input.trip.id, candidates: [] }; },
    async apply(input) { calls.push(['apply', input]); return { applied: true, applyId: 'apply-a', trip: input.trip }; },
    async revert(input) { calls.push(['revert', input]); return { reverted: true, revertId: 'revert-a', trip: input.trip }; },
  };
  const router = createPlanBRouter({
    prisma: fakePrisma([participantTrip]), requireAuth: auth, adapter: { async search() { return []; } }, service: service,
  });
  await withServer(router, async function (baseUrl) {
    const preview = await request(baseUrl, '/api/trips/trip-a/plan-b/preview', 'user-p', { preferences: ['faster'] });
    assert.equal(preview.status, 200);
    assert.equal(calls.length, 1);
    const apply = await request(baseUrl, '/api/trips/trip-a/plan-b/apply', 'user-p', {
      proposalId: 'pbp-another-trip', candidateId: 'pbc-another-trip',
    }, { 'idempotency-key': 'route-idempotency-0001' });
    assert.equal(apply.status, 403);
    assert.equal(apply.body.error.code, 'PLAN_B_OWNER_REQUIRED');
    const revert = await request(baseUrl, '/api/trips/trip-a/plan-b/revert', 'user-p', {});
    assert.equal(revert.status, 403);
    assert.equal(calls.filter(function (call) { return call[0] === 'apply' || call[0] === 'revert'; }).length, 0);
  });
});

test('owner apply response explicitly states that Plan B did not complete a provider purchase', async () => {
  const ownerTrip = trip('trip-a', 'user-a');
  const router = createPlanBRouter({
    prisma: fakePrisma([ownerTrip]),
    requireAuth: auth,
    adapter: { async search() { return []; } },
    service: {
      async createDemoDisruption() { return { source: 'DEMO_SIMULATION', type: 'DELAYED' }; },
      async createPreview() { return { tripId: 'trip-a', candidates: [] }; },
      async apply() { return { applied: true, applyId: 'apply-a', trip: ownerTrip }; },
      async revert() { return { reverted: true, revertId: 'revert-a', trip: ownerTrip }; },
    },
  });
  await withServer(router, async function (baseUrl) {
    const applied = await request(baseUrl, '/api/trips/trip-a/plan-b/apply', 'user-a', {
      proposalId: 'pbp-a', candidateId: 'pbc-a',
    }, { 'idempotency-key': 'route-idempotency-0002' });
    assert.equal(applied.status, 201);
    assert.equal(applied.body.purchaseCompleted, false);
  });
});

test('preview exposes a controlled fail-closed response when recovery cutoff data is invalid', async () => {
  const ownerTrip = trip('trip-a', 'user-a');
  const cutoffError = Object.assign(
    new Error('Trusted demo disruption timestamps cannot establish a recovery cutoff'),
    { code: 'PLAN_B_RECOVERY_CUTOFF_INVALID', status: 409, retryable: false },
  );
  const router = createPlanBRouter({
    prisma: fakePrisma([ownerTrip]),
    requireAuth: auth,
    adapter: { async search() { return []; } },
    service: {
      async createDemoDisruption() { return { source: 'DEMO_SIMULATION', type: 'DELAYED' }; },
      async createPreview() { throw cutoffError; },
      async apply() { return { applied: true, applyId: 'apply-a', trip: ownerTrip }; },
      async revert() { return { reverted: true, revertId: 'revert-a', trip: ownerTrip }; },
    },
  });
  await withServer(router, async function (baseUrl) {
    const preview = await request(baseUrl, '/api/trips/trip-a/plan-b/preview', 'user-a', { preferences: ['faster'] });
    assert.equal(preview.status, 409);
    assert.equal(preview.body.error.code, 'PLAN_B_RECOVERY_CUTOFF_INVALID');
    assert.equal(preview.body.error.retryable, false);
  });
});

test('preview exposes a controlled fail-closed response for invalid persisted recovery context', async () => {
  const ownerTrip = trip('trip-a', 'user-a');
  const contextError = Object.assign(
    new Error('Stored Tutu recovery search context is invalid'),
    { code: 'PLAN_B_RECOVERY_CONTEXT_INVALID', status: 409, retryable: false },
  );
  const router = createPlanBRouter({
    prisma: fakePrisma([ownerTrip]),
    requireAuth: auth,
    adapter: { async search() { return []; } },
    service: {
      async createDemoDisruption() { return { source: 'DEMO_SIMULATION', type: 'DELAYED' }; },
      async createPreview() { throw contextError; },
      async apply() { return { applied: true, applyId: 'apply-a', trip: ownerTrip }; },
      async revert() { return { reverted: true, revertId: 'revert-a', trip: ownerTrip }; },
    },
  });
  await withServer(router, async function (baseUrl) {
    const preview = await request(baseUrl, '/api/trips/trip-a/plan-b/preview', 'user-a', { preferences: ['faster'] });
    assert.equal(preview.status, 409);
    assert.deepEqual(preview.body, {
      error: {
        code: 'PLAN_B_RECOVERY_CONTEXT_INVALID',
        message: 'Stored recovery search context is invalid',
        retryable: false,
      },
    });
  });
});

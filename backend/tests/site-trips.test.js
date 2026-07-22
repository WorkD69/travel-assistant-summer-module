const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const request = require('supertest');

const { createApp } = require('../src/app');
const { routePoints } = require('../src/routes/site/trips');
const { COOKIE_NAME, issueSession } = require('../src/security/site-auth');

const config = {
  isProduction: false,
  allowedOrigins: [],
  jwtSecret: 'j'.repeat(32),
  serviceToken: 's'.repeat(32),
  sessionTtlSeconds: 3600,
  documentTokenTtlSeconds: 300,
  linkTokenTtlSeconds: 600,
};
const user = { id: 'u-1', name: 'Anna', email: 'anna@example.test' };

function fixture() {
  return {
    user: { async findUnique() { return user; } },
    trip: {
      async findMany() {
        return [{
          id: 't-1', title: 'Turkey', route: 'Moscow → Antalya',
          startDate: new Date('2026-08-01'), endDate: new Date('2026-08-08'),
          timezone: 'Europe/Moscow', type: 'group', status: 'active', ownerId: 'u-owner',
          participants: [{ userId: 'u-1', role: 'participant', status: 'active' }],
        }];
      },
    },
    async $queryRaw() { return [{ ok: 1 }]; },
  };
}

describe('site trip API', () => {
  test('requires the HttpOnly session', async () => {
    const response = await request(createApp({ config, prisma: fixture() })).get('/api/site/trips');
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'not_authenticated');
  });

  test('derives role from membership rather than the browser', async () => {
    const cookie = `${COOKIE_NAME}=${issueSession(user, config)}`;
    const response = await request(createApp({ config, prisma: fixture() }))
      .get('/api/site/trips')
      .set('Cookie', cookie);
    assert.equal(response.status, 200);
    assert.equal(response.body.items[0].role, 'participant');
    assert.equal(response.body.items[0].membershipStatus, 'member');
    assert.equal(response.body.items[0].ownerId, undefined);
  });

  test('creates the trip and its route events atomically', async () => {
    const calls = [];
    const prisma = fixture();
    prisma.$transaction = async (callback) => callback({
      trip: { async create(input) { calls.push(['trip', input]); return { ...input.data, participants: [] }; } },
      routePoint: { async createMany(input) { calls.push(['routePoints', input]); return { count: input.data.length }; } },
      tripEvent: { async createMany(input) { calls.push(['events', input]); return { count: input.data.length }; } },
    });
    const cookie = `${COOKIE_NAME}=${issueSession(user, config)}`;
    const response = await request(createApp({ config, prisma }))
      .post('/api/site/trips')
      .set('Cookie', cookie)
      .send({
        title: 'Turkey', route: 'Moscow -> Antalya', startDate: '2026-08-01', endDate: '2026-08-08',
        timezone: 'Europe/Moscow', type: 'group',
        routePoints: [
          { name: 'Moscow', canonicalName: 'Moscow, Russia', latitude: 55.7558, longitude: 37.6173, sortOrder: 0 },
          { name: 'Antalya', canonicalName: 'Antalya, Türkiye', latitude: 36.8969, longitude: 30.7133, sortOrder: 1 },
        ],
        events: [{ type: 'flight', title: 'Flight', startsAt: '2026-08-01T07:00:00.000Z', endsAt: '2026-08-01T11:00:00.000Z', departure: 'Moscow', arrival: 'Antalya', source: 'manual', reference: 'SU-100', sortOrder: 0 }],
      });
    assert.equal(response.status, 201);
    assert.match(response.body.trip.id, /^trip-[0-9a-f-]{36}$/);
    assert.deepEqual(calls.map((item) => item[0]), ['trip', 'routePoints', 'events']);
    assert.equal(calls[1][1].data[0].tripId, response.body.trip.id);
    assert.equal(calls[1][1].data[1].canonicalName, 'Antalya, Türkiye');
    assert.equal(calls[2][1].data[0].reference, 'SU-100');
    assert.equal(calls[2][1].data[0].sortOrder, 0);
  });

  test('rejects unconfirmed or invalid route-point coordinates before persistence', () => {
    assert.throws(
      () => routePoints([
        { name: 'Moscow', canonicalName: 'Moscow, Russia', latitude: 55.75, longitude: 37.61, sortOrder: 0 },
        { name: 'Unknown', canonicalName: '', latitude: 120, longitude: 31, sortOrder: 1 },
      ], 't-1'),
      (error) => error.status === 422 && error.code === 'validation_error',
    );
  });

  test('returns persisted route points and timeline provenance after a fresh detail request', async () => {
    const prisma = fixture();
    prisma.trip.findUnique = async () => ({
      id: 't-1', title: 'Turkey', route: 'Moscow → Antalya', ownerId: 'u-1',
      startDate: new Date('2026-08-01'), endDate: new Date('2026-08-08'),
      timezone: 'Europe/Moscow', type: 'group', status: 'active', participants: [],
    });
    prisma.participant = { async findMany() { return []; } };
    prisma.routePoint = { async findMany() { return [
      { id: 'rp-1', name: 'Moscow', canonicalName: 'Moscow, Russia', latitude: 55.7558, longitude: 37.6173, sortOrder: 0, source: 'nominatim' },
      { id: 'rp-2', name: 'Antalya', canonicalName: 'Antalya, Türkiye', latitude: 36.8969, longitude: 30.7133, sortOrder: 1, source: 'nominatim' },
    ]; } };
    prisma.tripEvent = { async findMany() { return [{
      id: 'e-1', type: 'flight', title: 'Flight', startsAt: new Date('2026-08-01T07:00:00Z'), endsAt: null,
      departure: 'Moscow', arrival: 'Antalya', status: 'scheduled', detail: null,
      source: 'manual', reference: 'SU-100', sortOrder: 0,
    }]; } };
    for (const name of ['document', 'message', 'monitoringSignal', 'tripPlan', 'sosTicket']) {
      prisma[name] = { async findMany() { return []; } };
    }

    const cookie = `${COOKIE_NAME}=${issueSession(user, config)}`;
    const response = await request(createApp({ config, prisma }))
      .get('/api/site/trips/t-1')
      .set('Cookie', cookie);

    assert.equal(response.status, 200);
    assert.equal(response.body.routePoints.length, 2);
    assert.equal(response.body.routePoints[1].canonicalName, 'Antalya, Türkiye');
    assert.equal(response.body.events[0].reference, 'SU-100');
    assert.equal(response.body.events[0].sortOrder, 0);
  });

  test('does not let a participant replace a trip route', async () => {
    const prisma = fixture();
    prisma.trip.findUnique = async () => ({
      id: 't-1', ownerId: 'u-owner', participants: [{ userId: 'u-1', role: 'participant', status: 'active' }],
    });
    let transactionCalls = 0;
    prisma.$transaction = async () => { transactionCalls += 1; };
    const cookie = `${COOKIE_NAME}=${issueSession(user, config)}`;
    const response = await request(createApp({ config, prisma }))
      .patch('/api/site/trips/t-1')
      .set('Cookie', cookie)
      .send({ routePoints: [
        { name: 'Moscow', canonicalName: 'Moscow, Russia', latitude: 55.75, longitude: 37.61, sortOrder: 0 },
        { name: 'Antalya', canonicalName: 'Antalya, Türkiye', latitude: 36.89, longitude: 30.71, sortOrder: 1 },
      ] });
    assert.equal(response.status, 403);
    assert.equal(transactionCalls, 0);
  });
});

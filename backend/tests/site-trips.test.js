const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const request = require('supertest');

const { createApp } = require('../src/app');
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
      tripEvent: { async createMany(input) { calls.push(['events', input]); return { count: input.data.length }; } },
    });
    const cookie = `${COOKIE_NAME}=${issueSession(user, config)}`;
    const response = await request(createApp({ config, prisma }))
      .post('/api/site/trips')
      .set('Cookie', cookie)
      .send({
        title: 'Turkey', route: 'Moscow -> Antalya', startDate: '2026-08-01', endDate: '2026-08-08',
        timezone: 'Europe/Moscow', type: 'group',
        events: [{ type: 'flight', title: 'Flight', startsAt: '2026-08-01T07:00:00.000Z', endsAt: '2026-08-01T11:00:00.000Z', departure: 'Moscow', arrival: 'Antalya' }],
      });
    assert.equal(response.status, 201);
    assert.match(response.body.trip.id, /^trip-[0-9a-f-]{36}$/);
    assert.deepEqual(calls.map((item) => item[0]), ['trip', 'events']);
    assert.equal(calls[1][1].data[0].tripId, response.body.trip.id);
  });
});

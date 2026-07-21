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
});

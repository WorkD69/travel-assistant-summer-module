const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const request = require('supertest');

const { createApp } = require('../src/app');

const config = {
  isProduction: false,
  allowedOrigins: [],
  jwtSecret: 'j'.repeat(32),
  serviceToken: 's'.repeat(32),
  sessionTtlSeconds: 3600,
  documentTokenTtlSeconds: 300,
  linkTokenTtlSeconds: 600,
  publicBaseUrl: 'https://api.example.test',
};

function prismaFixture() {
  const user = { id: 'u-1', name: 'Anna', email: 'anna@example.test' };
  return {
    telegramAccountLink: {
      async findUnique({ where }) {
        if (where.telegramUserId === '42') return { id: 'l-1', telegramUserId: '42', siteUserId: 'u-1', revokedAt: null, siteUser: user };
        return null;
      },
    },
    user: {
      async findUnique() { return { ...user, botState: { activeTripId: 't-1' } }; },
    },
    notificationEvent: {
      async findMany() {
        return [{
          id: 'n-1', eventId: 'evt-1', type: 'organizer_message', recipientTelegramId: '42',
          tripId: 't-1', createdAt: new Date('2026-07-22T12:00:00Z'),
          payload: { trip_title: 'Turkey', what_changed: 'New message', deep_link_target: 'messages' },
        }];
      },
    },
    async $queryRaw() { return [{ ok: 1 }]; },
  };
}

describe('Telegram HTTP API', () => {
  test('returns the linked profile with exact contract fields', async () => {
    const response = await request(createApp({ config, prisma: prismaFixture() }))
      .get('/api/bot/me')
      .set('Authorization', `Bearer ${config.serviceToken}`)
      .set('X-Telegram-User-Id', '42');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      site_user_id: 'u-1', name: 'Anna', email: 'anna@example.test', active_trip_id: 't-1',
    });
  });

  test('maps authentication failures to an allowed OpenAPI error code', async () => {
    const response = await request(createApp({ config, prisma: prismaFixture() }))
      .get('/api/bot/me')
      .set('Authorization', 'Bearer wrong')
      .set('X-Telegram-User-Id', '42');
    assert.equal(response.status, 401);
    assert.deepEqual(Object.keys(response.body.error).sort(), ['code', 'message_ru']);
    assert.equal(response.body.error.code, 'access_denied');
  });

  test('allows service-only pending polling and maps int64 Telegram IDs', async () => {
    const response = await request(createApp({ config, prisma: prismaFixture() }))
      .get('/api/bot/notifications/pending?limit=50')
      .set('Authorization', `Bearer ${config.serviceToken}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.items[0].recipient_telegram_id, 42);
    assert.equal(response.body.items[0].deep_link_target, 'messages');
    assert.equal(response.body.next_cursor, null);
  });
});

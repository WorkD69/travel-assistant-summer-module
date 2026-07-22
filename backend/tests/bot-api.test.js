const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const request = require('supertest');

const { createApp } = require('../src/app');
const { messageVisible } = require('../src/routes/bot');

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
  test('claims a link token with a conditional write before creating the link', async () => {
    const calls = [];
    const prisma = prismaFixture();
    prisma.$transaction = async (callback) => callback({
      telegramLinkToken: {
        async findUnique() {
          return { id: 'token-1', siteUserId: 'u-1', siteUser: { name: 'Anna' }, consumedAt: null, expiresAt: new Date('2026-08-01T00:00:00Z') };
        },
        async updateMany(input) { calls.push(['claim', input]); return { count: 1 }; },
      },
      telegramAccountLink: {
        async findUnique() { return null; },
        async create(input) { calls.push(['link', input]); return input.data; },
      },
    });
    const response = await request(createApp({ config, prisma }))
      .post('/api/integrations/telegram/link-token/consume')
      .set('Authorization', `Bearer ${config.serviceToken}`)
      .set('X-Telegram-User-Id', '42')
      .send({ token: 'a-valid-link-token-value' });
    assert.equal(response.status, 200);
    assert.deepEqual(calls.map((item) => item[0]), ['claim', 'link']);
    assert.equal(calls[0][1].where.consumedAt, null);
  });

  test('returns distinct safe errors for invalid, expired, and reused link tokens', async () => {
    const cases = [
      [null, 422, 'link_token_invalid'],
      [{ id: 'token-expired', siteUserId: 'u-1', siteUser: { name: 'Anna' }, consumedAt: null, expiresAt: new Date('2020-01-01T00:00:00Z') }, 422, 'link_token_expired'],
      [{ id: 'token-used', siteUserId: 'u-1', siteUser: { name: 'Anna' }, consumedAt: new Date(), expiresAt: new Date('2030-01-01T00:00:00Z') }, 409, 'link_token_used'],
    ];
    for (const [token, status, code] of cases) {
      const prisma = prismaFixture();
      prisma.$transaction = async (callback) => callback({
        telegramLinkToken: { async findUnique() { return token; } },
      });
      const response = await request(createApp({ config, prisma }))
        .post('/api/integrations/telegram/link-token/consume')
        .set('Authorization', `Bearer ${config.serviceToken}`)
        .set('X-Telegram-User-Id', '42')
        .send({ token: 'a-valid-link-token-value' });
      assert.equal(response.status, status);
      assert.equal(response.body.error.code, code);
      assert.equal(JSON.stringify(response.body).includes('a-valid-link-token-value'), false);
    }
  });

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

  test('shows legacy all-participants seed messages to participants', () => {
    assert.equal(
      messageVisible({ audience: { type: 'all-participants', participantIds: [] } }, 'u-anna', 'participant'),
      true,
    );
  });

  test('keeps updated route events compatible with Telegram today and next', async () => {
    const prisma = prismaFixture();
    const event = {
      id: 'event-updated', tripId: 't-1', type: 'flight', title: 'Москва → Анталья',
      startsAt: new Date('2026-08-01T12:00:00.000Z'), endsAt: new Date('2026-08-01T16:00:00.000Z'),
      departure: 'Москва', arrival: 'Анталья', status: 'scheduled', detail: 'Обновлённый маршрут',
      source: 'manual', reference: 'SU-100', sortOrder: 3, document: null,
    };
    prisma.trip = { async findUnique() { return {
      id: 't-1', title: 'Turkey', route: 'Сыктывкар → Москва → Анталья', ownerId: 'u-1',
      startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-03T00:00:00.000Z'),
      timezone: 'Etc/UTC', status: 'active', participants: [],
    }; } };
    prisma.tripEvent = {
      async findMany() { return [event]; },
      async findFirst() { return event; },
    };
    const app = createApp({ config, prisma, now: () => new Date('2026-08-01T10:00:00.000Z') });
    const headers = { Authorization: `Bearer ${config.serviceToken}`, 'X-Telegram-User-Id': '42' };
    const today = await request(app).get('/api/bot/trips/t-1/today').set(headers);
    const next = await request(app).get('/api/bot/trips/t-1/next').set(headers);
    assert.equal(today.status, 200);
    assert.equal(today.body.items[0].id, 'event-updated');
    assert.equal(today.body.items[0].departure_place, 'Москва');
    assert.equal(next.status, 200);
    assert.equal(next.body.event.arrival_place, 'Анталья');
    assert.equal('source' in next.body.event, false);
    assert.equal('sortOrder' in next.body.event, false);
  });

  test('includes the published selected Plan B in Telegram assistant context', async () => {
    const prisma = prismaFixture();
    prisma.trip = { async findUnique() { return {
      id: 't-1', title: 'Turkey', route: 'Москва → Анталья', ownerId: 'u-1',
      startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-03T00:00:00.000Z'),
      timezone: 'Etc/UTC', status: 'active', participants: [],
    }; } };
    prisma.tripEvent = { async findMany() { return []; } };
    prisma.document = { async findMany() { return []; } };
    prisma.message = { async findMany() { return [{
      id: 'message-plan', tripId: 't-1', title: 'Plan B: быстрый вариант',
      content: 'Летим через Стамбул', planId: 'plan-speed', audience: 'participants', status: 'published',
      publishedAt: new Date('2026-08-01T10:00:00.000Z'), createdAt: new Date('2026-08-01T10:00:00.000Z'),
      author: { name: 'Anna' },
    }]; } };
    prisma.sosTicket = { async findMany() { return []; } };
    prisma.monitoringSignal = { async findMany() { return []; } };
    const response = await request(createApp({ config, prisma }))
      .get('/api/bot/trips/t-1/assistant-context')
      .set('Authorization', `Bearer ${config.serviceToken}`)
      .set('X-Telegram-User-Id', '42');
    assert.equal(response.status, 200);
    assert.equal(response.body.messages.length, 1);
    assert.equal(response.body.messages[0].is_plan_b, true);
    assert.match(response.body.messages[0].text, /Стамбул/);
  });
});

const test = require('node:test');
const assert = require('node:assert/strict');

const { demoDisruptionProjection } = require('../src/routes/bot');

function activeDemoSignal(detail) {
  return {
    id: 'signal-1',
    tripId: 'trip-1',
    category: 'plan_b_disruption',
    source: 'DEMO_SIMULATION',
    status: 'active',
    detail: JSON.stringify(detail),
  };
}

test('projects only the factual fields of an active DEMO_SIMULATION disruption', () => {
  assert.deepEqual(
    demoDisruptionProjection(activeDemoSignal({
      type: 'DELAYED',
      context: { station: 'Казань', minutes: 45, providerNote: '<b>untrusted</b>' },
      ignored: 'must not be exposed',
    })),
    {
      category: 'plan_b_disruption',
      source: 'DEMO_SIMULATION',
      status: 'active',
      type: 'DELAYED',
      context: { station: 'Казань', minutes: 45, providerNote: '<b>untrusted</b>' },
    },
  );
});

test('returns null when signal is not the exact active DEMO_SIMULATION disruption', () => {
  for (const signal of [
    null,
    { ...activeDemoSignal({ type: 'DELAYED' }), category: 'other_category' },
    { ...activeDemoSignal({ type: 'DELAYED' }), source: 'LIVE_PROVIDER' },
    { ...activeDemoSignal({ type: 'DELAYED' }), status: 'superseded' },
  ]) {
    assert.equal(demoDisruptionProjection(signal), null);
  }
});

test('returns safe nullable factual values for malformed or incomplete stored detail', () => {
  assert.deepEqual(
    demoDisruptionProjection({ ...activeDemoSignal({}), detail: '{ malformed JSON' }),
    {
      category: 'plan_b_disruption',
      source: 'DEMO_SIMULATION',
      status: 'active',
      type: null,
      context: null,
    },
  );
  assert.deepEqual(
    demoDisruptionProjection(activeDemoSignal({ type: 42, context: ['not', 'an', 'object'] })),
    {
      category: 'plan_b_disruption',
      source: 'DEMO_SIMULATION',
      status: 'active',
      type: null,
      context: null,
    },
  );
});

const http = require('node:http');
const express = require('express');
const config = require('../src/config');
const prisma = require('../src/db');
const botRouter = require('../src/routes/bot');

const FIXTURE_TRIP = {
  id: 'trip-1',
  ownerId: 'user-owner',
  title: 'Москва — Казань',
  route: 'Москва → Казань',
  startDate: '2026-09-01T10:00:00.000Z',
  endDate: '2026-09-02T10:00:00.000Z',
  createdAt: '2026-08-01T10:00:00.000Z',
  status: 'active',
};

async function withServer(callback) {
  const app = express();
  app.use(express.json());
  app.use(botRouter);
  const server = http.createServer(app);
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  try {
    const address = server.address();
    await callback('http://127.0.0.1:' + address.port);
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }
}

async function withBotFixture(options, callback) {
  const originalServiceToken = config.bot.serviceToken;
  const originals = {
    link: prisma.telegramLink.findUnique,
    trip: prisma.trip.findUnique,
    participant: prisma.participant.findFirst,
    signal: prisma.monitoringSignal.findFirst,
  };
  config.bot.serviceToken = 'bot-test-service-token';
  prisma.telegramLink.findUnique = async function () {
    return options.linkedUserId ? {
      telegramUserId: 'telegram-user-1',
      user: { id: options.linkedUserId, name: 'Telegram User', email: '' },
    } : null;
  };
  prisma.trip.findUnique = async function ({ where }) {
    return where.id === FIXTURE_TRIP.id ? FIXTURE_TRIP : null;
  };
  prisma.participant.findFirst = async function () {
    return options.participant || null;
  };
  prisma.monitoringSignal.findFirst = async function () {
    return options.signal || null;
  };
  try {
    await callback();
  } finally {
    config.bot.serviceToken = originalServiceToken;
    prisma.telegramLink.findUnique = originals.link;
    prisma.trip.findUnique = originals.trip;
    prisma.participant.findFirst = originals.participant;
    prisma.monitoringSignal.findFirst = originals.signal;
  }
}

async function getTrip(baseUrl) {
  const response = await fetch(baseUrl + '/api/bot/trips/' + FIXTURE_TRIP.id, {
    headers: {
      authorization: 'Bearer bot-test-service-token',
      'x-telegram-user-id': 'telegram-user-1',
    },
  });
  return { status: response.status, body: await response.json() };
}

test('bot Trip detail returns active factual DEMO_SIMULATION projection without regressing core fields', { concurrency: false }, async () => {
  await withBotFixture({
    linkedUserId: 'user-owner',
    signal: activeDemoSignal({ type: 'CANCELLED', context: { segmentId: 'seg-1', reason: 'schedule change' } }),
  }, async function () {
    await withServer(async function (baseUrl) {
      const response = await getTrip(baseUrl);
      assert.equal(response.status, 200);
      assert.deepEqual(
        {
          id: response.body.id,
          title: response.body.title,
          route: response.body.route,
          status: response.body.status,
          membership_status: response.body.membership_status,
        },
        {
          id: 'trip-1',
          title: 'Москва — Казань',
          route: 'Москва → Казань',
          status: 'active',
          membership_status: 'member',
        },
      );
      assert.deepEqual(response.body.demo_disruption, {
        category: 'plan_b_disruption',
        source: 'DEMO_SIMULATION',
        status: 'active',
        type: 'CANCELLED',
        context: { segmentId: 'seg-1', reason: 'schedule change' },
      });
    });
  });
});

test('bot Trip detail returns null for missing, non-demo and inactive signals', { concurrency: false }, async () => {
  for (const signal of [
    null,
    { ...activeDemoSignal({ type: 'DELAYED' }), source: 'LIVE_PROVIDER' },
    { ...activeDemoSignal({ type: 'DELAYED' }), status: 'superseded' },
    { ...activeDemoSignal({ type: 'DELAYED' }), category: 'other_category' },
  ]) {
    await withBotFixture({ linkedUserId: 'user-owner', signal: signal }, async function () {
      await withServer(async function (baseUrl) {
        const response = await getTrip(baseUrl);
        assert.equal(response.status, 200);
        assert.equal(response.body.demo_disruption, null);
      });
    });
  }
});

test('bot Trip detail returns safe nullable fields when active signal detail is malformed', { concurrency: false }, async () => {
  await withBotFixture({
    linkedUserId: 'user-owner',
    signal: { ...activeDemoSignal({}), detail: '{ malformed JSON' },
  }, async function () {
    await withServer(async function (baseUrl) {
      const response = await getTrip(baseUrl);
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.demo_disruption, {
        category: 'plan_b_disruption',
        source: 'DEMO_SIMULATION',
        status: 'active',
        type: null,
        context: null,
      });
    });
  });
});

test('bot Trip detail keeps unrelated and revoked Telegram users fail-closed before signal projection', { concurrency: false }, async () => {
  for (const fixture of [
    { linkedUserId: 'user-unrelated', participant: null },
    { linkedUserId: 'user-revoked', participant: { userId: 'user-revoked', access: 'revoked', role: 'participant' } },
  ]) {
    await withBotFixture({
      ...fixture,
      signal: activeDemoSignal({ type: 'CANCELLED', context: { secret: 'must not leak' } }),
    }, async function () {
      await withServer(async function (baseUrl) {
        const response = await getTrip(baseUrl);
        assert.equal(response.status, 403);
        assert.equal(response.body.error.code, 'access_denied');
        assert.equal(response.body.demo_disruption, undefined);
      });
    });
  }
});

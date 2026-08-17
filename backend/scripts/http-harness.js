const assert = require('node:assert/strict');
const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const PRISMA_ROOT = path.join(BACKEND_ROOT, 'prisma');

function pushTemporarySchema(databaseUrl) {
  const prismaCli = process.platform === 'win32'
    ? path.join(BACKEND_ROOT, 'node_modules', '.bin', 'prisma.cmd')
    : path.join(BACKEND_ROOT, 'node_modules', '.bin', 'prisma');
  const command = process.platform === 'win32' ? 'powershell.exe' : prismaCli;
  const args = process.platform === 'win32'
    ? [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      "& '" + prismaCli.replace(/'/g, "''") + "' db push --skip-generate",
    ]
    : ['db', 'push', '--skip-generate'];
  const result = spawnSync(command, args, {
    cwd: BACKEND_ROOT,
    env: Object.assign({}, process.env, {
      DATABASE_URL: databaseUrl,
      RUST_BACKTRACE: '1',
      RUST_LOG: 'debug',
    }),
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error('Unable to prepare the temporary HTTP harness database');
  }
}

async function request(baseUrl, method, pathname, options) {
  const settings = options || {};
  const headers = Object.assign({}, settings.headers || {});
  if (settings.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(baseUrl + pathname, {
    method: method,
    headers: headers,
    body: settings.body === undefined ? undefined : JSON.stringify(settings.body),
  });
  let payload = null;
  if (response.status !== 204) {
    const text = await response.text();
    payload = text ? JSON.parse(text) : null;
  }
  return { status: response.status, body: payload };
}

async function requestRaw(baseUrl, method, pathname, options) {
  const settings = options || {};
  const response = await fetch(baseUrl + pathname, {
    method: method,
    headers: settings.headers || {},
  });
  return { status: response.status, body: Buffer.from(await response.arrayBuffer()) };
}

async function runHarness() {
  const databaseFilename = 'http-harness-' + crypto.randomUUID() + '.db';
  const databasePath = path.join(PRISMA_ROOT, databaseFilename);
  const databaseUrl = 'file:./' + databaseFilename;
  const previousEnv = {};
  const envKeys = [
    'DATABASE_URL', 'JWT_SECRET', 'BOT_SERVICE_TOKEN', 'NODE_ENV',
    'FRONTEND_ORIGIN', 'AI_API_KEY', 'PUBLIC_BASE_URL',
    'TELEGRAM_BOT_USERNAME', 'OPEN_METEO_DISABLED',
  ];
  envKeys.forEach(function (key) {
    previousEnv[key] = Object.prototype.hasOwnProperty.call(process.env, key)
      ? process.env[key]
      : undefined;
  });

  const jwtSecret = crypto.randomBytes(48).toString('base64url');
  const serviceToken = crypto.randomBytes(48).toString('base64url');
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = jwtSecret;
  process.env.BOT_SERVICE_TOKEN = serviceToken;
  process.env.NODE_ENV = 'development';
  process.env.FRONTEND_ORIGIN = 'http://localhost:8011';
  process.env.PUBLIC_BASE_URL = 'http://127.0.0.1';
  process.env.TELEGRAM_BOT_USERNAME = 'travel_assistent10_bot';
  process.env.OPEN_METEO_DISABLED = 'true';
  delete process.env.AI_API_KEY;

  let server;
  let coreServer;
  let prisma;
  try {
    pushTemporarySchema(databaseUrl);
    const app = require('../src/app');
    prisma = require('../src/db');
    const botNotify = require('../src/services/botNotify');
    server = await new Promise(function (resolve, reject) {
      const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
      instance.once('error', reject);
    });
    const address = server.address();
    const baseUrl = 'http://127.0.0.1:' + address.port;
    process.env.PUBLIC_BASE_URL = baseUrl;

    const health = await request(baseUrl, 'GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.ai, false);

    const email = 'harness-' + crypto.randomUUID() + '@example.test';
    const password = crypto.randomBytes(24).toString('base64url');
    const registered = await request(baseUrl, 'POST', '/api/auth/register', {
      body: { email: email, password: password, name: 'HTTP Harness' },
    });
    assert.equal(registered.status, 201);
    assert.ok(registered.body.token);
    const siteToken = registered.body.token;
    const siteHeaders = { Authorization: 'Bearer ' + siteToken };

    const restored = await request(baseUrl, 'GET', '/api/auth/me', { headers: siteHeaders });
    assert.equal(restored.status, 200);
    assert.equal(restored.body.user.email, email);

    const createdTrip = await request(baseUrl, 'POST', '/api/trips', {
      headers: siteHeaders,
      body: {
        title: 'Isolated HTTP Harness Trip',
        route: 'Moscow - Kazan',
        startDate: '2026-08-01T08:00:00.000Z',
        endDate: '2026-08-05T20:00:00.000Z',
        status: 'active',
      },
    });
    assert.equal(createdTrip.status, 201);
    const tripId = createdTrip.body.trip.id;

    const linkToken = await request(baseUrl, 'POST', '/api/integrations/telegram/link-token', {
      headers: siteHeaders,
      body: {},
    });
    assert.equal(linkToken.status, 201);
    assert.ok(linkToken.body.token);
    assert.equal(linkToken.body.bot_username, 'travel_assistent10_bot');
    assert.equal(
      linkToken.body.deep_link,
      'https://t.me/travel_assistent10_bot?start=link_' + linkToken.body.token,
    );

    const telegramUserId = String(900000000 + Math.floor(Math.random() * 9999999));
    const serviceHeaders = {
      Authorization: 'Bearer ' + serviceToken,
      'X-Telegram-User-Id': telegramUserId,
    };
    const consumed = await request(baseUrl, 'POST', '/api/integrations/telegram/link-token/consume', {
      headers: serviceHeaders,
      body: { token: linkToken.body.token },
    });
    assert.equal(consumed.status, 200);
    assert.equal(consumed.body.site_user_id, restored.body.user.id);

    const reused = await request(baseUrl, 'POST', '/api/integrations/telegram/link-token/consume', {
      headers: serviceHeaders,
      body: { token: linkToken.body.token },
    });
    assert.equal(reused.status, 409);
    assert.equal(reused.body.error.code, 'link_token_used');

    const expiredTokenValue = crypto.randomBytes(32).toString('base64url');
    await prisma.telegramLinkToken.create({
      data: {
        token: expiredTokenValue,
        userId: restored.body.user.id,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const expired = await request(baseUrl, 'POST', '/api/integrations/telegram/link-token/consume', {
      headers: Object.assign({}, serviceHeaders, {
        'X-Telegram-User-Id': String(Number(telegramUserId) + 1),
      }),
      body: { token: expiredTokenValue },
    });
    assert.equal(expired.status, 400);
    assert.equal(expired.body.error.code, 'link_token_expired');

    const secondRegistered = await request(baseUrl, 'POST', '/api/auth/register', {
      body: {
        email: 'harness-' + crypto.randomUUID() + '@example.test',
        password: crypto.randomBytes(24).toString('base64url'),
        name: 'HTTP Harness Second User',
      },
    });
    assert.equal(secondRegistered.status, 201);
    const secondSiteHeaders = { Authorization: 'Bearer ' + secondRegistered.body.token };
    const secondLinkToken = await request(baseUrl, 'POST', '/api/integrations/telegram/link-token', {
      headers: secondSiteHeaders,
      body: {},
    });
    assert.equal(secondLinkToken.status, 201);
    const secondTelegramUserId = String(Number(telegramUserId) + 2);
    const secondServiceHeaders = {
      Authorization: 'Bearer ' + serviceToken,
      'X-Telegram-User-Id': secondTelegramUserId,
    };
    const secondConsumed = await request(
      baseUrl,
      'POST',
      '/api/integrations/telegram/link-token/consume',
      { headers: secondServiceHeaders, body: { token: secondLinkToken.body.token } },
    );
    assert.equal(secondConsumed.status, 200);

    const unlinked = await request(baseUrl, 'DELETE', '/api/integrations/telegram/link', {
      headers: siteHeaders,
    });
    assert.equal(unlinked.status, 204);
    const firstStatusAfterUnlink = await request(
      baseUrl,
      'GET',
      '/api/integrations/telegram/status',
      { headers: siteHeaders },
    );
    const secondStatusAfterFirstUnlink = await request(
      baseUrl,
      'GET',
      '/api/integrations/telegram/status',
      { headers: secondSiteHeaders },
    );
    assert.equal(firstStatusAfterUnlink.body.linked, false);
    assert.equal(secondStatusAfterFirstUnlink.body.linked, true);

    const freshLinkToken = await request(baseUrl, 'POST', '/api/integrations/telegram/link-token', {
      headers: siteHeaders,
      body: {},
    });
    const relinked = await request(baseUrl, 'POST', '/api/integrations/telegram/link-token/consume', {
      headers: serviceHeaders,
      body: { token: freshLinkToken.body.token },
    });
    assert.equal(relinked.status, 200);
    const firstStatusAfterRelink = await request(
      baseUrl,
      'GET',
      '/api/integrations/telegram/status',
      { headers: siteHeaders },
    );
    const secondStatusAfterRelink = await request(
      baseUrl,
      'GET',
      '/api/integrations/telegram/status',
      { headers: secondSiteHeaders },
    );
    assert.equal(firstStatusAfterRelink.body.linked, true);
    assert.equal(secondStatusAfterRelink.body.linked, true);
    assert.equal(
      await prisma.telegramLink.count({ where: { userId: restored.body.user.id } }),
      1,
    );

    await prisma.participant.create({ data: {
      tripId: tripId,
      userId: secondRegistered.body.user.id,
      name: secondRegistered.body.user.name,
      role: 'participant',
      access: 'active',
      telegram: 'linked',
    } });
    const deniedParticipantPatch = await request(baseUrl, 'PATCH', '/api/trips/' + tripId, {
      headers: secondSiteHeaders,
      body: { route: 'Участник не должен изменить маршрут' },
    });
    assert.equal(deniedParticipantPatch.status, 403);

    const revisedSegments = [{
      id: 'b2-segment-1',
      from: 'Санкт-Петербург',
      to: 'Москва',
      transportType: 'train',
      departureAt: '2026-08-02T08:00:00.000Z',
      arrivalAt: '2026-08-02T12:00:00.000Z',
    }];
    const ownerPatch = await request(baseUrl, 'PATCH', '/api/trips/' + tripId, {
      headers: siteHeaders,
      body: {
        title: 'B2 Canonical Trip',
        route: 'Санкт-Петербург → Москва',
        startDate: '2026-08-02T08:00:00.000Z',
        endDate: '2026-08-06T20:00:00.000Z',
        status: 'active',
        type: 'group',
        segments: revisedSegments,
      },
    });
    assert.equal(ownerPatch.status, 200);
    assert.equal(ownerPatch.body.trip.route, 'Санкт-Петербург → Москва');
    assert.deepEqual(ownerPatch.body.trip.segments, revisedSegments);
    assert.ok(ownerPatch.body.trip.updatedAt);
    assert.equal(await prisma.tripChange.count({ where: { tripId: tripId, type: 'route_changed' } }), 1);
    assert.equal(await prisma.tripChange.count({ where: { tripId: tripId, type: 'dates_changed' } }), 1);
    assert.equal(await prisma.tripChange.count({ where: { tripId: tripId, type: 'segments_changed' } }), 1);
    const routeOutbox = await prisma.telegramNotification.findMany({
      where: { tripId: tripId, type: 'route_changed' },
    });
    assert.equal(routeOutbox.length, 1);
    assert.equal(routeOutbox[0].telegramUserId, secondTelegramUserId);

    const botMe = await request(baseUrl, 'GET', '/api/bot/me', { headers: serviceHeaders });
    assert.equal(botMe.status, 200);
    assert.equal(botMe.body.site_user_id, restored.body.user.id);
    const botTrips = await request(baseUrl, 'GET', '/api/bot/trips?limit=100', { headers: serviceHeaders });
    assert.equal(botTrips.status, 200);
    assert.equal(botTrips.body.items.some(function (trip) { return trip.id === tripId; }), true);

    const context = await request(baseUrl, 'GET', '/api/bot/trips/' + tripId + '/assistant-context', {
      headers: serviceHeaders,
    });
    assert.equal(context.status, 200);
    assert.equal(context.body.trip.id, tripId);
    assert.equal(context.body.trip.route, 'Санкт-Петербург → Москва');
    assert.equal(context.body.recent_changes.some(function (change) { return change.type === 'route_changed'; }), true);
    assert.equal(Array.isArray(context.body.weather), true);

    const planAlternatives = await request(baseUrl, 'POST', '/api/trips/' + tripId + '/monitoring/assistant', {
      headers: siteHeaders,
      body: { mode: 'plans', messages: [{ role: 'user', content: 'Перестрой маршрут' }] },
    });
    assert.equal(planAlternatives.status, 200);
    assert.equal(planAlternatives.body.plans.length, 3);
    assert.deepEqual(planAlternatives.body.plans.map(function (plan) { return plan.strategy; }), [
      'fastest', 'cheapest', 'reliable',
    ]);
    assert.equal(planAlternatives.body.plans.every(function (plan) {
      return plan.isDemoData === true && Array.isArray(plan.segments) && plan.segments.length > 0;
    }), true);

    const selectedAlternative = planAlternatives.body.plans[1];
    const canonicalBeforeLegacyPost = await prisma.trip.findUnique({ where: { id: tripId } });
    const legacyPost = await request(baseUrl, 'POST', '/api/trips/' + tripId + '/monitoring/plan', {
      headers: siteHeaders,
      body: selectedAlternative,
    });
    assert.equal(legacyPost.status, 410);
    assert.equal(legacyPost.body.code, 'LEGACY_PLAN_B_DISABLED');
    const canonicalAfterLegacyPost = await prisma.trip.findUnique({ where: { id: tripId } });
    assert.equal(canonicalAfterLegacyPost.route, canonicalBeforeLegacyPost.route);
    assert.equal(canonicalAfterLegacyPost.segments, canonicalBeforeLegacyPost.segments);
    assert.equal(await prisma.tripChange.count({ where: { tripId: tripId, type: 'plan_b_created' } }), 0);
    assert.equal(await prisma.tripChange.count({ where: { tripId: tripId, type: 'plan_b_applied' } }), 0);

    const legacyReadFixture = await prisma.tripPlan.create({ data: {
      tripId: tripId,
      title: 'Legacy read fixture',
      strategy: 'fastest',
      revisedRoute: 'Fixture route must stay private',
      segments: JSON.stringify(revisedSegments),
      source: 'test',
      status: 'active',
    } });
    const ownerActiveLegacyPlan = await request(baseUrl, 'GET', '/api/trips/' + tripId + '/monitoring/plan', { headers: siteHeaders });
    assert.equal(ownerActiveLegacyPlan.status, 200);
    assert.equal(ownerActiveLegacyPlan.body.plan.id, legacyReadFixture.id);
    const participantActiveLegacyPlan = await request(baseUrl, 'GET', '/api/trips/' + tripId + '/monitoring/plan', { headers: secondSiteHeaders });
    assert.equal(participantActiveLegacyPlan.status, 200);
    assert.equal(participantActiveLegacyPlan.body.plan.id, legacyReadFixture.id);
    const ownerLegacyPlans = await request(baseUrl, 'GET', '/api/trips/' + tripId + '/monitoring/plans', { headers: siteHeaders });
    assert.equal(ownerLegacyPlans.status, 200);
    assert.equal(ownerLegacyPlans.body.plans.some(function (plan) { return plan.id === legacyReadFixture.id; }), true);
    const participantLegacyPlans = await request(baseUrl, 'GET', '/api/trips/' + tripId + '/monitoring/plans', { headers: secondSiteHeaders });
    assert.equal(participantLegacyPlans.status, 200);
    assert.equal(participantLegacyPlans.body.plans.some(function (plan) { return plan.id === legacyReadFixture.id; }), true);

    const outsiderRegistered = await request(baseUrl, 'POST', '/api/auth/register', {
      body: {
        email: 'harness-outsider-' + crypto.randomUUID() + '@example.test',
        password: crypto.randomBytes(24).toString('base64url'),
        name: 'HTTP Harness Outsider',
      },
    });
    assert.equal(outsiderRegistered.status, 201);
    const outsiderHeaders = { Authorization: 'Bearer ' + outsiderRegistered.body.token };
    const deniedActiveLegacyPlan = await request(baseUrl, 'GET', '/api/trips/' + tripId + '/monitoring/plan', { headers: outsiderHeaders });
    assert.equal(deniedActiveLegacyPlan.status, 403);
    assert.equal(Object.prototype.hasOwnProperty.call(deniedActiveLegacyPlan.body, 'plan'), false);
    const deniedLegacyPlans = await request(baseUrl, 'GET', '/api/trips/' + tripId + '/monitoring/plans', { headers: outsiderHeaders });
    assert.equal(deniedLegacyPlans.status, 403);
    assert.equal(Object.prototype.hasOwnProperty.call(deniedLegacyPlans.body, 'plans'), false);

    const contextAfterLegacyPost = await request(baseUrl, 'GET', '/api/bot/trips/' + tripId + '/assistant-context', {
      headers: serviceHeaders,
    });
    assert.equal(contextAfterLegacyPost.status, 200);
    assert.equal(contextAfterLegacyPost.body.trip.route, canonicalBeforeLegacyPost.route);
    assert.equal(contextAfterLegacyPost.body.selected_plan, null);

    const coreCanonicalSegments = [{
      id: 'core-original-segment', transportType: 'flight', departurePlace: 'SVO', arrivalPlace: 'LED',
      departureAt: '2026-08-21T08:00:00.000Z', arrivalAt: '2026-08-21T09:30:00.000Z',
      serviceNumber: 'SU100', carrierName: 'Harness Air', order: 0, transportOptionId: 'core-original',
      source: 'tutu-mcp', fetchedAt: '2026-08-17T08:00:00.000Z',
    }];
    const coreTrip = await prisma.trip.create({ data: {
      title: 'Core Plan B HTTP Trip', route: 'SVO → LED', segments: JSON.stringify(coreCanonicalSegments),
      startDate: new Date('2026-08-21T08:00:00.000Z'), endDate: new Date('2026-08-21T09:30:00.000Z'),
      status: 'active', type: 'solo', ownerId: restored.body.user.id,
    } });
    const otherCoreTrip = await prisma.trip.create({ data: {
      title: 'Other Core Trip', route: 'SVO → LED', segments: JSON.stringify(coreCanonicalSegments),
      startDate: new Date('2026-08-21T08:00:00.000Z'), endDate: new Date('2026-08-21T09:30:00.000Z'),
      status: 'active', type: 'solo', ownerId: restored.body.user.id,
    } });
    const corePastOption = {
      schemaVersion: '1', id: 'core-past-option', transportType: 'flight',
      segments: [{
        id: 'core-past-segment', transportType: 'flight', departurePlace: 'SVO', arrivalPlace: 'LED',
        departureAt: '2026-08-21T07:00:00.000Z', arrivalAt: '2026-08-21T08:00:00.000Z', serviceNumber: 'SU099', carrierName: 'Harness Air',
      }],
      price: { amount: 5000, currency: 'RUB', kind: 'unknown' }, availability: null, transferCount: 0, durationMinutes: 60,
      source: { provider: 'tutu-mcp', tool: 'search_avia', serverVersion: 'http-harness' }, fetchedAt: '2026-08-17T08:00:00.000Z',
    };
    const coreApplyOption = {
      schemaVersion: '1', id: 'core-apply-option', transportType: 'flight',
      segments: [{
        id: 'core-apply-segment', transportType: 'flight', departurePlace: 'SVO', arrivalPlace: 'LED',
        departureAt: '2026-08-21T10:00:00.000Z', arrivalAt: '2026-08-21T11:30:00.000Z', serviceNumber: 'SU200', carrierName: 'Harness Air',
      }],
      price: { amount: 6500, currency: 'RUB', kind: 'unknown' }, availability: null, transferCount: 0, durationMinutes: 90,
      source: { provider: 'tutu-mcp', tool: 'search_avia', serverVersion: 'http-harness' }, fetchedAt: '2026-08-17T08:00:00.000Z',
    };
    const { createPlanBRouter } = require('../src/routes/planB');
    const coreApp = express();
    coreApp.use(express.json());
    coreApp.use('/api', require('../src/routes/trips'));
    coreApp.use('/api', createPlanBRouter({ prisma: prisma, adapter: { async search() { return [{ option: corePastOption }, { option: coreApplyOption }]; } } }));
    coreServer = await new Promise(function (resolve, reject) {
      const instance = coreApp.listen(0, '127.0.0.1', function () { resolve(instance); });
      instance.once('error', reject);
    });
    const coreBaseUrl = 'http://127.0.0.1:' + coreServer.address().port;
    const coreBefore = await request(coreBaseUrl, 'GET', '/api/trips/' + coreTrip.id, { headers: siteHeaders });
    assert.equal(coreBefore.status, 200);
    const coreDisruption = await request(coreBaseUrl, 'POST', '/api/trips/' + coreTrip.id + '/disruptions/demo', {
      headers: siteHeaders,
      body: { type: 'DELAYED', occurredAt: '2026-08-21T09:00:00.000Z' },
    });
    assert.equal(coreDisruption.status, 201);
    const corePreview = await request(coreBaseUrl, 'POST', '/api/trips/' + coreTrip.id + '/plan-b/preview', {
      headers: siteHeaders,
      body: { preferences: ['faster'] },
    });
    assert.equal(corePreview.status, 200);
    assert.deepEqual(corePreview.body.candidates.map(function (candidate) { return candidate.option.id; }), ['core-apply-option']);
    const crossTripProposal = await request(coreBaseUrl, 'POST', '/api/trips/' + otherCoreTrip.id + '/plan-b/apply', {
      headers: Object.assign({}, siteHeaders, { 'Idempotency-Key': 'http-harness-cross-trip-proposal-key' }),
      body: { proposalId: corePreview.body.proposalId, candidateId: corePreview.body.candidates[0].candidateId },
    });
    assert.equal(crossTripProposal.status, 404);
    assert.equal(crossTripProposal.body.error.code, 'PLAN_B_PROPOSAL_NOT_FOUND');
    const coreApply = await request(coreBaseUrl, 'POST', '/api/trips/' + coreTrip.id + '/plan-b/apply', {
      headers: Object.assign({}, siteHeaders, { 'Idempotency-Key': 'http-harness-core-apply-key' }),
      body: { proposalId: corePreview.body.proposalId, candidateId: corePreview.body.candidates[0].candidateId },
    });
    assert.equal(coreApply.status, 201);
    const coreAfterApply = await request(coreBaseUrl, 'GET', '/api/trips/' + coreTrip.id, { headers: siteHeaders });
    assert.equal(coreAfterApply.status, 200);
    assert.equal(coreAfterApply.body.trip.route, 'SVO → LED');
    assert.equal(coreAfterApply.body.trip.segments[0].transportOptionId, 'core-apply-option');
    const coreRevert = await request(coreBaseUrl, 'POST', '/api/trips/' + coreTrip.id + '/plan-b/revert', {
      headers: siteHeaders,
      body: {},
    });
    assert.equal(coreRevert.status, 200);
    const coreAfterRevert = await request(coreBaseUrl, 'GET', '/api/trips/' + coreTrip.id, { headers: siteHeaders });
    assert.equal(coreAfterRevert.status, 200);
    assert.deepEqual(coreAfterRevert.body.trip.segments, coreBefore.body.trip.segments);
    assert.equal(coreAfterRevert.body.trip.route, coreBefore.body.trip.route);

    const addedDocument = await request(baseUrl, 'POST', '/api/trips/' + tripId + '/documents', {
      headers: siteHeaders,
      body: { name: 'Safe harness document', type: 'ticket', status: 'confirmed' },
    });
    assert.equal(addedDocument.status, 201);
    assert.equal(await prisma.tripChange.count({ where: { tripId: tripId, type: 'document_added' } }), 1);
    assert.equal(await prisma.telegramNotification.count({
      where: { tripId: tripId, type: 'document_added', telegramUserId: secondTelegramUserId },
    }), 1);

    const organizerMessage = await request(baseUrl, 'POST', '/api/trips/' + tripId + '/messages', {
      headers: siteHeaders,
      body: { kind: 'announcement', status: 'published', title: 'Route update', body: 'Use the selected Plan B.' },
    });
    assert.equal(organizerMessage.status, 201);
    assert.equal(await prisma.tripChange.count({ where: { tripId: tripId, type: 'organizer_message' } }), 1);
    assert.equal(await prisma.telegramNotification.count({
      where: { tripId: tripId, type: 'organizer_message', telegramUserId: secondTelegramUserId },
    }), 1);

    const detectedRisk = await request(baseUrl, 'POST', '/api/trips/' + tripId + '/monitoring', {
      headers: secondSiteHeaders,
      body: { label: 'Задержка пересадки', severity: 'high', status: 'new', detail: 'Synthetic staging risk' },
    });
    assert.equal(detectedRisk.status, 201);
    assert.equal(await prisma.tripChange.count({ where: { tripId: tripId, type: 'risk_detected' } }), 1);
    assert.equal(await prisma.telegramNotification.count({
      where: { tripId: tripId, type: 'risk_detected', telegramUserId: telegramUserId },
    }), 1);

    const inviteeEmail = 'invitee-' + crypto.randomUUID() + '@example.test';
    const inviteeRegistered = await request(baseUrl, 'POST', '/api/auth/register', {
      body: { email: inviteeEmail, password: crypto.randomBytes(24).toString('base64url'), name: 'Invited User' },
    });
    assert.equal(inviteeRegistered.status, 201);
    const inviteeHeaders = { Authorization: 'Bearer ' + inviteeRegistered.body.token };
    const invitation24h = await request(baseUrl, 'POST', '/api/trips/' + tripId + '/invitations', {
      headers: siteHeaders,
      body: { email: inviteeEmail, role: 'participant', expiresInDays: 1 },
    });
    assert.equal(invitation24h.status, 201);
    assert.equal(invitation24h.body.invitation.expiresInDays, 1);
    assert.match(invitation24h.body.invitation.link, /^http:\/\/localhost:8011\/invitation\.html\?token=/);
    const resolvedInvitation = await request(
      baseUrl,
      'GET',
      '/api/invitations/resolve/' + encodeURIComponent(invitation24h.body.invitation.token),
    );
    assert.equal(resolvedInvitation.status, 200);
    assert.equal(resolvedInvitation.body.invitation.trip.id, tripId);
    const wrongUserAccept = await request(
      baseUrl,
      'POST',
      '/api/invitations/' + encodeURIComponent(invitation24h.body.invitation.token) + '/accept',
      { headers: secondSiteHeaders, body: {} },
    );
    assert.equal(wrongUserAccept.status, 403);
    const acceptedInvitation = await request(
      baseUrl,
      'POST',
      '/api/invitations/' + encodeURIComponent(invitation24h.body.invitation.token) + '/accept',
      { headers: inviteeHeaders, body: {} },
    );
    assert.equal(acceptedInvitation.status, 200);
    assert.equal(acceptedInvitation.body.invitation.status, 'accepted');
    const reusedInvitation = await request(
      baseUrl,
      'POST',
      '/api/invitations/' + encodeURIComponent(invitation24h.body.invitation.token) + '/accept',
      { headers: inviteeHeaders, body: {} },
    );
    assert.equal(reusedInvitation.status, 409);
    assert.equal(await prisma.participant.count({ where: { tripId: tripId, userId: inviteeRegistered.body.user.id } }), 1);

    const invitation3d = await request(baseUrl, 'POST', '/api/trips/' + tripId + '/invitations', {
      headers: siteHeaders,
      body: { email: 'revoked-' + crypto.randomUUID() + '@example.test', expiresInDays: 3 },
    });
    assert.equal(invitation3d.status, 201);
    assert.equal(invitation3d.body.invitation.expiresInDays, 3);
    const revokedInvitation = await request(
      baseUrl,
      'DELETE',
      '/api/trips/' + tripId + '/invitations/' + invitation3d.body.invitation.id,
      { headers: siteHeaders },
    );
    assert.equal(revokedInvitation.status, 200);
    const resolveRevoked = await request(
      baseUrl,
      'GET',
      '/api/invitations/resolve/' + encodeURIComponent(invitation3d.body.invitation.token),
    );
    assert.equal(resolveRevoked.status, 410);

    const invitation7d = await request(baseUrl, 'POST', '/api/trips/' + tripId + '/invitations', {
      headers: siteHeaders,
      body: { email: 'expired-' + crypto.randomUUID() + '@example.test', expiresInDays: 7 },
    });
    assert.equal(invitation7d.status, 201);
    assert.equal(invitation7d.body.invitation.expiresInDays, 7);
    await prisma.invitation.update({ where: { id: invitation7d.body.invitation.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const resolveExpired = await request(
      baseUrl,
      'GET',
      '/api/invitations/resolve/' + encodeURIComponent(invitation7d.body.invitation.token),
    );
    assert.equal(resolveExpired.status, 410);

    const preferences = await request(baseUrl, 'GET', '/api/bot/notification-preferences', {
      headers: serviceHeaders,
    });
    assert.equal(preferences.status, 200);
    assert.equal(typeof preferences.body.segment_reminders, 'boolean');

    const idempotencyKey = crypto.randomUUID();
    const sosOptions = {
      headers: Object.assign({}, secondServiceHeaders, { 'Idempotency-Key': idempotencyKey }),
      body: { category: 'late', description: 'Safe isolated harness check' },
    };
    const firstSos = await request(baseUrl, 'POST', '/api/bot/trips/' + tripId + '/sos', sosOptions);
    const repeatedSos = await request(baseUrl, 'POST', '/api/bot/trips/' + tripId + '/sos', sosOptions);
    assert.equal(firstSos.status, 201);
    assert.equal(repeatedSos.status, 201);
    assert.equal(firstSos.body.id, repeatedSos.body.id);

    const updatedSos = await request(baseUrl, 'PATCH', '/api/trips/' + tripId + '/monitoring/' + firstSos.body.id, {
      headers: siteHeaders,
      body: { status: 'in_review' },
    });
    assert.equal(updatedSos.status, 200);
    assert.equal(updatedSos.body.signal.status, 'in_review');
    assert.equal(await prisma.tripChange.count({ where: { tripId: tripId, type: 'sos_status_changed' } }), 1);

    const pendingNotifications = await request(baseUrl, 'GET', '/api/bot/notifications/pending?limit=50', {
      headers: { Authorization: 'Bearer ' + serviceToken },
    });
    assert.equal(pendingNotifications.status, 200);
    assert.equal(
      pendingNotifications.body.items.some(function (notification) {
        return notification.type === 'sos_created' && notification.trip_id === tripId;
      }),
      true,
    );

    // ---- Yellow Zone: canonical participant access, true cross-trip IDOR, and visibility ----
    const participantRow = await prisma.participant.findFirst({
      where: { tripId: tripId, userId: secondRegistered.body.user.id },
    });
    assert.ok(participantRow);

    const activeDetail = await request(baseUrl, 'GET', '/api/trips/' + tripId, { headers: secondSiteHeaders });
    assert.equal(activeDetail.status, 200);
    const activeList = await request(baseUrl, 'GET', '/api/trips', { headers: secondSiteHeaders });
    assert.equal(activeList.status, 200);
    assert.equal(activeList.body.trips.some(function (trip) { return trip.id === tripId; }), true);

    await prisma.participant.update({ where: { id: participantRow.id }, data: { access: 'Активен' } });
    const cyrillicActive = await request(baseUrl, 'GET', '/api/trips/' + tripId, { headers: secondSiteHeaders });
    assert.equal(cyrillicActive.status, 200);

    for (const blockedAccess of ['revoked', 'invited', 'inactive', 'denied', '', 'unknown']) {
      await prisma.participant.update({ where: { id: participantRow.id }, data: { access: blockedAccess } });
      const deniedDetail = await request(baseUrl, 'GET', '/api/trips/' + tripId, { headers: secondSiteHeaders });
      assert.equal(deniedDetail.status, 403, blockedAccess || '(blank)');
      const deniedList = await request(baseUrl, 'GET', '/api/trips', { headers: secondSiteHeaders });
      assert.equal(deniedList.body.trips.some(function (trip) { return trip.id === tripId; }), false, blockedAccess || '(blank)');
      const deniedBotTrips = await request(baseUrl, 'GET', '/api/bot/trips?limit=100', { headers: secondServiceHeaders });
      assert.equal(deniedBotTrips.body.items.some(function (trip) { return trip.id === tripId; }), false, blockedAccess || '(blank)');
    }
    const blockedMonitoring = await request(baseUrl, 'POST', '/api/trips/' + tripId + '/monitoring/assistant', {
      headers: secondSiteHeaders,
      body: { mode: 'dialog', messages: [] },
    });
    assert.equal(blockedMonitoring.status, 403);
    const blockedNotificationCount = await prisma.telegramNotification.count({
      where: { tripId: tripId, telegramUserId: secondTelegramUserId, type: 'route_changed' },
    });
    await botNotify.enqueue({ tripId: tripId, type: 'route_changed', tripTitle: 'Should not reach inactive participant' });
    assert.equal(await prisma.telegramNotification.count({
      where: { tripId: tripId, telegramUserId: secondTelegramUserId, type: 'route_changed' },
    }), blockedNotificationCount);
    await prisma.participant.update({ where: { id: participantRow.id }, data: { access: 'active' } });

    const tripB = await request(baseUrl, 'POST', '/api/trips', {
      headers: secondSiteHeaders,
      body: { title: 'Private Trip B', route: 'B-only route', status: 'active' },
    });
    assert.equal(tripB.status, 201);
    const tripBId = tripB.body.trip.id;

    const invitationB = await request(baseUrl, 'POST', '/api/trips/' + tripBId + '/invitations', {
      headers: secondSiteHeaders,
      body: { email: 'cross-trip-' + crypto.randomUUID() + '@example.test', expiresInDays: 1 },
    });
    assert.equal(invitationB.status, 201);
    const invitationAttack = await request(baseUrl, 'PATCH', '/api/trips/' + tripId + '/invitations/' + invitationB.body.invitation.id, {
      headers: siteHeaders,
      body: { active: false },
    });
    assert.equal(invitationAttack.status, 404);
    assert.equal((await prisma.invitation.findUnique({ where: { id: invitationB.body.invitation.id } })).active, true);

    const documentB = await request(baseUrl, 'POST', '/api/trips/' + tripBId + '/documents', {
      headers: secondSiteHeaders,
      body: { name: 'Trip B private document', visibility: 'shared' },
    });
    assert.equal(documentB.status, 201);
    const documentPatchAttack = await request(baseUrl, 'PATCH', '/api/trips/' + tripId + '/documents/' + documentB.body.document.id, {
      headers: siteHeaders,
      body: { name: 'attacker mutation' },
    });
    assert.equal(documentPatchAttack.status, 404);
    assert.equal((await prisma.document.findUnique({ where: { id: documentB.body.document.id } })).name, 'Trip B private document');
    const documentDeleteAttack = await request(baseUrl, 'DELETE', '/api/trips/' + tripId + '/documents/' + documentB.body.document.id, { headers: siteHeaders });
    assert.equal(documentDeleteAttack.status, 404);
    assert.ok(await prisma.document.findUnique({ where: { id: documentB.body.document.id } }));

    const messageB = await request(baseUrl, 'POST', '/api/trips/' + tripBId + '/messages', {
      headers: secondSiteHeaders,
      body: { kind: 'announcement', status: 'published', title: 'Trip B only', body: 'Private B message' },
    });
    assert.equal(messageB.status, 201);
    const messageDeleteAttack = await request(baseUrl, 'DELETE', '/api/trips/' + tripId + '/messages/' + messageB.body.message.id, { headers: siteHeaders });
    assert.equal(messageDeleteAttack.status, 404);
    assert.ok(await prisma.message.findUnique({ where: { id: messageB.body.message.id } }));

    for (const unknownPath of [
      '/api/trips/' + tripId + '/invitations/unknown-invitation',
      '/api/trips/' + tripId + '/documents/unknown-document',
      '/api/trips/' + tripId + '/messages/unknown-message',
    ]) {
      const method = unknownPath.includes('/invitations/') || unknownPath.includes('/messages/') ? 'PATCH' : 'DELETE';
      const unknown = await request(baseUrl, method, unknownPath, { headers: siteHeaders, body: method === 'PATCH' ? { active: false } : undefined });
      assert.equal(unknown.status, 404, unknownPath);
    }

    const createVisibleDocument = async function (name, visibility) {
      return prisma.document.create({
        data: {
          tripId: tripId,
          name: name,
          visibility: visibility,
          uploadedById: restored.body.user.id,
          blob: { create: { data: Buffer.from(name, 'utf8') } },
        },
      });
    };
    const sharedDocument = await createVisibleDocument('Shared document', 'shared');
    const organizerDocument = await createVisibleDocument('Organizer document', 'organizer_only');
    const personalDocument = await createVisibleDocument('Personal document', 'personal');
    const unknownDocument = await createVisibleDocument('Unknown document', 'restricted_custom');

    const ownerDocuments = await request(baseUrl, 'GET', '/api/trips/' + tripId + '/documents', { headers: siteHeaders });
    assert.equal(ownerDocuments.status, 200);
    [sharedDocument.id, organizerDocument.id, personalDocument.id, unknownDocument.id].forEach(function (id) {
      assert.equal(ownerDocuments.body.documents.some(function (doc) { return doc.id === id; }), true, id);
    });
    const participantDocuments = await request(baseUrl, 'GET', '/api/trips/' + tripId + '/documents', { headers: secondSiteHeaders });
    assert.equal(participantDocuments.status, 200);
    assert.equal(participantDocuments.body.documents.some(function (doc) { return doc.id === sharedDocument.id; }), true);
    [organizerDocument.id, personalDocument.id, unknownDocument.id].forEach(function (id) {
      assert.equal(participantDocuments.body.documents.some(function (doc) { return doc.id === id; }), false, id);
    });

    const participantSharedFile = await requestRaw(baseUrl, 'GET', '/api/trips/' + tripId + '/documents/' + sharedDocument.id + '/file', { headers: secondSiteHeaders });
    assert.equal(participantSharedFile.status, 200);
    for (const id of [organizerDocument.id, personalDocument.id, unknownDocument.id]) {
      const forbiddenFile = await requestRaw(baseUrl, 'GET', '/api/trips/' + tripId + '/documents/' + id + '/file', { headers: secondSiteHeaders });
      assert.equal(forbiddenFile.status, 403, id);
    }
    for (const id of [sharedDocument.id, organizerDocument.id, personalDocument.id, unknownDocument.id]) {
      const ownerFile = await requestRaw(baseUrl, 'GET', '/api/trips/' + tripId + '/documents/' + id + '/file', { headers: siteHeaders });
      assert.equal(ownerFile.status, 200, id);
    }

    const botDocuments = await request(baseUrl, 'GET', '/api/bot/trips/' + tripId + '/documents', { headers: secondServiceHeaders });
    assert.equal(botDocuments.status, 200);
    assert.equal(botDocuments.body.items.some(function (doc) { return doc.id === sharedDocument.id; }), true);
    [organizerDocument.id, personalDocument.id, unknownDocument.id].forEach(function (id) {
      assert.equal(botDocuments.body.items.some(function (doc) { return doc.id === id; }), false, id);
    });
    const botSharedLink = await request(baseUrl, 'POST', '/api/bot/documents/' + sharedDocument.id + '/temporary-link', { headers: secondServiceHeaders, body: {} });
    assert.equal(botSharedLink.status, 200);
    for (const id of [organizerDocument.id, personalDocument.id, unknownDocument.id]) {
      const forbiddenLink = await request(baseUrl, 'POST', '/api/bot/documents/' + id + '/temporary-link', { headers: secondServiceHeaders, body: {} });
      assert.equal(forbiddenLink.status, 403, id);
    }

    const rejected = await request(baseUrl, 'GET', '/api/bot/me', {
      headers: {
        Authorization: 'Bearer invalid-isolated-token',
        'X-Telegram-User-Id': telegramUserId,
      },
    });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.body.error.code, 'access_denied');

    return {
      ok: true,
      aiConfigured: health.body.ai,
      checked: [
        'health',
        'register-and-restore-session',
        'create-trip',
        'telegram-link-consume',
        'telegram-link-security-lifecycle',
        'owner-only-atomic-trip-patch',
        'telegram-me-and-trips',
        'telegram-assistant-context',
        'structured-plan-b-alternatives',
        'atomic-plan-b-apply',
        'legacy-plan-b-fail-closed-and-idor',
        'plan-b-core-http-preview-apply-revert',
        'typed-change-outbox-events',
        'invitation-1d-3d-7d-lifecycle',
        'telegram-notification-preferences',
        'telegram-sos-idempotency',
        'telegram-notification-queue',
        'service-token-rejection',
        'yellow-zone-access-idor-and-visibility',
      ],
    };
  } finally {
    if (coreServer) {
      await new Promise(function (resolve) { coreServer.close(resolve); });
    }
    if (server) {
      await new Promise(function (resolve) { server.close(resolve); });
    }
    if (prisma) await prisma.$disconnect();
    const resolvedDatabasePath = path.resolve(databasePath);
    if (
      path.dirname(resolvedDatabasePath) === path.resolve(PRISMA_ROOT) &&
      path.basename(resolvedDatabasePath).startsWith('http-harness-')
    ) {
      for (const candidate of [resolvedDatabasePath, resolvedDatabasePath + '-journal']) {
        if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
      }
    }
    envKeys.forEach(function (key) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    });
  }
}

if (require.main === module) {
  runHarness()
    .then(function (result) { process.stdout.write(JSON.stringify(result) + '\n'); })
    .catch(function (error) {
      process.stderr.write('HTTP harness failed: ' + error.message + '\n');
      process.exitCode = 1;
    });
}

module.exports = { runHarness: runHarness };

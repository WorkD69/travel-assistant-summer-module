'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const jwt = require('jsonwebtoken');
const {
  createPlanBService,
  deriveActivePlanBApply,
} = require('../src/services/planB');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const TEMP_ROOT = process.platform === 'darwin' ? '/private/tmp' : require('node:os').tmpdir();

function change(id, type, newValue, createdAt) {
  return {
    id: id,
    type: type,
    newValue: newValue == null ? null : JSON.stringify(newValue),
    createdAt: new Date(createdAt),
  };
}

test('active Plan B projection is null for normal history and ignores unrelated TripChange types', () => {
  assert.equal(typeof deriveActivePlanBApply, 'function');
  assert.equal(deriveActivePlanBApply([]), null);
  assert.equal(deriveActivePlanBApply([
    change('change-route', 'route_changed', { optionId: 'not-an-apply' }, '2026-08-18T08:00:00.000Z'),
    change('proposal-a', 'plan_b_proposal', { candidateId: 'not-an-apply' }, '2026-08-18T09:00:00.000Z'),
  ]), null);
});

test('active Plan B projection selects the newest apply without a matching revert', () => {
  assert.equal(typeof deriveActivePlanBApply, 'function');
  const older = change('apply-older', 'plan_b_apply', {
    proposalId: 'proposal-older', candidateId: 'candidate-older', optionId: 'option-older',
  }, '2026-08-18T09:00:00.000Z');
  const newer = change('apply-newer', 'plan_b_apply', {
    proposalId: 'proposal-newer', candidateId: 'candidate-newer', optionId: 'option-newer',
  }, '2026-08-18T10:00:00.000Z');
  const revertedNewer = change('revert-newer', 'plan_b_revert', {
    applyId: 'apply-newer',
  }, '2026-08-18T11:00:00.000Z');

  assert.deepEqual(deriveActivePlanBApply([newer, older]), {
    applyId: 'apply-newer',
    proposalId: 'proposal-newer',
    candidateId: 'candidate-newer',
    optionId: 'option-newer',
    appliedAt: '2026-08-18T10:00:00.000Z',
  });
  assert.deepEqual(deriveActivePlanBApply([older, revertedNewer, newer]), {
    applyId: 'apply-older',
    proposalId: 'proposal-older',
    candidateId: 'candidate-older',
    optionId: 'option-older',
    appliedAt: '2026-08-18T09:00:00.000Z',
  });
});

function pushSchema(databaseUrl) {
  const prismaCli = path.join(
    BACKEND_ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
  );
  const result = spawnSync(prismaCli, ['db', 'push', '--skip-generate'], {
    cwd: BACKEND_ROOT,
    env: Object.assign({}, process.env, {
      DATABASE_URL: databaseUrl,
      RUST_BACKTRACE: '1',
      RUST_LOG: 'debug',
    }),
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(
    result.status,
    0,
    'temporary lifecycle database schema must be ready: ' + String(result.stderr || result.stdout || '').trim(),
  );
}

async function request(baseUrl, method, pathname, token, body, headers) {
  const response = await fetch(baseUrl + pathname, {
    method: method,
    headers: Object.assign(
      {},
      body === undefined ? {} : { 'content-type': 'application/json' },
      token ? { authorization: 'Bearer ' + token } : {},
      headers || {},
    ),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function transportOption(id) {
  return {
    schemaVersion: '1',
    id: id,
    transportType: 'flight',
    segments: [{
      id: id + '-segment',
      transportType: 'flight',
      departurePlace: 'SVO',
      arrivalPlace: 'LED',
      departureAt: '2026-08-20T10:00:00+03:00',
      arrivalAt: '2026-08-20T11:20:00+03:00',
      serviceNumber: id,
      carrierName: 'Example Air',
    }],
    price: { amount: 6800, currency: 'RUB', kind: 'unknown' },
    availability: null,
    transferCount: 0,
    durationMinutes: 80,
    source: { provider: 'tutu-mcp', tool: 'search_avia', serverVersion: 'test' },
    fetchedAt: '2026-08-17T08:00:00.000Z',
  };
}

function storedSegments(option) {
  return option.segments.map(function (segment, index) {
    return Object.assign({}, segment, {
      order: index,
      transportOptionId: option.id,
      source: 'tutu-mcp',
      fetchedAt: option.fetchedAt,
    });
  });
}

test('canonical lifecycle rereads Apply and Revert state without exposing raw TripChange data', async () => {
  const filename = 'plan-b-lifecycle-' + crypto.randomUUID() + '.db';
  const databasePath = path.join(TEMP_ROOT, filename);
  const databaseUrl = 'file:' + databasePath;
  const jwtSecret = crypto.randomBytes(48).toString('base64url');
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = jwtSecret;
  process.env.NODE_ENV = 'test';
  process.env.FRONTEND_ORIGIN = 'http://127.0.0.1:8011';
  delete process.env.AI_API_KEY;

  let prisma;
  let server;
  try {
    pushSchema(databaseUrl);
    const app = require('../src/app');
    prisma = require('../src/db');
    const owner = await prisma.user.create({ data: {
      email: 'lifecycle-owner-' + crypto.randomUUID() + '@example.test',
      passwordHash: 'not-used-in-this-test',
      name: 'Lifecycle Owner',
    } });
    const outsider = await prisma.user.create({ data: {
      email: 'lifecycle-outsider-' + crypto.randomUUID() + '@example.test',
      passwordHash: 'not-used-in-this-test',
      name: 'Lifecycle Outsider',
    } });
    const originalOption = Object.assign({}, transportOption('original-service'), {
      segments: [{
        id: 'original-segment',
        transportType: 'flight',
        departurePlace: 'SVO',
        arrivalPlace: 'LED',
        departureAt: '2026-08-20T08:00:00+03:00',
        arrivalAt: '2026-08-20T09:30:00+03:00',
        serviceNumber: 'SU100',
        carrierName: 'Example Air',
      }],
      durationMinutes: 90,
    });
    const originalSegments = storedSegments(originalOption);
    const trip = await prisma.trip.create({ data: {
      title: 'Lifecycle Trip',
      route: 'SVO → LED',
      segments: JSON.stringify(originalSegments),
      startDate: new Date(originalOption.segments[0].departureAt),
      endDate: new Date(originalOption.segments[0].arrivalAt),
      status: 'active',
      type: 'solo',
      ownerId: owner.id,
    } });
    const ownerToken = jwt.sign({ sub: owner.id }, jwtSecret, { expiresIn: '1h' });
    const outsiderToken = jwt.sign({ sub: outsider.id }, jwtSecret, { expiresIn: '1h' });
    server = await new Promise(function (resolve, reject) {
      const instance = http.createServer(app);
      instance.listen(0, '127.0.0.1', function () { resolve(instance); });
      instance.once('error', reject);
    });
    const baseUrl = 'http://127.0.0.1:' + server.address().port;

    const unauthenticated = await request(baseUrl, 'GET', '/api/trips/' + trip.id);
    assert.equal(unauthenticated.status, 401);
    const denied = await request(baseUrl, 'GET', '/api/trips/' + trip.id, outsiderToken);
    assert.equal(denied.status, 403);

    const normal = await request(baseUrl, 'GET', '/api/trips/' + trip.id, ownerToken);
    assert.equal(normal.status, 200);
    assert.equal(normal.body.trip.activePlanBApply, null);
    assert.equal(Object.hasOwn(normal.body.trip, 'changes'), false);

    const replacement = transportOption('replacement-service');
    const service = createPlanBService({
      prisma: prisma,
      adapter: { async search() { return [{ option: replacement }]; } },
      clock: function () { return new Date('2026-08-18T09:00:00.000Z'); },
    });
    await service.createDemoDisruption({
      trip: trip,
      actorId: owner.id,
      body: { type: 'CARRIER_CANCELLED' },
    });
    await prisma.monitoringSignal.createMany({ data: [
      {
        tripId: trip.id,
        label: 'Unrelated source',
        status: 'active',
        source: 'REAL_MONITORING',
        category: 'plan_b_disruption',
      },
      {
        tripId: trip.id,
        label: 'Unrelated category',
        status: 'active',
        source: 'DEMO_SIMULATION',
        category: 'weather_warning',
      },
    ] });

    const disrupted = await request(baseUrl, 'GET', '/api/trips/' + trip.id, ownerToken);
    assert.equal(disrupted.body.trip.activePlanBApply, null);
    assert.ok(disrupted.body.trip.monitoringSignals.some(function (signal) {
      return signal.category === 'plan_b_disruption' && signal.source === 'DEMO_SIMULATION' && signal.status === 'active';
    }));

    const preview = await service.createPreview({
      trip: trip,
      actorId: owner.id,
      body: { preferences: ['faster'] },
    });
    const candidate = preview.candidates[0];
    const applied = await request(
      baseUrl,
      'POST',
      '/api/trips/' + trip.id + '/plan-b/apply',
      ownerToken,
      { proposalId: preview.proposalId, candidateId: candidate.candidateId },
      { 'idempotency-key': 'lifecycle-apply-key-0001' },
    );
    assert.equal(applied.status, 201);

    const applyChange = await prisma.tripChange.findUnique({ where: { id: applied.body.applyId } });
    const afterApply = await request(baseUrl, 'GET', '/api/trips/' + trip.id, ownerToken);
    assert.deepEqual(afterApply.body.trip.activePlanBApply, {
      applyId: applied.body.applyId,
      proposalId: preview.proposalId,
      candidateId: candidate.candidateId,
      optionId: replacement.id,
      appliedAt: applyChange.createdAt.toISOString(),
    });
    assert.equal(afterApply.body.trip.segments[0].transportOptionId, replacement.id);
    assert.equal(Object.hasOwn(afterApply.body.trip, 'changes'), false);

    const browserStyleReread = await request(baseUrl, 'GET', '/api/trips/' + trip.id, ownerToken);
    assert.deepEqual(browserStyleReread.body.trip.activePlanBApply, afterApply.body.trip.activePlanBApply);

    const reverted = await request(
      baseUrl,
      'POST',
      '/api/trips/' + trip.id + '/plan-b/revert',
      ownerToken,
      {},
    );
    assert.equal(reverted.status, 200);
    assert.equal(reverted.body.reverted, true);

    const afterRevert = await request(baseUrl, 'GET', '/api/trips/' + trip.id, ownerToken);
    assert.equal(afterRevert.body.trip.activePlanBApply, null);
    assert.deepEqual(afterRevert.body.trip.segments, originalSegments);
    assert.equal(afterRevert.body.trip.monitoringSignals.some(function (signal) {
      return signal.category === 'plan_b_disruption' && signal.source === 'DEMO_SIMULATION' && signal.status === 'active';
    }), false);
    assert.ok(afterRevert.body.trip.monitoringSignals.some(function (signal) {
      return signal.category === 'plan_b_disruption' && signal.source === 'DEMO_SIMULATION' && signal.status === 'resolved';
    }));
    assert.ok(afterRevert.body.trip.monitoringSignals.some(function (signal) {
      return signal.source === 'REAL_MONITORING' && signal.status === 'active';
    }));
    assert.ok(afterRevert.body.trip.monitoringSignals.some(function (signal) {
      return signal.category === 'weather_warning' && signal.status === 'active';
    }));

    const repeatedRevert = await request(
      baseUrl,
      'POST',
      '/api/trips/' + trip.id + '/plan-b/revert',
      ownerToken,
      {},
    );
    assert.equal(repeatedRevert.status, 200);
    assert.equal(repeatedRevert.body.reverted, false);
    assert.equal(repeatedRevert.body.reason, 'PLAN_B_ALREADY_REVERTED');
  } finally {
    if (server) await new Promise(function (resolve) { server.close(resolve); });
    if (prisma) await prisma.$disconnect();
    for (const candidate of [databasePath, databasePath + '-journal']) {
      if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
    }
  }
});

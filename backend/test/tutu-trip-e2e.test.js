const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const BACKEND_ROOT = path.resolve(__dirname, '..');

function pushSchema(databaseUrl) {
  const prismaCli = path.join(BACKEND_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
  const result = spawnSync(prismaCli, ['db', 'push', '--skip-generate'], {
    cwd: BACKEND_ROOT,
    env: Object.assign({}, process.env, {
      DATABASE_URL: databaseUrl,
      RUST_BACKTRACE: '1',
      RUST_LOG: 'debug',
    }),
    encoding: 'utf8', windowsHide: true,
  });
  assert.equal(
    result.status,
    0,
    'temporary Tutu Trip database schema must be ready: ' + String(result.stderr || result.stdout || '').trim(),
  );
}

async function request(baseUrl, pathname, body, headers) {
  const response = await fetch(baseUrl + pathname, {
    method: body === undefined ? 'GET' : 'POST',
    headers: Object.assign(body === undefined ? {} : { 'content-type': 'application/json' }, headers || {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: JSON.parse(await response.text()) };
}

function option(id) {
  return {
    schemaVersion: '1', id: id, transportType: 'flight',
    segments: [{
      id: 'ts_e2e_1', transportType: 'flight', departurePlace: 'Москва', arrivalPlace: 'Санкт-Петербург',
      departureAt: '2026-08-20T12:05:00+03:00', arrivalAt: '2026-08-20T13:30:00+03:00',
      serviceNumber: 'SU-001', carrierName: 'Example Air',
    }],
    price: { amount: 6345.62, currency: 'RUB', kind: 'unknown' }, availability: null,
    transferCount: 0, durationMinutes: 85,
    source: { provider: 'tutu-mcp', tool: 'search_avia', serverVersion: '0.38.0' },
    fetchedAt: '2026-08-16T10:00:00.000Z',
  };
}

test('demo-success is idempotent and canonical GET rereads the same transport facts', async () => {
  const filename = 'tutu-trip-e2e-' + crypto.randomUUID() + '.db';
  const databasePath = path.join(os.tmpdir(), filename);
  const databaseUrl = 'file:' + databasePath;
  const jwtSecret = crypto.randomBytes(48).toString('base64url');
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = jwtSecret;
  process.env.NODE_ENV = 'test';
  process.env.FRONTEND_ORIGIN = 'http://127.0.0.1:8011';
  delete process.env.AI_API_KEY;

  let server;
  let prisma;
  try {
    pushSchema(databaseUrl);
    const app = require('../src/app');
    prisma = require('../src/db');
    const { createSelectionTokenService } = require('../src/services/tutuSelectionToken');
    server = await new Promise(function (resolve, reject) {
      const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
      instance.once('error', reject);
    });
    const baseUrl = 'http://127.0.0.1:' + server.address().port;
    const registered = await request(baseUrl, '/api/auth/register', {
      email: 'tutu-' + crypto.randomUUID() + '@example.test', password: 'correct-horse-2026', name: 'Tutu Owner',
    });
    assert.equal(registered.status, 201);
    const headers = { authorization: 'Bearer ' + registered.body.token };
    const userId = registered.body.user.id;
    const tokens = createSelectionTokenService({ secret: jwtSecret });
    const selection = {
      option: option('to_e2e_offer_one'),
      providerContext: { offerId: 'offer-1', transport: 'avia', checkoutRef: {}, checkoutUrl: null, searchResultsUrl: null },
    };
    const selectionToken = tokens.signSelection(userId, selection);
    const purchaseHeaders = Object.assign({}, headers, { 'idempotency-key': 'e2e-purchase-attempt-0001' });

    const created = await request(baseUrl, '/api/tutu/demo-purchase-success', { selectionToken: selectionToken }, purchaseHeaders);
    const replay = await request(baseUrl, '/api/tutu/demo-purchase-success', { selectionToken: selectionToken }, purchaseHeaders);
    assert.equal(created.status, 201);
    assert.deepEqual(replay.body, { tripId: created.body.tripId, created: false });

    const reread = await request(baseUrl, '/api/trips/' + created.body.tripId, undefined, headers);
    assert.equal(reread.status, 200);
    assert.equal(reread.body.trip.route, 'Москва → Санкт-Петербург');
    assert.equal(reread.body.trip.segments[0].transportOptionId, 'to_e2e_offer_one');
    assert.equal(reread.body.trip.segments[0].departureAt, selection.option.segments[0].departureAt);
    assert.equal(reread.body.trip.segments[0].arrivalAt, selection.option.segments[0].arrivalAt);
    assert.equal(reread.body.trip.segments[0].source, 'tutu-mcp');

    const differentToken = tokens.signSelection(userId, Object.assign({}, selection, {
      option: option('to_e2e_offer_two'),
    }));
    const conflict = await request(
      baseUrl, '/api/tutu/demo-purchase-success', { selectionToken: differentToken }, purchaseHeaders,
    );
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error.code, 'IDEMPOTENCY_KEY_REUSE');
    assert.equal(await prisma.trip.count(), 1);

    const concurrentHeaders = Object.assign({}, headers, { 'idempotency-key': 'e2e-concurrent-attempt-0002' });
    const concurrent = await Promise.all([
      request(baseUrl, '/api/tutu/demo-purchase-success', { selectionToken: selectionToken }, concurrentHeaders),
      request(baseUrl, '/api/tutu/demo-purchase-success', { selectionToken: selectionToken }, concurrentHeaders),
    ]);
    assert.deepEqual(concurrent.map(function (result) { return result.status; }).sort(), [200, 201]);
    assert.equal(concurrent[0].body.tripId, concurrent[1].body.tripId);
    assert.equal(await prisma.trip.count(), 2);
  } finally {
    if (server) await new Promise(function (resolve) { server.close(resolve); });
    if (prisma) await prisma.$disconnect();
    for (const candidate of [databasePath, databasePath + '-journal']) {
      if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
    }
  }
});

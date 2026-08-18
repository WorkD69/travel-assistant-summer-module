const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const { createTutuRouter } = require('../src/routes/tutu');
const { parseSearchToolResult } = require('../src/services/tutuMcpAdapter');
const { createSelectionTokenService } = require('../src/services/tutuSelectionToken');

const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures', 'tutu', 'search-avia.direct.json'), 'utf8',
));
const parsedSelection = parseSearchToolResult('search_avia', {
  content: [{ type: 'text', text: JSON.stringify(fixture) }], isError: false,
}, { fetchedAt: '2026-08-16T10:00:00.000Z', serverVersion: '0.38.0' })[0];

async function withServer(router, callback) {
  const app = express();
  app.use(express.json());
  app.use('/api/tutu', router);
  const server = http.createServer(app);
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  try {
    const address = server.address();
    await callback('http://127.0.0.1:' + address.port);
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }
}

function auth(req, _res, next) {
  req.user = { id: 'user-1' };
  next();
}

function request(returnDate) {
  return {
    schemaVersion: '1', mode: 'flight', origin: 'Москва', destination: 'Санкт-Петербург',
    departureDate: '2026-08-20', returnDate: returnDate,
    passengers: { adults: 1, children: 0, infants: 0 },
  };
}

test('POST /search returns canonical options with user-bound selection tokens', async () => {
  const selectionTokens = createSelectionTokenService({ secret: 'route-test-secret' });
  let seenRequest;
  const router = createTutuRouter({
    requireAuth: auth,
    adapter: { async search(input) { seenRequest = input; return [parsedSelection]; } },
    selectionTokens: selectionTokens,
  });
  await withServer(router, async function (baseUrl) {
    const unnormalized = request(null);
    unnormalized.origin = '  Москва  ';
    unnormalized.destination = ' Санкт-Петербург ';
    const response = await fetch(baseUrl + '/api/tutu/search', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(unnormalized),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.options.length, 1);
    assert.deepEqual(body.options[0].option, parsedSelection.option);
    assert.deepEqual(selectionTokens.verifySelection('user-1', body.options[0].selectionToken), Object.assign({}, parsedSelection, {
      searchRequest: request(null),
    }));
    assert.equal(seenRequest.returnDate, null);
  });
});

test('POST /search rejects returnDate before invoking MCP', async () => {
  let calls = 0;
  const router = createTutuRouter({
    requireAuth: auth,
    adapter: { async search() { calls += 1; return []; } },
    selectionTokens: createSelectionTokenService({ secret: 'route-test-secret' }),
  });
  await withServer(router, async function (baseUrl) {
    const response = await fetch(baseUrl + '/api/tutu/search', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request('2026-08-27')),
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'TUTU_ROUND_TRIP_UNSUPPORTED');
    assert.equal(calls, 0);
  });
});

test('POST /search rejects unsupported passenger combinations before invoking MCP', async () => {
  let calls = 0;
  const router = createTutuRouter({
    requireAuth: auth,
    adapter: { async search() { calls += 1; return []; } },
    selectionTokens: createSelectionTokenService({ secret: 'route-test-secret' }),
  });
  await withServer(router, async function (baseUrl) {
    for (const passengers of [
      { adults: 2, children: 0, infants: 0 },
      { adults: 1, children: 1, infants: 0 },
      { adults: 1, children: 0, infants: 1 },
    ]) {
      const body = request(null);
      body.passengers = passengers;
      const response = await fetch(baseUrl + '/api/tutu/search', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const payload = await response.json();
      assert.equal(response.status, 400);
      assert.equal(payload.error.code, 'TUTU_MULTI_PASSENGER_UNSUPPORTED');
    }
    assert.equal(calls, 0);
  });
});

test('POST /checkout-link verifies the selection and returns the opaque provider URL', async () => {
  const selectionTokens = createSelectionTokenService({ secret: 'route-test-secret' });
  const token = selectionTokens.signSelection('user-1', parsedSelection);
  let seenContext;
  const router = createTutuRouter({
    requireAuth: auth,
    adapter: {
      async search() { return []; },
      async createCheckoutLink(context) {
        seenContext = context;
        return { checkoutUrl: 'https://avia.tutu.ru/x?z=2&a=1', kind: 'deeplink', searchResultsUrl: null, fallbackNote: null };
      },
    },
    selectionTokens: selectionTokens,
  });
  await withServer(router, async function (baseUrl) {
    const response = await fetch(baseUrl + '/api/tutu/checkout-link', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectionToken: token }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.checkout.checkoutUrl, 'https://avia.tutu.ru/x?z=2&a=1');
    assert.deepEqual(seenContext, parsedSelection.providerContext);
  });
});

test('route errors use a stable envelope without leaking upstream details', async () => {
  const error = new Error('secret upstream response');
  error.code = 'TUTU_TOOL_ERROR'; error.status = 502; error.retryable = true;
  const router = createTutuRouter({
    requireAuth: auth,
    adapter: { async search() { throw error; } },
    selectionTokens: createSelectionTokenService({ secret: 'route-test-secret' }),
  });
  await withServer(router, async function (baseUrl) {
    const response = await fetch(baseUrl + '/api/tutu/search', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request(null)),
    });
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.deepEqual(body, { error: { code: 'TUTU_TOOL_ERROR', message: 'Tutu request failed', retryable: true } });
  });
});

test('POST /demo-purchase-success creates or replays a canonical Trip through TripFactory', async () => {
  const selectionTokens = createSelectionTokenService({ secret: 'route-test-secret' });
  const token = selectionTokens.signSelection('user-1', Object.assign({}, parsedSelection, {
    searchRequest: request(null),
  }));
  const calls = [];
  const router = createTutuRouter({
    requireAuth: auth,
    adapter: { async search() { return []; } },
    selectionTokens: selectionTokens,
    tripFactory: {
      async createFromSelection(input) {
        calls.push(input);
        return { trip: { id: 'tutu_trip_1' }, created: calls.length === 1 };
      },
    },
  });
  await withServer(router, async function (baseUrl) {
    for (const expected of [[201, true], [200, false]]) {
      const response = await fetch(baseUrl + '/api/tutu/demo-purchase-success', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': 'fixture-000000000000' },
        body: JSON.stringify({ selectionToken: token }),
      });
      assert.equal(response.status, expected[0]);
      assert.deepEqual(await response.json(), { tripId: 'tutu_trip_1', created: expected[1] });
    }
    assert.equal(calls[0].user.id, 'user-1');
    assert.equal(calls[0].idempotencyKey, 'fixture-000000000000');
    assert.deepEqual(calls[0].option, parsedSelection.option);
    assert.deepEqual(calls[0].searchRequest, request(null));
  });
});

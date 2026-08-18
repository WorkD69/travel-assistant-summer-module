'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const PRODUCTION_PAGES = [
  'history.html',
  'home.html',
  'invitation.html',
  'login.html',
  'password-recovery.html',
  'profile.html',
  'register.html',
  'search-results.html',
  'trip-overview.html',
  'trip-wizard.html',
];

function read(relativePath) {
  return fs.readFileSync(relativePath, 'utf8');
}

function run(relativePath, context) {
  vm.runInNewContext(read(relativePath), context);
}

function option() {
  return {
    schemaVersion: '1',
    id: 'option-1',
    transportType: 'flight',
    segments: [{
      id: 'segment-1',
      transportType: 'flight',
      departurePlace: 'Москва',
      arrivalPlace: 'Санкт-Петербург',
      departureAt: '2026-08-20T12:05:00+03:00',
      arrivalAt: '2026-08-20T13:30:00+03:00',
      serviceNumber: 'SU 001',
      carrierName: 'Россия',
    }],
    price: { amount: 6346, currency: 'RUB', kind: 'total' },
    availability: null,
    transferCount: 0,
    durationMinutes: 85,
    source: { provider: 'tutu-mcp', tool: 'search_avia', serverVersion: '0.38.0' },
    fetchedAt: '2026-08-16T10:00:00.000Z',
  };
}

function request() {
  return {
    schemaVersion: '1',
    mode: 'flight',
    origin: 'Москва',
    destination: 'Санкт-Петербург',
    departureDate: '2026-08-20',
    returnDate: null,
    passengers: { adults: 1, children: 0, infants: 0 },
  };
}

function loadResults() {
  const context = { window: {}, URL, URLSearchParams, Intl, document: {} };
  run('assets/js/tutu-search-results.js', context);
  return context.window.TutuSearchResults;
}

function apiContext(calls, releaseOrigin) {
  return {
    fetch: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, async json() { return { created: true, tripId: 'trip-1' }; } };
    },
    navigator: {},
    location: { protocol: 'https:' },
    window: {
      TRAVEL_RELEASE_API_BASE: releaseOrigin,
      TravelAuthStorage: { load() { return null; }, save() {}, clear() {} },
    },
  };
}

async function searchOne(controller, token = 'opaque-selection-token') {
  await controller.search(request());
  assert.equal(controller.getState().status, 'results');
  assert.equal(controller.getState().entries[0].selectionToken, token);
}

test('every production page loads common runtime bootstrap before api-client', () => {
  for (const page of PRODUCTION_PAGES) {
    const html = read(page);
    assert.ok(html.indexOf('assets/js/runtime-config.js') !== -1, `${page} must load runtime bootstrap`);
    assert.ok(
      html.indexOf('assets/js/runtime-config.js') < html.indexOf('assets/js/api-client.js'),
      `${page} must bootstrap API base before api-client`,
    );
  }
});

test('runtime bootstrap yields the configured release origin before TravelApi is evaluated', () => {
  const calls = [];
  const context = apiContext(calls, 'https://release.example.test/');
  run('assets/js/runtime-config.js', context);
  run('assets/js/api-client.js', context);
  assert.equal(context.window.TravelApi.base, 'https://release.example.test');
});

test('final execution source contains no historical B2 backend origin', () => {
  const finalSources = [
    read('assets/js/api-client.js'),
    read('service-worker.js'),
    ...PRODUCTION_PAGES.map(read),
  ].join('\n');
  assert.doesNotMatch(finalSources, /travel-assistant-teammate-backend-b2-staging-staging-b2\.up\.railway\.app/);
});

test('TravelApi posts exact demo purchase body with supplied stable idempotency key', async () => {
  const calls = [];
  const context = apiContext(calls, 'https://release.example.test');
  run('assets/js/runtime-config.js', context);
  run('assets/js/api-client.js', context);

  await context.window.TravelApi.tutuDemoPurchaseSuccess('opaque-selection-token', 'a'.repeat(32));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://release.example.test/api/tutu/demo-purchase-success');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), { selectionToken: 'opaque-selection-token' });
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'a'.repeat(32));
});

test('checkout opens a synchronous managed placeholder before factual checkout API and isolates opener', async () => {
  const results = loadResults();
  const order = [];
  const placeholder = {
    opener: 'parent-window',
    location: { replace(url) { this.url = url; } },
    close() { this.closed = true; },
  };
  const controller = results.createController({
    api: {
      async tutuSearch() { return { options: [{ option: option(), selectionToken: 'opaque-selection-token' }] }; },
      async tutuCheckoutLink() { order.push('api'); return { checkout: { checkoutUrl: 'https://avia.tutu.ru/checkout' } }; },
    },
    openPlaceholder() { order.push('open'); return placeholder; },
    randomBytes() { return new Uint8Array(24).fill(2); },
    render() {},
  });

  await searchOne(controller);
  await controller.select('option-1');

  assert.deepEqual(order, ['open', 'api']);
  assert.equal(placeholder.opener, null);
  assert.equal(placeholder.location.url, 'https://avia.tutu.ru/checkout');
});

test('checkout stops before API call when a synchronous placeholder is blocked', async () => {
  const results = loadResults();
  let checkoutCalls = 0;
  const controller = results.createController({
    api: {
      async tutuSearch() { return { options: [{ option: option(), selectionToken: 'opaque-selection-token' }] }; },
      async tutuCheckoutLink() { checkoutCalls += 1; return { checkout: { checkoutUrl: 'https://avia.tutu.ru/checkout' } }; },
    },
    openPlaceholder() { return null; },
    render() {},
  });

  await searchOne(controller);
  await controller.select('option-1');

  assert.equal(checkoutCalls, 0);
  assert.match(controller.getState().errorMessage, /всплывающ|окно/i);
});

test('checkout closes managed placeholder when response URL is invalid', async () => {
  const results = loadResults();
  const placeholder = {
    opener: 'parent-window',
    location: { replace(url) { this.url = url; } },
    close() { this.closed = true; },
  };
  const controller = results.createController({
    api: {
      async tutuSearch() { return { options: [{ option: option(), selectionToken: 'opaque-selection-token' }] }; },
      async tutuCheckoutLink() { return { checkout: { checkoutUrl: 'javascript:alert(1)' } }; },
    },
    openPlaceholder() { return placeholder; },
    render() {},
  });

  await searchOne(controller);
  await controller.select('option-1');

  assert.equal(placeholder.opener, null);
  assert.equal(placeholder.closed, true);
  assert.equal(placeholder.location.url, undefined);
});

test('demo retry reuses a transient idempotency key and rereads canonical Trip before existing route', async () => {
  const results = loadResults();
  const keys = [];
  const events = [];
  let attempts = 0;
  const placeholder = { opener: 'parent-window', location: { replace() {} }, close() {} };
  const controller = results.createController({
    api: {
      async tutuSearch() { return { options: [{ option: option(), selectionToken: 'opaque-selection-token' }] }; },
      async tutuCheckoutLink() { return { checkout: { checkoutUrl: 'https://avia.tutu.ru/checkout' } }; },
      async tutuDemoPurchaseSuccess(token, key) {
        keys.push([token, key]);
        attempts += 1;
        if (attempts === 1) throw new Error('network');
        events.push('post');
        return { created: false, tripId: 'trip-1' };
      },
      async getTrip(tripId) { events.push(`get:${tripId}`); return { id: tripId }; },
    },
    openPlaceholder() { return placeholder; },
    goToTrip(tripId) { events.push(`route:${tripId}`); },
    randomBytes() { return new Uint8Array(24).fill(7); },
    render() {},
  });

  await searchOne(controller);
  await controller.select('option-1');
  await controller.confirmDemoPurchase();
  await controller.confirmDemoPurchase();

  assert.equal(keys.length, 2);
  assert.equal(keys[0][0], 'opaque-selection-token');
  assert.equal(keys[0][1], keys[1][1]);
  assert.match(keys[0][1], /^.{16,128}$/);
  assert.deepEqual(events, ['post', 'get:trip-1', 'route:trip-1']);
});

test('canonical reread failure does not navigate and selection token is never rendered or persisted', async () => {
  const results = loadResults();
  const renders = [];
  const stored = [];
  const routes = [];
  const placeholder = { opener: 'parent-window', location: { replace() {} }, close() {} };
  const controller = results.createController({
    api: {
      async tutuSearch() { return { options: [{ option: option(), selectionToken: 'opaque-selection-token' }] }; },
      async tutuCheckoutLink() { return { checkout: { checkoutUrl: 'https://avia.tutu.ru/checkout' } }; },
      async tutuDemoPurchaseSuccess() { return { created: true, tripId: 'trip-1' }; },
      async getTrip() { throw new Error('network'); },
    },
    openPlaceholder() { return placeholder; },
    randomBytes() { return new Uint8Array(24).fill(3); },
    goToTrip(tripId) { routes.push(tripId); },
    storage: { setItem(...args) { stored.push(args); } },
    render(state) { renders.push(results.renderPage(state, controller.visibleEntries())); },
  });

  await searchOne(controller);
  await controller.select('option-1');
  await controller.confirmDemoPurchase();

  assert.deepEqual(routes, []);
  assert.deepEqual(stored, []);
  assert.doesNotMatch(renders.join('\n'), /opaque-selection-token/);
  assert.match(controller.getState().errorMessage, /поездк/i);
});

test('page reload loses transient selection state and requires a new factual search', async () => {
  const results = loadResults();
  let checkoutCalls = 0;
  const api = {
    async tutuSearch() { return { options: [{ option: option(), selectionToken: 'opaque-selection-token' }] }; },
    async tutuCheckoutLink() { checkoutCalls += 1; return { checkout: { checkoutUrl: 'https://avia.tutu.ru/checkout' } }; },
  };
  const beforeReload = results.createController({
    api,
    openPlaceholder() { return { opener: null, location: { replace() {} }, close() {} }; },
    randomBytes() { return new Uint8Array(24).fill(4); },
    render() {},
  });
  await searchOne(beforeReload);

  const afterReload = results.createController({ api, render() {} });
  assert.equal(await afterReload.select('option-1'), false);
  assert.equal(await afterReload.confirmDemoPurchase(), false);
  assert.equal(checkoutCalls, 0);
});

test('existing AppRoutes is the only canonical Trip handoff and no fixture Trip is constructed', () => {
  const source = read('assets/js/tutu-search-results.js');

  assert.match(source, /window\.AppRoutes\.goToTrip\(tripId\)/);
  assert.doesNotMatch(source, /\/trips\//);
  assert.doesNotMatch(source, /createTrip\s*\(|fixture\s*Trip|selected option/i);
});

test('checkout closes placeholder and stops before API when opener isolation cannot be confirmed', async () => {
  const results = loadResults();
  let checkoutCalls = 0;
  const placeholder = {
    location: { replace(url) { this.url = url; } },
    close() { this.closed = true; },
  };
  Object.defineProperty(placeholder, 'opener', {
    get() { return 'parent-window'; },
    set() {},
  });
  const controller = results.createController({
    api: {
      async tutuSearch() { return { options: [{ option: option(), selectionToken: 'opaque-selection-token' }] }; },
      async tutuCheckoutLink() { checkoutCalls += 1; return { checkout: { checkoutUrl: 'https://avia.tutu.ru/checkout' } }; },
    },
    openPlaceholder() { return placeholder; },
    render() {},
  });

  await searchOne(controller);
  await controller.select('option-1');

  assert.equal(checkoutCalls, 0);
  assert.equal(placeholder.closed, true);
  assert.equal(placeholder.location.url, undefined);
  assert.match(controller.getState().errorMessage, /безопасно|оформлен/i);
});

test('unauthenticated canonical reread reports session state without route navigation', async () => {
  const results = loadResults();
  const routes = [];
  const controller = results.createController({
    api: {
      async tutuSearch() { return { options: [{ option: option(), selectionToken: 'opaque-selection-token' }] }; },
      async tutuCheckoutLink() { return { checkout: { checkoutUrl: 'https://avia.tutu.ru/checkout' } }; },
      async tutuDemoPurchaseSuccess() { return { created: true, tripId: 'trip-1' }; },
      async getTrip() { throw { status: 401, data: { error: { code: 'UNAUTHENTICATED' } } }; },
    },
    openPlaceholder() { return { opener: null, location: { replace() {} }, close() {} }; },
    randomBytes() { return new Uint8Array(24).fill(5); },
    goToTrip(tripId) { routes.push(tripId); },
    render() {},
  });

  await searchOne(controller);
  await controller.select('option-1');
  await controller.confirmDemoPurchase();

  assert.deepEqual(routes, []);
  assert.match(controller.getState().errorMessage, /Сессия истекла/i);
});

test('IDEMPOTENCY_KEY_REUSE clears the conflicted intent and requires a new factual search', async () => {
  const results = loadResults();
  const keys = [];
  let randomCalls = 0;
  const placeholder = { opener: 'parent-window', location: { replace() {} }, close() {} };
  const controller = results.createController({
    api: {
      async tutuSearch() { return { options: [{ option: option(), selectionToken: 'opaque-selection-token' }] }; },
      async tutuCheckoutLink() { return { checkout: { checkoutUrl: 'https://avia.tutu.ru/checkout' } }; },
      async tutuDemoPurchaseSuccess(_token, key) {
        keys.push(key);
        throw { status: 409, data: { error: { code: 'IDEMPOTENCY_KEY_REUSE' } } };
      },
    },
    openPlaceholder() { return placeholder; },
    randomBytes() { randomCalls += 1; return new Uint8Array(24).fill(9); },
    render() {},
  });

  await searchOne(controller);
  await controller.select('option-1');
  await controller.confirmDemoPurchase();

  assert.equal(keys.length, 1);
  assert.equal(randomCalls, 1);
  assert.equal(controller.getState().selectionIntent, null);
  assert.equal(controller.getState().requiresFreshSearch, true);
  assert.equal(await controller.confirmDemoPurchase(), false);
  assert.equal(await controller.select('option-1'), false);
  assert.equal(keys.length, 1);
  assert.equal(randomCalls, 1);
  assert.match(controller.getState().errorMessage, /новый поиск.*выберите вариант/i);
});

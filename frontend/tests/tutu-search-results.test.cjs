const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function read(relativePath) {
  assert.ok(fs.existsSync(relativePath), `${relativePath} must exist`);
  return fs.readFileSync(relativePath, 'utf8');
}

function loadAdapter() {
  const context = { window: {}, URLSearchParams };
  vm.runInNewContext(read('assets/js/tutu-search-adapter.js'), context);
  return context.window.TutuSearchAdapter;
}

function loadResults(overrides = {}) {
  const context = Object.assign({
    window: {},
    document: {},
    URL,
    URLSearchParams,
    Intl,
  }, overrides);
  vm.runInNewContext(read('assets/js/tutu-search-results.js'), context);
  return context.window.TutuSearchResults;
}

function option(patch = {}) {
  const base = {
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
  return Object.assign(base, patch);
}

function validDetail(patch = {}) {
  return Object.assign({
    mode: 'flights',
    origin: 'Москва',
    destination: 'Санкт-Петербург',
    outbound: '2026-08-20',
    returnDate: '',
    passengers: '1 пассажир, эконом',
  }, patch);
}

test('maps the existing Home search event to frozen SearchRequestV1', () => {
  const adapter = loadAdapter();

  assert.deepEqual(
    JSON.parse(JSON.stringify(adapter.mapSearchDetail(validDetail(), new Date('2026-08-16T00:00:00Z')))),
    {
      schemaVersion: '1',
      mode: 'flight',
      origin: 'Москва',
      destination: 'Санкт-Петербург',
      departureDate: '2026-08-20',
      returnDate: null,
      passengers: { adults: 1, children: 0, infants: 0 },
    },
  );
});

test('resolves relative Home date labels without changing one-way semantics', () => {
  const adapter = loadAdapter();

  assert.equal(adapter.mapSearchDetail(validDetail({ outbound: 'Сегодня' }), new Date('2026-08-16T12:00:00Z')).departureDate, '2026-08-16');
  assert.equal(adapter.mapSearchDetail(validDetail({ outbound: 'Завтра' }), new Date('2026-08-16T12:00:00Z')).departureDate, '2026-08-17');
  assert.equal(adapter.mapSearchDetail(validDetail({ outbound: 'Послезавтра' }), new Date('2026-08-16T12:00:00Z')).departureDate, '2026-08-18');
  assert.equal(adapter.mapSearchDetail(validDetail({ outbound: '20.08.2026' })).departureDate, '2026-08-20');
});

test('maps each supported Home transport mode and rejects unrelated products', () => {
  const adapter = loadAdapter();

  assert.equal(adapter.mapSearchDetail(validDetail({ mode: 'rail' })).mode, 'train');
  assert.equal(adapter.mapSearchDetail(validDetail({ mode: 'buses' })).mode, 'bus');
  assert.equal(adapter.mapSearchDetail(validDetail({ mode: 'electric' })).mode, 'etrain');
  assert.throws(
    () => adapter.mapSearchDetail(validDetail({ mode: 'hotels' })),
    (error) => error && error.code === 'TUTU_MODE_UNSUPPORTED',
  );
});

test('rejects round trips and unsupported passengers before navigation', () => {
  const adapter = loadAdapter();

  assert.throws(
    () => adapter.mapSearchDetail(validDetail({ returnDate: '2026-08-27' })),
    (error) => error && error.code === 'TUTU_ROUND_TRIP_UNSUPPORTED',
  );
  assert.throws(
    () => adapter.mapSearchDetail(validDetail({ passengers: '2 пассажира, эконом' })),
    (error) => error && error.code === 'TUTU_MULTI_PASSENGER_UNSUPPORTED',
  );
});

test('requires a factual departure date and preserves request query fields', () => {
  const adapter = loadAdapter();

  assert.throws(
    () => adapter.mapSearchDetail(validDetail({ outbound: '' })),
    (error) => error && error.code === 'TUTU_DEPARTURE_DATE_REQUIRED',
  );
  const request = adapter.mapSearchDetail(validDetail());
  const restored = adapter.requestFromQuery(adapter.requestToQuery(request));
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), JSON.parse(JSON.stringify(request)));
  assert.throws(
    () => adapter.requestFromQuery(`${adapter.requestToQuery(request)}&returnDate=2026-08-27`),
    (error) => error && error.code === 'TUTU_ROUND_TRIP_UNSUPPORTED',
  );
});

test('local unsupported errors have safe Russian messages', () => {
  const adapter = loadAdapter();

  assert.match(adapter.messageForLocalError({ code: 'TUTU_ROUND_TRIP_UNSUPPORTED' }), /туда и обратно/i);
  assert.match(adapter.messageForLocalError({ code: 'TUTU_MULTI_PASSENGER_UNSUPPORTED' }), /одного взрослого/i);
  assert.match(adapter.messageForLocalError({ code: 'TUTU_MODE_UNSUPPORTED' }), /вида поездки/i);
  assert.match(adapter.messageForLocalError({ code: 'TUTU_DEPARTURE_DATE_REQUIRED' }), /дату отправления/i);
});

test('Home flow consumes the existing search event and uses existing AppRoutes', () => {
  let searchListener;
  const status = { textContent: '' };
  const routed = [];
  const document = {
    addEventListener(type, listener) {
      if (type === 'tutu-native:search') searchListener = listener;
    },
  };
  const request = { schemaVersion: '1', mode: 'flight' };
  const context = {
    document,
    window: {
      TutuSearchAdapter: {
        mapSearchDetail(detail) {
          assert.equal(detail.origin, 'Москва');
          return request;
        },
        messageForLocalError() { return 'safe error'; },
      },
      AppRoutes: { goToSearchResults(value) { routed.push(value); } },
    },
  };

  vm.runInNewContext(read('assets/js/tutu-search-flow.js'), context);
  assert.equal(typeof searchListener, 'function');
  searchListener({ detail: { origin: 'Москва' }, target: { querySelector() { return status; } } });
  assert.deepEqual(routed, [request]);
  assert.equal(status.textContent, '');
});

test('Home flow reports unsupported requests locally without navigation', () => {
  let searchListener;
  const status = { textContent: '' };
  let routeCalls = 0;
  const context = {
    document: { addEventListener(_type, listener) { searchListener = listener; } },
    window: {
      TutuSearchAdapter: {
        mapSearchDetail() { const error = new Error('raw'); error.code = 'TUTU_ROUND_TRIP_UNSUPPORTED'; throw error; },
        messageForLocalError() { return 'Поиск туда и обратно пока недоступен.'; },
      },
      AppRoutes: { goToSearchResults() { routeCalls += 1; } },
    },
  };

  vm.runInNewContext(read('assets/js/tutu-search-flow.js'), context);
  const event = {
    detail: validDetail(),
    target: { querySelector() { return status; } },
    prevented: false,
    preventDefault() { this.prevented = true; },
  };
  searchListener(event);
  assert.equal(routeCalls, 0);
  assert.equal(event.prevented, true);
  assert.match(status.textContent, /туда и обратно/i);
});

test('search results navigation is part of the existing router and Home load order', () => {
  const routes = read('assets/js/app-routes.js');
  const home = read('home.html');

  assert.match(routes, /"search-results\.html"/);
  assert.match(routes, /goToSearchResults\(request\)/);
  assert.match(routes, /TutuSearchAdapter\.requestToQuery\(request\)/);
  assert.match(home, /assets\/js\/tutu-search-adapter\.js/);
  assert.match(home, /assets\/js\/tutu-search-flow\.js/);
  assert.ok(home.indexOf('tutu-search-adapter.js') < home.indexOf('tutu-search-flow.js'));
  const shell = read('assets/js/tutu-search-shell.js');
  assert.match(shell, /cancelable:\s*true/);
  assert.match(shell, /if \(accepted\) status\.textContent/);
});

test('TravelApi posts exact frozen search and selection token payloads', async () => {
  const calls = [];
  const context = {
    fetch: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, async json() { return {}; } };
    },
    navigator: {},
    location: { protocol: 'http:' },
    window: {
      TRAVEL_API_BASE: 'https://api.example.test/',
      TravelAuthStorage: { load() { return null; }, save() {}, clear() {} },
    },
  };
  vm.runInNewContext(read('assets/js/api-client.js'), context);
  const request = loadAdapter().mapSearchDetail(validDetail());

  await context.window.TravelApi.tutuSearch(request);
  await context.window.TravelApi.tutuCheckoutLink('server-issued-token');

  assert.equal(calls[0].url, 'https://api.example.test/api/tutu/search');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), JSON.parse(JSON.stringify(request)));
  assert.equal(calls[1].url, 'https://api.example.test/api/tutu/checkout-link');
  assert.deepEqual(JSON.parse(calls[1].init.body), { selectionToken: 'server-issued-token' });
});

test('formats duration and Russian transfer pluralization from contract facts', () => {
  const results = loadResults();

  assert.equal(results.formatDuration(85), '1 ч 25 мин');
  assert.equal(results.formatDuration(120), '2 ч');
  assert.equal(results.formatTransfers(0), 'Прямой');
  assert.equal(results.formatTransfers(1), '1 пересадка');
  assert.equal(results.formatTransfers(2), '2 пересадки');
  assert.equal(results.formatTransfers(5), '5 пересадок');
});

test('renders factual carrier and optional service number with neutral fallbacks', () => {
  const results = loadResults();

  assert.equal(results.carrierLabel(option()), 'Россия');
  assert.equal(results.carrierLabel(option({ segments: [{ ...option().segments[0], carrierName: null }] })), 'Авиаперевозчик');
  assert.equal(results.carrierLabel(option({ transportType: 'train', segments: [{ ...option().segments[0], carrierName: null }] })), 'Поезд');
  assert.equal(results.serviceNumberLabel(option()), 'SU 001');
  assert.equal(results.serviceNumberLabel(option({ segments: [{ ...option().segments[0], serviceNumber: null }] })), '');
});

test('formats price honestly without per-person or total semantics', () => {
  const results = loadResults();

  assert.equal(results.formatPrice(null), 'Цена уточняется');
  assert.match(results.formatPrice({ amount: 6346, currency: 'RUB', kind: 'total' }), /^6[\s\u00a0\u202f]346 ₽$/);
  assert.match(results.formatPrice({ amount: 6346, currency: 'RUB', kind: 'from' }), /^от 6[\s\u00a0\u202f]346 ₽$/);
  assert.doesNotMatch(results.formatPrice({ amount: 6346, currency: 'RUB', kind: 'unknown' }), /человек|всех/i);
});

test('keeps scheduled local time from the explicit ISO timestamp text', () => {
  const results = loadResults();

  assert.equal(results.formatIsoTime('2026-08-20T00:15:00-11:00'), '00:15');
  assert.equal(results.formatIsoTime('2026-08-20T23:50:00+14:00'), '23:50');
});

test('default order stays provider order and factual sorts are deterministic', () => {
  const results = loadResults();
  const entries = [
    { providerIndex: 0, option: option({ id: 'a', price: null, durationMinutes: 120, segments: [{ ...option().segments[0], departureAt: '2026-08-20T09:00:00+03:00' }] }) },
    { providerIndex: 1, option: option({ id: 'b', price: { amount: 7000, currency: 'RUB', kind: 'total' }, durationMinutes: 60, segments: [{ ...option().segments[0], departureAt: '2026-08-20T07:00:00+03:00' }] }) },
    { providerIndex: 2, option: option({ id: 'c', price: { amount: 5000, currency: 'RUB', kind: 'from' }, durationMinutes: 90, segments: [{ ...option().segments[0], departureAt: '2026-08-20T08:00:00+03:00' }] }) },
  ];
  const ids = (sort) => results.sortEntries(entries, sort).map((entry) => entry.option.id);

  assert.deepEqual(ids('default'), ['a', 'b', 'c']);
  assert.deepEqual(ids('cheap'), ['c', 'b', 'a']);
  assert.deepEqual(ids('fast'), ['b', 'c', 'a']);
  assert.deepEqual(ids('early'), ['b', 'c', 'a']);

  const mixedCurrencies = [
    { providerIndex: 0, option: option({ id: 'rub', price: { amount: 7000, currency: 'RUB', kind: 'total' } }) },
    { providerIndex: 1, option: option({ id: 'usd', price: { amount: 10, currency: 'USD', kind: 'total' } }) },
    { providerIndex: 2, option: option({ id: 'rub-lower', price: { amount: 5000, currency: 'RUB', kind: 'total' } }) },
  ];
  assert.deepEqual(
    results.sortEntries(mixedCurrencies, 'cheap').map((entry) => entry.option.id),
    ['rub', 'usd', 'rub-lower'],
  );
});

test('filters only direct options and factual non-null carriers', () => {
  const results = loadResults();
  const entries = [
    { providerIndex: 0, option: option({ id: 'a', transferCount: 0 }) },
    { providerIndex: 1, option: option({ id: 'b', transferCount: 1, segments: [{ ...option().segments[0], carrierName: 'S7 Airlines' }, { ...option().segments[0], id: 'segment-2' }] }) },
    { providerIndex: 2, option: option({ id: 'c', transferCount: 0, segments: [{ ...option().segments[0], carrierName: null }] }) },
  ];

  assert.deepEqual(results.filterEntries(entries, true, '').map((entry) => entry.option.id), ['a', 'c']);
  assert.deepEqual(results.filterEntries(entries, false, 'S7 Airlines').map((entry) => entry.option.id), ['b']);
  assert.deepEqual(Array.from(results.carrierOptions(entries)), ['Россия', 'S7 Airlines']);
});

test('normalizes only the frozen search envelope and retains server tokens opaquely', () => {
  const results = loadResults();
  const payload = { options: [{ option: option(), selectionToken: 'opaque.jwt.value' }] };
  const entries = results.normalizeSearchEnvelope(payload);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].option.id, 'option-1');
  assert.equal(entries[0].selectionToken, 'opaque.jwt.value');
  assert.equal(entries[0].providerIndex, 0);
  assert.throws(() => results.normalizeSearchEnvelope({ offers: [] }), /invalid/i);
  assert.throws(
    () => results.normalizeSearchEnvelope({ options: [
      { option: option({ id: 'duplicate' }), selectionToken: 'token-a' },
      { option: option({ id: 'duplicate' }), selectionToken: 'token-b' },
    ] }),
    /invalid/i,
  );
  const source = read('assets/js/tutu-search-results.js');
  assert.doesNotMatch(source, /providerContext|rawOffer|jwt\.decode|atob\s*\(/i);
});

test('maps stable backend errors to unsupported, temporary, and generic Russian states', () => {
  const results = loadResults();
  const backendError = (code) => ({ data: { error: { code, message: 'raw provider message' } } });

  assert.match(results.messageForBackendError(backendError('TUTU_ROUND_TRIP_UNSUPPORTED')), /туда и обратно/i);
  assert.match(results.messageForBackendError(backendError('TUTU_MULTI_PASSENGER_UNSUPPORTED')), /одного взрослого/i);
  assert.match(results.messageForBackendError(backendError('TUTU_TIMEOUT')), /временно|позже/i);
  assert.match(results.messageForBackendError(backendError('TUTU_UNAVAILABLE')), /временно|позже/i);
  assert.match(results.messageForBackendError(backendError('TUTU_TOOL_ERROR')), /не удалось/i);
  assert.doesNotMatch(results.messageForBackendError(backendError('TUTU_TOOL_ERROR')), /raw provider/i);
});

test('controller exposes loading, success, empty, and safe error states', async () => {
  const results = loadResults();
  const renders = [];
  let resolveSearch;
  let searchCalls = 0;
  const api = {
    tutuSearch() {
      searchCalls += 1;
      return new Promise((resolve) => { resolveSearch = resolve; });
    },
  };
  const controller = results.createController({ api, render: (state) => renders.push(state.status) });
  const request = loadAdapter().mapSearchDetail(validDetail());

  const first = controller.search(request);
  const duplicate = await controller.search(request);
  assert.equal(searchCalls, 1);
  assert.equal(duplicate, false);
  assert.equal(controller.getState().status, 'loading');
  assert.equal(controller.getState().entries.length, 0);
  resolveSearch({ options: [{ option: option(), selectionToken: 'token-1' }] });
  await first;
  assert.equal(controller.getState().status, 'results');
  assert.deepEqual(renders, ['loading', 'results']);

  api.tutuSearch = async () => ({ options: [] });
  await controller.search(request);
  assert.equal(controller.getState().status, 'empty');

  api.tutuSearch = async () => { throw { data: { error: { code: 'TUTU_TIMEOUT' } } }; };
  await controller.search(request);
  assert.equal(controller.getState().status, 'error');
  assert.match(controller.getState().errorMessage, /временно|позже/i);
});

test('controller propagates the exact server selectionToken to checkout and opaque URL to navigation', async () => {
  const results = loadResults();
  const checkoutTokens = [];
  const navigations = [];
  const controller = results.createController({
    api: {
      async tutuSearch() { return { options: [{ option: option(), selectionToken: 'server-token-123' }] }; },
      async tutuCheckoutLink(token) {
        checkoutTokens.push(token);
        return { checkout: { checkoutUrl: 'https://avia.tutu.ru/x?z=2&a=1' } };
      },
    },
    render() {},
    navigate(url) { navigations.push(url); },
  });
  await controller.search(loadAdapter().mapSearchDetail(validDetail()));

  await controller.select('option-1');

  assert.deepEqual(checkoutTokens, ['server-token-123']);
  assert.deepEqual(navigations, ['https://avia.tutu.ru/x?z=2&a=1']);
  assert.equal(controller.getState().pendingSelectionId, null);
});

test('controller rejects checkout envelopes without a real URL and blocks duplicate selections', async () => {
  const results = loadResults();
  let resolveCheckout;
  let checkoutCalls = 0;
  const controller = results.createController({
    api: {
      async tutuSearch() { return { options: [{ option: option(), selectionToken: 'server-token-123' }] }; },
      tutuCheckoutLink() {
        checkoutCalls += 1;
        return new Promise((resolve) => { resolveCheckout = resolve; });
      },
    },
    render() {},
    navigate() { throw new Error('must not navigate'); },
  });
  await controller.search(loadAdapter().mapSearchDetail(validDetail()));

  const first = controller.select('option-1');
  const duplicate = await controller.select('option-1');
  assert.equal(duplicate, false);
  assert.equal(checkoutCalls, 1);
  resolveCheckout({ checkout: { checkoutUrl: null } });
  await first;
  assert.match(controller.getState().errorMessage, /не удалось|недоступ/i);
});

test('controller rejects non-HTTPS checkout schemes without rewriting the opaque URL', async () => {
  const results = loadResults();
  let navigations = 0;
  const controller = results.createController({
    api: {
      async tutuSearch() { return { options: [{ option: option(), selectionToken: 'server-token-123' }] }; },
      async tutuCheckoutLink() { return { checkout: { checkoutUrl: 'javascript:alert(1)' } }; },
    },
    render() {},
    navigate() { navigations += 1; },
  });
  await controller.search(loadAdapter().mapSearchDetail(validDetail()));

  await controller.select('option-1');

  assert.equal(navigations, 0);
  assert.match(controller.getState().errorMessage, /не удалось|недоступ/i);
});

test('controller reports expired selections as checkout errors and never as search failures', async () => {
  const results = loadResults();
  const controller = results.createController({
    api: {
      async tutuSearch() { return { options: [{ option: option(), selectionToken: 'expired-token' }] }; },
      async tutuCheckoutLink() {
        throw { data: { error: { code: 'TUTU_SELECTION_EXPIRED', message: 'raw token details' } } };
      },
    },
    render() {},
    navigate() { throw new Error('must not navigate'); },
  });
  await controller.search(loadAdapter().mapSearchDetail(validDetail()));

  await controller.select('option-1');

  assert.match(controller.getState().errorMessage, /вариант|результат/i);
  assert.doesNotMatch(controller.getState().errorMessage, /выполнить поиск|raw token/i);
});

test('Search Results page reuses AppShell, AppRoutes, TravelApi, and the frozen adapter', () => {
  const html = read('search-results.html');

  assert.match(html, /<body class="[^"]*tutu-results-surface[^"]*"/);
  assert.match(html, /assets\/css\/app-shell\.css/);
  assert.match(html, /assets\/css\/tutu-search-results\.css/);
  for (const script of [
    'assets/js/app-routes.js',
    'assets/js/app-shell.js',
    'assets/js/api-client.js',
    'assets/js/tutu-search-adapter.js',
    'assets/js/tutu-search-results.js',
  ]) {
    assert.match(html, new RegExp(script.replace(/[./]/g, '\\$&')));
  }
  assert.match(html, /appShellInit\(\{\s*section:\s*"Результаты поиска",\s*variant:\s*"tutu"\s*\}\)/);
  assert.match(html, /tutuSearchResultsInit/);
});

test('factual card rendering uses only TransportOptionV1 fields', () => {
  const results = loadResults();
  const transferOption = option({
    id: 'transfer-option',
    price: { amount: 7120, currency: 'RUB', kind: 'from' },
    availability: { status: 'limited', seats: 6 },
    transferCount: 1,
    durationMinutes: 210,
    segments: [
      {
        ...option().segments[0],
        id: 'leg-1',
        arrivalPlace: 'Казань',
        arrivalAt: '2026-08-20T13:20:00+03:00',
        serviceNumber: 'SU 100',
      },
      {
        ...option().segments[0],
        id: 'leg-2',
        departurePlace: 'Казань',
        departureAt: '2026-08-20T14:05:00+03:00',
        arrivalAt: '2026-08-20T15:35:00+03:00',
        serviceNumber: 'SU 200',
      },
    ],
  });
  const html = results.renderCard({ option: transferOption, selectionToken: 'must-not-render', providerIndex: 0 }, null);

  for (const fact of ['Россия', 'SU 100', '12:05', 'Москва', '15:35', 'Санкт-Петербург', '3 ч 30 мин', '1 пересадка', 'Казань', 'от 7', '120 ₽', 'Осталось 6 мест', 'Выбрать билет']) {
    assert.match(html, new RegExp(fact));
  }
  assert.doesNotMatch(html, /must-not-render|tutu-mcp|0\.38\.0|search_avia/);
});

test('card rendering handles null carrier, service, price, and seat count neutrally', () => {
  const results = loadResults();
  const neutral = option({
    price: null,
    availability: { status: 'available', seats: null },
    segments: [{ ...option().segments[0], carrierName: null, serviceNumber: null }],
  });
  const html = results.renderCard({ option: neutral, selectionToken: 'token', providerIndex: 0 }, null);

  assert.match(html, /Авиаперевозчик/);
  assert.match(html, /Цена уточняется/);
  assert.match(html, /Доступно/);
  assert.doesNotMatch(html, /Осталось \d|service-number/);
});

test('loading, empty, error, and no-filter-match states are explicit and offer-free', () => {
  const results = loadResults();

  assert.match(results.renderContent({ status: 'loading' }, []), /tutu-result-skeleton/);
  assert.doesNotMatch(results.renderContent({ status: 'loading' }, []), /Выбрать билет/);
  assert.match(results.renderContent({ status: 'empty' }, []), /По вашему запросу вариантов не найдено/);
  assert.match(results.renderContent({ status: 'error', errorMessage: 'Безопасная ошибка' }, []), /Безопасная ошибка/);
  assert.match(results.renderContent({ status: 'results' }, []), /Нет вариантов с выбранными фильтрами/);
});

test('results controls expose only factual deterministic sorts and filters', () => {
  const source = read('assets/js/tutu-search-results.js');

  for (const label of ['По умолчанию', 'Сначала дешёвые', 'Сначала быстрые', 'Сначала ранние', 'Прямые', 'Все перевозчики']) {
    assert.match(source, new RegExp(label));
  }
  assert.doesNotMatch(source, /Рекомендуем/);
  assert.match(source, /data-results-sort/);
  assert.match(source, /data-results-direct/);
  assert.match(source, /data-results-carrier/);
});

test('production Results UI contains no unsupported provider claims', () => {
  const combined = [
    read('search-results.html'),
    read('assets/js/tutu-search-results.js'),
    read('assets/css/tutu-search-results.css'),
  ].join('\n');

  for (const forbidden of [
    /багаж/i,
    /рейтинг/i,
    /отзыв/i,
    /задерж/i,
    /отмен[аеуы]/i,
    /возврат билета/i,
    /обмен билета/i,
    /за человека/i,
    /за всех/i,
    /Wi-Fi/i,
  ]) {
    assert.doesNotMatch(combined, forbidden);
  }
});

test('responsive Results CSS separates shell and card breakpoints without page overflow', () => {
  const css = read('assets/css/tutu-search-results.css');

  assert.match(css, /max-width:\s*995px/);
  assert.match(css, /border-radius:\s*24px/);
  assert.match(css, /position:\s*sticky/);
  assert.match(css, /@media\s*\(max-width:\s*820px\)/);
  assert.match(css, /@media\s*\(max-width:\s*700px\)/);
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /min-width:\s*0/);
});

test('production service worker precaches the Results entry and its local runtime', () => {
  const source = read('service-worker.js');

  for (const asset of [
    '/search-results.html',
    '/assets/css/tutu-search-results.css',
    '/assets/js/tutu-search-adapter.js',
    '/assets/js/tutu-search-results.js',
  ]) {
    assert.match(source, new RegExp(asset.replace(/[./]/g, '\\$&')));
  }
});

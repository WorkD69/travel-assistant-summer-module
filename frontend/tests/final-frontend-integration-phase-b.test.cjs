'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const load = (relative) => {
  const target = path.join(root, relative);
  delete require.cache[require.resolve(target)];
  return require(target);
};

function segment(overrides) {
  return Object.assign({
    id: 'segment-1',
    transportType: 'flight',
    departurePlace: 'Москва',
    arrivalPlace: 'Санкт-Петербург',
    departureAt: '2026-08-20T12:05:00+03:00',
    arrivalAt: '2026-08-20T13:30:00+03:00',
    serviceNumber: 'SU 001',
    carrierName: 'Россия',
    order: 0,
    transportOptionId: 'option-original',
    source: 'tutu-mcp',
    fetchedAt: '2026-08-16T10:00:00.000Z',
  }, overrides || {});
}

function signal(overrides) {
  return Object.assign({
    id: 'signal-1',
    category: 'plan_b_disruption',
    source: 'DEMO_SIMULATION',
    status: 'active',
    detail: JSON.stringify({
      schemaVersion: '1',
      type: 'CARRIER_CANCELLED',
      source: 'DEMO_SIMULATION',
      occurredAt: '2026-08-19T09:00:00.000Z',
      segmentId: 'segment-1',
    }),
  }, overrides || {});
}

function canonicalTrip(overrides) {
  return Object.assign({
    id: 'trip-1',
    title: 'Москва → Санкт-Петербург',
    route: 'Москва → Санкт-Петербург',
    startDate: '2026-08-20T09:05:00.000Z',
    endDate: '2026-08-20T10:30:00.000Z',
    status: 'active',
    type: 'solo',
    segments: [segment()],
    monitoringSignals: [],
    documents: [],
    activePlanBApply: null,
  }, overrides || {});
}

function option(id, overrides) {
  return Object.assign({
    schemaVersion: '1',
    id,
    transportType: 'flight',
    segments: [segment({
      id: `${id}-segment`,
      departureAt: '2026-08-20T15:40:00+03:00',
      arrivalAt: '2026-08-20T17:20:00+03:00',
      serviceNumber: 'SU 777',
      transportOptionId: undefined,
      source: undefined,
    })],
    price: { amount: 7150, currency: 'RUB', kind: 'total' },
    availability: null,
    transferCount: 0,
    durationMinutes: 100,
    source: { provider: 'tutu-mcp', tool: 'search_avia', serverVersion: '0.38.0' },
    fetchedAt: '2026-08-19T09:05:00.000Z',
  }, overrides || {});
}

function preview(overrides) {
  const candidateA = {
    candidateId: 'candidate-a',
    option: option('option-a'),
    impact: {
      arrivalAt: '2026-08-20T17:20:00+03:00',
      arrivalDeltaMinutes: 230,
      price: { amount: 7150, currency: 'RUB', kind: 'total' },
      priceDelta: null,
      priceDeltaStatus: 'unavailable_without_canonical_factual_price',
      transferCount: 0,
      transferCountDelta: 0,
      durationMinutes: 100,
      durationDeltaMinutes: 15,
    },
  };
  const candidateB = {
    candidateId: 'candidate-b',
    option: option('option-b', {
      price: { amount: 5240, currency: 'RUB', kind: 'total' },
      durationMinutes: 140,
    }),
    impact: {
      arrivalAt: '2026-08-20T18:00:00+03:00',
      arrivalDeltaMinutes: 270,
      price: { amount: 5240, currency: 'RUB', kind: 'total' },
      priceDelta: null,
      priceDeltaStatus: 'unavailable_without_canonical_factual_price',
      transferCount: 0,
      transferCountDelta: 0,
      durationMinutes: 140,
      durationDeltaMinutes: 55,
    },
  };
  return Object.assign({
    tripId: 'trip-1',
    proposalId: 'pbp-1',
    disruption: { id: 'signal-1', type: 'CARRIER_CANCELLED', source: 'DEMO_SIMULATION' },
    candidates: [candidateA, candidateB],
    fastest: { status: 'available', candidateId: 'candidate-a' },
    cheapest: { status: 'available', candidateId: 'candidate-b' },
    personalized: { status: 'available', candidateId: 'candidate-a', reasons: ['Самое раннее прибытие.'] },
    impactPreview: [
      { candidateId: 'candidate-a', impact: candidateA.impact },
      { candidateId: 'candidate-b', impact: candidateB.impact },
    ],
  }, overrides || {});
}

function controllerHarness(apiOverrides) {
  const integration = load('assets/js/smart-workspace-integration.js');
  const renders = [];
  const calls = [];
  const trip = canonicalTrip();
  const api = Object.assign({
    async getTrip(tripId) {
      calls.push(['getTrip', tripId]);
      return { trip };
    },
    async triggerPlanBDemo(tripId, body) {
      calls.push(['triggerPlanBDemo', tripId, body]);
      return { tripId, disruption: { type: 'CARRIER_CANCELLED', source: 'DEMO_SIMULATION' } };
    },
    async previewPlanB(tripId, preferences) {
      calls.push(['previewPlanB', tripId, preferences]);
      return preview();
    },
    async applyPlanB(tripId, body, key) {
      calls.push(['applyPlanB', tripId, body, key]);
      return { tripId, applyId: 'apply-1', applied: true, purchaseCompleted: false };
    },
    async revertPlanB(tripId) {
      calls.push(['revertPlanB', tripId]);
      return { tripId, reverted: true, reason: null, purchaseCompleted: false };
    },
  }, apiOverrides || {});
  const controller = integration.createController({
    tripId: 'trip-1',
    api,
    viewModel: load('assets/js/smart-workspace-view-model.js'),
    render(model, presentation) { renders.push({ model, presentation }); },
    randomBytes() { return new Uint8Array(24).fill(7); },
    previewTimeoutMs: 20,
  });
  return { controller, api, calls, renders, trip };
}

test('canonical Trip maps to Normal and never invents absent booking facts', () => {
  const adapter = load('assets/js/smart-workspace-view-model.js');
  assert.equal(typeof adapter.projectCanonicalTrip, 'function');
  const model = adapter.projectCanonicalTrip(canonicalTrip());
  assert.equal(model.stage, 'normal');
  assert.equal(model.trip.route, 'Москва → Санкт-Петербург');
  assert.equal(model.disruption, null);
  assert.equal(model.trip.pnr, undefined);
  assert.equal(model.trip.seat, undefined);
  assert.deepEqual(model.documents, []);
});

test('matching active DEMO signal maps to Disruption while nonmatching signals do not', () => {
  const adapter = load('assets/js/smart-workspace-view-model.js');
  const disrupted = adapter.projectCanonicalTrip(canonicalTrip({ monitoringSignals: [signal()] }));
  assert.equal(disrupted.stage, 'disruption');
  assert.equal(disrupted.disruption.type, 'CARRIER_CANCELLED');
  assert.equal(disrupted.disruption.source, 'DEMO_SIMULATION');
  const withoutDetail = adapter.projectCanonicalTrip(canonicalTrip({ monitoringSignals: [signal({ detail: null })] }));
  assert.equal(withoutDetail.stage, 'disruption');
  assert.equal(withoutDetail.disruption.type, 'CARRIER_CANCELLED');

  for (const mismatch of [
    signal({ category: 'weather' }),
    signal({ source: 'TUTU' }),
    signal({ status: 'resolved' }),
  ]) {
    assert.equal(adapter.projectCanonicalTrip(canonicalTrip({ monitoringSignals: [mismatch] })).stage, 'normal');
  }
});

test('activePlanBApply has precedence and reconstructs Applied after refresh', () => {
  const adapter = load('assets/js/smart-workspace-view-model.js');
  const model = adapter.projectCanonicalTrip(canonicalTrip({
    activePlanBApply: {
      applyId: 'apply-1', proposalId: 'pbp-1', candidateId: 'candidate-a', optionId: 'option-a', appliedAt: '2026-08-19T10:00:00.000Z',
    },
    monitoringSignals: [signal()],
    segments: [segment({ transportOptionId: 'option-a' })],
  }));
  assert.equal(model.stage, 'applied');
  assert.equal(model.apply.candidateId, 'candidate-a');
  assert.equal(model.appliedTrip.route, 'Москва → Санкт-Петербург');
});

test('preview maps candidates, factual Impact, and server-owned ranking without client ranking', () => {
  const adapter = load('assets/js/smart-workspace-view-model.js');
  const model = adapter.mergePlanBPreview(
    adapter.projectCanonicalTrip(canonicalTrip({ monitoringSignals: [signal()] })),
    preview({
      fastest: { status: 'available', candidateId: 'candidate-a' },
      cheapest: { status: 'available', candidateId: 'candidate-a' },
      personalized: { status: 'available', candidateId: 'candidate-a', reasons: ['server reason'] },
    }),
  );
  assert.equal(model.stage, 'planb');
  assert.equal(model.candidates.length, 2);
  assert.deepEqual(model.candidates[0].rankingLabels, ['fastest', 'cheapest', 'personalized']);
  assert.equal(model.candidates[0].price.amount, 7150);
  assert.equal(model.candidates[0].impact.arrivalDeltaMinutes, 230);
  assert.equal(model.ranking.personalized.reasons[0], 'server reason');
  assert.doesNotMatch(source('assets/js/smart-workspace-view-model.js'), /\.sort\(|recommendationScore|matchPercentage|aiScore/i);
});

test('preview preserves zero candidates and unavailable ranking without fake options', () => {
  const adapter = load('assets/js/smart-workspace-view-model.js');
  const empty = preview({
    candidates: [], impactPreview: [],
    fastest: { status: 'unavailable', code: 'PLAN_B_NO_ALTERNATIVES' },
    cheapest: { status: 'unavailable', code: 'PRICE_COMPARISON_UNAVAILABLE' },
    personalized: { status: 'unavailable', code: 'PLAN_B_NO_ALTERNATIVES' },
  });
  const model = adapter.mergePlanBPreview(adapter.projectCanonicalTrip(canonicalTrip({ monitoringSignals: [signal()] })), empty);
  assert.deepEqual(model.candidates, []);
  assert.equal(model.ranking.fastest.status, 'unavailable');
});

test('controller starts with null selection and demo trigger performs canonical reread', async () => {
  const { controller, calls } = controllerHarness();
  assert.equal(controller.getState().selectedCandidateId, null);
  await controller.start();
  await controller.triggerDemoDisruption();
  assert.deepEqual(calls, [
    ['getTrip', 'trip-1'],
    ['triggerPlanBDemo', 'trip-1', { type: 'CARRIER_CANCELLED' }],
    ['getTrip', 'trip-1'],
  ]);
});

test('Plan B preview uses real API, exact preference codes, and explicit selection', async () => {
  const { controller, calls } = controllerHarness();
  await controller.start();
  await controller.showPlanB();
  assert.deepEqual(calls.at(-1), ['previewPlanB', 'trip-1', []]);
  assert.equal(controller.getState().selectedCandidateId, null);
  assert.equal(controller.selectCandidate('candidate-a'), true);
  assert.equal(controller.getState().selectedCandidateId, 'candidate-a');
  assert.equal(controller.selectCandidate('missing'), false);

  await controller.togglePreference('cheaper');
  assert.deepEqual(calls.at(-1), ['previewPlanB', 'trip-1', ['cheaper']]);
  await controller.togglePreference('fewer_transfers');
  assert.deepEqual(calls.at(-1), ['previewPlanB', 'trip-1', ['cheaper', 'fewer_transfers']]);
});

test('new preview clears selection only when selected candidate disappears', async () => {
  let response = preview();
  const { controller } = controllerHarness({ async previewPlanB() { return response; } });
  await controller.start();
  await controller.showPlanB();
  controller.selectCandidate('candidate-a');
  await controller.togglePreference('faster');
  assert.equal(controller.getState().selectedCandidateId, 'candidate-a');
  response = preview({ candidates: [preview().candidates[1]], impactPreview: [preview().impactPreview[1]] });
  await controller.togglePreference('cheaper');
  assert.equal(controller.getState().selectedCandidateId, null);
});

test('Impact is exposed only after valid explicit selection and keeps price comparison unavailable', async () => {
  const { controller } = controllerHarness();
  await controller.start();
  await controller.showPlanB();
  assert.equal(controller.getState().presentation.impact, null);
  controller.selectCandidate('candidate-a');
  assert.equal(controller.getState().presentation.impact.candidateId, 'candidate-a');
  assert.equal(controller.getState().presentation.impact.priceDelta, null);
  assert.equal(controller.getState().presentation.impact.priceDeltaStatus, 'unavailable_without_canonical_factual_price');
});

test('Apply is double-click safe, uses one transient key, and canonically rereads', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const { controller, calls } = controllerHarness({
    async applyPlanB(tripId, body, key) {
      calls.push(['applyPlanB', tripId, body, key]);
      await pending;
      return { tripId, applyId: 'apply-1', applied: true, purchaseCompleted: false };
    },
  });
  await controller.start();
  await controller.showPlanB();
  assert.equal(await controller.apply(), false);
  controller.selectCandidate('candidate-a');
  const first = controller.apply();
  const second = await controller.apply();
  assert.equal(second, false);
  assert.equal(calls.filter((call) => call[0] === 'applyPlanB').length, 1);
  assert.deepEqual(calls.find((call) => call[0] === 'applyPlanB').slice(1, 3), [
    'trip-1', { proposalId: 'pbp-1', candidateId: 'candidate-a' },
  ]);
  assert.equal(calls.find((call) => call[0] === 'applyPlanB')[3], '07'.repeat(24));
  release();
  await first;
  assert.equal(calls.at(-1)[0], 'getTrip');
});

test('Apply retry reuses its stable intent key and never stores it in browser storage', async () => {
  let attempts = 0;
  const keys = [];
  const { controller } = controllerHarness({
    async applyPlanB(tripId, body, key) {
      keys.push(key);
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error('network'), { status: 503 });
      return { tripId, applied: true, applyId: 'apply-1' };
    },
  });
  await controller.start();
  await controller.showPlanB();
  controller.selectCandidate('candidate-a');
  await controller.apply();
  await controller.apply();
  assert.deepEqual(keys, ['07'.repeat(24), '07'.repeat(24)]);
  assert.doesNotMatch(source('assets/js/smart-workspace-integration.js'), /localStorage|sessionStorage/);
});

test('Revert posts once, canonically rereads, and already reverted resolves to Normal', async () => {
  const appliedTrip = canonicalTrip({ activePlanBApply: {
    applyId: 'apply-1', proposalId: 'pbp-1', candidateId: 'candidate-a', optionId: 'option-a', appliedAt: '2026-08-19T10:00:00.000Z',
  } });
  let reads = 0;
  const { controller, calls } = controllerHarness({
    async getTrip(tripId) {
      reads += 1;
      calls.push(['getTrip', tripId]);
      return { trip: reads === 1 ? appliedTrip : canonicalTrip({ monitoringSignals: [signal({ status: 'resolved' })] }) };
    },
    async revertPlanB(tripId) {
      calls.push(['revertPlanB', tripId]);
      return { tripId, reverted: false, reason: 'PLAN_B_ALREADY_REVERTED', purchaseCompleted: false };
    },
  });
  await controller.start();
  assert.equal(controller.getState().model.stage, 'applied');
  await controller.revert();
  assert.deepEqual(calls.slice(-2), [['revertPlanB', 'trip-1'], ['getTrip', 'trip-1']]);
  assert.equal(controller.getState().model.stage, 'normal');
});

test('controller exposes auth, not-found, preview timeout, and mutation conflict errors without fixtures', async () => {
  for (const [status, expected] of [[401, 'auth'], [403, 'forbidden'], [404, 'not_found']]) {
    const { controller } = controllerHarness({
      async getTrip() { throw Object.assign(new Error('failed'), { status }); },
    });
    await controller.start();
    assert.equal(controller.getState().error.kind, expected);
  }

  const timeoutHarness = controllerHarness({ async previewPlanB() { return new Promise(() => {}); } });
  await timeoutHarness.controller.start();
  await timeoutHarness.controller.showPlanB();
  assert.equal(timeoutHarness.controller.getState().error.kind, 'preview_timeout');

  const conflictHarness = controllerHarness({
    async applyPlanB() { throw Object.assign(new Error('stale'), { status: 409, data: { error: { code: 'PLAN_B_PROPOSAL_STALE' } } }); },
  });
  await conflictHarness.controller.start();
  await conflictHarness.controller.showPlanB();
  conflictHarness.controller.selectCandidate('candidate-a');
  await conflictHarness.controller.apply();
  assert.equal(conflictHarness.controller.getState().error.kind, 'apply_conflict');
  assert.equal(conflictHarness.calls.filter((call) => call[0] === 'getTrip').length, 2);
  assert.equal(conflictHarness.controller.getState().selectedCandidateId, null);

  const appliedTrip = canonicalTrip({ activePlanBApply: {
    applyId: 'apply-1', proposalId: 'pbp-1', candidateId: 'candidate-a', optionId: 'option-a', appliedAt: '2026-08-19T10:00:00.000Z',
  } });
  const revertConflict = controllerHarness({
    async getTrip(tripId) {
      revertConflict.calls.push(['getTrip', tripId]);
      return { trip: appliedTrip };
    },
    async revertPlanB() { throw Object.assign(new Error('conflict'), { status: 409, data: { error: { code: 'PLAN_B_REVERT_CONFLICT' } } }); },
  });
  await revertConflict.controller.start();
  await revertConflict.controller.revert();
  assert.equal(revertConflict.controller.getState().error.kind, 'revert_conflict');
  assert.equal(revertConflict.calls.filter((call) => call[0] === 'getTrip').length, 2);
});

test('TravelApi uses exact Backend V5 Plan B routes, bodies, and Apply header', async () => {
  const calls = [];
  const context = {
    fetch: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, async json() { return {}; } };
    },
    navigator: {},
    location: { protocol: 'http:' },
    window: { TRAVEL_API_BASE: 'https://release.example.test', TravelAuthStorage: { load() { return null; }, save() {}, clear() {} } },
  };
  vm.runInNewContext(source('assets/js/api-client.js'), context);
  const api = context.window.TravelApi;
  await api.triggerPlanBDemo('trip/1', { type: 'CARRIER_CANCELLED' });
  await api.previewPlanB('trip/1', []);
  await api.previewPlanB('trip/1', ['faster']);
  await api.applyPlanB('trip/1', { proposalId: 'pbp-1', candidateId: 'candidate-a' }, 'a'.repeat(32));
  await api.revertPlanB('trip/1');
  assert.deepEqual(calls.map((call) => call.url), [
    'https://release.example.test/api/trips/trip%2F1/disruptions/demo',
    'https://release.example.test/api/trips/trip%2F1/plan-b/preview',
    'https://release.example.test/api/trips/trip%2F1/plan-b/preview',
    'https://release.example.test/api/trips/trip%2F1/plan-b/apply',
    'https://release.example.test/api/trips/trip%2F1/plan-b/revert',
  ]);
  assert.deepEqual(JSON.parse(calls[0].init.body), { type: 'CARRIER_CANCELLED' });
  assert.deepEqual(JSON.parse(calls[1].init.body), {});
  assert.match(source('../backend/src/services/planB.js'), /input\.length < 1/);
  assert.deepEqual(JSON.parse(calls[2].init.body), { preferences: ['faster'] });
  assert.deepEqual(JSON.parse(calls[3].init.body), { proposalId: 'pbp-1', candidateId: 'candidate-a' });
  assert.equal(calls[3].init.headers['Idempotency-Key'], 'a'.repeat(32));
  assert.deepEqual(JSON.parse(calls[4].init.body), {});
});

test('production frontend contains no legacy monitoring Plan B path or fixture fallback', () => {
  const productionSources = [
    'assets/js/api-client.js',
    'assets/js/backend-sync.js',
    'assets/js/ai-assistant.js',
    'assets/js/smart-workspace-integration.js',
    'assets/js/smart-workspace-view-model.js',
    'assets/js/smart-workspace-renderer.js',
    'trip-overview.html',
  ].map(source).join('\n');
  assert.doesNotMatch(productionSources, /\/monitoring\/plan/);
  assert.doesNotMatch(source('assets/js/smart-workspace-integration.js'), /catch\s*\([^)]*\)\s*\{[^}]*previewMock/);
  const integration = load('assets/js/smart-workspace-integration.js');
  assert.equal(integration.runtimeEnvironment('production', 'development', 'release.example.test'), 'production');
  assert.equal(integration.runtimeEnvironment('development', 'development', 'release.example.test'), 'production');
  assert.equal(integration.runtimeEnvironment('production', 'development', '127.0.0.1'), 'development');
  const legacyBoot = source('assets/js/workspace-integration.js');
  assert.match(legacyBoot, /if \(smartWorkspacePreview\) \{[\s\S]*setAttribute\("data-app-environment", previewParams\.get\("env"\)\)[\s\S]*return;/);
  assert.doesNotMatch(legacyBoot, /if \(previewParams\.get\("env"\) === "development"\)/);
});

test('renderer remains API-free and uses factual recommendation copy, pending and error presentation', () => {
  const renderer = load('assets/js/smart-workspace-renderer.js');
  const rendererSource = source('assets/js/smart-workspace-renderer.js');
  assert.doesNotMatch(rendererSource, /TravelApi|fetch\(/);
  const planModel = load('assets/js/smart-workspace-view-model.js').mergePlanBPreview(
    load('assets/js/smart-workspace-view-model.js').projectCanonicalTrip(canonicalTrip({ monitoringSignals: [signal()] })),
    preview(),
  );
  const markup = renderer.renderMarkup(planModel, {
    selectedCandidateId: null,
    preferences: [],
    pendingAction: 'preview',
    error: { message: 'Не удалось загрузить варианты' },
  });
  assert.match(markup, /Кандидаты — из Tutu MCP; рекомендации рассчитаны Travel Assistant/);
  assert.match(markup, /Не удалось загрузить варианты/);
  assert.match(markup, /disabled[^>]*>Применить Plan B/);
  assert.match(markup, /disabled[^>]*>Выбрать этот вариант/);
  assert.doesNotMatch(markup, /data-smart-action="companion"/);

  const terminal = renderer.renderMarkup(null, {
    pendingAction: null,
    error: { kind: 'not_found', message: 'Поездка не найдена.', retryable: false },
  });
  assert.match(terminal, /Поездка не найдена/);
  assert.doesNotMatch(terminal, /Загружаем поездку|aria-busy/);

  const normalPending = renderer.renderMarkup(load('assets/js/smart-workspace-view-model.js').projectCanonicalTrip(canonicalTrip()), {
    pendingAction: 'disruption', preferences: [], selectedCandidateId: null,
  });
  assert.match(normalPending, /disabled[^>]*>Запускаем демо/);

  const conflict = renderer.renderMarkup(planModel, {
    pendingAction: null, preferences: [], selectedCandidateId: null,
    error: { kind: 'apply_conflict', message: 'Предложение изменилось.', retryable: true },
  });
  assert.match(conflict, /data-smart-action="retry-preview">Получить новые варианты/);
});

test('trip page preserves runtime bootstrap, canonical route modules, script order, and hides legacy workspace after mount', () => {
  const html = source('trip-overview.html');
  const runtime = html.indexOf('assets/js/runtime-config.js');
  const api = html.indexOf('assets/js/api-client.js');
  const routes = html.indexOf('assets/js/app-routes.js');
  const viewModel = html.indexOf('assets/js/smart-workspace-view-model.js');
  const renderer = html.indexOf('assets/js/smart-workspace-renderer.js');
  const integration = html.indexOf('assets/js/smart-workspace-integration.js');
  assert.ok(runtime > -1 && runtime < api);
  assert.ok(routes > api && viewModel > routes && renderer > viewModel && integration > renderer);
  assert.match(source('assets/js/app-routes.js'), /goToTrip\(tripId[\s\S]*trip-overview\.html/);
  assert.match(source('assets/css/smart-workspace.css'), /smart-workspace-production[\s\S]*#panel-overview/);
  assert.match(source('assets/css/smart-workspace.css'), /smart-workspace-production main\.page[\s\S]*box-sizing:\s*border-box/);
  assert.match(source('assets/css/smart-workspace.css'), /@media \(max-width: 390px\)[\s\S]*smart-workspace__apply[\s\S]*bottom:\s*96px/);
  assert.match(source('assets/js/workspace-integration.js'), /localPreviewHost[\s\S]*previewParams\.get\("preview"\) === "smart-workspace"/);
});

test('Phase A transient token and checkout guarantees remain in the integrated source', () => {
  const results = source('assets/js/tutu-search-results.js');
  assert.match(results, /selectionToken/);
  assert.doesNotMatch(results, /localStorage|sessionStorage/);
  assert.match(results, /openPlaceholder\(\)/);
  assert.match(results, /placeholder\.opener = null/);
  assert.match(results, /new URL\(value\)\.protocol === "https:"/);
  assert.match(results, /api\.getTrip\(result\.tripId\)/);
  assert.match(results, /goToTrip\(result\.tripId\)/);
});

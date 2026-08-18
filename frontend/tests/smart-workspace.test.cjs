const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const viewModelPath = path.join(__dirname, '..', 'assets', 'js', 'smart-workspace-view-model.js');

function loadViewModel() {
  assert.equal(
    fs.existsSync(viewModelPath),
    true,
    'Smart Workspace view-model module must exist before its contract can be used'
  );
  delete require.cache[require.resolve(viewModelPath)];
  return require(viewModelPath);
}

test('maps server-owned ranking references without creating duplicate candidates', () => {
  const viewModel = loadViewModel();
  const model = viewModel.buildSmartWorkspaceViewModel({
    trip: { id: 'trip-1', route: 'Москва → Санкт-Петербург' },
    candidates: [
      { id: 'candidate-a', durationMinutes: 100, price: 7150 },
      { id: 'candidate-c', durationMinutes: 325, price: 5240 }
    ],
    ranking: {
      fastest: { status: 'available', candidateId: 'candidate-a' },
      cheapest: { status: 'available', candidateId: 'candidate-c' },
      personalized: {
        status: 'available',
        candidateId: 'candidate-c',
        reasons: ['минимальная цена']
      }
    }
  });

  assert.equal(model.candidates.length, 2);
  assert.deepEqual(model.candidates[0].rankingLabels, ['fastest']);
  assert.deepEqual(model.candidates[1].rankingLabels, ['cheapest', 'personalized']);
});

test('preserves nullable factual transport fields and starts with no selected candidate', () => {
  const viewModel = loadViewModel();
  const model = viewModel.buildSmartWorkspaceViewModel({
    trip: { id: 'trip-2' },
    selectedCandidateId: 'must-not-leak-from-input',
    candidates: [{
      id: 'candidate-a',
      carrierName: null,
      serviceNumber: null,
      price: null,
      availability: null
    }]
  });

  assert.equal(model.selectedCandidateId, null);
  assert.equal(model.candidates[0].carrierName, null);
  assert.equal(model.candidates[0].serviceNumber, null);
  assert.equal(model.candidates[0].price, null);
  assert.equal(model.candidates[0].availability, null);
});

test('ignores unavailable and unknown ranking references', () => {
  const viewModel = loadViewModel();
  const model = viewModel.buildSmartWorkspaceViewModel({
    candidates: [{ id: 'candidate-a' }],
    ranking: {
      fastest: { status: 'unavailable', candidateId: 'candidate-a' },
      cheapest: { status: 'available', candidateId: 'absent-candidate' },
      personalized: { status: 'not_requested' }
    }
  });

  assert.deepEqual(model.candidates[0].rankingLabels, []);
});

const integrationPath = path.join(__dirname, '..', 'assets', 'js', 'smart-workspace-integration.js');

function loadIntegration() {
  assert.equal(
    fs.existsSync(integrationPath),
    true,
    'Smart Workspace integration module must exist before preview safety can be checked'
  );
  delete require.cache[require.resolve(integrationPath)];
  return require(integrationPath);
}

test('enables Smart Workspace preview only through an explicit non-production gate', () => {
  const integration = loadIntegration();

  assert.equal(integration.isSmartWorkspacePreview({ env: 'development', preview: 'smart-workspace' }), true);
  assert.equal(integration.isSmartWorkspacePreview({ env: 'test', preview: 'smart-workspace' }), true);
  assert.equal(integration.isSmartWorkspacePreview({ env: 'production', preview: 'smart-workspace' }), false);
  assert.equal(integration.isSmartWorkspacePreview({ env: 'development', preview: '' }), false);
});

test('does not create a production fixture fallback without a supplied view model', () => {
  const integration = loadIntegration();

  assert.equal(
    integration.resolveSmartWorkspaceInput({ env: 'production', preview: '', supplied: null }),
    null
  );
});

const rendererPath = path.join(__dirname, '..', 'assets', 'js', 'smart-workspace-renderer.js');

function loadRenderer() {
  assert.equal(
    fs.existsSync(rendererPath),
    true,
    'Smart Workspace renderer module must exist before presentation behavior can be checked'
  );
  delete require.cache[require.resolve(rendererPath)];
  return require(rendererPath);
}

test('starts presentation state without candidate selection and selects only after explicit action', () => {
  const renderer = loadRenderer();
  const initial = renderer.createPresentationState({ selectedCandidateId: 'candidate-a' });
  const selected = renderer.selectCandidate(initial, 'candidate-a');

  assert.equal(initial.selectedCandidateId, null);
  assert.equal(selected.selectedCandidateId, 'candidate-a');
});

test('renders explicit demo cancellation wording without claiming live detection', () => {
  const renderer = loadRenderer();
  const markup = renderer.renderMarkup({
    trip: { route: 'Москва → Санкт-Петербург' },
    disruption: { type: 'CARRIER_CANCELLED', source: 'DEMO_SIMULATION' },
    candidates: [],
    documents: []
  }, renderer.createPresentationState());

  assert.match(markup, /ДЕМО-СОБЫТИЕ/);
  assert.match(markup, /Симулированное событие демо-режима/);
  assert.match(markup, /Рейс отменён/);
  assert.doesNotMatch(markup, /Tutu обнаружил|перевозчик сообщил|live cancellation/i);
});

test('keeps ranking labels separate from selected candidate and uses unavailable price wording', () => {
  const renderer = loadRenderer();
  const markup = renderer.renderMarkup({
    stage: 'planb',
    trip: { route: 'Москва → Санкт-Петербург' },
    disruption: { type: 'CARRIER_CANCELLED', source: 'DEMO_SIMULATION' },
    candidates: [{
      id: 'candidate-a',
      departure: { time: '15:40', place: 'Москва' },
      arrival: { time: '17:20', place: 'Санкт-Петербург' },
      duration: '1ч 40м',
      transfers: 'Без пересадок',
      carrierName: null,
      serviceNumber: null,
      price: null,
      rankingLabels: ['fastest', 'personalized']
    }],
    documents: []
  }, renderer.createPresentationState());

  assert.match(markup, /БЫСТРЕЕ ВСЕГО/);
  assert.match(markup, /ДЛЯ ВАС/);
  assert.match(markup, /Цена не указана/);
  assert.doesNotMatch(markup, /Вы выбрали этот вариант/);
  assert.match(markup, /disabled[^>]*>Применить Plan B/);
});

test('renders impact only for an explicitly selected candidate and keeps price comparison unavailable', () => {
  const renderer = loadRenderer();
  const model = {
    stage: 'planb',
    trip: { route: 'Москва → Санкт-Петербург' },
    disruption: { type: 'CARRIER_CANCELLED', source: 'DEMO_SIMULATION' },
    candidates: [{ id: 'candidate-a', rankingLabels: [] }],
    impact: {
      candidateId: 'candidate-a',
      arrivalAt: '17:20',
      arrivalDeltaMinutes: 195,
      durationMinutes: 100,
      durationDeltaMinutes: 5,
      transferCount: 0,
      transferCountDelta: 0,
      price: 7150,
      priceDelta: null,
      priceDeltaStatus: 'unavailable'
    },
    documents: []
  };

  assert.doesNotMatch(renderer.renderMarkup(model, renderer.createPresentationState()), /Что изменится/);
  const markup = renderer.renderMarkup(model, renderer.selectCandidate(renderer.createPresentationState(), 'candidate-a'));
  assert.match(markup, /Что изменится/);
  assert.match(markup, /Цена нового варианта/);
  assert.match(markup, /Сравнение с исходной ценой недоступно/);
});

const cssPath = path.join(__dirname, '..', 'assets', 'css', 'smart-workspace.css');

test('scoped stylesheet owns Smart Workspace geometry, focus, and 390px safeguards', () => {
  assert.equal(fs.existsSync(cssPath), true, 'Smart Workspace scoped stylesheet must exist');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(css, /\.smart-workspace\s*\{/);
  assert.match(css, /\.smart-workspace\s+button:focus-visible/);
  assert.match(css, /@media\s*\(max-width:\s*960px\)/);
  assert.match(css, /@media\s*\(max-width:\s*390px\)/);
  assert.match(css, /min-width:\s*0/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(css, /(^|\n)body\s*\{/);
  assert.doesNotMatch(css, /(^|\n)\.card\s*\{/);
});

test('canonical Trip surface links scoped CSS and mounts Smart Workspace outside legacy overview DOM', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'trip-overview.html'), 'utf8');
  const overviewEnd = html.indexOf('</div>\n        </div>\n      </div>\n\n      <!-- Detailed route panel -->');
  const rootIndex = html.indexOf('<section id="smart-workspace-root" aria-live="polite"></section>');
  const stylesIndex = html.indexOf('<link rel="stylesheet" href="assets/css/smart-workspace.css" />');
  const viewModelScript = html.indexOf('<script src="assets/js/smart-workspace-view-model.js"></script>');
  const rendererScript = html.indexOf('<script src="assets/js/smart-workspace-renderer.js"></script>');
  const integrationScript = html.indexOf('<script src="assets/js/smart-workspace-integration.js"></script>');

  assert.ok(stylesIndex > -1, 'scoped Smart Workspace stylesheet must be linked');
  assert.ok(rootIndex > overviewEnd, 'Smart Workspace root must be appended after the legacy overview grid');
  assert.ok(viewModelScript > -1 && rendererScript > viewModelScript && integrationScript > rendererScript,
    'Smart Workspace scripts must load in view-model, renderer, integration order');
});

test('development preview supplies explicit frozen states while production still resolves no fixture', () => {
  const integration = loadIntegration();
  const normal = integration.resolveSmartWorkspaceInput({ env: 'development', preview: 'smart-workspace', smartState: 'normal', supplied: null });
  const disruption = integration.resolveSmartWorkspaceInput({ env: 'development', preview: 'smart-workspace', smartState: 'disruption', supplied: null });
  const planB = integration.resolveSmartWorkspaceInput({ env: 'development', preview: 'smart-workspace', smartState: 'planb', supplied: null });
  const applied = integration.resolveSmartWorkspaceInput({ env: 'development', preview: 'smart-workspace', smartState: 'applied', supplied: null });

  assert.equal(normal.stage, 'normal');
  assert.equal(disruption.stage, 'disruption');
  assert.equal(planB.stage, 'planb');
  assert.equal(applied.stage, 'applied');
  assert.equal(planB.candidates.length, 3);
  assert.equal(planB.ranking.fastest.candidateId, 'candidate-a');
  assert.equal(planB.ranking.cheapest.candidateId, 'candidate-c');
  assert.equal(applied.apply.status, 'applied');
  assert.equal(integration.resolveSmartWorkspaceInput({ env: 'production', preview: 'smart-workspace', smartState: 'planb', supplied: null }), null);
});

test('renderer keeps Disruption and Plan B as distinct presentation stages', () => {
  const renderer = loadRenderer();
  const disruptionOnly = renderer.renderMarkup({
    stage: 'disruption',
    trip: { route: 'Москва → Санкт-Петербург' },
    disruption: { type: 'CARRIER_CANCELLED', source: 'DEMO_SIMULATION' },
    candidates: [{ id: 'candidate-a', rankingLabels: ['fastest'] }],
    documents: []
  }, renderer.createPresentationState());
  const planB = renderer.renderMarkup({
    stage: 'planb',
    trip: { route: 'Москва → Санкт-Петербург' },
    disruption: { type: 'CARRIER_CANCELLED', source: 'DEMO_SIMULATION' },
    candidates: [{ id: 'candidate-a', rankingLabels: ['fastest'] }],
    documents: []
  }, renderer.createPresentationState());

  assert.doesNotMatch(disruptionOnly, /Варианты поездки/);
  assert.match(planB, /Варианты поездки/);
});

test('renders every Revert presentation status without a backend mutation', () => {
  const renderer = loadRenderer();
  const statuses = ['available', 'pending', 'success', 'already_reverted', 'nothing_applied', 'conflict', 'disabled'];

  statuses.forEach((status) => {
    const markup = renderer.renderMarkup({
      stage: 'applied',
      trip: { route: 'Москва → Санкт-Петербург' },
      candidates: [{ id: 'candidate-a', departure: { time: '15:40' }, arrival: { time: '17:20' } }],
      revert: { status: status },
      documents: []
    }, renderer.createPresentationState());

    assert.match(markup, new RegExp('Состояние возврата: ' + status));
    assert.match(markup, /Переоформление у перевозчика не выполнялось/);
    if (status === 'available') {
      assert.doesNotMatch(markup, /data-smart-action="revert" disabled/);
    } else {
      assert.match(markup, /data-smart-action="revert" disabled/);
    }
  });
});

test('renders documents and downstream context only when factual values are supplied', () => {
  const renderer = loadRenderer();
  const emptyMarkup = renderer.renderMarkup({
    stage: 'planb',
    trip: { route: 'Москва → Санкт-Петербург' },
    disruption: { type: 'CARRIER_CANCELLED', source: 'DEMO_SIMULATION' },
    candidates: [{ id: 'candidate-a', rankingLabels: [] }],
    impact: { candidateId: 'candidate-a', priceDelta: null, priceDeltaStatus: 'unavailable' },
    documents: [],
    contextRows: []
  }, renderer.selectCandidate(renderer.createPresentationState(), 'candidate-a'));
  const factualMarkup = renderer.renderMarkup({
    stage: 'planb',
    trip: { route: 'Москва → Санкт-Петербург' },
    disruption: { type: 'CARRIER_CANCELLED', source: 'DEMO_SIMULATION' },
    candidates: [{ id: 'candidate-a', rankingLabels: [] }],
    impact: { candidateId: 'candidate-a', priceDelta: null, priceDeltaStatus: 'unavailable' },
    documents: [{ title: 'Маршрут поездки' }],
    contextRows: [{ label: 'Заселение', value: '20:00' }]
  }, renderer.selectCandidate(renderer.createPresentationState(), 'candidate-a'));

  assert.doesNotMatch(emptyMarkup, /Документы поездки/);
  assert.doesNotMatch(emptyMarkup, /<li>Маршрут поездки<\/li>/);
  assert.match(factualMarkup, /<li>Маршрут поездки<\/li>/);
  assert.match(factualMarkup, /Заселение/);
  assert.match(factualMarkup, /20:00/);
});

test('does not render map, weather, or document placeholder cards when facts are absent', () => {
  const renderer = loadRenderer();
  const markup = renderer.renderMarkup({
    stage: 'normal',
    trip: { route: 'Москва → Санкт-Петербург' },
    documents: []
  }, renderer.createPresentationState());

  assert.doesNotMatch(markup, /Карта маршрута/);
  assert.doesNotMatch(markup, /Погода/);
  assert.doesNotMatch(markup, /Документы поездки/);
});

test('Smart Workspace source contains no client ranking, storage, or mutation API behavior', () => {
  const viewModelSource = fs.readFileSync(viewModelPath, 'utf8');
  const rendererSource = fs.readFileSync(rendererPath, 'utf8');
  const integrationSource = fs.readFileSync(integrationPath, 'utf8');
  const source = [viewModelSource, rendererSource, integrationSource].join('\n');

  assert.doesNotMatch(viewModelSource, /\.sort\(|Math\.min|Math\.max|score|match percent/i);
  assert.doesNotMatch(source, /localStorage|TravelApi|fetch\(|applyPlan\(|revertPlan\(/);
});

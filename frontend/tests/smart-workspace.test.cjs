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

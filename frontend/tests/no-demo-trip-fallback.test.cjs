const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function loadAppState(search) {
  const context = {
    URLSearchParams,
    document: { body: { getAttribute() { return null; } } },
    window: { location: { search: search || '' }, console: { error() {} } },
  };
  vm.runInNewContext(source('features/app-state.js'), context);
  return context.window.TravelAppState.getState();
}

const runtimeModules = [
  'assets/js/ai-assistant.js',
  'assets/js/backend-sync.js',
  'assets/js/coreflow-sync.js',
  'assets/js/docs-sync.js',
  'assets/js/members-sync.js',
  'assets/js/trip-pages.js',
];

test('production-facing runtime modules do not retain the Turkey Trip fallback', () => {
  runtimeModules.forEach((relativePath) => {
    assert.doesNotMatch(
      source(relativePath),
      /trip-turkey-2026/,
      relativePath + ' must require an explicit Trip ID instead of selecting the legacy demo Trip',
    );
  });
});

test('normal browser boot does not seed the legacy demo catalog', () => {
  const appState = source('features/app-state.js');
  const bridge = source('assets/js/app-state-bridge.js');
  const normalState = loadAppState('');
  const previewState = loadAppState('?preview=legacy-fixtures');

  assert.equal(normalState.trip.id, '');
  assert.equal(Array.isArray(normalState.participants) && normalState.participants.length, 0);
  assert.equal(Array.isArray(normalState.documents) && normalState.documents.length, 0);
  assert.equal(previewState.trip.id, 'trip-turkey-2026');

  assert.match(appState, /function\s+appProductionInitialState\s*\(/);
  assert.match(appState, /appReadPreviewMode\s*\(\)/);
  assert.match(bridge, /function\s+isExplicitDemoPreview\s*\(/);
  assert.match(bridge, /if\s*\(isExplicitDemoPreview\(\)\)/);
  assert.doesNotMatch(
    bridge,
    /else\s*\{\s*origSetState\(sanitizePartial\(seedExtension\(\)\),\s*\{\s*source:\s*"app-state-bridge",\s*action:\s*"seed"\s*\}\);\s*\}/,
  );
});

test('Trip-scoped sync stops before authentication or backend calls when no Trip ID resolves', () => {
  const sourceCode = source('assets/js/coreflow-sync.js');

  assert.match(
    sourceCode,
    /function\s+refresh\s*\(\)\s*\{[\s\S]*?var\s+id\s*=\s*getTripId\(\);\s*if\s*\(!id\)\s*return;[\s\S]*?withAuth\(/,
  );
  assert.match(
    sourceCode,
    /function\s+pushSignal\s*\([^)]*\)\s*\{[\s\S]*?var\s+id\s*=\s*getTripId\(\);\s*if\s*\(!id\)\s*return;[\s\S]*?withAuth\(/,
  );
});

test('core-flow adapter keeps its legacy fixture state behind an explicit preview mode', () => {
  const coreFlowAdapter = source('assets/js/core-flow-state-adapter.js');

  assert.match(coreFlowAdapter, /function\s+coreFlowIsExplicitDemoPreview\s*\(/);
  assert.match(coreFlowAdapter, /function\s+coreFlowProductionState\s*\(/);
  assert.match(coreFlowAdapter, /coreFlowIsExplicitDemoPreview\(\)\s*\?\s*coreFlowDefaultState\(\)\s*:\s*coreFlowProductionState\(\)/);
});

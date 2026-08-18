'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(relativePath) {
  return fs.readFileSync(relativePath, 'utf8');
}

test('final build uses one runtime-configured API base and contains no historical B2 origin', () => {
  const apiClient = read('assets/js/api-client.js');
  const runtimeConfig = read('assets/js/runtime-config.js');
  const finalSources = [apiClient, runtimeConfig, read('service-worker.js')].join('\n');

  assert.match(apiClient, /window\.TRAVEL_BUILD\s*=/);
  assert.match(apiClient, /version:\s*"FINAL"/);
  assert.match(apiClient, /buildId:\s*BUILD_ID/);
  assert.match(apiClient, /var BASE = \(typeof window\.TRAVEL_API_BASE === "string"\) \? window\.TRAVEL_API_BASE : ""/);
  assert.match(runtimeConfig, /TRAVEL_RELEASE_API_BASE/);
  assert.match(runtimeConfig, /window\.TRAVEL_API_BASE = releaseBase/);
  assert.doesNotMatch(finalSources, /travel-assistant-teammate-backend-b2-staging-staging-b2\.up\.railway\.app/);
});

test('service worker precaches final runtime bootstrap and removes stale application caches', () => {
  const source = read('service-worker.js');

  assert.match(source, /travel-assistant-final-frontend-integration-phase-a/);
  assert.match(source, /\/assets\/js\/runtime-config\.js/);
  assert.match(source, /self\.skipWaiting\(\)/);
  assert.match(source, /self\.clients\.claim\(\)/);
  assert.match(source, /caches\.keys\(\)/);
  assert.match(source, /caches\.delete\(key\)/);
  assert.match(source, /pathname\.startsWith\("\/api\/"\)/);
});

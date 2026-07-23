const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');


test('version B2 exposes a non-secret staging build marker', () => {
  const source = fs.readFileSync('assets/js/api-client.js', 'utf8');

  assert.match(source, /window\.TRAVEL_BUILD\s*=/);
  assert.match(source, /version:\s*"B2"/);
  assert.match(source, /deployedAt:\s*"2026-07-23"/);
  assert.match(source, /buildId:\s*"version-b2-staging-20260723"/);
  assert.match(
    source,
    /backend:\s*"https:\/\/travel-assistant-teammate-backend-b2-staging-staging-b2\.up\.railway\.app"/,
  );
  assert.match(source, /serviceWorker\.register\("\/service-worker\.js\?v=version-b2-staging-20260723"\)/);
});


test('service worker activates version B2 staging and removes stale app caches', () => {
  const source = fs.readFileSync('service-worker.js', 'utf8');

  assert.match(source, /travel-assistant-version-b2-staging-20260723/);
  assert.match(source, /self\.skipWaiting\(\)/);
  assert.match(source, /self\.clients\.claim\(\)/);
  assert.match(source, /caches\.keys\(\)/);
  assert.match(source, /caches\.delete\(key\)/);
  assert.match(source, /pathname\.startsWith\("\/api\/"\)/);
});

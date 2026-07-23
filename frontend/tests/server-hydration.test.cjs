const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('trip deep link always hydrates from backend and preserves full return URL', () => {
  const source = fs.readFileSync('assets/js/workspace-integration.js', 'utf8');
  const html = fs.readFileSync('trip-overview.html', 'utf8');

  assert.doesNotMatch(source, /if\s*\(!found\)\s*\{\s*hydrateActiveTripFromBackend/);
  assert.match(
    source,
    /if\s*\(tripId\)\s*\{\s*hydrateActiveTripFromBackend\(tripId\);\s*return;/,
  );
  assert.match(
    source,
    /window\.location\.pathname\s*\+\s*window\.location\.search\s*\+\s*window\.location\.hash/,
  );
  assert.match(source, /conn\.getTrip\(tripId\)/);
  assert.ok(html.indexOf('assets/js/api-client.js') < html.indexOf('assets/js/workspace-integration.js'));
  assert.ok(html.indexOf('assets/js/trip-sync.js') < html.indexOf('assets/js/workspace-integration.js'));
});

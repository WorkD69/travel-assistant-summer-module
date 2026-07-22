const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');

const frontend = path.join(__dirname, '..', '..', 'frontend');
const read = (relative) => fs.readFileSync(path.join(frontend, relative), 'utf8');

describe('frontend production API integration', () => {
  test('uses a same-origin cookie client without embedded credentials', () => {
    const client = read('assets/js/api-client.js');
    assert.match(client, /fetch\(.*\/api/);
    assert.match(client, /credentials\s*(?:=|:)\s*["']include["']/);
    assert.doesNotMatch(client, /TRAVEL_API_SERVICE_TOKEN|Bearer\s+[A-Za-z0-9_-]{16,}|groq/i);
    assert.doesNotMatch(client, /https?:\/\/[^"']+\/api/);
  });

  test('loads API auth before account page handlers', () => {
    for (const page of ['login.html', 'register.html']) {
      const html = read(page);
      assert.ok(html.indexOf('assets/js/api-client.js') < html.indexOf('assets/js/auth-integration.js'));
      assert.ok(html.indexOf('assets/js/auth-integration.js') < html.indexOf('assets/js/account-pages.js'));
    }
  });

  test('hydrates protected pages from the backend and keeps the current visual shell', () => {
    for (const page of ['home.html', 'history.html', 'trip-wizard.html', 'trip-overview.html', 'profile.html']) {
      const html = read(page);
      assert.match(html, /assets\/js\/api-client\.js/);
      assert.match(html, /assets\/js\/site-sync\.js/);
    }
  });

  test('contains no tracked demo passwords or hidden production auto-login', () => {
    const files = [
      'assets/js/app-state-bridge.js',
      'assets/js/account-state-adapter.js',
      'assets/js/auth-integration.js',
      'README.md',
      'docs/integration/ACCOUNT-PAGES-INTEGRATION.md',
    ];
    const text = files.map(read).join('\n');
    assert.doesNotMatch(text, /Password2026|Travel2026|Invite2026|Boris2026/);
    assert.doesNotMatch(text, /auto.?login/i);
  });

  test('proxies /api through the Vercel project and never to localhost', () => {
    const config = JSON.parse(read('vercel.json'));
    const rewrite = config.rewrites.find((item) => item.source === '/api/:path*');
    assert.ok(rewrite);
    assert.match(rewrite.destination, /^https:\/\//);
    assert.doesNotMatch(rewrite.destination, /localhost|127\.0\.0\.1/);
  });

  test('persists wizard create and update actions through the site API', () => {
    const sync = read('assets/js/site-sync.js');
    const pages = read('assets/js/trip-pages.js');
    assert.match(sync, /api\.trips\.create/);
    assert.match(sync, /api\.trips\.update/);
    assert.match(pages, /async function wizardCreate/);
    assert.match(pages, /await adapter\.createTrip/);
  });

  test('keeps hydrated trip detail in the collection used by setActiveTrip', () => {
    const sync = read('assets/js/site-sync.js');
    assert.match(sync, /replaceTripInCollections/);
    assert.match(sync, /trips:\s*collections\.active/);
    assert.match(sync, /completedTrips:\s*collections\.completed/);
  });
});

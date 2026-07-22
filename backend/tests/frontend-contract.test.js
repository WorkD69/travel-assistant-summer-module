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

  test('connects workspace SOS, monitoring, Plan B, and messages to backend operations', () => {
    const client = read('assets/js/api-client.js');
    const workspace = read('assets/js/workspace-integration.js');
    for (const method of ['createSos', 'confirmSignal', 'generatePlans', 'selectPlan', 'publishPlan', 'createMessage']) {
      assert.match(client, new RegExp(method + '\\s*\\('));
      assert.match(workspace, new RegExp('api\\.trips\\.' + method));
    }
    assert.match(workspace, /connectServerOperations/);
  });

  test('connects the profile Telegram UX through a deep link instead of a demo code', () => {
    const client = read('assets/js/api-client.js');
    const pages = read('assets/js/account-pages.js');
    assert.match(client, /telegram:\s*\{/);
    for (const method of ['status', 'createLink', 'disconnect']) {
      assert.match(client, new RegExp(method + '\\s*\\('));
    }
    assert.match(pages, /deepLink/);
    assert.match(pages, /Открыть Telegram/);
    assert.match(pages, /Ссылка действует 10 минут/);
    assert.match(pages, /startTelegramPolling/);
    assert.doesNotMatch(pages, /TG-482-916|Демонстрационный код подключения/);
  });

  test('hydrates monitoring, plans, and messages into the shared workspace state', () => {
    const sync = read('assets/js/site-sync.js');
    assert.match(sync, /function coreFlowState/);
    assert.match(sync, /planBOptions/);
    assert.match(sync, /serverBacked:\s*true/);
  });

  test('persists real document uploads and deletions from the workspace', () => {
    const client = read('assets/js/api-client.js');
    const overview = read('trip-overview.html');
    assert.match(client, /uploadDocument\s*\(/);
    assert.match(client, /removeDocument\s*\(/);
    assert.match(overview, /TravelAPI\.trips\.uploadDocument/);
    assert.match(overview, /TravelAPI\.trips\.removeDocument/);
  });

  test('uses the same-origin geo API for live search and weather refresh', () => {
    const client = read('assets/js/api-client.js');
    assert.match(client, /geo:\s*\{/);
    assert.match(client, /search\(query, signal\)/);
    assert.match(client, /\/api\/site\/geo\/search\?q=/);
    assert.match(client, /weather\(latitude, longitude, refresh\)/);
    assert.match(client, /\/api\/site\/geo\/weather\?/);
    assert.match(client, /params\.set\(["']refresh["'], ["']1["']\)/);
  });

  test('provides accessible cancellable city autocomplete in the trip wizard', () => {
    const autocomplete = read('assets/js/city-autocomplete.js');
    const wizard = read('trip-wizard.html');
    const pages = read('assets/js/trip-pages.js');
    assert.match(autocomplete, /AbortController/);
    assert.match(autocomplete, /setTimeout/);
    assert.match(autocomplete, /setAttribute\(["']role["'], ["']listbox["']\)/);
    assert.match(autocomplete, /role=["']option["']/);
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) assert.match(autocomplete, new RegExp(key));
    assert.match(autocomplete, /travel:city-selected/);
    assert.match(autocomplete, /provider_unavailable|city_not_found/);
    assert.ok(wizard.indexOf('assets/js/city-autocomplete.js') < wizard.indexOf('assets/js/trip-pages.js'));
    assert.match(pages, /data-city-autocomplete/);
    assert.match(pages, /fromPoint/);
    assert.match(pages, /toPoint/);
    assert.match(pages, /Подтвердите город/);
  });

  test('persists canonical ordered route points and complete event provenance', () => {
    const sync = read('assets/js/site-sync.js');
    assert.match(sync, /routePoints:/);
    for (const field of ['canonicalName', 'latitude', 'longitude', 'sortOrder', 'source']) {
      assert.match(sync, new RegExp(field));
    }
    assert.match(sync, /reference:/);
    assert.match(sync, /detail\.routePoints/);
  });

  test('renders hydrated routes with Leaflet, live weather, and backend timeline data', () => {
    const overview = read('trip-overview.html');
    const route = read('assets/js/route-experience.js');
    assert.match(overview, /leaflet@1\.9\.4\/dist\/leaflet\.css/);
    assert.match(overview, /sha256-p4NxAoJBhIIN\+hmNHrzRCf9tD\/miZyoHS5obTRR9BMY=/);
    assert.match(overview, /leaflet@1\.9\.4\/dist\/leaflet\.js/);
    assert.match(overview, /sha256-20nQCchB9co0qIjJZRGuk2\/Z9VM\+kNiyxNV1lvTlZBo=/);
    assert.match(overview, /assets\/js\/route-experience\.js/);
    for (const id of ['route-map-viewport', 'overview-route-map', 'route-weather', 'overview-route-timeline', 'route-full-timeline']) {
      assert.match(overview, new RegExp(`id=["']${id}["']`));
    }
    assert.match(route, /TravelSite\.ready/);
    assert.match(route, /routePoints/);
    assert.match(route, /L\.map\(/);
    assert.match(route, /L\.tileLayer\(/);
    assert.match(route, /openstreetmap\.org|basemaps\.cartocdn\.com/);
    assert.match(route, /L\.marker\(/);
    assert.match(route, /L\.polyline\(/);
    assert.match(route, /fitBounds\(/);
    assert.match(route, /invalidateSize\(/);
    assert.match(route, /partial_geocoding/);
    assert.match(route, /offline_fallback/);
    assert.match(route, /provider_unavailable/);
    assert.match(route, /api\.geo\.weather/);
    assert.match(route, /Open-Meteo/);
    assert.match(route, /sortOrder/);
    assert.match(route, /reference/);
  });
});

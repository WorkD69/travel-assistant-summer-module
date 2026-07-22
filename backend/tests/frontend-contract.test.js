const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, test } = require('node:test');

const frontend = path.join(__dirname, '..', '..', 'frontend');
const read = (relative) => fs.readFileSync(path.join(frontend, relative), 'utf8');

describe('canonical teammate frontend integration', () => {
  test('loads a same-origin runtime adapter before the untouched canonical API client', () => {
    const runtime = read('assets/js/api-runtime.js');
    assert.match(runtime, /window\.TRAVEL_API_BASE\s*=\s*["']["']/);
    assert.doesNotMatch(runtime, /https?:\/\/|localhost|service.?token|password/i);

    for (const page of ['home.html', 'trip-wizard.html', 'trip-overview.html']) {
      const html = read(page);
      assert.ok(html.indexOf('assets/js/api-runtime.js') >= 0, page);
      assert.ok(html.indexOf('assets/js/api-runtime.js') < html.indexOf('assets/js/api-client.js'), page);
    }
  });

  test('uses only the teammate site contracts and canonical integration modules', () => {
    const client = read('assets/js/api-client.js');
    for (const endpoint of ['/api/trips', '/api/geo/search', '/api/weather']) {
      assert.match(client, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.doesNotMatch(client, /\/api\/site\/(?:trips|geo|assistant)/);

    const overview = read('trip-overview.html');
    for (const moduleName of [
      'api-client', 'backend-sync', 'route-timeline', 'weather-map', 'ai-assistant',
    ]) {
      const source = moduleName === 'backend-sync' ? read('assets/js/backend-sync.js') : overview;
      assert.match(source, new RegExp(moduleName.replace('-', '\\-')));
    }
  });

  test('does not load the replacement A controllers or expose serverBacked gating', () => {
    const html = fs.readdirSync(frontend)
      .filter((name) => name.endsWith('.html'))
      .map((name) => read(name))
      .join('\n');
    assert.doesNotMatch(html, /route-experience\.js|site-assistant\.js|site-sync\.js/);

    const activeModules = [
      'api-client.js', 'trip-sync.js', 'route-timeline.js', 'weather-map.js',
      'ai-assistant.js', 'backend-sync.js',
    ].map((name) => read(`assets/js/${name}`)).join('\n');
    assert.doesNotMatch(activeModules, /serverBacked/);
  });

  test('keeps the Preview API proxy same-origin without changing production domains', () => {
    const config = JSON.parse(read('vercel.json'));
    const rewrite = config.rewrites.find((item) => item.source === '/api/:path*');
    assert.ok(rewrite);
    assert.match(rewrite.destination, /^https:\/\/travel-assistant-api-parity-preview\.vercel\.app\/api\/:path\*$/);
    assert.doesNotMatch(rewrite.destination, /localhost|127\.0\.0\.1/);
  });

  test('exposes backend deployment metadata at the frontend build marker path', () => {
    const config = JSON.parse(read('vercel.json'));
    const marker = config.rewrites.find((item) => item.source === '/build-info.json');
    assert.equal(
      marker.destination,
      'https://travel-assistant-api-parity-preview.vercel.app/api/build-info',
    );
  });

  test('restores the canonical Bearer session across static page navigation', async () => {
    const values = new Map([['travelAssistant.apiToken.session', 'persisted-token']]);
    const storage = {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); },
    };
    let authorization = null;
    const location = { port: '', hostname: 'preview.example.test', href: 'https://preview.example.test/home.html', origin: 'https://preview.example.test' };
    const rawFetch = async (_url, options) => {
      authorization = options.headers.Authorization;
      return { ok: true, async json() { return { trips: [] }; } };
    };
    const context = {
      window: { TRAVEL_API_BASE: '', sessionStorage: storage, localStorage: storage, location, fetch: rawFetch },
      location,
      sessionStorage: storage,
      localStorage: storage,
      URL,
    };
    context.fetch = (...args) => context.window.fetch(...args);
    vm.runInNewContext(read('assets/js/api-client.js'), context);
    vm.runInNewContext(read('assets/js/api-session-runtime.js'), context);

    assert.equal(context.window.TravelApi.getToken(), 'persisted-token');
    await context.window.TravelApi.listTrips();
    assert.equal(authorization, 'Bearer persisted-token');
  });

  test('loads the session adapter after the byte-identical teammate API client', () => {
    for (const page of ['home.html', 'trip-wizard.html', 'trip-overview.html']) {
      const html = read(page);
      assert.ok(html.indexOf('assets/js/api-client.js') >= 0, page);
      assert.ok(html.indexOf('assets/js/api-session-runtime.js') > html.indexOf('assets/js/api-client.js'), page);
    }

    const runtime = read('assets/js/api-session-runtime.js');
    assert.match(runtime, /api\.ensureAuth/);
    assert.match(runtime, /accountPages\.credentials/);
    assert.doesNotMatch(runtime, /api\/site|serverBacked|service.?token/i);
  });
});

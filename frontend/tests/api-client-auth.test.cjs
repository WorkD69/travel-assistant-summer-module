const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadClient(options) {
  const calls = [];
  const saves = [];
  let clears = 0;
  const responses = (options.responses || []).slice();
  const authStorage = {
    load() { return options.initialToken || null; },
    save(token, remember) { saves.push({ token, remember }); },
    clear() { clears += 1; },
  };
  const context = {
    window: { TravelAuthStorage: authStorage },
    location: { hostname: 'preview.example.test', port: '', href: 'https://preview.example.test/' },
    console: { warn() {} },
    FormData: class FormData {},
    fetch: async function (url, requestOptions) {
      calls.push({ url, options: requestOptions });
      const response = responses.shift() || { status: 200, body: {} };
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        async json() { return response.body; },
      };
    },
  };
  vm.runInNewContext(
    fs.readFileSync('assets/js/api-client.js', 'utf8'),
    context,
  );
  return {
    api: context.window.TravelApi,
    calls,
    saves,
    clearCount() { return clears; },
  };
}

test('restored JWT is attached to API requests', async () => {
  const client = loadClient({
    initialToken: 'restored-jwt',
    responses: [{ status: 200, body: { user: { id: 'u-1' } } }],
  });

  await client.api.me();

  assert.equal(
    client.calls[0].options.headers.Authorization,
    'Bearer restored-jwt',
  );
});

test('login stores the returned JWT according to remember choice', async () => {
  const client = loadClient({
    responses: [{ status: 200, body: { token: 'new-jwt', user: { id: 'u-1' } } }],
  });

  await client.api.login('user@example.test', 'secret', true);

  assert.deepEqual(client.saves, [{ token: 'new-jwt', remember: true }]);
});

test('session restore never performs an implicit credential login', async () => {
  const client = loadClient({
    initialToken: 'expired-jwt',
    responses: [{ status: 401, body: { error: 'Не авторизован' } }],
  });

  await assert.rejects(client.api.ensureAuth(), /Не авторизован/);

  assert.equal(client.calls.length, 1);
  assert.equal(client.clearCount(), 1);
});

test('preview client contains only the isolated Railway backend URL', () => {
  const source = fs.readFileSync('assets/js/api-client.js', 'utf8');

  assert.match(
    source,
    /https:\/\/travel-assistant-teammate-backend-b2-staging-staging-b2\.up\.railway\.app/,
  );
  assert.equal(source.includes('REPLACE_WITH_BACKEND_URL'), false);
  assert.equal(source.includes('travel-assistant-summer-module'), false);
  assert.equal(source.includes('localhost'), false);
  assert.equal(source.includes('127.0.0.1'), false);
  assert.equal(source.includes('/api/site/'), false);
});

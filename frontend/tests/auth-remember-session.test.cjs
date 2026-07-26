const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const TOKEN_KEY = 'travel.auth.token';

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function loadAuthStorage() {
  const context = {
    window: {},
    sessionStorage: createStorage(),
    localStorage: createStorage(),
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(FRONTEND_ROOT, 'assets/js/auth-storage.js'), 'utf8'),
    context,
  );
  return context;
}

test('галочка выключена — токен только в sessionStorage', () => {
  const context = loadAuthStorage();

  context.window.TravelAuthStorage.save('session-only-jwt', false);

  assert.equal(context.sessionStorage.getItem(TOKEN_KEY), 'session-only-jwt');
  assert.equal(context.localStorage.getItem(TOKEN_KEY), null);
});

test('галочка включена — токен только в localStorage', () => {
  const context = loadAuthStorage();

  context.window.TravelAuthStorage.save('remembered-jwt', true);

  assert.equal(context.localStorage.getItem(TOKEN_KEY), 'remembered-jwt');
  assert.equal(context.sessionStorage.getItem(TOKEN_KEY), null);
});

test('повторный вход не оставляет конфликтующих токенов', () => {
  const context = loadAuthStorage();

  context.window.TravelAuthStorage.save('remembered-jwt', true);
  context.window.TravelAuthStorage.save('session-jwt', false);

  assert.equal(context.sessionStorage.getItem(TOKEN_KEY), 'session-jwt');
  assert.equal(context.localStorage.getItem(TOKEN_KEY), null);
  assert.equal(context.window.TravelAuthStorage.load(), 'session-jwt');
});

test('при токенах в обоих хранилищах выбирается sessionStorage и лишний удаляется', () => {
  const context = loadAuthStorage();
  context.localStorage.setItem(TOKEN_KEY, 'stale-local-jwt');
  context.sessionStorage.setItem(TOKEN_KEY, 'fresh-session-jwt');

  assert.equal(context.window.TravelAuthStorage.load(), 'fresh-session-jwt');
  assert.equal(context.localStorage.getItem(TOKEN_KEY), null);
});

test('logout очищает sessionStorage и localStorage', () => {
  const context = loadAuthStorage();
  context.localStorage.setItem(TOKEN_KEY, 'local-jwt');
  context.sessionStorage.setItem(TOKEN_KEY, 'session-jwt');

  context.window.TravelAuthStorage.clear();

  assert.equal(context.localStorage.getItem(TOKEN_KEY), null);
  assert.equal(context.sessionStorage.getItem(TOKEN_KEY), null);
  assert.equal(context.window.TravelAuthStorage.load(), null);
});

test('галочка входа называется «Оставаться в системе» и не сохраняет пароль', () => {
  const source = fs.readFileSync(
    path.join(FRONTEND_ROOT, 'assets/js/account-pages.js'),
    'utf8',
  );

  assert.match(source, /Оставаться в системе/);
  assert.doesNotMatch(source, /Запомнить пароль/);
  assert.doesNotMatch(source, /(session|local)Storage\.setItem\([^)]*password/i);
});

test('API-клиент сохраняет токен в хранилище по флагу remember', async () => {
  // Проверяется фактическое поведение save(token, remember) через реальный
  // вызов TravelApi.login, а не регулярное выражение по исходнику: клиент
  // вправе обращаться к хранилищу через локальный псевдоним.
  function bootApiClient() {
    const context = {
      window: {},
      sessionStorage: createStorage(),
      localStorage: createStorage(),
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ token: 'issued-jwt', user: { id: 'u1' } }),
      }),
    };
    context.window.TRAVEL_API_BASE = 'http://api.test';
    vm.runInNewContext(
      fs.readFileSync(path.join(FRONTEND_ROOT, 'assets/js/auth-storage.js'), 'utf8'),
      context,
    );
    vm.runInNewContext(
      fs.readFileSync(path.join(FRONTEND_ROOT, 'assets/js/api-client.js'), 'utf8'),
      context,
    );
    return context;
  }

  const remembered = bootApiClient();
  await remembered.window.TravelApi.login('user@example.com', 'passphrase-1', true);
  assert.equal(remembered.localStorage.getItem(TOKEN_KEY), 'issued-jwt');
  assert.equal(remembered.sessionStorage.getItem(TOKEN_KEY), null);

  const sessionOnly = bootApiClient();
  await sessionOnly.window.TravelApi.login('user@example.com', 'passphrase-1', false);
  assert.equal(sessionOnly.sessionStorage.getItem(TOKEN_KEY), 'issued-jwt');
  assert.equal(sessionOnly.localStorage.getItem(TOKEN_KEY), null);

  // Выход из аккаунта очищает оба хранилища.
  await sessionOnly.window.TravelApi.logout();
  assert.equal(sessionOnly.sessionStorage.getItem(TOKEN_KEY), null);
  assert.equal(sessionOnly.localStorage.getItem(TOKEN_KEY), null);
});

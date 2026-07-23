const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

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
    fs.readFileSync('assets/js/auth-storage.js', 'utf8'),
    context,
  );
  return context;
}

test('session tokens restore from sessionStorage', () => {
  const context = loadAuthStorage();

  context.window.TravelAuthStorage.save('session-jwt', false);

  assert.equal(
    context.sessionStorage.getItem('travel.auth.token'),
    'session-jwt',
  );
  assert.equal(context.localStorage.getItem('travel.auth.token'), null);
  assert.equal(context.window.TravelAuthStorage.load(), 'session-jwt');
});

test('remembered tokens use localStorage and clear from both stores', () => {
  const context = loadAuthStorage();
  context.sessionStorage.setItem('travel.auth.token', 'old-session');

  context.window.TravelAuthStorage.save('remembered-jwt', true);

  assert.equal(context.sessionStorage.getItem('travel.auth.token'), null);
  assert.equal(
    context.localStorage.getItem('travel.auth.token'),
    'remembered-jwt',
  );
  assert.equal(context.window.TravelAuthStorage.load(), 'remembered-jwt');

  context.window.TravelAuthStorage.clear();
  assert.equal(context.window.TravelAuthStorage.load(), null);
});


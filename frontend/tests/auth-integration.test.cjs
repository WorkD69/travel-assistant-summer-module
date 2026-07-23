const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(relativePath, 'utf8');
}

test('account forms authenticate only through the backend API', () => {
  const accountPages = read('assets/js/account-pages.js');

  assert.match(accountPages, /await window\.TravelApi\.login\(/);
  assert.match(accountPages, /await window\.TravelApi\.register\(/);
  assert.doesNotMatch(accountPages, /ctx\.adapter\.authenticate\(/);
  assert.doesNotMatch(accountPages, /ctx\.adapter\.register\(/);
});

test('runtime API modules contain no implicit demo-login calls', () => {
  const files = fs.readdirSync('assets/js')
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join('assets/js', name));
  const runtime = files.map(read).join('\n');

  assert.doesNotMatch(runtime, /ensureAuth\([^)]*\.demo/);
  assert.doesNotMatch(runtime, /ensureAuth\(DEMO\)/);
  assert.doesNotMatch(read('assets/js/api-client.js'), /var DEMO\s*=/);
  assert.doesNotMatch(read('assets/js/app-state-bridge.js'), /Password2026!/);
});

test('login and registration load auth storage before the API client', () => {
  for (const page of ['login.html', 'register.html']) {
    const html = read(page);
    const storageIndex = html.indexOf('assets/js/auth-storage.js');
    const apiIndex = html.indexOf('assets/js/api-client.js');

    assert.notEqual(storageIndex, -1, page + ' must load auth storage');
    assert.notEqual(apiIndex, -1, page + ' must load the API client');
    assert.ok(storageIndex < apiIndex, page + ' must restore storage first');
  }
});

test('application logout clears the backend JWT session', () => {
  assert.match(read('assets/js/app-routes.js'), /TravelApi\.logout\(\)/);
  assert.match(read('assets/js/account-routes.js'), /TravelApi\.logout\(\)/);
});

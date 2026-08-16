const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { parseCorsOrigins, isCorsOriginAllowed } = require('../src/config');

function loadConfigInChild(extraEnv) {
  const env = Object.assign({}, process.env, {
    NODE_ENV: 'production',
    FRONTEND_ORIGIN: 'https://travel-assistant.example.test',
  }, extraEnv);
  if (!Object.prototype.hasOwnProperty.call(extraEnv, 'JWT_SECRET')) delete env.JWT_SECRET;
  return spawnSync(process.execPath, ['-e', "require('./src/config')"], {
    cwd: path.resolve(__dirname, '..'),
    env,
    encoding: 'utf8',
  });
}

test('production CORS accepts only configured HTTPS origins', () => {
  const origins = parseCorsOrigins(
    'https://travel-assistant-teammate-preview.vercel.app',
    true,
  );

  assert.deepEqual(origins, [
    'https://travel-assistant-teammate-preview.vercel.app',
  ]);
  assert.equal(
    isCorsOriginAllowed(
      'https://travel-assistant-teammate-preview.vercel.app',
      origins,
    ),
    true,
  );
  assert.equal(isCorsOriginAllowed('https://example.test', origins), false);
  assert.equal(isCorsOriginAllowed(undefined, origins), true);
});

test('production CORS rejects missing, wildcard, and localhost origins', () => {
  assert.throws(() => parseCorsOrigins('', true), /FRONTEND_ORIGIN/);
  assert.throws(() => parseCorsOrigins('*', true), /wildcard/i);
  assert.throws(
    () => parseCorsOrigins('http://localhost:8011', true),
    /HTTPS|localhost/i,
  );
});


test('production config fails closed when JWT_SECRET is missing or insecure', () => {
  [{}, { JWT_SECRET: '' }, { JWT_SECRET: 'dev-insecure-secret-change-me' }].forEach((extraEnv) => {
    const result = loadConfigInChild(extraEnv);
    assert.notEqual(result.status, 0, JSON.stringify(extraEnv) + ' must reject production startup');
    assert.match(result.stderr, /JWT_SECRET/i);
  });
});

test('production config accepts an explicit non-placeholder JWT_SECRET', () => {
  const result = loadConfigInChild({ JWT_SECRET: 'test-only-production-jwt-secret' });
  assert.equal(result.status, 0, result.stderr);
});

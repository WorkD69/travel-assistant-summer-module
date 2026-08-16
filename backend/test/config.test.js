const test = require('node:test');
const assert = require('node:assert/strict');

const { parseCorsOrigins, isCorsOriginAllowed } = require('../src/config');

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


const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

test('uses the canonical explicit Vercel entrypoint without Express auto-detection', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));

  assert.deepEqual(config.builds, [
    { src: 'api/index.js', use: '@vercel/node' },
  ]);
  assert.deepEqual(config.routes, [
    { src: '/(.*)', dest: '/api/index.js' },
  ]);
  assert.equal(config.functions, undefined);
  assert.equal(config.rewrites, undefined);
});

const test = require('node:test');
const assert = require('node:assert/strict');

test('backend application loads as an Express request handler', () => {
  const app = require('../src/app');

  assert.equal(typeof app, 'function');
});


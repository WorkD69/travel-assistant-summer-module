const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const YAML = require('yaml');

const { BOT_OPERATION_IDS } = require('../src/routes/bot');

test('implements every operation in the immutable Telegram OpenAPI contract', () => {
  const openapiPath = path.join(__dirname, '..', '..', 'telegram-bot', 'docs', 'bot-api.openapi.yaml');
  const document = YAML.parse(fs.readFileSync(openapiPath, 'utf8'));
  const expected = [];
  for (const pathItem of Object.values(document.paths)) {
    for (const method of ['get', 'post', 'patch', 'put', 'delete']) {
      if (pathItem[method]?.operationId) expected.push(pathItem[method].operationId);
    }
  }
  assert.deepEqual([...BOT_OPERATION_IDS].sort(), expected.sort());
  assert.equal(new Set(BOT_OPERATION_IDS).size, BOT_OPERATION_IDS.length);
});

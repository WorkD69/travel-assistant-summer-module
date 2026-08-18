const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('legacy assistant proposals stay informational and cannot mutate Plan B state', () => {
  const assistant = fs.readFileSync('assets/js/ai-assistant.js', 'utf8');
  const api = fs.readFileSync('assets/js/api-client.js', 'utf8');

  assert.match(assistant, /p\.revisedRoute/);
  assert.match(assistant, /p\.segments/);
  assert.match(assistant, /предложения ассистента справочные/i);
  assert.doesNotMatch(assistant, /TravelApi\.(applyPlan|getActivePlan|updatePlan|deletePlan)/);
  assert.doesNotMatch(api, /\/monitoring\/plan/);
});

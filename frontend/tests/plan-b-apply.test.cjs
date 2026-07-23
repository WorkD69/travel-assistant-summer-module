const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('Plan B UI keeps structured routes, confirms, and applies the canonical server trip', () => {
  const source = fs.readFileSync('assets/js/ai-assistant.js', 'utf8');

  assert.match(source, /planRegistry\[key\]\s*=\s*Object\.assign\(\{\},\s*p/);
  assert.match(source, /p\.revisedRoute/);
  assert.match(source, /p\.segments/);
  assert.match(source, /window\.confirm\("Применить Plan B/);
  assert.match(source, /var result = await window\.TravelApi\.applyPlan/);
  assert.match(source, /canonicalSharedTrip\(result\.trip/);
  assert.match(source, /action:\s*"applyPlanB"/);
});


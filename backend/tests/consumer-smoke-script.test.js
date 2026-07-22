const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

test('allows the real bot consumer smoke to use an exact preview Origin', () => {
  const scripts = path.join(__dirname, '..', 'scripts');
  const python = fs.readFileSync(path.join(scripts, 'bot_consumer_smoke.py'), 'utf8');
  const powershell = fs.readFileSync(path.join(scripts, 'run-bot-consumer-smoke.ps1'), 'utf8');

  assert.match(python, /TRAVEL_FRONTEND_ORIGIN/);
  assert.match(powershell, /\[string\]\$FrontendOrigin/);
  assert.match(powershell, /\$env:TRAVEL_FRONTEND_ORIGIN = \$FrontendOrigin/);
  assert.match(powershell, /Remove-Item Env:TRAVEL_FRONTEND_ORIGIN/);
});

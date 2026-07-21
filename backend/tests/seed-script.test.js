const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

test('database seed requires external demo credentials and never embeds them', () => {
  const file = path.join(__dirname, '..', 'prisma', 'seed.js');
  const text = fs.readFileSync(file, 'utf8');

  assert.match(text, /DEMO_ORGANIZER_PASSWORD/);
  assert.match(text, /DEMO_PARTICIPANT_PASSWORD/);
  assert.match(text, /DEMO_NO_ACCESS_PASSWORD/);
  assert.match(text, /passwordHash/);
  assert.doesNotMatch(text, /Password2026|password\s*:\s*['"][^'"]+['"]/i);
  assert.doesNotMatch(text, /console\.log\([^\n]*(password|credential|secret)/i);
  assert.match(text, /SEED_DATA\.plans\.length\s*!==\s*3/);
});

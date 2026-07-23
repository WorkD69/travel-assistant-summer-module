const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('settings save awaits canonical backend update before success UI', () => {
  const source = fs.readFileSync('features/trip-settings.js', 'utf8');
  const start = source.indexOf('async function settingsSaveTrip');
  const end = source.indexOf('\n  function settingsOpenConfigureModal', start);
  const body = source.slice(start, end);

  assert.match(body, /async function settingsSaveTrip/);
  assert.match(body, /await window\.TravelTripSync\.updateCanonicalTrip/);
  assert.match(body, /segments:/);
  assert.match(body, /catch\s*\(/);
  assert.match(body, /settingsToast\([^,]+,\s*"Изменения сохранены"\)/);
  assert.ok(
    body.indexOf('await window.TravelTripSync.updateCanonicalTrip') <
      body.indexOf('"Изменения сохранены"'),
  );
});

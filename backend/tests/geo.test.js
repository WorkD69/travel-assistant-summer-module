const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const { getWeather, searchPlaces } = require('../src/services/geo');

function response(payload) {
  return { ok: true, status: 200, async text() { return JSON.stringify(payload); } };
}

describe('bounded geo integrations', () => {
  test('encodes place queries and returns a small normalized result', async () => {
    let requestUrl;
    let requestOptions;
    const fetchImpl = async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return response([{ place_id: 1, display_name: 'Moscow', lat: '55.75', lon: '37.61', type: 'city' }]);
    };
    const items = await searchPlaces('Moscow & test', { fetchImpl });
    assert.match(String(requestUrl), /q=Moscow\+%26\+test/);
    assert.ok(requestOptions.signal);
    assert.deepEqual(items, [{ id: '1', name: 'Moscow', latitude: 55.75, longitude: 37.61, type: 'city' }]);
  });

  test('validates coordinates before making a weather request', async () => {
    let calls = 0;
    await assert.rejects(
      getWeather(100, 37, { fetchImpl: async () => { calls += 1; } }),
      (error) => error.code === 'validation_error',
    );
    assert.equal(calls, 0);
  });

  test('does not return raw provider failures', async () => {
    await assert.rejects(
      searchPlaces('Moscow', { fetchImpl: async () => ({ ok: false, status: 500, async text() { return 'provider secret body'; } }) }),
      (error) => error.code === 'external_service_error' && !error.message.includes('secret'),
    );
  });
});

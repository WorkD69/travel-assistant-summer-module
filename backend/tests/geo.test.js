const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const { getWeather, searchPlaces } = require('../src/services/geo');

function response(payload) {
  return { ok: true, status: 200, async text() { return JSON.stringify(payload); } };
}

function weatherPayload() {
  return {
    latitude: 55.75,
    longitude: 37.61,
    timezone: 'Europe/Moscow',
    current: {
      time: '2026-07-22T10:15',
      temperature_2m: 23.4,
      relative_humidity_2m: 61,
      weather_code: 2,
      wind_speed_10m: 12.8,
    },
    daily: {
      time: ['2026-07-22', '2026-07-23', '2026-07-24'],
      weather_code: [2, 61, 0],
      temperature_2m_min: [17.1, 15.2, 18.4],
      temperature_2m_max: [25.6, 22.3, 27.9],
    },
  };
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

  test('returns normalized current weather and a three-day forecast', async () => {
    let requestUrl;
    const result = await getWeather(55.75, 37.61, {
      cache: new Map(),
      now: () => new Date('2026-07-22T07:16:00.000Z'),
      fetchImpl: async (url) => { requestUrl = url; return response(weatherPayload()); },
    });

    assert.match(String(requestUrl), /relative_humidity_2m/);
    assert.match(String(requestUrl), /forecast_days=3/);
    assert.equal(result.provider, 'Open-Meteo');
    assert.equal(result.observedAt, '2026-07-22T10:15');
    assert.equal(result.fetchedAt, '2026-07-22T07:16:00.000Z');
    assert.deepEqual(result.current, {
      temperatureC: 23.4,
      description: 'Переменная облачность',
      weatherCode: 2,
      windKph: 12.8,
      humidityPercent: 61,
    });
    assert.equal(result.forecast.length, 3);
    assert.deepEqual(result.forecast[1], {
      date: '2026-07-23', description: 'Небольшой дождь', weatherCode: 61, minC: 15.2, maxC: 22.3,
    });
    assert.equal(result.cache.hit, false);
  });

  test('uses a bounded cache and supports an explicit refresh bypass', async () => {
    const cache = new Map();
    let calls = 0;
    const options = {
      cache,
      now: () => new Date('2026-07-22T07:16:00.000Z'),
      fetchImpl: async () => { calls += 1; return response(weatherPayload()); },
    };
    const first = await getWeather(55.75, 37.61, options);
    const second = await getWeather(55.75, 37.61, options);
    const refreshed = await getWeather(55.75, 37.61, { ...options, refresh: true });

    assert.equal(calls, 2);
    assert.equal(first.cache.hit, false);
    assert.equal(second.cache.hit, true);
    assert.equal(refreshed.cache.hit, false);
    assert.equal(cache.size, 1);
  });

  test('rejects malformed weather provider data without leaking it', async () => {
    await assert.rejects(
      getWeather(55.75, 37.61, { cache: new Map(), fetchImpl: async () => response({ current: { provider_secret: 'hidden' } }) }),
      (error) => error.code === 'external_service_error' && !error.message.includes('hidden'),
    );
  });
});

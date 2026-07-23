const assert = require('node:assert/strict');
const test = require('node:test');

const geoWeather = require('../src/services/geoWeather');

test('route weather is resolved server-side from Open-Meteo data', async () => {
  geoWeather.resetCaches();
  const calls = [];
  async function fakeFetch(url) {
    calls.push(url);
    if (url.includes('geocoding-api')) {
      return { ok: true, json: async () => ({ results: [{
        id: 1,
        name: url.includes('%D0%A1%D0%B0%D0%BD%D0%BA%D1%82') ? 'Санкт-Петербург' : 'Москва',
        country: 'Россия',
        country_code: 'RU',
        latitude: 59.93,
        longitude: 30.31,
      }] }) };
    }
    return { ok: true, json: async () => ({
      current: {
        temperature_2m: 18.4,
        relative_humidity_2m: 60,
        weather_code: 1,
        wind_speed_10m: 5.6,
      },
      daily: { time: [], temperature_2m_max: [], temperature_2m_min: [], weather_code: [] },
    }) };
  }

  const weather = await geoWeather.weatherForRoute(
    'Санкт-Петербург → Москва',
    [],
    { fetchImpl: fakeFetch },
  );

  assert.equal(weather.length, 2);
  assert.equal(weather[0].city, 'Санкт-Петербург');
  assert.equal(weather[0].temperature, 18);
  assert.equal(weather[0].windSpeed, 6);
  assert.equal(weather[0].source, 'Open-Meteo');
  assert.ok(weather[0].updatedAt);
  assert.equal(calls.length, 3, 'identical coordinates reuse the weather cache');
});

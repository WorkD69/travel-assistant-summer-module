const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const GEO_BASE = 'https://geocoding-api.open-meteo.com/v1/search';
const WX_BASE = 'https://api.open-meteo.com/v1/forecast';

// In-memory caches (per process). Keeps us within Open-Meteo fair-use limits.
const geoCache = new Map();
const wxCache = new Map();
const GEO_TTL = 24 * 60 * 60 * 1000; // 24h
const WX_TTL = 30 * 60 * 1000; // 30 min

// WMO weather interpretation codes -> Russian text
const WMO = {
  0: 'Ясно', 1: 'Преимущественно ясно', 2: 'Переменная облачность', 3: 'Пасмурно',
  45: 'Туман', 48: 'Изморозь',
  51: 'Лёгкая морось', 53: 'Морось', 55: 'Сильная морось',
  56: 'Ледяная морось', 57: 'Сильная ледяная морось',
  61: 'Небольшой дождь', 63: 'Дождь', 65: 'Сильный дождь',
  66: 'Ледяной дождь', 67: 'Сильный ледяной дождь',
  71: 'Небольшой снег', 73: 'Снег', 75: 'Сильный снег', 77: 'Снежная крупа',
  80: 'Небольшой ливень', 81: 'Ливень', 82: 'Сильный ливень',
  85: 'Снежный ливень', 86: 'Сильный снежный ливень',
  95: 'Гроза', 96: 'Гроза с градом', 99: 'Сильная гроза с градом'
};
function weatherText(code) { return WMO[code] != null ? WMO[code] : 'Нет данных'; }

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'travel-assistant/1.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// Geocoding + city validation. No results => city does not exist.
router.get('/geo/search', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ results: [] });
  const key = q.toLowerCase();
  const cached = geoCache.get(key);
  if (cached && Date.now() - cached.at < GEO_TTL) return res.json({ results: cached.data, cached: true });
  try {
    const url = GEO_BASE + '?name=' + encodeURIComponent(q) + '&count=6&language=ru&format=json';
    const data = await fetchJson(url);
    const results = (data.results || []).map(function (r) {
      return {
        id: r.id,
        name: r.name,
        country: r.country || '',
        countryCode: r.country_code || '',
        admin1: r.admin1 || '',
        latitude: r.latitude,
        longitude: r.longitude,
        population: r.population || null,
        label: [r.name, r.admin1, r.country].filter(Boolean).join(', ')
      };
    });
    geoCache.set(key, { at: Date.now(), data: results });
    res.json({ results: results });
  } catch (e) {
    console.error('[geo/search]', e && e.message);
    res.status(502).json({ error: 'Не удалось получить данные геокодинга', results: [] });
  }
});

// Current weather + 3-day forecast for a coordinate.
router.get('/weather', requireAuth, async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'Нужны координаты lat и lon' });
  const key = lat.toFixed(2) + ',' + lon.toFixed(2);
  const cached = wxCache.get(key);
  if (cached && Date.now() - cached.at < WX_TTL) return res.json(Object.assign({}, cached.data, { cached: true }));
  try {
    const url = WX_BASE + '?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m' +
      '&daily=temperature_2m_max,temperature_2m_min,weather_code' +
      '&timezone=auto&forecast_days=3';
    const data = await fetchJson(url);
    const cur = data.current || {};
    const daily = data.daily || {};
    const times = daily.time || [];
    const out = {
      latitude: lat,
      longitude: lon,
      current: {
        temperature: typeof cur.temperature_2m === 'number' ? Math.round(cur.temperature_2m) : null,
        windSpeed: typeof cur.wind_speed_10m === 'number' ? Math.round(cur.wind_speed_10m) : null,
        humidity: cur.relative_humidity_2m != null ? cur.relative_humidity_2m : null,
        weatherCode: cur.weather_code,
        description: weatherText(cur.weather_code)
      },
      daily: times.map(function (t, i) {
        return {
          date: t,
          tMax: daily.temperature_2m_max ? Math.round(daily.temperature_2m_max[i]) : null,
          tMin: daily.temperature_2m_min ? Math.round(daily.temperature_2m_min[i]) : null,
          weatherCode: daily.weather_code ? daily.weather_code[i] : null,
          description: daily.weather_code ? weatherText(daily.weather_code[i]) : ''
        };
      }),
      updatedAt: new Date().toISOString()
    };
    wxCache.set(key, { at: Date.now(), data: out });
    res.json(out);
  } catch (e) {
    console.error('[weather]', e && e.message);
    res.status(502).json({ error: 'Не удалось получить погоду' });
  }
});

module.exports = router;

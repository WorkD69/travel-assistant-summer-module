const GEO_BASE = 'https://geocoding-api.open-meteo.com/v1/search';
const WX_BASE = 'https://api.open-meteo.com/v1/forecast';
const GEO_TTL = 24 * 60 * 60 * 1000;
const WX_TTL = 30 * 60 * 1000;
const geoCache = new Map();
const wxCache = new Map();

const WMO = {
  0: 'Ясно', 1: 'Преимущественно ясно', 2: 'Переменная облачность', 3: 'Пасмурно',
  45: 'Туман', 48: 'Изморозь', 51: 'Лёгкая морось', 53: 'Морось', 55: 'Сильная морось',
  56: 'Ледяная морось', 57: 'Сильная ледяная морось', 61: 'Небольшой дождь',
  63: 'Дождь', 65: 'Сильный дождь', 66: 'Ледяной дождь', 67: 'Сильный ледяной дождь',
  71: 'Небольшой снег', 73: 'Снег', 75: 'Сильный снег', 77: 'Снежная крупа',
  80: 'Небольшой ливень', 81: 'Ливень', 82: 'Сильный ливень', 85: 'Снежный ливень',
  86: 'Сильный снежный ливень', 95: 'Гроза', 96: 'Гроза с градом', 99: 'Сильная гроза с градом',
};

function weatherText(code) { return WMO[code] != null ? WMO[code] : 'Нет данных'; }

async function fetchJson(url, fetchImpl) {
  const request = fetchImpl || fetch;
  const options = { headers: { Accept: 'application/json', 'User-Agent': 'travel-assistant/2.0' } };
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    options.signal = AbortSignal.timeout(8000);
  }
  const response = await request(url, options);
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

async function searchPlaces(query, options) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const key = q.toLowerCase();
  const cached = geoCache.get(key);
  if (cached && Date.now() - cached.at < GEO_TTL) return cached.data;
  const url = GEO_BASE + '?name=' + encodeURIComponent(q) + '&count=6&language=ru&format=json';
  const data = await fetchJson(url, options && options.fetchImpl);
  const results = (data.results || []).map(function (result) {
    return {
      id: result.id,
      name: result.name,
      country: result.country || '',
      countryCode: result.country_code || '',
      admin1: result.admin1 || '',
      latitude: result.latitude,
      longitude: result.longitude,
      population: result.population || null,
      label: [result.name, result.admin1, result.country].filter(Boolean).join(', '),
    };
  });
  geoCache.set(key, { at: Date.now(), data: results });
  return results;
}

async function getWeather(latitude, longitude, options) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Invalid weather coordinates');
  const key = lat.toFixed(2) + ',' + lon.toFixed(2);
  const cached = wxCache.get(key);
  if (cached && Date.now() - cached.at < WX_TTL) return cached.data;
  const url = WX_BASE + '?latitude=' + lat + '&longitude=' + lon +
    '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m' +
    '&daily=temperature_2m_max,temperature_2m_min,weather_code' +
    '&timezone=auto&forecast_days=3';
  const data = await fetchJson(url, options && options.fetchImpl);
  const current = data.current || {};
  const daily = data.daily || {};
  const times = daily.time || [];
  const out = {
    latitude: lat,
    longitude: lon,
    current: {
      temperature: typeof current.temperature_2m === 'number' ? Math.round(current.temperature_2m) : null,
      windSpeed: typeof current.wind_speed_10m === 'number' ? Math.round(current.wind_speed_10m) : null,
      humidity: current.relative_humidity_2m != null ? current.relative_humidity_2m : null,
      weatherCode: current.weather_code,
      description: weatherText(current.weather_code),
    },
    daily: times.map(function (time, index) {
      return {
        date: time,
        tMax: daily.temperature_2m_max ? Math.round(daily.temperature_2m_max[index]) : null,
        tMin: daily.temperature_2m_min ? Math.round(daily.temperature_2m_min[index]) : null,
        weatherCode: daily.weather_code ? daily.weather_code[index] : null,
        description: daily.weather_code ? weatherText(daily.weather_code[index]) : '',
      };
    }),
    updatedAt: new Date().toISOString(),
    source: 'Open-Meteo',
  };
  wxCache.set(key, { at: Date.now(), data: out });
  return out;
}

function routeCities(route, segments) {
  const names = String(route || '').split(/\s*(?:→|->|—>)\s*/).map(function (value) { return value.trim(); });
  (Array.isArray(segments) ? segments : []).forEach(function (segment) {
    ['departurePlace', 'from', 'arrivalPlace', 'to'].forEach(function (field) {
      if (segment && segment[field]) names.push(String(segment[field]).trim());
    });
  });
  return Array.from(new Set(names.filter(Boolean))).slice(0, 4);
}

async function weatherForRoute(route, segments, options) {
  if (String(process.env.OPEN_METEO_DISABLED || '').toLowerCase() === 'true') return [];
  const result = [];
  for (const city of routeCities(route, segments)) {
    try {
      const places = await searchPlaces(city, options);
      if (!places.length) continue;
      const weather = await getWeather(places[0].latitude, places[0].longitude, options);
      result.push({
        city: places[0].name || city,
        temperature: weather.current.temperature,
        conditions: weather.current.description,
        windSpeed: weather.current.windSpeed,
        updatedAt: weather.updatedAt,
        source: 'Open-Meteo',
      });
    } catch (error) {
      console.warn('[weather/context] ' + city + ': ' + (error && error.message ? error.message : error));
    }
  }
  return result;
}

function resetCaches() { geoCache.clear(); wxCache.clear(); }

module.exports = {
  searchPlaces,
  getWeather,
  weatherForRoute,
  routeCities,
  weatherText,
  resetCaches,
};


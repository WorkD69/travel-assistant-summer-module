const { ApiError } = require('../errors');

const MAX_PROVIDER_BYTES = 512 * 1024;
const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_WEATHER_CACHE_ENTRIES = 128;
const weatherCache = new Map();

const WMO_DESCRIPTIONS = new Map([
  [0, 'Ясно'],
  [1, 'Преимущественно ясно'],
  [2, 'Переменная облачность'],
  [3, 'Пасмурно'],
  [45, 'Туман'], [48, 'Изморозь'],
  [51, 'Небольшая морось'], [53, 'Морось'], [55, 'Сильная морось'],
  [56, 'Ледяная морось'], [57, 'Сильная ледяная морось'],
  [61, 'Небольшой дождь'], [63, 'Дождь'], [65, 'Сильный дождь'],
  [66, 'Ледяной дождь'], [67, 'Сильный ледяной дождь'],
  [71, 'Небольшой снег'], [73, 'Снег'], [75, 'Сильный снег'], [77, 'Снежные зёрна'],
  [80, 'Небольшой ливень'], [81, 'Ливень'], [82, 'Сильный ливень'],
  [85, 'Небольшой снегопад'], [86, 'Сильный снегопад'],
  [95, 'Гроза'], [96, 'Гроза с градом'], [99, 'Сильная гроза с градом'],
]);

async function fetchJson(url, { fetchImpl = fetch, timeoutMs = 5000, headers = {} } = {}) {
  let response;
  try {
    response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new ApiError(503, 'external_service_error', 'Внешний сервис временно недоступен.');
  }
  if (!response.ok) throw new ApiError(503, 'external_service_error', 'Внешний сервис временно недоступен.');
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_PROVIDER_BYTES) {
    throw new ApiError(503, 'external_service_error', 'Ответ внешнего сервиса слишком большой.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(503, 'external_service_error', 'Внешний сервис вернул некорректный ответ.');
  }
}

async function searchPlaces(query, options = {}) {
  const q = String(query || '').trim();
  if (q.length < 2 || q.length > 100) {
    throw new ApiError(422, 'validation_error', 'Поисковый запрос должен содержать от 2 до 100 символов.');
  }
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '8');
  url.searchParams.set('addressdetails', '0');
  const data = await fetchJson(url, {
    ...options,
    headers: { Accept: 'application/json', 'User-Agent': 'TravelAssistant/1.0' },
  });
  if (!Array.isArray(data)) throw new ApiError(503, 'external_service_error', 'Внешний сервис вернул некорректный ответ.');
  return data.slice(0, 8).map((item) => ({
    id: String(item.place_id),
    name: String(item.display_name || ''),
    latitude: Number(item.lat),
    longitude: Number(item.lon),
    type: String(item.type || ''),
  })).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
}

function weatherDescription(code) {
  return WMO_DESCRIPTIONS.get(Number(code)) || 'Неизвестные погодные условия';
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeWeather(data, fetchedAt, expiresAt) {
  const current = data?.current;
  const daily = data?.daily;
  const temperatureC = finiteNumber(current?.temperature_2m);
  const weatherCode = finiteNumber(current?.weather_code);
  const windKph = finiteNumber(current?.wind_speed_10m);
  const humidityPercent = finiteNumber(current?.relative_humidity_2m);
  const observedAt = typeof current?.time === 'string' && current.time ? current.time : null;
  const dailyRows = Array.isArray(daily?.time) ? daily.time.slice(0, 3) : [];

  if (
    temperatureC === null || weatherCode === null || windKph === null ||
    humidityPercent === null || !observedAt || dailyRows.length === 0 ||
    !Array.isArray(daily?.weather_code) || !Array.isArray(daily?.temperature_2m_min) ||
    !Array.isArray(daily?.temperature_2m_max)
  ) {
    throw new ApiError(503, 'external_service_error', 'Внешний сервис вернул некорректный ответ.');
  }

  const forecast = dailyRows.map((date, index) => {
    const code = finiteNumber(daily.weather_code[index]);
    const minC = finiteNumber(daily.temperature_2m_min[index]);
    const maxC = finiteNumber(daily.temperature_2m_max[index]);
    if (typeof date !== 'string' || code === null || minC === null || maxC === null) {
      throw new ApiError(503, 'external_service_error', 'Внешний сервис вернул некорректный ответ.');
    }
    return { date, description: weatherDescription(code), weatherCode: code, minC, maxC };
  });

  return {
    latitude: finiteNumber(data.latitude),
    longitude: finiteNumber(data.longitude),
    timezone: String(data.timezone || 'UTC'),
    provider: 'Open-Meteo',
    observedAt,
    fetchedAt: fetchedAt.toISOString(),
    cache: { hit: false, expiresAt: expiresAt.toISOString() },
    current: {
      temperatureC,
      description: weatherDescription(weatherCode),
      weatherCode,
      windKph,
      humidityPercent,
    },
    forecast,
  };
}

async function getWeather(latitude, longitude, options = {}) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new ApiError(422, 'validation_error', 'Некорректные координаты.');
  }
  const cache = options.cache || weatherCache;
  const currentTime = options.now ? options.now() : new Date();
  const now = currentTime instanceof Date ? currentTime : new Date(currentTime);
  const cacheTtlMs = Number.isFinite(options.cacheTtlMs) ? options.cacheTtlMs : WEATHER_CACHE_TTL_MS;
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cached = cache.get(key);
  if (!options.refresh && cached && cached.expiresAt > now.getTime()) {
    return { ...cached.value, cache: { ...cached.value.cache, hit: true } };
  }
  if (cached) cache.delete(key);

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m');
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
  url.searchParams.set('forecast_days', '3');
  url.searchParams.set('timezone', 'auto');
  const data = await fetchJson(url, options);
  const expiresAt = new Date(now.getTime() + cacheTtlMs);
  const normalized = normalizeWeather(data, now, expiresAt);
  if (cache.size >= MAX_WEATHER_CACHE_ENTRIES && !cache.has(key)) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { expiresAt: expiresAt.getTime(), value: normalized });
  return normalized;
}

module.exports = {
  MAX_PROVIDER_BYTES,
  MAX_WEATHER_CACHE_ENTRIES,
  WEATHER_CACHE_TTL_MS,
  fetchJson,
  getWeather,
  normalizeWeather,
  searchPlaces,
  weatherDescription,
};

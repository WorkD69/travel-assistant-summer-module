const { ApiError } = require('../errors');

const MAX_PROVIDER_BYTES = 512 * 1024;

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

async function getWeather(latitude, longitude, options = {}) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new ApiError(422, 'validation_error', 'Некорректные координаты.');
  }
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('current', 'temperature_2m,weather_code,wind_speed_10m');
  url.searchParams.set('timezone', 'auto');
  const data = await fetchJson(url, options);
  return {
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
    timezone: String(data.timezone || 'UTC'),
    current: data.current || null,
  };
}

module.exports = { MAX_PROVIDER_BYTES, fetchJson, getWeather, searchPlaces };

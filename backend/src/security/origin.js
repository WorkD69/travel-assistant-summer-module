const { ApiError } = require('../errors');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function normalizeOrigin(origin) {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function assertAllowedOrigin(method, origin, allowedOrigins, isProduction) {
  if (!isProduction || SAFE_METHODS.has(String(method).toUpperCase())) return;
  const normalized = normalizeOrigin(origin);
  if (!normalized || !allowedOrigins.includes(normalized)) {
    throw new ApiError(403, 'origin_denied', 'Источник запроса не разрешён.');
  }
}

function createOriginMiddleware(config) {
  return function originMiddleware(req, _res, next) {
    try {
      assertAllowedOrigin(
        req.method,
        req.get('Origin'),
        config.allowedOrigins,
        config.isProduction,
      );
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { assertAllowedOrigin, createOriginMiddleware, normalizeOrigin };

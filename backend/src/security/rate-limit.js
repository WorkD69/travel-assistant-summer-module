const { rateLimit } = require('express-rate-limit');

const { ApiError } = require('../errors');

function createAuthRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(_req, _res, next) {
      next(new ApiError(429, 'rate_limited', 'Слишком много попыток. Повторите позже.'));
    },
  });
}

module.exports = { createAuthRateLimit };

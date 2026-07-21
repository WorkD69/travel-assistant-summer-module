const crypto = require('node:crypto');

const { ApiError } = require('../errors');

function digest(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest();
}

function constantTimeEqual(actual, expected) {
  const actualDigest = digest(actual);
  const expectedDigest = digest(expected);
  return crypto.timingSafeEqual(actualDigest, expectedDigest);
}

function parseTelegramUserId(value) {
  const text = String(value || '');
  if (!/^[1-9]\d{0,19}$/.test(text)) {
    throw new ApiError(
      422,
      'invalid_telegram_user_id',
      'Некорректный идентификатор Telegram.',
    );
  }
  return text;
}

function authenticateServiceToken(authorization, expectedToken) {
  const match = /^Bearer ([^\s]+)$/.exec(String(authorization || ''));
  if (!expectedToken || !match || !constantTimeEqual(match[1], expectedToken)) {
    throw new ApiError(401, 'service_unauthorized', 'Сервисная авторизация не пройдена.');
  }
}

function authenticateServiceRequest(authorization, telegramHeader, expectedToken) {
  authenticateServiceToken(authorization, expectedToken);
  return { telegramUserId: parseTelegramUserId(telegramHeader) };
}

function createServiceOnlyMiddleware(config) {
  return function serviceOnlyMiddleware(req, _res, next) {
    try {
      authenticateServiceToken(req.get('Authorization'), config.serviceToken);
      next();
    } catch (error) {
      next(error);
    }
  };
}

function createTelegramIdentityMiddleware(config) {
  return function telegramIdentityMiddleware(req, _res, next) {
    try {
      req.telegramUserId = authenticateServiceRequest(
        req.get('Authorization'),
        req.get('X-Telegram-User-Id'),
        config.serviceToken,
      ).telegramUserId;
      next();
    } catch (error) {
      next(error);
    }
  };
}

function createServiceAuthMiddleware(config, prisma) {
  return async function serviceAuthMiddleware(req, _res, next) {
    try {
      const identity = authenticateServiceRequest(
        req.get('Authorization'),
        req.get('X-Telegram-User-Id'),
        config.serviceToken,
      );
      const link = await prisma.telegramAccountLink.findUnique({
        where: { telegramUserId: identity.telegramUserId },
        include: { siteUser: true },
      });
      if (!link || link.revokedAt || !link.siteUser) {
        throw new ApiError(401, 'not_linked', 'Telegram-аккаунт не привязан.');
      }
      req.telegramIdentity = {
        telegramUserId: identity.telegramUserId,
        siteUser: link.siteUser,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  authenticateServiceRequest,
  authenticateServiceToken,
  constantTimeEqual,
  createServiceAuthMiddleware,
  createServiceOnlyMiddleware,
  createTelegramIdentityMiddleware,
  parseTelegramUserId,
};

const jwt = require('jsonwebtoken');

const { ApiError } = require('../errors');

const COOKIE_NAME = 'travel_session';

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function issueSession(user, config) {
  return jwt.sign(
    { sub: user.id, purpose: 'site_session' },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: config.sessionTtlSeconds },
  );
}

function sessionCookieOptions(config) {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: config.sessionTtlSeconds * 1000,
  };
}

function readSession(token, config) {
  try {
    const claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (!claims || claims.purpose !== 'site_session' || typeof claims.sub !== 'string') {
      throw new Error('invalid claims');
    }
    return claims.sub;
  } catch {
    throw new ApiError(401, 'not_authenticated', 'Требуется вход в аккаунт.');
  }
}

function createSiteAuthMiddleware(config, prisma) {
  return async function siteAuthMiddleware(req, _res, next) {
    try {
      const token = req.cookies?.[COOKIE_NAME];
      if (!token) throw new ApiError(401, 'not_authenticated', 'Требуется вход в аккаунт.');
      const userId = readSession(token, config);
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new ApiError(401, 'not_authenticated', 'Требуется вход в аккаунт.');
      req.siteUser = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  COOKIE_NAME,
  createSiteAuthMiddleware,
  issueSession,
  publicUser,
  readSession,
  sessionCookieOptions,
};

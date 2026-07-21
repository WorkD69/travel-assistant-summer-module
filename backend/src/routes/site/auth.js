const crypto = require('node:crypto');

const bcrypt = require('bcryptjs');
const express = require('express');

const { ApiError } = require('../../errors');
const {
  COOKIE_NAME,
  createSiteAuthMiddleware,
  issueSession,
  publicUser,
  sessionCookieOptions,
} = require('../../security/site-auth');
const { createAuthRateLimit } = require('../../security/rate-limit');

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(422, 'validation_error', 'Укажите корректный адрес электронной почты.');
  }
  return email;
}

function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 12 || password.length > 128) {
    throw new ApiError(422, 'validation_error', 'Пароль должен содержать от 12 до 128 символов.');
  }
  return password;
}

function createAuthRouter({ config, prisma }) {
  const router = express.Router();
  const requireSiteUser = createSiteAuthMiddleware(config, prisma);
  const authRateLimit = createAuthRateLimit();

  router.post('/register', authRateLimit, async (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (name.length < 2 || name.length > 100) {
      throw new ApiError(422, 'validation_error', 'Имя должно содержать от 2 до 100 символов.');
    }
    const email = normalizeEmail(req.body?.email);
    const password = validatePassword(req.body?.password);
    const passwordHash = await bcrypt.hash(password, 12);
    let user;
    try {
      user = await prisma.user.create({
        data: {
          id: `u-${crypto.randomUUID()}`,
          name,
          email,
          passwordHash,
          initials: name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(),
        },
      });
    } catch (error) {
      if (error?.code === 'P2002') {
        throw new ApiError(409, 'email_already_used', 'Аккаунт с такой почтой уже существует.');
      }
      throw error;
    }
    res.cookie(COOKIE_NAME, issueSession(user, config), sessionCookieOptions(config));
    res.status(201).json({ user: publicUser(user) });
  });

  router.post('/login', authRateLimit, async (req, res) => {
    let email = '';
    try { email = normalizeEmail(req.body?.email); } catch { /* generic auth failure */ }
    const password = String(req.body?.password || '');
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
    const fallbackHash = '$2b$12$ZqzPjT2vQtSENWsGtXrF2eS9s8sMlq6dtjpTD8yImh5Jd8V2T5f2C';
    const valid = await bcrypt.compare(password, user?.passwordHash || fallbackHash);
    if (!user || !valid) {
      throw new ApiError(401, 'invalid_credentials', 'Неверная почта или пароль.');
    }
    res.cookie(COOKIE_NAME, issueSession(user, config), sessionCookieOptions(config));
    res.json({ user: publicUser(user) });
  });

  router.get('/me', requireSiteUser, (req, res) => {
    res.json({ user: publicUser(req.siteUser) });
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE_NAME, { ...sessionCookieOptions(config), maxAge: undefined });
    res.status(204).end();
  });

  return router;
}

module.exports = { createAuthRouter, normalizeEmail, validatePassword };

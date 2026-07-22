const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const config = require('../config');
const { requireAuth, signToken } = require('../middleware/auth');

const router = express.Router();

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    initials: u.initials,
    telegram: u.telegram,
    emailContact: u.emailContact,
    notifyPrefs: u.notifyPrefs ? JSON.parse(u.notifyPrefs) : null,
    appearance: u.appearance ? JSON.parse(u.appearance) : null,
  };
}

function setAuthCookie(res, token, remember) {
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: (remember ? 30 : 2) * 24 * 60 * 60 * 1000,
  });
}

function initialsFrom(name) {
  return String(name || '').trim().charAt(0).toUpperCase();
}

router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password || !name) return res.status(400).json({ error: 'Укажите имя, e-mail и пароль' });
    const exists = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
    if (exists) return res.status(409).json({ error: 'Пользователь с таким e-mail уже существует' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email: String(email).toLowerCase(), passwordHash, name, initials: initialsFrom(name) },
    });
    const token = signToken(user, false);
    setAuthCookie(res, token, false);
    res.status(201).json({ user: publicUser(user), token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password, remember } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Укажите e-mail и пароль' });
    const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
    if (!user) return res.status(401).json({ error: 'Неверный e-mail или пароль' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Неверный e-mail или пароль' });
    const token = signToken(user, !!remember);
    setAuthCookie(res, token, !!remember);
    res.json({ user: publicUser(user), token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const data = {};
    if (b.name !== undefined) { data.name = String(b.name); data.initials = initialsFrom(b.name); }
    if (b.telegram !== undefined) data.telegram = b.telegram ? String(b.telegram) : null;
    if (b.emailContact !== undefined) data.emailContact = b.emailContact ? String(b.emailContact) : null;
    if (b.notifyPrefs !== undefined) data.notifyPrefs = b.notifyPrefs ? JSON.stringify(b.notifyPrefs) : null;
    if (b.appearance !== undefined) data.appearance = b.appearance ? JSON.stringify(b.appearance) : null;
    const user = await prisma.user.update({ where: { id: req.user.id }, data: data });
    res.json({ user: publicUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Не удалось обновить профиль' }); }
});

module.exports = router;

const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../db');

function bearerToken(req) {
  const h = req.headers.authorization || '';
  return h.indexOf('Bearer ') === 0 ? h.slice(7) : null;
}

async function requireAuth(req, res, next) {
  try {
    const token = (req.cookies && req.cookies.token) || bearerToken(req);
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: 'Сессия недействительна' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Не авторизован' });
  }
}

function signToken(user, remember) {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, {
    expiresIn: remember ? '30d' : '2d',
  });
}

module.exports = { requireAuth, signToken };

// Bridge router: implements the Telegram bot's fixed REST contract
// (docs/bot-api.openapi.yaml) against our real Prisma data.
//
// Auth model:
//   * Service endpoints require Authorization: Bearer <BOT_SERVICE_TOKEN>.
//   * User-scoped endpoints additionally require X-Telegram-User-Id, which is
//     resolved to a site user via TelegramLink.
//   * The public document download link is opaque + signed + short-lived and
//     needs no header (so the bot can fetch the bytes and re-upload them to the
//     user's Telegram chat).
//
// Site-facing linking endpoints (JWT-authenticated) let the website mint a
// one-time link token and render a t.me deep link.
const express = require('express');
const crypto = require('crypto');
const prisma = require('../db');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const botNotify = require('../services/botNotify');
const assistant = require('../services/assistant');
const tripChanges = require('../services/tripChanges');

const router = express.Router();

// ----------------------------------------------------------------- helpers
const CODE_STATUS = {
  not_linked: 401,
  access_denied: 403,
  not_found: 404,
  link_token_invalid: 400,
  link_token_expired: 400,
  link_token_used: 409,
  link_conflict: 409,
  rate_limited: 429,
  validation_error: 422,
  internal_error: 500,
};
const CODE_MSG = {
  not_linked: 'Telegram не привязан к аккаунту сайта.',
  access_denied: 'Недостаточно прав для этого действия.',
  not_found: 'Объект не найден.',
  link_token_invalid: 'Ссылка привязки недействительна.',
  link_token_expired: 'Ссылка привязки истекла. Сгенерируйте новую в профиле.',
  link_token_used: 'Эта ссылка привязки уже использована.',
  link_conflict: 'Этот Telegram уже привязан к другому аккаунту.',
  rate_limited: 'Слишком много запросов, попробуйте позже.',
  validation_error: 'Проверьте корректность данных запроса.',
  internal_error: 'Внутренняя ошибка. Попробуйте позже.',
};
function fail(res, code, message) {
  const status = CODE_STATUS[code] || 400;
  return res.status(status).json({
    error: { code: code, message_ru: message || CODE_MSG[code] || 'Ошибка.', request_id: null },
  });
}
function jsonParse(v, fb) { try { return v == null ? fb : JSON.parse(v); } catch (e) { return fb; } }
function page(items) { return { items: items, next_cursor: null }; }

function toIso(v) {
  if (!v) return null;
  try {
    const d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch (e) { return null; }
}
function toDateOnly(v) {
  const iso = toIso(v);
  return iso ? iso.slice(0, 10) : null;
}
function ymdInTz(v, tz) {
  const d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  } catch (e) { return d.toISOString().slice(0, 10); }
}

// ----------------------------------------------------------------- signing
function secret() { return config.bot.serviceToken || config.jwtSecret; }
function b64url(buf) { return Buffer.from(buf).toString('base64url'); }
function sign(data) { return crypto.createHmac('sha256', secret()).update(data).digest('base64url'); }
function makeFileToken(documentId, telegramUserId) {
  const exp = Date.now() + config.bot.fileLinkTtlMinutes * 60 * 1000;
  const body = b64url(JSON.stringify({ d: documentId, u: String(telegramUserId), e: exp }));
  return body + '.' + sign(body);
}
function verifyFileToken(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const parts = token.split('.');
  const body = parts[0]; const sig = parts[1];
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch (e) { return null; }
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!payload || !payload.d || !payload.e || Date.now() > payload.e) return null;
  return { documentId: payload.d, telegramUserId: payload.u };
}
function randomToken() { return crypto.randomBytes(24).toString('base64url'); }

// ----------------------------------------------------------------- auth mw
function requireService(req, res, next) {
  if (!config.bot.serviceToken) {
    return fail(res, 'internal_error', 'BOT_SERVICE_TOKEN не настроен на backend.');
  }
  const h = req.headers.authorization || '';
  const token = h.indexOf('Bearer ') === 0 ? h.slice(7) : null;
  let ok = false;
  try {
    ok = !!token && token.length === config.bot.serviceToken.length &&
      crypto.timingSafeEqual(Buffer.from(token), Buffer.from(config.bot.serviceToken));
  } catch (e) { ok = false; }
  if (!ok) return fail(res, 'access_denied', 'Неверный сервисный токен бота.');
  next();
}
function readTgId(req) {
  const raw = req.headers['x-telegram-user-id'];
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw).trim();
}
async function resolveUser(req, res, next) {
  const tgId = readTgId(req);
  if (!tgId) return fail(res, 'validation_error', 'Не передан заголовок X-Telegram-User-Id.');
  req.tgId = tgId;
  try {
    const link = await prisma.telegramLink.findUnique({ where: { telegramUserId: tgId }, include: { user: true } });
    if (!link || !link.user) return fail(res, 'not_linked');
    req.link = link;
    req.siteUser = link.user;
    next();
  } catch (e) { return fail(res, 'internal_error'); }
}

// ----------------------------------------------------------------- roles
async function tripRoleFor(trip, userId) {
  if (!trip) return null;
  if (trip.ownerId === userId) return { role: 'organizer', membership: 'member' };
  const p = await prisma.participant.findFirst({ where: { tripId: trip.id, userId: userId } });
  if (!p) return null;
  const role = ['organizer', 'participant', 'viewer'].indexOf(p.role) >= 0 ? p.role : 'participant';
  const membership = p.access === 'revoked' ? 'revoked' : (p.access === 'invited' ? 'invited' : 'member');
  return { role: role, membership: membership };
}
async function loadAccessibleTrip(tripId, userId) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return { error: 'not_found' };
  const roleInfo = await tripRoleFor(trip, userId);
  if (!roleInfo || roleInfo.membership === 'revoked') return { error: 'access_denied' };
  return { trip: trip, roleInfo: roleInfo };
}
async function accessibleTrips(userId) {
  const owned = await prisma.trip.findMany({ where: { ownerId: userId } });
  const parts = await prisma.participant.findMany({ where: { userId: userId }, include: { trip: true } });
  const byId = new Map();
  owned.forEach(function (t) { byId.set(t.id, { trip: t, roleInfo: { role: 'organizer', membership: 'member' } }); });
  parts.forEach(function (p) {
    if (!p.trip) return;
    if (byId.has(p.trip.id)) return;
    if (p.access === 'revoked') return;
    const role = ['organizer', 'participant', 'viewer'].indexOf(p.role) >= 0 ? p.role : 'participant';
    const membership = p.access === 'invited' ? 'invited' : 'member';
    byId.set(p.trip.id, { trip: p.trip, roleInfo: { role: role, membership: membership } });
  });
  return Array.from(byId.values());
}

// ----------------------------------------------------------------- mappers
function tripStatus(s) {
  if (['draft', 'planned', 'active', 'finished'].indexOf(s) >= 0) return s;
  if (s === 'completed' || s === 'archived') return 'finished';
  return 'active';
}
function serializeTrip(trip, roleInfo) {
  const startDate = toDateOnly(trip.startDate) || toDateOnly(trip.createdAt) || '1970-01-01';
  const endDate = toDateOnly(trip.endDate) || startDate;
  return {
    id: trip.id,
    title: trip.title || 'Поездка',
    route: trip.route || '',
    date_start: startDate,
    date_end: endDate,
    timezone: 'Europe/Moscow',
    status: tripStatus(trip.status),
    role: roleInfo.role,
    membership_status: roleInfo.membership,
  };
}

const TYPE_MAP = {
  'самолёт': 'flight', 'самолет': 'flight', 'flight': 'flight', 'перелёт': 'flight', 'перелет': 'flight',
  'поезд': 'train', 'train': 'train',
  'автобус': 'bus', 'bus': 'bus',
  'трансфер': 'transfer', 'transfer': 'transfer', 'автомобиль': 'transfer', 'такси': 'transfer',
  'проживание': 'checkin', 'отель': 'checkin', 'заселение': 'checkin', 'checkin': 'checkin',
  'выселение': 'checkout', 'checkout': 'checkout',
  'активность': 'activity', 'экскурсия': 'activity', 'activity': 'activity',
};
function evType(t) { return TYPE_MAP[String(t || '').trim().toLowerCase()] || 'manual'; }
const EV_STATUS_MAP = {
  'черновик': 'scheduled', 'подтверждён': 'scheduled', 'подтвержден': 'scheduled', 'запланировано': 'scheduled',
  'требует проверки': 'changed', 'изменено': 'changed',
  'задержка': 'delayed', 'отменён': 'cancelled', 'отменен': 'cancelled', 'завершён': 'completed', 'завершен': 'completed',
};
function evStatus(s) { return EV_STATUS_MAP[String(s || '').trim().toLowerCase()] || 'scheduled'; }
function segTitle(s) {
  if (s.title) return String(s.title);
  if (s.departurePlace && s.arrivalPlace) return String(s.departurePlace) + ' → ' + String(s.arrivalPlace);
  if (s.from && s.to) return String(s.from) + ' → ' + String(s.to);
  return s.transportType || s.type ? String(s.transportType || s.type) : 'Событие';
}
function tripEvents(trip) {
  const segs = jsonParse(trip.segments, []);
  if (!Array.isArray(segs)) return [];
  return segs
    .map(function (s, i) {
      const starts = toIso(s.departureAt || s.startAt || s.start);
      return {
        id: String(s.id || ('seg-' + i)),
        trip_id: trip.id,
        type: evType(s.transportType || s.type),
        title: segTitle(s),
        starts_at: starts || toIso(trip.startDate) || new Date().toISOString(),
        ends_at: toIso(s.arrivalAt || s.endAt || s.end),
        departure_place: s.departurePlace || s.from || '',
        arrival_place: s.arrivalPlace || s.to || '',
        status: evStatus(s.status),
        note: s.note || s.ref || s.source || '',
        document_id: null,
        document_title: '',
        _order: (typeof s.order === 'number') ? s.order : i,
      };
    })
    .sort(function (a, b) {
      const da = new Date(a.starts_at).getTime();
      const db = new Date(b.starts_at).getTime();
      if (da !== db) return da - db;
      return a._order - b._order;
    })
    .map(function (e) { delete e._order; return e; });
}

function docVisibility(v) {
  if (v === 'personal') return 'personal';
  if (v === 'organizer' || v === 'organizer_only') return 'organizer_only';
  return 'all';
}
function serializeDoc(d) {
  return {
    id: d.id,
    trip_id: d.tripId,
    title: d.name || 'Документ',
    doc_type: d.type || 'документ',
    segment_title: d.segment || '',
    uploaded_at: toIso(d.uploadedAt) || new Date().toISOString(),
    visibility: docVisibility(d.visibility),
    owner_user_id: d.uploadedById || null,
    revoked: false,
    deleted: false,
  };
}
function canSeeDoc(d, roleInfo, userId) {
  const vis = docVisibility(d.visibility);
  if (roleInfo.role === 'organizer') return true;
  if (vis === 'all') return true;
  if (vis === 'personal') return d.uploadedById === userId;
  if (vis === 'organizer_only') return false;
  return true;
}

function serializeMsg(m) {
  return {
    id: m.id,
    trip_id: m.tripId,
    title: m.title || 'Сообщение',
    text: m.body || '',
    author_name: (m.author && m.author.name) || 'Организатор',
    created_at: toIso(m.createdAt) || new Date().toISOString(),
    segment_title: '',
    is_plan_b: !!m.planBLinked,
    audience: m.recipients || 'participants',
    status: m.status || 'published',
  };
}
function isPublishedMsg(m) {
  const k = String(m.kind || '').toLowerCase();
  const st = String(m.status || '').toLowerCase();
  if (k === 'draft') return false;
  if (st === 'draft') return false;
  return k === 'published' || k === 'sent' || st === 'published' || st === 'sent' || m.planBLinked;
}

const SOS_CATEGORIES = ['late', 'lost_document', 'transport', 'accommodation', 'need_help', 'other'];
const SOS_STATUS_MAP = {
  'new': 'new', 'новый': 'new', 'открыт': 'new', 'open': 'new',
  'in_review': 'in_review', 'на рассмотрении': 'in_review', 'in review': 'in_review', 'review': 'in_review',
  'resolved': 'resolved', 'решён': 'resolved', 'решен': 'resolved', 'closed': 'resolved',
  'rejected': 'rejected', 'отклонён': 'rejected', 'отклонен': 'rejected',
};
function sosStatus(s) { return SOS_STATUS_MAP[String(s || '').trim().toLowerCase()] || 'new'; }
function sosNumber(sig) { return sig.number || ('SOS-' + String(sig.id).slice(-6).toUpperCase()); }
function serializeSos(sig) {
  return {
    id: sig.id,
    number: sosNumber(sig),
    trip_id: sig.tripId,
    author_user_id: sig.authorId || '',
    category: SOS_CATEGORIES.indexOf(sig.category) >= 0 ? sig.category : 'other',
    description: sig.detail || sig.label || '',
    status: sosStatus(sig.status),
    created_at: toIso(sig.createdAt) || new Date().toISOString(),
    segment_id: sig.segment || null,
    segment_title: sig.segment || null,
  };
}
function isSosSignal(sig) {
  const src = String(sig.source || '').toLowerCase();
  return src.indexOf('sos') >= 0 || !!sig.number || SOS_CATEGORIES.indexOf(sig.category) >= 0;
}

// =================================================================
// SITE-FACING LINKING (JWT auth) — used by the website profile page
// =================================================================

// Create a one-time Telegram link token + deep link for the logged-in user.
router.post('/api/integrations/telegram/link-token', requireAuth, async (req, res) => {
  try {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + config.bot.linkTokenTtlMinutes * 60 * 1000);
    await prisma.telegramLinkToken.create({ data: { token: token, userId: req.user.id, expiresAt: expiresAt } });
    const username = config.bot.username;
    const deepLink = username ? ('https://t.me/' + username + '?start=link_' + token) : null;
    res.status(201).json({
      token: token,
      deep_link: deepLink,
      bot_username: username || null,
      expires_at: expiresAt.toISOString(),
      ttl_minutes: config.bot.linkTokenTtlMinutes,
    });
  } catch (e) {
    console.error('[bot/link-token]', e && e.message);
    res.status(500).json({ error: 'Не удалось создать ссылку привязки' });
  }
});

// Current Telegram link status for the logged-in user.
router.get('/api/integrations/telegram/status', requireAuth, async (req, res) => {
  try {
    const link = await prisma.telegramLink.findUnique({ where: { userId: req.user.id } });
    res.json({
      linked: !!link,
      telegram_user_id: link ? link.telegramUserId : null,
      linked_at: link ? link.createdAt : null,
      bot_username: config.bot.username || null,
    });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

// Unlink from the website side.
router.delete('/api/integrations/telegram/link', requireAuth, async (req, res) => {
  try {
    await prisma.telegramLink.deleteMany({ where: { userId: req.user.id } });
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

// =================================================================
// PUBLIC SIGNED DOWNLOAD — no auth header; opaque, expiring token
// =================================================================
router.get('/api/bot/documents/download/:token', async (req, res) => {
  const info = verifyFileToken(req.params.token);
  if (!info) return res.status(403).send('Ссылка недействительна или истекла');
  try {
    const doc = await prisma.document.findUnique({ where: { id: info.documentId }, include: { blob: true } });
    if (!doc || !doc.blob || !doc.blob.data) return res.status(404).send('Файл не найден');
    const buf = Buffer.from(doc.blob.data);
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    const fname = doc.name || 'document';
    const disp = (req.query.inline ? 'inline' : 'attachment');
    res.setHeader('Content-Disposition', disp + "; filename*=UTF-8''" + encodeURIComponent(fname));
    return res.send(buf);
  } catch (e) {
    console.error('[bot/download]', e && e.message);
    return res.status(500).send('Ошибка');
  }
});

// =================================================================
// LINKING (service token)
// =================================================================
router.post('/api/integrations/telegram/link-token/consume', requireService, async (req, res) => {
  const tgId = readTgId(req);
  if (!tgId) return fail(res, 'validation_error', 'Не передан заголовок X-Telegram-User-Id.');
  const token = req.body && req.body.token;
  if (!token || typeof token !== 'string') return fail(res, 'link_token_invalid');
  try {
    const row = await prisma.telegramLinkToken.findUnique({ where: { token: token }, include: { user: true } });
    if (!row || !row.user) return fail(res, 'link_token_invalid');
    if (row.usedAt) return fail(res, 'link_token_used');
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return fail(res, 'link_token_expired');

    // A telegram account can only map to one site user.
    const existingForTg = await prisma.telegramLink.findUnique({ where: { telegramUserId: tgId } });
    const relinked = !!existingForTg;
    if (existingForTg && existingForTg.userId !== row.userId) {
      // Re-point this Telegram to the new account (explicit user action via fresh token).
      await prisma.telegramLink.delete({ where: { telegramUserId: tgId } });
    }
    // Ensure the target site user is not linked to a different telegram id.
    await prisma.telegramLink.deleteMany({ where: { userId: row.userId, NOT: { telegramUserId: tgId } } });

    await prisma.telegramLink.upsert({
      where: { telegramUserId: tgId },
      update: { userId: row.userId },
      create: { telegramUserId: tgId, userId: row.userId },
    });
    await prisma.telegramLinkToken.update({ where: { token: token }, data: { usedAt: new Date() } });

    res.json({ site_user_id: row.userId, name: row.user.name || 'Пользователь', relinked: relinked });
  } catch (e) {
    console.error('[bot/consume]', e && e.message);
    return fail(res, 'internal_error');
  }
});

router.delete('/api/integrations/telegram', requireService, resolveUser, async (req, res) => {
  try {
    await prisma.telegramLink.delete({ where: { telegramUserId: req.tgId } });
  } catch (e) { /* already gone */ }
  res.status(204).end();
});

router.get('/api/bot/me', requireService, resolveUser, async (req, res) => {
  const u = req.siteUser;
  let activeTripId = req.link.activeTripId || null;
  if (activeTripId) {
    const ok = await loadAccessibleTrip(activeTripId, u.id);
    if (ok.error) activeTripId = null;
  }
  res.json({
    site_user_id: u.id,
    name: u.name || 'Пользователь',
    email: u.email || '',
    active_trip_id: activeTripId,
  });
});

// =================================================================
// TRIPS (service token + user)
// =================================================================
router.get('/api/bot/trips', requireService, resolveUser, async (req, res) => {
  const all = await accessibleTrips(req.siteUser.id);
  const items = all.filter(function (x) { return tripStatus(x.trip.status) !== 'finished'; })
    .map(function (x) { return serializeTrip(x.trip, x.roleInfo); });
  res.json(page(items));
});

router.get('/api/bot/trips/history', requireService, resolveUser, async (req, res) => {
  const all = await accessibleTrips(req.siteUser.id);
  const items = all.filter(function (x) { return tripStatus(x.trip.status) === 'finished'; })
    .map(function (x) { return serializeTrip(x.trip, x.roleInfo); });
  res.json(page(items));
});

router.get('/api/bot/trips/:tripId', requireService, resolveUser, async (req, res) => {
  const r = await loadAccessibleTrip(req.params.tripId, req.siteUser.id);
  if (r.error) return fail(res, r.error);
  res.json(serializeTrip(r.trip, r.roleInfo));
});

router.post('/api/bot/trips/:tripId/select-active', requireService, resolveUser, async (req, res) => {
  const r = await loadAccessibleTrip(req.params.tripId, req.siteUser.id);
  if (r.error) return fail(res, r.error);
  if (r.roleInfo.role === 'viewer') return fail(res, 'access_denied');
  await prisma.telegramLink.update({ where: { telegramUserId: req.tgId }, data: { activeTripId: r.trip.id } });
  res.status(204).end();
});

router.get('/api/bot/trips/:tripId/today', requireService, resolveUser, async (req, res) => {
  const r = await loadAccessibleTrip(req.params.tripId, req.siteUser.id);
  if (r.error) return fail(res, r.error);
  const tz = 'Europe/Moscow';
  const today = ymdInTz(new Date(), tz);
  const items = tripEvents(r.trip).filter(function (e) { return ymdInTz(e.starts_at, tz) === today; });
  res.json({ items: items });
});

router.get('/api/bot/trips/:tripId/next', requireService, resolveUser, async (req, res) => {
  const r = await loadAccessibleTrip(req.params.tripId, req.siteUser.id);
  if (r.error) return fail(res, r.error);
  const now = Date.now();
  const upcoming = tripEvents(r.trip).filter(function (e) { return new Date(e.starts_at).getTime() >= now; });
  res.json({ event: upcoming.length ? upcoming[0] : null });
});

// =================================================================
// DOCUMENTS
// =================================================================
router.get('/api/bot/trips/:tripId/documents', requireService, resolveUser, async (req, res) => {
  const r = await loadAccessibleTrip(req.params.tripId, req.siteUser.id);
  if (r.error) return fail(res, r.error);
  const docs = await prisma.document.findMany({
    where: { tripId: r.trip.id },
    orderBy: { uploadedAt: 'desc' },
    include: { blob: { select: { id: true } } },
  });
  const items = docs.filter(function (d) { return d.blob && canSeeDoc(d, r.roleInfo, req.siteUser.id); })
    .map(serializeDoc);
  res.json(page(items));
});

router.post('/api/bot/documents/:documentId/temporary-link', requireService, resolveUser, async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.documentId },
      include: { blob: { select: { id: true } } },
    });
    if (!doc) return fail(res, 'not_found');
    const r = await loadAccessibleTrip(doc.tripId, req.siteUser.id);
    if (r.error) return fail(res, r.error);
    if (!canSeeDoc(doc, r.roleInfo, req.siteUser.id)) return fail(res, 'access_denied');
    if (!doc.blob) return fail(res, 'not_found', 'Файл документа не сохранён.');
    const token = makeFileToken(doc.id, req.tgId);
    const url = config.publicBaseUrl + '/api/bot/documents/download/' + token;
    res.json({ url: url, filename: doc.name || 'document', title: doc.name || 'Документ поездки' });
  } catch (e) {
    console.error('[bot/temporary-link]', e && e.message);
    return fail(res, 'internal_error');
  }
});

// =================================================================
// MESSAGES
// =================================================================
router.get('/api/bot/trips/:tripId/messages', requireService, resolveUser, async (req, res) => {
  const r = await loadAccessibleTrip(req.params.tripId, req.siteUser.id);
  if (r.error) return fail(res, r.error);
  const msgs = await prisma.message.findMany({
    where: { tripId: r.trip.id },
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { name: true } } },
  });
  const items = msgs.filter(isPublishedMsg).map(serializeMsg);
  res.json(page(items));
});

// =================================================================
// SOS
// =================================================================
router.post('/api/bot/trips/:tripId/sos', requireService, resolveUser, async (req, res) => {
  const r = await loadAccessibleTrip(req.params.tripId, req.siteUser.id);
  if (r.error) return fail(res, r.error);
  if (r.roleInfo.role === 'viewer') return fail(res, 'access_denied');
  const idempotencyKey = req.headers['idempotency-key'];
  if (!idempotencyKey || String(idempotencyKey).length < 16) {
    return fail(res, 'validation_error', 'Требуется заголовок Idempotency-Key (>= 16 символов).');
  }
  const b = req.body || {};
  if (!b.description || typeof b.description !== 'string' || b.description.trim() === '') {
    return fail(res, 'validation_error', 'Опишите проблему.');
  }
  const category = SOS_CATEGORIES.indexOf(b.category) >= 0 ? b.category : 'other';
  try {
    const existing = await prisma.monitoringSignal.findUnique({ where: { idempotencyKey: String(idempotencyKey) } });
    if (existing) return res.status(201).json(serializeSos(existing));

    const count = await prisma.monitoringSignal.count({ where: { tripId: r.trip.id } });
    const number = 'SOS-' + String(count + 1).padStart(3, '0');
    const sig = await prisma.$transaction(async function (tx) {
      const created = await tx.monitoringSignal.create({ data: {
        tripId: r.trip.id,
        label: 'SOS: ' + category,
        status: 'new',
        severity: 'high',
        segment: b.segment_id || null,
        source: 'sos-telegram',
        detail: b.description.trim(),
        authorId: req.siteUser.id,
        number: number,
        category: category,
        idempotencyKey: String(idempotencyKey),
      } });
      await tripChanges.recordCustomChangeEvent(tx, {
        tripId: r.trip.id,
        actorId: req.siteUser.id,
        tripTitle: r.trip.title,
        type: 'sos_created',
        newValue: { sosId: created.id, number: number, category: category, status: 'new' },
        whatChanged: (req.siteUser.name || 'Участник') + ': ' + b.description.trim().slice(0, 180),
        deepLinkTarget: 'sos',
      });
      return created;
    });
    res.status(201).json(serializeSos(sig));
  } catch (e) {
    // Unique-constraint race on idempotency key -> return the stored one.
    if (e && e.code === 'P2002') {
      const existing = await prisma.monitoringSignal.findUnique({ where: { idempotencyKey: String(idempotencyKey) } });
      if (existing) return res.status(201).json(serializeSos(existing));
    }
    console.error('[bot/sos]', e && e.message);
    return fail(res, 'internal_error');
  }
});

router.get('/api/bot/trips/:tripId/sos/mine', requireService, resolveUser, async (req, res) => {
  const r = await loadAccessibleTrip(req.params.tripId, req.siteUser.id);
  if (r.error) return fail(res, r.error);
  const sigs = await prisma.monitoringSignal.findMany({
    where: { tripId: r.trip.id, authorId: req.siteUser.id },
    orderBy: { createdAt: 'desc' },
  });
  const items = sigs.filter(isSosSignal).map(serializeSos);
  res.json(page(items));
});

router.get('/api/bot/sos/:sosId', requireService, resolveUser, async (req, res) => {
  const sig = await prisma.monitoringSignal.findUnique({ where: { id: req.params.sosId } });
  if (!sig || !isSosSignal(sig)) return fail(res, 'not_found');
  if (sig.authorId !== req.siteUser.id) return fail(res, 'access_denied');
  res.json(serializeSos(sig));
});

// =================================================================
// NOTIFICATION PREFERENCES
// =================================================================
router.get('/api/bot/notification-preferences', requireService, resolveUser, async (req, res) => {
  res.json(botNotify.parsePrefs(req.siteUser.notifyPrefs));
});

router.patch('/api/bot/notification-preferences', requireService, resolveUser, async (req, res) => {
  const current = botNotify.parsePrefs(req.siteUser.notifyPrefs);
  const patch = req.body || {};
  const allowed = Object.keys(botNotify.NOTIF_DEFAULTS);
  const next = Object.assign({}, current);
  let touched = 0;
  allowed.forEach(function (k) { if (patch[k] !== undefined) { next[k] = patch[k]; touched++; } });
  if (!touched) return fail(res, 'validation_error', 'Нет полей для обновления.');
  await prisma.user.update({ where: { id: req.siteUser.id }, data: { notifyPrefs: JSON.stringify(next) } });
  res.json(next);
});

// =================================================================
// NOTIFICATION QUEUE (service role only — no per-user header)
// =================================================================
router.get('/api/bot/notifications/pending', requireService, async (req, res) => {
  let limit = parseInt(req.query.limit, 10);
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;
  const rows = await prisma.telegramNotification.findMany({
    where: { status: 'pending' },
    orderBy: { occurredAt: 'asc' },
    take: limit,
  });
  const items = rows.map(function (n) {
    return {
      id: n.id,
      event_id: n.eventId,
      type: n.type,
      recipient_telegram_id: Number(n.telegramUserId),
      trip_id: n.tripId || null,
      trip_title: n.tripTitle || '',
      title: n.title || null,
      what_changed: n.whatChanged || '',
      old_value: n.oldValue || null,
      new_value: n.newValue || null,
      occurred_at: toIso(n.occurredAt) || new Date().toISOString(),
      source: n.source || 'backend',
      sos_id: n.sosId || null,
      deep_link_target: n.deepLinkTarget || 'trip',
    };
  });
  res.json(page(items));
});

router.post('/api/bot/notifications/:notificationId/delivered', requireService, async (req, res) => {
  try {
    await prisma.telegramNotification.update({
      where: { id: req.params.notificationId },
      data: { status: 'delivered', deliveredAt: new Date() },
    });
  } catch (e) { /* already handled / gone -> idempotent 204 */ }
  res.status(204).end();
});

router.post('/api/bot/notifications/:notificationId/failed', requireService, async (req, res) => {
  const reason = (req.body && req.body.reason) ? String(req.body.reason).slice(0, 500) : '';
  try {
    const n = await prisma.telegramNotification.findUnique({ where: { id: req.params.notificationId } });
    if (n) {
      await prisma.telegramNotification.update({
        where: { id: n.id },
        data: { status: 'failed', attempts: (n.attempts || 0) + 1, lastError: reason },
      });
    }
  } catch (e) { /* idempotent */ }
  res.status(204).end();
});

// =================================================================
// ASSISTANT CONTEXT
// =================================================================
router.get('/api/bot/trips/:tripId/assistant-context', requireService, resolveUser, async (req, res) => {
  const r = await loadAccessibleTrip(req.params.tripId, req.siteUser.id);
  if (r.error) return fail(res, r.error);
  const [docs, msgs, sigs, context] = await Promise.all([
    prisma.document.findMany({ where: { tripId: r.trip.id }, orderBy: { uploadedAt: 'desc' }, include: { blob: { select: { id: true } } } }),
    prisma.message.findMany({ where: { tripId: r.trip.id }, orderBy: { createdAt: 'desc' }, include: { author: { select: { name: true } } } }),
    prisma.monitoringSignal.findMany({ where: { tripId: r.trip.id, authorId: req.siteUser.id }, orderBy: { createdAt: 'desc' } }),
    assistant.buildTripContextData(r.trip.id),
  ]);
  res.json({
    trip: serializeTrip(r.trip, r.roleInfo),
    events: tripEvents(r.trip),
    documents: docs.filter(function (d) { return d.blob && canSeeDoc(d, r.roleInfo, req.siteUser.id); }).map(serializeDoc),
    messages: msgs.filter(isPublishedMsg).map(serializeMsg),
    own_sos: sigs.filter(isSosSignal).map(serializeSos),
    participants: context ? context.participants : [],
    monitoring: context ? context.monitoring : [],
    risks: context ? context.risks : [],
    plans: context ? context.plans : [],
    selected_plan: context ? context.selectedPlan : null,
    next_event: context ? context.nextEvent : null,
    next_flight: context ? context.nextFlight : null,
    boarding: context ? context.boarding : null,
    weather: context ? context.weather : [],
    updated_at: context ? context.trip.updatedAt : r.trip.updatedAt,
    recent_changes: context ? context.recentChanges : [],
  });
});

module.exports = router;

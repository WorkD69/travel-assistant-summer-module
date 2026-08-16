// Enqueues Telegram notifications for linked trip members.
// Site events (new document, published message / Plan B, SOS) call enqueue();
// the bot polls GET /api/bot/notifications/pending and delivers them.
// Every call is best-effort and never throws into the caller's request flow.
const prisma = require('../db');

const NOTIF_DEFAULTS = {
  segment_reminders: true,
  time_changes: true,
  departure_changes: true,
  delays_cancellations: true,
  transfer_changes: true,
  hotel_changes: true,
  new_documents: true,
  invitations: true,
  own_sos: true,
  violations: true,
  plan_b: true,
  organizer_messages: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '23:00',
  quiet_hours_end: '08:00',
  timezone: 'Europe/Moscow',
};

// Which preference toggle gates which notification type.
const PREF_BY_TYPE = {
  route_changed: 'departure_changes',
  dates_changed: 'time_changes',
  segments_changed: 'transfer_changes',
  event_changed: 'segment_reminders',
  participant_changed: 'invitations',
  document_added: 'new_documents',
  plan_b_created: 'plan_b',
  plan_b_applied: 'plan_b',
  risk_detected: 'delays_cancellations',
  sos_created: 'own_sos',
  sos_status_changed: 'own_sos',
  new_document: 'new_documents',
  organizer_message: 'organizer_messages',
  plan_b_published: 'plan_b',
  sos_received: 'own_sos',
  sos_status_change: 'own_sos',
  trip_invitation: 'invitations',
  violation_confirmed: 'violations',
};

function parsePrefs(raw) {
  let obj = {};
  if (raw && typeof raw === 'string') { try { obj = JSON.parse(raw); } catch (e) { obj = {}; } }
  else if (raw && typeof raw === 'object') { obj = raw; }
  return Object.assign({}, NOTIF_DEFAULTS, obj || {});
}

async function linkedMembers(db, tripId) {
  const trip = await db.trip.findUnique({ where: { id: tripId }, include: { participants: true } });
  if (!trip) return [];
  const userIds = new Set();
  if (trip.ownerId) userIds.add(trip.ownerId);
  (trip.participants || []).forEach(function (p) {
    if (p.userId && p.access !== 'revoked') userIds.add(p.userId);
  });
  if (!userIds.size) return [];
  const links = await db.telegramLink.findMany({
    where: { userId: { in: Array.from(userIds) } },
    include: { user: true },
  });
  return links.map(function (l) {
    return {
      userId: l.userId,
      telegramUserId: l.telegramUserId,
      prefs: parsePrefs(l.user && l.user.notifyPrefs),
    };
  });
}

function uid() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/**
 * Enqueue a notification for the linked members of a trip.
 * opts: { tripId, type, tripTitle?, title?, whatChanged?, oldValue?, newValue?,
 *         deepLinkTarget?, sosId?, onlyUserId?, excludeUserId? }
 */
async function enqueueWith(db, opts) {
    if (!opts || !opts.tripId || !opts.type) return 0;
    const members = await linkedMembers(db, opts.tripId);
    if (!members.length) return;
    const prefKey = PREF_BY_TYPE[opts.type];
    const data = [];
    for (const m of members) {
      if (opts.onlyUserId && m.userId !== opts.onlyUserId) continue;
      if (opts.excludeUserId && m.userId === opts.excludeUserId) continue;
      if (prefKey && m.prefs[prefKey] === false) continue;
      data.push({
        eventId: opts.type + ':' + (opts.sosId || opts.tripId) + ':' + m.telegramUserId + ':' + uid(),
        type: opts.type,
        telegramUserId: m.telegramUserId,
        tripId: opts.tripId,
        tripTitle: opts.tripTitle || null,
        title: opts.title || null,
        whatChanged: opts.whatChanged || '',
        oldValue: opts.oldValue || null,
        newValue: opts.newValue || null,
        sosId: opts.sosId || null,
        deepLinkTarget: opts.deepLinkTarget || 'trip',
        source: 'backend',
      });
    }
    if (data.length) await db.telegramNotification.createMany({ data: data });
    return data.length;
}

async function enqueueInTransaction(tx, opts) {
  return enqueueWith(tx, opts);
}

async function enqueue(opts) {
  try {
    return await enqueueWith(prisma, opts);
  } catch (e) {
    console.warn('[botNotify] enqueue failed:', e && e.message ? e.message : e);
    return 0;
  }
}

module.exports = { enqueue, enqueueInTransaction, parsePrefs, NOTIF_DEFAULTS };

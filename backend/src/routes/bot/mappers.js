function iso(value) {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function dateOnly(value) {
  return iso(value).slice(0, 10);
}

function mapBotUser(user) {
  return {
    site_user_id: user.id,
    name: user.name,
    email: user.email || '',
    active_trip_id: user.botState?.activeTripId || null,
  };
}

function mapTrip(trip) {
  const membership = trip.membership || trip.participants?.[0];
  const role = membership?.role || (trip.ownerId && trip.siteUserId === trip.ownerId ? 'organizer' : 'participant');
  const status = { completed: 'finished' }[trip.status] || trip.status || 'planned';
  const membershipStatus = { active: 'member', pending: 'invited' }[membership?.status] || membership?.status || 'member';
  return {
    id: trip.id,
    title: trip.title,
    route: trip.route || '',
    date_start: dateOnly(trip.startDate || trip.createdAt),
    date_end: dateOnly(trip.endDate || trip.startDate || trip.createdAt),
    timezone: trip.timezone || 'Europe/Moscow',
    status,
    role,
    membership_status: membershipStatus,
  };
}

function mapEvent(event) {
  return {
    id: event.id,
    trip_id: event.tripId,
    type: event.type,
    title: event.title,
    starts_at: iso(event.startsAt),
    ends_at: event.endsAt ? iso(event.endsAt) : null,
    departure_place: event.departure || '',
    arrival_place: event.arrival || '',
    status: event.status || 'scheduled',
    note: event.detail || '',
    document_id: event.documentId || null,
    document_title: event.document?.name || '',
  };
}

function mapDocument(document) {
  return {
    id: document.id,
    trip_id: document.tripId,
    title: document.name,
    doc_type: document.type || 'документ',
    segment_title: document.segment || '',
    uploaded_at: iso(document.createdAt),
    visibility: document.visibility === 'shared' ? 'all' : document.visibility,
    owner_user_id: document.ownerUserId || null,
    revoked: document.status === 'revoked' || Boolean(document.revokedAt),
    deleted: document.status === 'deleted' || Boolean(document.deletedAt),
  };
}

function audienceValue(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(',');
  return 'participants';
}

function mapMessage(message) {
  return {
    id: message.id,
    trip_id: message.tripId,
    title: message.title || '',
    text: message.content,
    author_name: message.author?.name || '',
    created_at: iso(message.publishedAt || message.createdAt),
    segment_title: message.segment || '',
    is_plan_b: Boolean(message.planId),
    audience: audienceValue(message.audience),
    status: message.status || 'published',
  };
}

function mapSos(ticket) {
  return {
    id: ticket.id,
    number: ticket.number,
    trip_id: ticket.tripId,
    author_user_id: ticket.authorUserId,
    category: ticket.category,
    description: ticket.description,
    status: { open: 'new', acknowledged: 'in_review' }[ticket.status] || ticket.status,
    created_at: iso(ticket.createdAt),
    segment_id: ticket.segmentId || null,
    segment_title: ticket.segmentTitle || ticket.segment || null,
  };
}

const PREFERENCE_FIELDS = [
  ['segment_reminders', 'segmentReminders', true],
  ['time_changes', 'timeChanges', true],
  ['departure_changes', 'departureChanges', true],
  ['delays_cancellations', 'delaysCancellations', true],
  ['transfer_changes', 'transferChanges', true],
  ['hotel_changes', 'hotelChanges', true],
  ['new_documents', 'newDocuments', true],
  ['invitations', 'invitations', true],
  ['own_sos', 'ownSos', true],
  ['violations', 'violations', true],
  ['plan_b', 'planB', true],
  ['organizer_messages', 'organizerMessages', true],
  ['quiet_hours_enabled', 'quietHoursEnabled', false],
  ['quiet_hours_start', 'quietHoursStart', '23:00'],
  ['quiet_hours_end', 'quietHoursEnd', '08:00'],
  ['timezone', 'timezone', 'Europe/Moscow'],
];

function mapNotificationPreferences(preferences = {}) {
  return Object.fromEntries(PREFERENCE_FIELDS.map(([apiName, dbName, fallback]) => [
    apiName,
    preferences[dbName] ?? fallback,
  ]));
}

function mapNotificationEvent(event) {
  const telegramId = Number(event.recipientTelegramId);
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
    throw new Error('recipientTelegramId must be a positive safe integer');
  }
  const payload = event.payload || {};
  return {
    id: event.id,
    event_id: event.eventId,
    type: event.type,
    recipient_telegram_id: telegramId,
    trip_id: event.tripId || null,
    trip_title: payload.trip_title ?? payload.tripTitle ?? '',
    title: payload.title ?? null,
    what_changed: payload.what_changed ?? payload.whatChanged ?? '',
    old_value: payload.old_value ?? payload.oldValue ?? null,
    new_value: payload.new_value ?? payload.newValue ?? null,
    occurred_at: iso(payload.occurred_at ?? payload.occurredAt ?? event.createdAt),
    source: payload.source || 'backend',
    sos_id: payload.sos_id ?? payload.sosId ?? null,
    deep_link_target: payload.deep_link_target ?? payload.deepLinkTarget ?? 'trip',
  };
}

function mapAssistantContext(context) {
  return {
    trip: mapTrip(context.trip),
    events: context.events.map(mapEvent),
    documents: context.documents.map(mapDocument),
    messages: context.messages.map(mapMessage),
    own_sos: context.ownSos.map(mapSos),
    recent_changes: [...context.recentChanges],
  };
}

module.exports = {
  mapAssistantContext,
  mapBotUser,
  mapDocument,
  mapEvent,
  mapMessage,
  mapNotificationEvent,
  mapNotificationPreferences,
  mapSos,
  mapTrip,
};

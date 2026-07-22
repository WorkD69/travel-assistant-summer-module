const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  mapAssistantContext,
  mapBotUser,
  mapDocument,
  mapEvent,
  mapMessage,
  mapNotificationEvent,
  mapNotificationPreferences,
  mapSos,
  mapTrip,
} = require('../src/routes/bot/mappers');
const { decodeCursor, encodeCursor, pageResult } = require('../src/pagination');
const { botErrorCode } = require('../src/errors');

const at = (value) => new Date(value);

describe('Telegram Bot API contract mappers', () => {
  test('maps user and trip records to exact bot field names and enums', () => {
    assert.deepEqual(
      mapBotUser({ id: 'u-1', name: 'Anna', email: 'a@example.test', botState: { activeTripId: 't-1' } }),
      { site_user_id: 'u-1', name: 'Anna', email: 'a@example.test', active_trip_id: 't-1' },
    );

    const mapped = mapTrip({
      id: 't-1',
      title: 'Turkey',
      route: null,
      startDate: at('2026-08-01T00:00:00Z'),
      endDate: at('2026-08-08T00:00:00Z'),
      timezone: 'Europe/Moscow',
      status: 'completed',
      membership: { role: 'viewer', status: 'active' },
      ownerId: 'u-owner',
    });

    assert.deepEqual(mapped, {
      id: 't-1',
      title: 'Turkey',
      route: '',
      date_start: '2026-08-01',
      date_end: '2026-08-08',
      timezone: 'Europe/Moscow',
      status: 'finished',
      role: 'viewer',
      membership_status: 'member',
    });
    assert.equal('ownerId' in mapped, false);
  });

  test('maps events and documents without leaking extracted content or blob metadata', () => {
    assert.deepEqual(
      mapEvent({
        id: 'e-1', tripId: 't-1', type: 'flight', title: 'SU 100',
        startsAt: at('2026-08-01T10:00:00Z'), endsAt: null,
        departure: 'SVO', arrival: 'AYT', status: 'changed', detail: null,
        documentId: 'd-1', document: { name: 'Ticket' },
      }),
      {
        id: 'e-1', trip_id: 't-1', type: 'flight', title: 'SU 100',
        starts_at: '2026-08-01T10:00:00.000Z', ends_at: null,
        departure_place: 'SVO', arrival_place: 'AYT', status: 'changed', note: '',
        document_id: 'd-1', document_title: 'Ticket',
      },
    );

    const document = mapDocument({
      id: 'd-1', tripId: 't-1', name: 'Ticket', type: 'ticket', segment: null,
      createdAt: at('2026-07-20T10:00:00Z'), visibility: 'shared', ownerUserId: 'u-1',
      status: 'confirmed', extractedText: 'secret', blob: { sha256: 'secret' },
    });
    assert.deepEqual(document, {
      id: 'd-1', trip_id: 't-1', title: 'Ticket', doc_type: 'ticket', segment_title: '',
      uploaded_at: '2026-07-20T10:00:00.000Z', visibility: 'all', owner_user_id: 'u-1',
      revoked: false, deleted: false,
    });
    assert.equal('extractedText' in document, false);
  });

  test('maps internal event types into the immutable Telegram enum', () => {
    const base = {
      id: 'e-hotel', tripId: 't-1', title: 'Hotel check-in',
      startsAt: at('2026-08-01T10:00:00Z'), endsAt: null,
      departure: null, arrival: null, status: 'scheduled', detail: null,
      documentId: null, document: null,
    };
    assert.equal(mapEvent({ ...base, type: 'hotel' }).type, 'checkin');
    assert.equal(mapEvent({ ...base, type: 'custom-provider-event' }).type, 'manual');
  });

  test('maps organizer messages and SOS statuses', () => {
    assert.deepEqual(
      mapMessage({
        id: 'm-1', tripId: 't-1', title: null, content: 'Changed',
        author: { name: 'Artem' }, publishedAt: at('2026-07-22T12:00:00Z'),
        planId: 'p-1', audience: 'all', status: 'published',
      }),
      {
        id: 'm-1', trip_id: 't-1', title: '', text: 'Changed', author_name: 'Artem',
        created_at: '2026-07-22T12:00:00.000Z', segment_title: '', is_plan_b: true,
        audience: 'all', status: 'published',
      },
    );

    assert.equal(mapSos({
      id: 's-1', number: 'SOS-1', tripId: 't-1', authorUserId: 'u-1', category: 'late',
      description: 'Late', status: 'acknowledged', createdAt: at('2026-07-22T12:00:00Z'), segment: null,
    }).status, 'in_review');
  });

  test('maps all explicit notification preferences with safe defaults', () => {
    assert.deepEqual(mapNotificationPreferences({ organizerMessages: false, timezone: 'UTC' }), {
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
      organizer_messages: false,
      quiet_hours_enabled: false,
      quiet_hours_start: '23:00',
      quiet_hours_end: '08:00',
      timezone: 'UTC',
    });
  });

  test('maps notification outbox payload and validates Telegram integer safety', () => {
    const mapped = mapNotificationEvent({
      id: 'n-1', eventId: 'evt-1', type: 'plan_b_published', recipientTelegramId: '123456789',
      tripId: 't-1', createdAt: at('2026-07-22T12:00:00Z'),
      payload: { trip_title: 'Turkey', title: 'Plan B', what_changed: 'Published', source: 'backend', deep_link_target: 'messages' },
    });
    assert.equal(mapped.recipient_telegram_id, 123456789);
    assert.equal(mapped.deep_link_target, 'messages');
    assert.throws(() => mapNotificationEvent({ ...mapped, recipientTelegramId: '9007199254740992', payload: {} }), /safe integer/i);
  });

  test('builds assistant context only from already-authorized records', () => {
    const context = mapAssistantContext({
      trip: {
        id: 't-1', title: 'Trip', route: '', startDate: at('2026-08-01'), endDate: at('2026-08-02'),
        timezone: 'UTC', status: 'active', membership: { role: 'participant', status: 'active' },
      },
      events: [], documents: [], messages: [], ownSos: [], recentChanges: ['Gate changed'],
    });
    assert.equal(context.trip.id, 't-1');
    assert.deepEqual(context.recent_changes, ['Gate changed']);
  });
});

describe('cursor pagination and bot error codes', () => {
  test('round-trips opaque cursors and rejects malformed values', () => {
    const cursor = encodeCursor({ createdAt: '2026-07-22T12:00:00.000Z', id: 'x' });
    assert.deepEqual(decodeCursor(cursor), { createdAt: '2026-07-22T12:00:00.000Z', id: 'x' });
    assert.throws(() => decodeCursor('not-a-cursor'), (error) => error.code === 'invalid_cursor');
  });

  test('returns one extra fetched row as next_cursor', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    assert.deepEqual(pageResult(rows, 2, (row) => row.id), {
      items: [{ id: 'a' }, { id: 'b' }],
      next_cursor: encodeCursor('b'),
    });
  });

  test('normalizes internal failures to OpenAPI error codes', () => {
    assert.equal(botErrorCode('trip_not_found'), 'not_found');
    assert.equal(botErrorCode('invalid_telegram_user_id'), 'validation_error');
    assert.equal(botErrorCode('service_unauthorized'), 'access_denied');
    assert.equal(botErrorCode('unexpected_db_error'), 'internal_error');
    assert.equal(botErrorCode('rate_limited'), 'rate_limited');
  });
});

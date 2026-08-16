const assert = require('node:assert/strict');
const test = require('node:test');

const { createTripFactory } = require('../src/services/tripFactory');

function option(id) {
  return {
    schemaVersion: '1', id: id || 'to_offer_one', transportType: 'train',
    segments: [
      {
        id: 'ts_1', transportType: 'train', departurePlace: 'Москва', arrivalPlace: 'Тверь',
        departureAt: '2026-08-20T10:00:00+03:00', arrivalAt: '2026-08-20T12:00:00+03:00',
        serviceNumber: '001А', carrierName: 'РЖД',
      },
      {
        id: 'ts_2', transportType: 'train', departurePlace: 'Тверь', arrivalPlace: 'Санкт-Петербург',
        departureAt: '2026-08-20T13:00:00+03:00', arrivalAt: '2026-08-20T18:00:00+03:00',
        serviceNumber: '003А', carrierName: 'РЖД',
      },
    ],
    price: { amount: 5978.14, currency: 'RUB', kind: 'unknown' }, availability: null,
    transferCount: 1, durationMinutes: 480,
    source: { provider: 'tutu-mcp', tool: 'search_rail', serverVersion: '0.38.0' },
    fetchedAt: '2026-08-16T10:00:00.000Z',
  };
}

function fakePrisma() {
  const records = new Map();
  const db = {
    trip: {
      async findUnique(query) { return records.get(query.where.id) || null; },
      async create(query) {
        await Promise.resolve();
        if (records.has(query.data.id)) {
          const error = new Error('unique'); error.code = 'P2002'; throw error;
        }
        const record = Object.assign({}, query.data, {
          participants: query.data.participants.create,
        });
        delete record.participants.create;
        records.set(record.id, record);
        return record;
      },
    },
    async $transaction(callback) { return callback(db); },
  };
  return { db: db, records: records };
}

const user = { id: 'user-1', name: 'Иван Иванов', initials: 'ИИ', telegram: null };
const key = 'purchase-attempt-0001';

test('maps a selected TransportOptionV1 to the existing canonical Trip model', async () => {
  const fake = fakePrisma();
  const factory = createTripFactory({ prisma: fake.db });

  const result = await factory.createFromSelection({ user: user, idempotencyKey: key, option: option() });

  assert.equal(result.created, true);
  assert.match(result.trip.id, /^tutu_[a-f0-9]{40}$/);
  assert.equal(result.trip.title, 'Москва → Санкт-Петербург');
  assert.equal(result.trip.route, 'Москва → Тверь → Санкт-Петербург');
  assert.equal(result.trip.startDate.toISOString(), '2026-08-20T07:00:00.000Z');
  assert.equal(result.trip.endDate.toISOString(), '2026-08-20T15:00:00.000Z');
  assert.equal(result.trip.status, 'active');
  assert.equal(result.trip.type, 'solo');
  assert.equal(result.trip.ownerId, 'user-1');
  assert.deepEqual(JSON.parse(result.trip.segments)[0], {
    id: 'ts_1', transportType: 'train', departurePlace: 'Москва', arrivalPlace: 'Тверь',
    departureAt: '2026-08-20T10:00:00+03:00', arrivalAt: '2026-08-20T12:00:00+03:00',
    serviceNumber: '001А', carrierName: 'РЖД', order: 0,
    transportOptionId: 'to_offer_one', source: 'tutu-mcp', fetchedAt: '2026-08-16T10:00:00.000Z',
  });
  assert.equal(result.trip.participants[0].role, 'organizer');
  assert.equal(result.trip.participants[0].userId, 'user-1');
});

test('same user, key, and option replays the existing Trip', async () => {
  const fake = fakePrisma();
  const factory = createTripFactory({ prisma: fake.db });
  const first = await factory.createFromSelection({ user: user, idempotencyKey: key, option: option() });
  const replay = await factory.createFromSelection({ user: user, idempotencyKey: key, option: option() });
  assert.equal(replay.created, false);
  assert.equal(replay.trip.id, first.trip.id);
  assert.equal(fake.records.size, 1);
});

test('same user and key with a different option returns a conflict and creates no second Trip', async () => {
  const fake = fakePrisma();
  const factory = createTripFactory({ prisma: fake.db });
  await factory.createFromSelection({ user: user, idempotencyKey: key, option: option() });
  await assert.rejects(factory.createFromSelection({
    user: user, idempotencyKey: key, option: option('to_different_offer'),
  }), function (error) {
    return error && error.code === 'IDEMPOTENCY_KEY_REUSE' && error.status === 409;
  });
  assert.equal(fake.records.size, 1);
});

test('concurrent same-key attempts converge on one Trip', async () => {
  const fake = fakePrisma();
  const factory = createTripFactory({ prisma: fake.db });
  const results = await Promise.all([
    factory.createFromSelection({ user: user, idempotencyKey: key, option: option() }),
    factory.createFromSelection({ user: user, idempotencyKey: key, option: option() }),
  ]);
  assert.deepEqual(results.map(function (result) { return result.created; }).sort(), [false, true]);
  assert.equal(results[0].trip.id, results[1].trip.id);
  assert.equal(fake.records.size, 1);
});

test('requires an idempotency key between 16 and 128 characters', async () => {
  const factory = createTripFactory({ prisma: fakePrisma().db });
  await assert.rejects(factory.createFromSelection({ user: user, idempotencyKey: 'short', option: option() }), function (error) {
    return error && error.code === 'IDEMPOTENCY_KEY_INVALID' && error.status === 400;
  });
});

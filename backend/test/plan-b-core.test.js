'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DISRUPTION_SOURCE,
  createPlanBService,
  deriveRecoverySearch,
  fastestCandidate,
  cheapestCandidate,
  personalizedCandidate,
  impactForOption,
  sameScheduledOption,
} = require('../src/services/planB');

function option(id, departureAt, arrivalAt, price, segments) {
  const optionSegments = segments || [{
    id: id + '-segment',
    transportType: 'flight',
    departurePlace: 'SVO',
    arrivalPlace: 'LED',
    departureAt: departureAt,
    arrivalAt: arrivalAt,
    serviceNumber: id,
    carrierName: 'Carrier',
  }];
  return {
    schemaVersion: '1',
    id: id,
    transportType: optionSegments.length === 1 ? optionSegments[0].transportType : 'mixed',
    segments: optionSegments,
    price: price,
    availability: null,
    transferCount: optionSegments.length - 1,
    durationMinutes: Math.round((new Date(optionSegments[optionSegments.length - 1].arrivalAt) - new Date(optionSegments[0].departureAt)) / 60000),
    source: { provider: 'tutu-mcp', tool: 'search_avia', serverVersion: 'test' },
    fetchedAt: '2026-08-17T08:00:00.000Z',
  };
}

function canonicalTrip() {
  const original = option('SU100', '2026-08-20T08:00:00+03:00', '2026-08-20T09:30:00+03:00', { amount: 7000, currency: 'RUB', kind: 'unknown' });
  return {
    id: 'trip-a',
    title: 'Москва → Санкт-Петербург',
    route: 'SVO → LED',
    segments: JSON.stringify(original.segments.map(function (segment, index) {
      return Object.assign({}, segment, {
        order: index,
        transportOptionId: original.id,
        source: 'tutu-mcp',
        fetchedAt: original.fetchedAt,
      });
    })),
    startDate: new Date('2026-08-20T08:00:00+03:00'),
    endDate: new Date('2026-08-20T09:30:00+03:00'),
    status: 'active',
    type: 'solo',
    ownerId: 'owner-a',
    participants: [],
  };
}

function fakePrisma() {
  const signals = [];
  const changes = [];
  const tx = {
    monitoringSignal: {
      async updateMany(input) {
        signals.forEach(function (signal) {
          if (signal.tripId === input.where.tripId && signal.category === input.where.category &&
              signal.source === input.where.source && signal.status === input.where.status) {
            Object.assign(signal, input.data);
          }
        });
        return { count: 0 };
      },
      async create(input) {
        const value = Object.assign({ id: 'signal-' + (signals.length + 1), createdAt: new Date('2026-08-17T09:00:00.000Z') }, input.data);
        signals.push(value);
        return value;
      },
    },
    tripChange: {
      async create(input) {
        const value = Object.assign({ id: 'change-' + (changes.length + 1), createdAt: new Date('2026-08-17T09:00:00.000Z') }, input.data);
        changes.push(value);
        return value;
      },
    },
  };
  return {
    signals: signals,
    changes: changes,
    async $transaction(fn) { return fn(tx); },
    monitoringSignal: {
      async findFirst(input) {
        return signals.filter(function (signal) {
          return signal.tripId === input.where.tripId && signal.category === input.where.category &&
            signal.source === input.where.source && signal.status === input.where.status;
        }).sort(function (left, right) { return new Date(right.createdAt) - new Date(left.createdAt); })[0] || null;
      },
    },
    tripChange: {
      async create(input) { return tx.tripChange.create(input); },
    },
  };
}

function candidate(candidateId, transport) {
  return { candidateId: candidateId, option: transport };
}

test('demo disruption is explicitly marked DEMO_SIMULATION and recovery preserves the V1 one-way traveler contract', async () => {
  const db = fakePrisma();
  const seen = [];
  const service = createPlanBService({
    prisma: db,
    adapter: { async search(request) { seen.push(request); return []; } },
    clock: function () { return new Date('2026-08-17T10:00:00.000Z'); },
  });
  const trip = canonicalTrip();
  const disruption = await service.createDemoDisruption({
    trip: trip,
    actorId: 'owner-a',
    body: { type: 'CARRIER_CANCELLED', note: 'Demo only' },
  });
  assert.equal(disruption.source, DISRUPTION_SOURCE);
  assert.equal(disruption.type, 'CARRIER_CANCELLED');
  assert.equal(db.signals[0].source, DISRUPTION_SOURCE);
  assert.equal(JSON.parse(db.signals[0].detail).source, DISRUPTION_SOURCE);

  const preview = await service.createPreview({ trip: trip, actorId: 'owner-a', body: { preferences: ['faster'] } });
  assert.deepEqual(seen[0], {
    schemaVersion: '1', mode: 'flight', origin: 'SVO', destination: 'LED', departureDate: '2026-08-20', returnDate: null,
    passengers: { adults: 1, children: 0, infants: 0 },
  });
  assert.equal(preview.candidates.length, 0);
  assert.equal(preview.fastest.code, 'PLAN_B_NO_ALTERNATIVES');
});

test('recovery mapping derives only supported first-segment scope and rejects ambiguous later-segment recovery', () => {
  const trip = canonicalTrip();
  const first = JSON.parse(trip.segments)[0];
  assert.deepEqual(deriveRecoverySearch(trip, { source: DISRUPTION_SOURCE, segmentId: first.id }), {
    schemaVersion: '1', mode: 'flight', origin: 'SVO', destination: 'LED', departureDate: '2026-08-20', returnDate: null,
    passengers: { adults: 1, children: 0, infants: 0 },
  });
  const multi = canonicalTrip();
  const segments = JSON.parse(multi.segments);
  segments.push(Object.assign({}, segments[0], {
    id: 'second', departurePlace: 'LED', arrivalPlace: 'HEL',
    departureAt: '2026-08-20T11:00:00+03:00', arrivalAt: '2026-08-20T13:00:00+03:00', order: 1,
  }));
  multi.segments = JSON.stringify(segments);
  assert.throws(function () {
    deriveRecoverySearch(multi, { source: DISRUPTION_SOURCE, segmentId: 'second' });
  }, { code: 'PLAN_B_RECOVERY_UNSUPPORTED' });
});

test('preview calls the adapter boundary, excludes provably identical original service, and never mutates canonical Trip', async () => {
  const db = fakePrisma();
  const trip = canonicalTrip();
  const originalSegments = trip.segments;
  const originalRoute = trip.route;
  const original = option('SU100', '2026-08-20T08:00:00+03:00', '2026-08-20T09:30:00+03:00', { amount: 7000, currency: 'RUB', kind: 'unknown' });
  const alternative = option('SU200', '2026-08-20T09:00:00+03:00', '2026-08-20T10:10:00+03:00', { amount: 6800, currency: 'RUB', kind: 'unknown' });
  const service = createPlanBService({ prisma: db, adapter: { async search() { return [{ option: original }, { option: alternative }]; } } });
  await service.createDemoDisruption({ trip: trip, actorId: 'owner-a', body: { type: 'DELAYED' } });
  const preview = await service.createPreview({ trip: trip, actorId: 'owner-a', body: { preferences: ['cheaper'] } });
  assert.equal(preview.candidates.length, 1);
  assert.equal(preview.candidates[0].option.id, 'SU200');
  assert.equal(preview.cheapest.candidateId, preview.candidates[0].candidateId);
  assert.equal(trip.segments, originalSegments);
  assert.equal(trip.route, originalRoute);
  assert.equal(sameScheduledOption(original, JSON.parse(originalSegments)), true);
});

test('provider error propagates as a controlled adapter boundary error and empty results are honest', async () => {
  const db = fakePrisma();
  const trip = canonicalTrip();
  const timeout = Object.assign(new Error('provider timeout'), { code: 'TUTU_TIMEOUT', status: 504, retryable: true });
  const service = createPlanBService({ prisma: db, adapter: { async search() { throw timeout; } } });
  await service.createDemoDisruption({ trip: trip, actorId: 'owner-a', body: { type: 'USER_REPORTED_PROBLEM' } });
  await assert.rejects(
    service.createPreview({ trip: trip, actorId: 'owner-a', body: { preferences: ['faster'] } }),
    { code: 'TUTU_TIMEOUT', status: 504 },
  );
});

test('Fastest uses arrival, duration, transfer count, then stable option id', () => {
  const early = candidate('early', option('A', '2026-08-20T07:00:00+03:00', '2026-08-20T08:00:00+03:00', null));
  const sameArrivalLonger = candidate('longer', option('B', '2026-08-20T06:00:00+03:00', '2026-08-20T08:00:00+03:00', null));
  const sameEverythingB = candidate('z', option('Z', '2026-08-20T07:00:00+03:00', '2026-08-20T08:00:00+03:00', null));
  assert.equal(fastestCandidate([sameEverythingB, sameArrivalLonger, early]).candidateId, 'early');
  assert.equal(fastestCandidate([sameEverythingB, candidate('a', option('A2', '2026-08-20T07:00:00+03:00', '2026-08-20T08:00:00+03:00', null))]).option.id, 'A2');
});

test('Cheapest selects only comparable factual prices and never allows null or currency mismatch to win', () => {
  const expensive = candidate('expensive', option('EXP', '2026-08-20T09:00:00+03:00', '2026-08-20T10:00:00+03:00', { amount: 9000, currency: 'RUB', kind: 'unknown' }));
  const cheap = candidate('cheap', option('CHEAP', '2026-08-20T09:00:00+03:00', '2026-08-20T10:20:00+03:00', { amount: 6500, currency: 'RUB', kind: 'unknown' }));
  const unknown = candidate('unknown', option('UNKNOWN', '2026-08-20T08:00:00+03:00', '2026-08-20T09:10:00+03:00', null));
  assert.equal(cheapestCandidate([expensive, cheap, unknown]).candidate.candidateId, 'cheap');
  const eur = candidate('eur', option('EUR', '2026-08-20T10:00:00+03:00', '2026-08-20T11:00:00+03:00', { amount: 50, currency: 'EUR', kind: 'unknown' }));
  assert.equal(cheapestCandidate([cheap, eur]).status, 'unavailable');
  assert.equal(cheapestCandidate([unknown]).status, 'unavailable');
});

test('Personalized scoring is deterministic, data-derived, and contains no fabricated match percentage', () => {
  const faster = candidate('faster', option('FAST', '2026-08-20T08:00:00+03:00', '2026-08-20T09:00:00+03:00', { amount: 9000, currency: 'RUB', kind: 'unknown' }));
  const cheaper = candidate('cheaper', option('CHEAP', '2026-08-20T08:00:00+03:00', '2026-08-20T10:00:00+03:00', { amount: 6000, currency: 'RUB', kind: 'unknown' }));
  const result = personalizedCandidate([faster, cheaper], ['cheaper', 'faster'], cheapestCandidate([faster, cheaper]));
  assert.equal(result.candidate.candidateId, 'faster');
  assert.ok(result.reasons.every(function (reason) { return !/%|match/i.test(reason); }));
  assert.equal(personalizedCandidate([faster], ['cheaper'], { status: 'unavailable' }).status, 'unavailable');
});

test('impact compares scheduled arrival, duration and transfers without inventing an unsupported price delta', () => {
  const original = JSON.parse(canonicalTrip().segments);
  const replacement = option('SU300', '2026-08-20T08:30:00+03:00', '2026-08-20T10:50:00+03:00', { amount: 8000, currency: 'RUB', kind: 'unknown' });
  const impact = impactForOption(replacement, original);
  assert.equal(impact.arrivalDeltaMinutes, 80);
  assert.equal(impact.durationDeltaMinutes, 50);
  assert.equal(impact.transferCountDelta, 0);
  assert.equal(impact.priceDelta, null);
  assert.equal(impact.priceDeltaStatus, 'unavailable_without_canonical_factual_price');
});

function persistentPrisma(initialTrip) {
  let sequence = 0;
  const state = { trip: Object.assign({}, initialTrip), signals: [], changes: [] };
  function matches(change, where) {
    return Object.keys(where || {}).every(function (key) {
      const expected = where[key];
      if (expected && typeof expected === 'object' && expected.in) return expected.in.includes(change[key]);
      return change[key] === expected;
    });
  }
  const tx = {
    trip: {
      async findUnique(input) {
        return state.trip && state.trip.id === input.where.id ? state.trip : null;
      },
      async update(input) {
        if (!state.trip || state.trip.id !== input.where.id) throw new Error('missing trip');
        Object.assign(state.trip, input.data, { updatedAt: new Date('2026-08-17T12:00:00.000Z') });
        return state.trip;
      },
    },
    monitoringSignal: {
      async updateMany(input) {
        let count = 0;
        state.signals.forEach(function (signal) {
          if (signal.tripId === input.where.tripId && signal.category === input.where.category &&
              signal.source === input.where.source && signal.status === input.where.status) {
            Object.assign(signal, input.data); count += 1;
          }
        });
        return { count: count };
      },
      async create(input) {
        const signal = Object.assign({ id: 'signal-' + (++sequence), createdAt: new Date('2026-08-17T09:00:00.000Z') }, input.data);
        state.signals.push(signal);
        return signal;
      },
      async findFirst(input) {
        return state.signals.filter(function (signal) {
          return signal.tripId === input.where.tripId && signal.category === input.where.category &&
            signal.source === input.where.source && signal.status === input.where.status;
        }).sort(function (left, right) { return new Date(right.createdAt) - new Date(left.createdAt); })[0] || null;
      },
    },
    tripChange: {
      async findUnique(input) { return state.changes.find(function (change) { return change.id === input.where.id; }) || null; },
      async findFirst(input) { return state.changes.find(function (change) { return matches(change, input.where); }) || null; },
      async findMany(input) {
        const rows = state.changes.filter(function (change) { return matches(change, input.where); });
        if (input.orderBy && input.orderBy.createdAt === 'desc') rows.reverse();
        return rows;
      },
      async create(input) {
        if (state.changes.some(function (change) { return change.id === input.data.id; })) {
          const error = new Error('unique'); error.code = 'P2002'; throw error;
        }
        const change = Object.assign({ id: 'change-' + (++sequence), createdAt: new Date('2026-08-17T09:00:00.000Z') }, input.data);
        state.changes.push(change);
        return change;
      },
    },
  };
  return Object.assign({ state: state }, tx, { async $transaction(fn) { return fn(tx); } });
}

test('Apply persists a server-side proposal reference and exact pre-apply snapshot; duplicate and revert are safe', async () => {
  const originalTrip = canonicalTrip();
  const before = {
    route: originalTrip.route,
    segments: JSON.parse(originalTrip.segments),
    startDate: originalTrip.startDate.toISOString(),
    endDate: originalTrip.endDate.toISOString(),
  };
  const db = persistentPrisma(originalTrip);
  const replacement = option('SU400', '2026-08-20T10:00:00+03:00', '2026-08-20T12:00:00+03:00', { amount: 7400, currency: 'RUB', kind: 'unknown' });
  const service = createPlanBService({ prisma: db, adapter: { async search() { return [{ option: replacement }]; } } });
  await service.createDemoDisruption({ trip: db.state.trip, actorId: 'owner-a', body: { type: 'CARRIER_CANCELLED' } });
  const preview = await service.createPreview({ trip: db.state.trip, actorId: 'owner-a', body: { preferences: ['faster'] } });
  const apply = await service.apply({
    trip: db.state.trip,
    actorId: 'owner-a',
    body: { proposalId: preview.proposalId, candidateId: preview.candidates[0].candidateId },
    idempotencyKey: 'plan-b-apply-key-0001',
  });
  assert.equal(apply.applied, true);
  assert.equal(apply.trip.route, 'SVO → LED');
  assert.equal(JSON.parse(apply.trip.segments)[0].transportOptionId, 'SU400');
  const applyChange = db.state.changes.find(function (change) { return change.type === 'plan_b_apply'; });
  assert.deepEqual(JSON.parse(applyChange.oldValue), before);
  assert.equal(JSON.parse(applyChange.newValue).proposalId, preview.proposalId);
  assert.equal(JSON.parse(applyChange.newValue).candidateId, preview.candidates[0].candidateId);

  const replay = await service.apply({
    trip: db.state.trip,
    actorId: 'owner-a',
    body: { proposalId: preview.proposalId, candidateId: preview.candidates[0].candidateId },
    idempotencyKey: 'plan-b-apply-key-0001',
  });
  assert.equal(replay.applied, false);
  assert.equal(db.state.changes.filter(function (change) { return change.type === 'plan_b_apply'; }).length, 1);

  const reverted = await service.revert({ trip: db.state.trip, actorId: 'owner-a' });
  assert.equal(reverted.reverted, true);
  assert.deepEqual({
    route: reverted.trip.route,
    segments: JSON.parse(reverted.trip.segments),
    startDate: reverted.trip.startDate.toISOString(),
    endDate: reverted.trip.endDate.toISOString(),
  }, before);
  const revertReplay = await service.revert({ trip: db.state.trip, actorId: 'owner-a' });
  assert.equal(revertReplay.reverted, false);
  assert.equal(revertReplay.reason, 'PLAN_B_ALREADY_REVERTED');
});

test('Apply rejects a stale proposal rather than mutating a changed canonical Trip', async () => {
  const db = persistentPrisma(canonicalTrip());
  const replacement = option('SU401', '2026-08-20T10:00:00+03:00', '2026-08-20T12:00:00+03:00', { amount: 7400, currency: 'RUB', kind: 'unknown' });
  const service = createPlanBService({ prisma: db, adapter: { async search() { return [{ option: replacement }]; } } });
  await service.createDemoDisruption({ trip: db.state.trip, actorId: 'owner-a', body: { type: 'DELAYED' } });
  const preview = await service.createPreview({ trip: db.state.trip, actorId: 'owner-a', body: { preferences: ['faster'] } });
  db.state.trip.route = 'Externally changed route';
  await assert.rejects(service.apply({
    trip: db.state.trip,
    actorId: 'owner-a',
    body: { proposalId: preview.proposalId, candidateId: preview.candidates[0].candidateId },
    idempotencyKey: 'plan-b-apply-key-0002',
  }), { code: 'PLAN_B_PROPOSAL_STALE' });
  assert.equal(db.state.changes.filter(function (change) { return change.type === 'plan_b_apply'; }).length, 0);
});

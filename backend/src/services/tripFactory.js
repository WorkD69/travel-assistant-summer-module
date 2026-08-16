'use strict';

const crypto = require('node:crypto');
const { validateTransportOptionV1 } = require('../contracts/transportOption');

function factoryError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.retryable = false;
  return error;
}

function deterministicTripId(ownerId, idempotencyKey) {
  const digest = crypto.createHash('sha256')
    .update('tutu-demo-purchase-v1\0' + ownerId + '\0' + idempotencyKey)
    .digest('hex')
    .slice(0, 40);
  return 'tutu_' + digest;
}

function persistedSegments(option) {
  return option.segments.map(function (segment, index) {
    return {
      id: segment.id,
      transportType: segment.transportType,
      departurePlace: segment.departurePlace,
      arrivalPlace: segment.arrivalPlace,
      departureAt: segment.departureAt,
      arrivalAt: segment.arrivalAt,
      serviceNumber: segment.serviceNumber,
      carrierName: segment.carrierName,
      order: index,
      transportOptionId: option.id,
      source: 'tutu-mcp',
      fetchedAt: option.fetchedAt,
    };
  });
}

function routeFromSegments(segments) {
  const points = [];
  segments.forEach(function (segment) {
    [segment.departurePlace, segment.arrivalPlace].forEach(function (point) {
      if (points[points.length - 1] !== point) points.push(point);
    });
  });
  return points.join(' → ');
}

function storedTransportOptionId(trip) {
  try {
    const segments = JSON.parse(trip.segments);
    if (!Array.isArray(segments) || !segments.length) return null;
    const ids = Array.from(new Set(segments.map(function (segment) { return segment.transportOptionId; })));
    return ids.length === 1 && typeof ids[0] === 'string' ? ids[0] : null;
  } catch (error) {
    return null;
  }
}

function resolveExisting(trip, ownerId, optionId) {
  if (!trip) return null;
  if (trip.ownerId !== ownerId || storedTransportOptionId(trip) !== optionId) {
    throw factoryError(
      'IDEMPOTENCY_KEY_REUSE',
      'Idempotency-Key was already used for a different transport selection',
      409,
    );
  }
  return { trip: trip, created: false };
}

function createTripFactory(options) {
  const prisma = options && options.prisma;
  if (!prisma) throw new Error('TripFactory requires Prisma');

  return Object.freeze({
    async createFromSelection(input) {
      const owner = input && input.user;
      const key = input && input.idempotencyKey;
      if (!owner || typeof owner.id !== 'string' || !owner.id) {
        throw factoryError('TUTU_USER_INVALID', 'Authenticated user is required', 401);
      }
      if (typeof key !== 'string' || key.length < 16 || key.length > 128) {
        throw factoryError('IDEMPOTENCY_KEY_INVALID', 'Idempotency-Key must contain 16 to 128 characters', 400);
      }
      const option = validateTransportOptionV1(input.option);
      const tripId = deterministicTripId(owner.id, key);
      const include = { participants: true };
      const existing = await prisma.trip.findUnique({ where: { id: tripId }, include: include });
      const replay = resolveExisting(existing, owner.id, option.id);
      if (replay) return replay;

      const segments = persistedSegments(option);
      const first = option.segments[0];
      const last = option.segments[option.segments.length - 1];
      try {
        const transactionResult = await prisma.$transaction(async function (tx) {
          const concurrentExisting = await tx.trip.findUnique({ where: { id: tripId }, include: include });
          const concurrentReplay = resolveExisting(concurrentExisting, owner.id, option.id);
          if (concurrentReplay) return concurrentReplay;
          const trip = await tx.trip.create({
            data: {
              id: tripId,
              title: first.departurePlace + ' → ' + last.arrivalPlace,
              route: routeFromSegments(option.segments),
              segments: JSON.stringify(segments),
              startDate: new Date(first.departureAt),
              endDate: new Date(last.arrivalAt),
              status: 'active',
              type: 'solo',
              ownerId: owner.id,
              participants: {
                create: [{
                  userId: owner.id,
                  name: String(owner.name || ''),
                  initials: owner.initials || String(owner.name || '').trim().charAt(0).toUpperCase(),
                  role: 'organizer', access: 'Активен', telegram: owner.telegram || 'none', tone: 'a',
                }],
              },
            },
            include: include,
          });
          return { trip: trip, created: true };
        });
        return transactionResult;
      } catch (error) {
        if (!error || error.code !== 'P2002') throw error;
        const raced = await prisma.trip.findUnique({ where: { id: tripId }, include: include });
        const racedReplay = resolveExisting(raced, owner.id, option.id);
        if (racedReplay) return racedReplay;
        throw error;
      }
    },
  });
}

module.exports = {
  createTripFactory,
  deterministicTripId,
};

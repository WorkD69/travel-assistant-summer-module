'use strict';

const crypto = require('node:crypto');
const {
  validateSearchRequestV1,
  validateTransportOptionV1,
} = require('../contracts/transportOption');

const DISRUPTION_TYPES = Object.freeze([
  'NONE',
  'DELAYED',
  'CARRIER_CANCELLED',
  'CONNECTION_AT_RISK',
  'USER_REPORTED_PROBLEM',
  'OTHER',
]);
const DISRUPTION_SOURCE = 'DEMO_SIMULATION';
const DISRUPTION_CATEGORY = 'plan_b_disruption';
const PREFERENCE_VALUES = Object.freeze(['faster', 'cheaper', 'fewer_transfers']);
const PROPOSAL_TYPE = 'plan_b_proposal';
const APPLY_TYPE = 'plan_b_apply';
const REVERT_TYPE = 'plan_b_revert';
const TUTU_SEARCH_CONTEXT_TYPE = 'tutu_search_context';

function planBError(code, message, status, retryable) {
  const error = new Error(message);
  error.code = code;
  error.status = status || 400;
  error.retryable = !!retryable;
  return error;
}

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + stableJson(value[key]);
    }).join(',') + '}';
  }
  return JSON.stringify(value);
}

function hash(prefix, value) {
  return prefix + crypto.createHash('sha256').update(stableJson(value)).digest('hex').slice(0, 40);
}

function jsonObject(value, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw planBError(code, message, 400, false);
  }
  return value;
}

function exactFields(value, allowed, code, label) {
  const unknown = Object.keys(value).find(function (key) { return !allowed.includes(key); });
  if (unknown) throw planBError(code, label + ' contains unsupported field: ' + unknown, 400, false);
}

function text(value, code, label, maximum) {
  if (typeof value !== 'string' || !value.trim()) {
    throw planBError(code, label + ' must be a non-empty string', 400, false);
  }
  const normalized = value.trim();
  if (maximum && normalized.length > maximum) {
    throw planBError(code, label + ' is too long', 400, false);
  }
  return normalized;
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function isoTimestamp(value, code, label) {
  const normalized = text(value, code, label, 64);
  if (Number.isNaN(new Date(normalized).getTime()) || !/^\d{4}-\d{2}-\d{2}T/.test(normalized)) {
    throw planBError(code, label + ' must be an ISO-8601 timestamp', 400, false);
  }
  return new Date(normalized).toISOString();
}

function canonicalSegments(trip) {
  const segments = parseJson(trip && trip.segments, null);
  if (!Array.isArray(segments) || !segments.length) {
    throw planBError('PLAN_B_CANONICAL_TRIP_UNSUPPORTED', 'Canonical Trip has no structured scheduled segments', 422, false);
  }
  const normalized = segments.map(function (segment, index) {
    if (!segment || typeof segment !== 'object' || Array.isArray(segment)) {
      throw planBError('PLAN_B_CANONICAL_TRIP_UNSUPPORTED', 'Canonical Trip segment is invalid', 422, false);
    }
    const required = ['id', 'transportType', 'departurePlace', 'arrivalPlace', 'departureAt', 'arrivalAt'];
    required.forEach(function (key) {
      if (typeof segment[key] !== 'string' || !segment[key].trim()) {
        throw planBError('PLAN_B_CANONICAL_TRIP_UNSUPPORTED', 'Canonical Trip segment lacks ' + key, 422, false);
      }
    });
    const departureAt = new Date(segment.departureAt);
    const arrivalAt = new Date(segment.arrivalAt);
    if (Number.isNaN(departureAt.getTime()) || Number.isNaN(arrivalAt.getTime()) || arrivalAt <= departureAt) {
      throw planBError('PLAN_B_CANONICAL_TRIP_UNSUPPORTED', 'Canonical Trip segment schedule is invalid', 422, false);
    }
    return {
      id: segment.id,
      transportType: segment.transportType,
      departurePlace: segment.departurePlace,
      arrivalPlace: segment.arrivalPlace,
      departureAt: segment.departureAt,
      arrivalAt: segment.arrivalAt,
      serviceNumber: segment.serviceNumber == null ? null : String(segment.serviceNumber),
      carrierName: segment.carrierName == null ? null : String(segment.carrierName),
      order: Number.isInteger(segment.order) ? segment.order : index,
      transportOptionId: typeof segment.transportOptionId === 'string' ? segment.transportOptionId : null,
      source: typeof segment.source === 'string' ? segment.source : null,
      fetchedAt: typeof segment.fetchedAt === 'string' ? segment.fetchedAt : null,
    };
  });
  return normalized.sort(function (left, right) { return left.order - right.order; });
}

function tripSnapshot(trip) {
  const segments = canonicalSegments(trip);
  return {
    title: trip.title,
    route: trip.route,
    segments: segments,
    startDate: trip.startDate ? new Date(trip.startDate).toISOString() : null,
    endDate: trip.endDate ? new Date(trip.endDate).toISOString() : null,
    status: trip.status,
    type: trip.type,
  };
}

function canonicalFingerprint(trip) {
  return hash('planb_trip_', tripSnapshot(trip));
}

function validateDisruptionInput(input, clock) {
  const body = jsonObject(input || {}, 'PLAN_B_DISRUPTION_INVALID', 'Demo disruption body must be an object');
  exactFields(body, ['type', 'occurredAt', 'note', 'context', 'segmentId'], 'PLAN_B_DISRUPTION_INVALID', 'Demo disruption');
  const type = text(body.type, 'PLAN_B_DISRUPTION_INVALID', 'Demo disruption type', 64);
  if (!DISRUPTION_TYPES.includes(type) || type === 'NONE') {
    throw planBError('PLAN_B_DISRUPTION_INVALID', 'Demo disruption type is unsupported', 400, false);
  }
  let note = null;
  if (body.note !== undefined && body.note !== null) note = text(body.note, 'PLAN_B_DISRUPTION_INVALID', 'Demo disruption note', 500);
  let context = null;
  if (body.context !== undefined && body.context !== null) {
    context = jsonObject(body.context, 'PLAN_B_DISRUPTION_INVALID', 'Demo disruption context must be an object');
    const encoded = stableJson(context);
    if (encoded.length > 2000) throw planBError('PLAN_B_DISRUPTION_INVALID', 'Demo disruption context is too large', 400, false);
  }
  let segmentId = null;
  if (body.segmentId !== undefined && body.segmentId !== null) {
    segmentId = text(body.segmentId, 'PLAN_B_DISRUPTION_INVALID', 'Demo disruption segmentId', 200);
  }
  const now = (clock || function () { return new Date(); })();
  return {
    schemaVersion: '1',
    type: type,
    source: DISRUPTION_SOURCE,
    occurredAt: body.occurredAt === undefined || body.occurredAt === null
      ? new Date(now).toISOString()
      : isoTimestamp(body.occurredAt, 'PLAN_B_DISRUPTION_INVALID', 'Demo disruption occurredAt'),
    note: note,
    context: context,
    segmentId: segmentId,
  };
}

function persistedInstantIso(value) {
  if (value === null || value === undefined) return null;
  const instant = new Date(value).getTime();
  return Number.isNaN(instant) ? null : new Date(instant).toISOString();
}

function disruptionFromSignal(signal) {
  if (!signal || signal.source !== DISRUPTION_SOURCE || signal.category !== DISRUPTION_CATEGORY) return null;
  const detail = parseJson(signal.detail, null);
  if (!detail || detail.schemaVersion !== '1' || detail.source !== DISRUPTION_SOURCE ||
      !DISRUPTION_TYPES.includes(detail.type) || detail.type === 'NONE') return null;
  return {
    id: signal.id,
    schemaVersion: '1',
    type: detail.type,
    source: DISRUPTION_SOURCE,
    occurredAt: detail.occurredAt,
    note: detail.note || null,
    context: detail.context || null,
    segmentId: detail.segmentId || null,
    createdAt: persistedInstantIso(signal.createdAt),
  };
}

function deriveRecoverySearch(trip, disruption) {
  if (!disruption || disruption.source !== DISRUPTION_SOURCE) {
    throw planBError('PLAN_B_DISRUPTION_REQUIRED', 'An active demo disruption is required', 409, false);
  }
  const segments = canonicalSegments(trip);
  const selectedId = disruption.segmentId || segments[0].id;
  const selectedIndex = segments.findIndex(function (segment) { return segment.id === selectedId; });
  if (selectedIndex < 0) {
    throw planBError('PLAN_B_CANONICAL_TRIP_UNSUPPORTED', 'Demo disruption segment is not part of this canonical Trip', 422, false);
  }
  if (selectedIndex !== 0) {
    throw planBError(
      'PLAN_B_RECOVERY_UNSUPPORTED',
      'Plan B Core supports recovery only from the first canonical segment of a multi-segment Trip',
      422,
      false,
    );
  }
  const remaining = segments.slice(selectedIndex);
  const modes = Array.from(new Set(remaining.map(function (segment) { return segment.transportType; })));
  const mode = modes.length === 1 ? modes[0] : 'mixed';
  const request = {
    schemaVersion: '1',
    mode: mode,
    origin: remaining[0].departurePlace,
    destination: remaining[remaining.length - 1].arrivalPlace,
    departureDate: remaining[0].departureAt.slice(0, 10),
    returnDate: null,
    passengers: { adults: 1, children: 0, infants: 0 },
  };
  return validateSearchRequestV1(request);
}

function invalidRecoveryContext() {
  return planBError(
    'PLAN_B_RECOVERY_CONTEXT_INVALID',
    'Stored Tutu recovery search context is invalid',
    409,
    false,
  );
}

function validateRecoveryContext(change, derived) {
  let stored;
  try {
    stored = validateSearchRequestV1(JSON.parse(change.newValue));
  } catch (error) {
    throw invalidRecoveryContext();
  }
  if (stored.departureDate !== derived.departureDate ||
      stored.mode !== derived.mode ||
      stored.returnDate !== null ||
      stored.passengers.adults !== 1 ||
      stored.passengers.children !== 0 ||
      stored.passengers.infants !== 0) {
    throw invalidRecoveryContext();
  }
  return stored;
}

async function resolveRecoverySearch(prisma, trip, disruption) {
  const derived = deriveRecoverySearch(trip, disruption);
  const context = await prisma.tripChange.findFirst({
    where: { tripId: trip.id, type: TUTU_SEARCH_CONTEXT_TYPE },
    orderBy: { createdAt: 'desc' },
  });
  return context ? validateRecoveryContext(context, derived) : derived;
}

function trustedInstantMs(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const instant = new Date(value).getTime();
  return Number.isNaN(instant) ? null : instant;
}

function recoveryCutoffMs(disruption) {
  const occurredAt = trustedInstantMs(disruption && disruption.occurredAt);
  const createdAt = trustedInstantMs(disruption && disruption.createdAt);
  if (occurredAt === null || createdAt === null) {
    throw planBError(
      'PLAN_B_RECOVERY_CUTOFF_INVALID',
      'Trusted demo disruption timestamps cannot establish a recovery cutoff',
      409,
      false,
    );
  }
  return Math.max(occurredAt, createdAt);
}

function departsAtOrAfterRecoveryCutoff(option, cutoffMs) {
  const firstSegment = option && Array.isArray(option.segments) ? option.segments[0] : null;
  const departureMs = new Date(firstSegment && firstSegment.departureAt).getTime();
  return !Number.isNaN(departureMs) && departureMs >= cutoffMs;
}

function sameScheduledOption(option, originalSegments) {
  if (!option || !Array.isArray(option.segments) || option.segments.length !== originalSegments.length) return false;
  const keys = ['transportType', 'departurePlace', 'arrivalPlace', 'departureAt', 'arrivalAt', 'serviceNumber', 'carrierName'];
  return option.segments.every(function (segment, index) {
    const original = originalSegments[index];
    if (!original) return false;
    return keys.every(function (key) {
      const left = segment[key] == null ? null : String(segment[key]);
      const right = original[key] == null ? null : String(original[key]);
      return left === right;
    });
  });
}

function arrivalMs(option) {
  return new Date(option.segments[option.segments.length - 1].arrivalAt).getTime();
}

function stableCandidateCompare(left, right) {
  const arrival = arrivalMs(left.option) - arrivalMs(right.option);
  if (arrival) return arrival;
  const duration = left.option.durationMinutes - right.option.durationMinutes;
  if (duration) return duration;
  const transfers = left.option.transferCount - right.option.transferCount;
  if (transfers) return transfers;
  return left.option.id.localeCompare(right.option.id);
}

function fastestCandidate(candidates) {
  if (!candidates.length) return null;
  return candidates.slice().sort(stableCandidateCompare)[0];
}

function cheapestCandidate(candidates) {
  const priced = candidates.filter(function (candidate) { return candidate.option.price !== null; });
  if (!priced.length) {
    return { status: 'unavailable', code: 'PRICE_COMPARISON_UNAVAILABLE', candidate: null };
  }
  const currencies = Array.from(new Set(priced.map(function (candidate) { return candidate.option.price.currency; })));
  if (currencies.length !== 1) {
    return { status: 'unavailable', code: 'PRICE_COMPARISON_UNAVAILABLE', candidate: null };
  }
  const candidate = priced.slice().sort(function (left, right) {
    const price = left.option.price.amount - right.option.price.amount;
    return price || stableCandidateCompare(left, right);
  })[0];
  return { status: 'available', code: null, candidate: candidate, currency: currencies[0] };
}

function validatePreferences(input) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.length < 1 || input.length > 3) {
    throw planBError('PLAN_B_PREFERENCES_INVALID', 'preferences must contain one to three values', 400, false);
  }
  const seen = new Set();
  return input.map(function (value) {
    const preference = text(value, 'PLAN_B_PREFERENCES_INVALID', 'preference', 64);
    if (!PREFERENCE_VALUES.includes(preference) || seen.has(preference)) {
      throw planBError('PLAN_B_PREFERENCES_INVALID', 'preferences contain an unsupported or duplicate value', 400, false);
    }
    seen.add(preference);
    return preference;
  });
}

function personalizedCandidate(candidates, preferences, cheapest) {
  if (!candidates.length) {
    return { status: 'unavailable', code: 'PLAN_B_NO_ALTERNATIVES', candidate: null, reasons: [], unavailablePreferences: [] };
  }
  if (!preferences.length) {
    return { status: 'unavailable', code: 'PLAN_B_PREFERENCES_REQUIRED', candidate: null, reasons: [], unavailablePreferences: [] };
  }
  const earliest = Math.min.apply(null, candidates.map(function (candidate) { return arrivalMs(candidate.option); }));
  const fewestTransfers = Math.min.apply(null, candidates.map(function (candidate) { return candidate.option.transferCount; }));
  const unavailablePreferences = [];
  const activePreferences = preferences.filter(function (preference) {
    if (preference === 'cheaper' && cheapest.status !== 'available') {
      unavailablePreferences.push(preference);
      return false;
    }
    return true;
  });
  if (!activePreferences.length) {
    return {
      status: 'unavailable',
      code: 'PLAN_B_PREFERENCES_UNAVAILABLE',
      candidate: null,
      reasons: [],
      unavailablePreferences: unavailablePreferences,
    };
  }
  const lowestPrice = cheapest.status === 'available' ? cheapest.candidate.option.price.amount : null;
  const scored = candidates.map(function (candidate) {
    const reasons = [];
    let score = 0;
    activePreferences.forEach(function (preference) {
      if (preference === 'faster' && arrivalMs(candidate.option) === earliest) {
        score += 1;
        reasons.push('Самое раннее прибытие среди доступных альтернатив.');
      }
      if (preference === 'cheaper' && candidate.option.price && candidate.option.price.amount === lowestPrice) {
        score += 1;
        reasons.push('Минимальная сопоставимая цена: ' + candidate.option.price.amount + ' ' + candidate.option.price.currency + '.');
      }
      if (preference === 'fewer_transfers' && candidate.option.transferCount === fewestTransfers) {
        score += 1;
        reasons.push('Минимум пересадок: ' + candidate.option.transferCount + '.');
      }
    });
    return { candidate: candidate, score: score, reasons: reasons };
  });
  scored.sort(function (left, right) {
    return right.score - left.score || stableCandidateCompare(left.candidate, right.candidate);
  });
  return {
    status: 'available',
    code: null,
    candidate: scored[0].candidate,
    reasons: scored[0].reasons,
    unavailablePreferences: unavailablePreferences,
  };
}

function durationForSegments(segments) {
  return Math.round((new Date(segments[segments.length - 1].arrivalAt).getTime() - new Date(segments[0].departureAt).getTime()) / 60000);
}

function impactForOption(option, originalSegments) {
  const originalArrival = new Date(originalSegments[originalSegments.length - 1].arrivalAt).getTime();
  const originalDuration = durationForSegments(originalSegments);
  const originalTransfers = Math.max(0, originalSegments.length - 1);
  return {
    arrivalAt: option.segments[option.segments.length - 1].arrivalAt,
    arrivalDeltaMinutes: Math.round((arrivalMs(option) - originalArrival) / 60000),
    price: option.price,
    priceDelta: null,
    priceDeltaStatus: 'unavailable_without_canonical_factual_price',
    transferCount: option.transferCount,
    transferCountDelta: option.transferCount - originalTransfers,
    durationMinutes: option.durationMinutes,
    durationDeltaMinutes: option.durationMinutes - originalDuration,
  };
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
    [segment.departurePlace, segment.arrivalPlace].forEach(function (place) {
      if (points[points.length - 1] !== place) points.push(place);
    });
  });
  return points.join(' → ');
}

function snapshotForAppliedOption(option) {
  const segments = persistedSegments(option);
  return {
    route: routeFromSegments(segments),
    segments: segments,
    startDate: new Date(option.segments[0].departureAt).toISOString(),
    endDate: new Date(option.segments[option.segments.length - 1].arrivalAt).toISOString(),
  };
}

function mutableSnapshot(trip) {
  return {
    route: trip.route || null,
    segments: canonicalSegments(trip),
    startDate: trip.startDate ? new Date(trip.startDate).toISOString() : null,
    endDate: trip.endDate ? new Date(trip.endDate).toISOString() : null,
  };
}

function fingerprintSnapshot(snapshot) {
  return hash('planb_mutable_', snapshot);
}

function validateIdempotencyKey(value) {
  if (typeof value !== 'string' || value.length < 16 || value.length > 128) {
    throw planBError('IDEMPOTENCY_KEY_INVALID', 'Idempotency-Key must contain 16 to 128 characters', 400, false);
  }
  return value;
}

function parseProposal(change) {
  const proposal = parseJson(change && change.newValue, null);
  if (!proposal || proposal.schemaVersion !== '1' || proposal.kind !== 'plan_b_proposal' ||
      !Array.isArray(proposal.candidates) || typeof proposal.baselineFingerprint !== 'string') {
    throw planBError('PLAN_B_PROPOSAL_INVALID', 'Stored Plan B proposal is invalid', 409, false);
  }
  return proposal;
}

function deriveActivePlanBApply(changes) {
  const lifecycleChanges = Array.isArray(changes) ? changes : [];
  const revertedApplyIds = new Set(lifecycleChanges.filter(function (change) {
    return change && change.type === REVERT_TYPE;
  }).map(function (change) {
    const value = parseJson(change.newValue, null);
    return value && value.applyId;
  }).filter(Boolean));
  const activeApply = lifecycleChanges.filter(function (change) {
    return change && change.type === APPLY_TYPE && !revertedApplyIds.has(change.id);
  }).sort(function (left, right) {
    const createdAt = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    return createdAt || String(right.id).localeCompare(String(left.id));
  })[0];
  if (!activeApply) return null;
  const value = parseJson(activeApply.newValue, null);
  const appliedAt = persistedInstantIso(activeApply.createdAt);
  if (!value || typeof value.proposalId !== 'string' || typeof value.candidateId !== 'string' ||
      typeof value.optionId !== 'string' || !appliedAt) return null;
  return {
    applyId: activeApply.id,
    proposalId: value.proposalId,
    candidateId: value.candidateId,
    optionId: value.optionId,
    appliedAt: appliedAt,
  };
}

function publicCandidate(candidate) {
  return {
    candidateId: candidate.candidateId,
    option: candidate.option,
    impact: candidate.impact,
  };
}

function publicRanking(result) {
  if (!result || !result.candidate) {
    return { status: result && result.status ? result.status : 'unavailable', code: result && result.code ? result.code : null };
  }
  return {
    status: result.status || 'available',
    candidateId: result.candidate.candidateId,
    reasons: result.reasons || [],
    unavailablePreferences: result.unavailablePreferences || [],
  };
}

function createPlanBService(options) {
  const settings = options || {};
  const prisma = settings.prisma;
  const adapter = settings.adapter;
  const clock = settings.clock || function () { return new Date(); };
  if (!prisma) throw new Error('PlanB service requires Prisma');
  if (!adapter || typeof adapter.search !== 'function') throw new Error('PlanB service requires Tutu adapter');

  return Object.freeze({
    async createDemoDisruption(input) {
      const trip = input && input.trip;
      const actorId = input && input.actorId;
      if (!trip || !trip.id || !actorId) throw new Error('Trip and actor are required');
      const disruption = validateDisruptionInput(input.body, clock);
      const segments = canonicalSegments(trip);
      const segmentId = disruption.segmentId || segments[0].id;
      if (!segments.some(function (segment) { return segment.id === segmentId; })) {
        throw planBError('PLAN_B_DISRUPTION_INVALID', 'Demo disruption segment is not part of this Trip', 400, false);
      }
      disruption.segmentId = segmentId;
      const signal = await prisma.$transaction(async function (tx) {
        await tx.monitoringSignal.updateMany({
          where: { tripId: trip.id, category: DISRUPTION_CATEGORY, source: DISRUPTION_SOURCE, status: 'active' },
          data: { status: 'superseded' },
        });
        return tx.monitoringSignal.create({ data: {
          tripId: trip.id,
          label: 'Plan B demo disruption: ' + disruption.type,
          status: 'active',
          severity: 'warning',
          segment: disruption.segmentId,
          source: DISRUPTION_SOURCE,
          detail: JSON.stringify(disruption),
          authorId: actorId,
          category: DISRUPTION_CATEGORY,
        } });
      });
      return disruptionFromSignal(signal);
    },

    async createPreview(input) {
      const trip = input && input.trip;
      const actorId = input && input.actorId;
      if (!trip || !trip.id || !actorId) throw new Error('Trip and actor are required');
      const preferences = validatePreferences(input.body && input.body.preferences);
      const signal = await prisma.monitoringSignal.findFirst({
        where: { tripId: trip.id, category: DISRUPTION_CATEGORY, source: DISRUPTION_SOURCE, status: 'active' },
        orderBy: { createdAt: 'desc' },
      });
      const disruption = disruptionFromSignal(signal);
      if (!disruption) throw planBError('PLAN_B_DISRUPTION_REQUIRED', 'An active demo disruption is required', 409, false);
      const recoverySearch = await resolveRecoverySearch(prisma, trip, disruption);
      const recoveryCutoff = recoveryCutoffMs(disruption);
      const originalSegments = canonicalSegments(trip);
      const normalized = await adapter.search(recoverySearch);
      if (!Array.isArray(normalized)) throw planBError('TUTU_INVALID_RESPONSE', 'Tutu adapter returned an invalid selection collection', 502, false);
      const proposalId = 'pbp_' + crypto.randomUUID();
      const candidates = normalized.map(function (selection) {
        const option = validateTransportOptionV1(selection && selection.option);
        return { option: option };
      }).filter(function (candidate) {
        return departsAtOrAfterRecoveryCutoff(candidate.option, recoveryCutoff);
      }).filter(function (candidate) {
        return !sameScheduledOption(candidate.option, originalSegments);
      }).map(function (candidate) {
        return {
          candidateId: hash('pbc_', { proposalId: proposalId, optionId: candidate.option.id }),
          option: candidate.option,
          impact: impactForOption(candidate.option, originalSegments),
        };
      });
      const fastest = fastestCandidate(candidates);
      const cheapest = cheapestCandidate(candidates);
      const personalized = personalizedCandidate(candidates, preferences, cheapest);
      const proposal = {
        schemaVersion: '1',
        kind: 'plan_b_proposal',
        proposalId: proposalId,
        disruptionId: disruption.id,
        recoverySearch: recoverySearch,
        baselineFingerprint: canonicalFingerprint(trip),
        issuedAt: new Date(clock()).toISOString(),
        candidates: candidates,
        preferences: preferences,
        rankings: {
          fastestCandidateId: fastest ? fastest.candidateId : null,
          cheapest: publicRanking(cheapest),
          personalized: publicRanking(personalized),
        },
      };
      await prisma.tripChange.create({ data: {
        id: proposalId,
        tripId: trip.id,
        actorId: actorId,
        type: PROPOSAL_TYPE,
        newValue: JSON.stringify(proposal),
        details: JSON.stringify({ schemaVersion: '1', source: 'tutu-mcp', disruptionSource: DISRUPTION_SOURCE }),
      } });
      return {
        tripId: trip.id,
        proposalId: proposalId,
        disruption: disruption,
        recoverySearch: recoverySearch,
        candidates: candidates.map(publicCandidate),
        fastest: fastest ? { status: 'available', candidateId: fastest.candidateId } : { status: 'unavailable', code: 'PLAN_B_NO_ALTERNATIVES' },
        cheapest: publicRanking(cheapest),
        personalized: publicRanking(personalized),
        impactPreview: candidates.map(function (candidate) {
          return { candidateId: candidate.candidateId, impact: candidate.impact };
        }),
      };
    },

    async apply(input) {
      const trip = input && input.trip;
      const actorId = input && input.actorId;
      const body = jsonObject(input && input.body || {}, 'PLAN_B_APPLY_INVALID', 'Plan B apply body must be an object');
      exactFields(body, ['proposalId', 'candidateId'], 'PLAN_B_APPLY_INVALID', 'Plan B apply');
      if (!trip || !trip.id || !actorId) throw new Error('Trip and actor are required');
      const proposalId = text(body.proposalId, 'PLAN_B_APPLY_INVALID', 'proposalId', 100);
      const candidateId = text(body.candidateId, 'PLAN_B_APPLY_INVALID', 'candidateId', 100);
      const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
      const proposalChange = await prisma.tripChange.findFirst({ where: { id: proposalId, tripId: trip.id, type: PROPOSAL_TYPE } });
      if (!proposalChange) throw planBError('PLAN_B_PROPOSAL_NOT_FOUND', 'Plan B proposal was not found for this Trip', 404, false);
      const proposal = parseProposal(proposalChange);
      const selected = proposal.candidates.find(function (candidate) { return candidate && candidate.candidateId === candidateId; });
      if (!selected) throw planBError('PLAN_B_CANDIDATE_NOT_FOUND', 'Plan B candidate was not found in this proposal', 404, false);
      const option = validateTransportOptionV1(selected.option);
      const applyId = hash('pba_', { tripId: trip.id, actorId: actorId, idempotencyKey: idempotencyKey });
      let result;
      try {
        result = await prisma.$transaction(async function (tx) {
          const existing = await tx.tripChange.findUnique({ where: { id: applyId } });
        if (existing) {
          const existingValue = parseJson(existing.newValue, null);
          if (!existingValue || existing.tripId !== trip.id || existingValue.proposalId !== proposalId || existingValue.candidateId !== candidateId) {
            throw planBError('IDEMPOTENCY_KEY_REUSE', 'Idempotency-Key was already used for a different Plan B apply', 409, false);
          }
          return { applied: false, applyId: applyId };
        }
        const current = await tx.trip.findUnique({ where: { id: trip.id } });
        if (!current) throw planBError('PLAN_B_TRIP_NOT_FOUND', 'Trip was not found', 404, false);
        if (canonicalFingerprint(current) !== proposal.baselineFingerprint) {
          throw planBError('PLAN_B_PROPOSAL_STALE', 'Plan B proposal no longer matches the canonical Trip', 409, false);
        }
        const before = mutableSnapshot(current);
        const after = snapshotForAppliedOption(option);
        const updated = await tx.trip.update({ where: { id: trip.id }, data: {
          route: after.route,
          segments: JSON.stringify(after.segments),
          startDate: new Date(after.startDate),
          endDate: new Date(after.endDate),
        } });
        await tx.tripChange.create({ data: {
          id: applyId,
          tripId: trip.id,
          actorId: actorId,
          type: APPLY_TYPE,
          oldValue: JSON.stringify(before),
          newValue: JSON.stringify({
            schemaVersion: '1',
            proposalId: proposalId,
            candidateId: candidateId,
            optionId: option.id,
            appliedSnapshot: after,
          }),
          details: JSON.stringify({ schemaVersion: '1', operation: 'apply', source: 'DEMO_PLAN_B_ROUTE_ONLY' }),
        } });
          return { applied: true, applyId: applyId, updated: updated };
        });
      } catch (error) {
        if (!error || error.code !== 'P2002') throw error;
        const raced = await prisma.tripChange.findUnique({ where: { id: applyId } });
        const racedValue = parseJson(raced && raced.newValue, null);
        if (!raced || raced.tripId !== trip.id || !racedValue || racedValue.proposalId !== proposalId || racedValue.candidateId !== candidateId) {
          throw error;
        }
        result = { applied: false, applyId: applyId };
      }
      const reread = await prisma.trip.findUnique({ where: { id: trip.id } });
      return { applied: result.applied, applyId: result.applyId, trip: reread };
    },

    async revert(input) {
      const trip = input && input.trip;
      const actorId = input && input.actorId;
      if (!trip || !trip.id || !actorId) throw new Error('Trip and actor are required');
      let result;
      try {
        result = await prisma.$transaction(async function (tx) {
          const applies = await tx.tripChange.findMany({ where: { tripId: trip.id, type: APPLY_TYPE }, orderBy: { createdAt: 'desc' } });
        if (!applies.length) return { reverted: false, reason: 'PLAN_B_NOT_APPLIED' };
        const reverts = await tx.tripChange.findMany({ where: { tripId: trip.id, type: REVERT_TYPE } });
        const revertedApplyIds = new Set(reverts.map(function (change) {
          const value = parseJson(change.newValue, null);
          return value && value.applyId;
        }).filter(Boolean));
        const applyChange = applies.find(function (change) { return !revertedApplyIds.has(change.id); });
        if (!applyChange) return { reverted: false, reason: 'PLAN_B_ALREADY_REVERTED' };
        const before = parseJson(applyChange.oldValue, null);
        const appliedValue = parseJson(applyChange.newValue, null);
        if (!before || !appliedValue || !appliedValue.appliedSnapshot) {
          throw planBError('PLAN_B_SNAPSHOT_INVALID', 'Stored Plan B snapshot is invalid', 409, false);
        }
        const revertId = hash('pbr_', { tripId: trip.id, applyId: applyChange.id });
        const existing = await tx.tripChange.findUnique({ where: { id: revertId } });
        if (existing) return { reverted: false, reason: 'PLAN_B_ALREADY_REVERTED', revertId: revertId };
        const current = await tx.trip.findUnique({ where: { id: trip.id } });
        if (!current) throw planBError('PLAN_B_TRIP_NOT_FOUND', 'Trip was not found', 404, false);
        if (fingerprintSnapshot(mutableSnapshot(current)) !== fingerprintSnapshot(appliedValue.appliedSnapshot)) {
          throw planBError('PLAN_B_REVERT_CONFLICT', 'Canonical Trip changed after Plan B apply', 409, false);
        }
        const restored = await tx.trip.update({ where: { id: trip.id }, data: {
          route: before.route,
          segments: JSON.stringify(before.segments),
          startDate: before.startDate ? new Date(before.startDate) : null,
          endDate: before.endDate ? new Date(before.endDate) : null,
        } });
        await tx.tripChange.create({ data: {
          id: revertId,
          tripId: trip.id,
          actorId: actorId,
          type: REVERT_TYPE,
          oldValue: JSON.stringify(appliedValue.appliedSnapshot),
          newValue: JSON.stringify({ schemaVersion: '1', applyId: applyChange.id, restoredSnapshot: before }),
          details: JSON.stringify({ schemaVersion: '1', operation: 'revert', source: 'DEMO_PLAN_B_ROUTE_ONLY' }),
        } });
        await tx.monitoringSignal.updateMany({
          where: {
            tripId: trip.id,
            category: DISRUPTION_CATEGORY,
            source: DISRUPTION_SOURCE,
            status: 'active',
          },
          data: { status: 'resolved' },
        });
          return { reverted: true, revertId: revertId, trip: restored };
        });
      } catch (error) {
        if (!error || error.code !== 'P2002') throw error;
        const existingRevert = await prisma.tripChange.findFirst({ where: { tripId: trip.id, type: REVERT_TYPE } });
        if (!existingRevert) throw error;
        result = { reverted: false, reason: 'PLAN_B_ALREADY_REVERTED', revertId: existingRevert.id };
      }
      const reread = await prisma.trip.findUnique({ where: { id: trip.id } });
      return { reverted: result.reverted, reason: result.reason || null, revertId: result.revertId || null, trip: reread };
    },
  });
}

module.exports = {
  DISRUPTION_TYPES,
  DISRUPTION_SOURCE,
  PREFERENCE_VALUES,
  canonicalSegments,
  deriveRecoverySearch,
  trustedInstantMs,
  recoveryCutoffMs,
  departsAtOrAfterRecoveryCutoff,
  sameScheduledOption,
  fastestCandidate,
  cheapestCandidate,
  personalizedCandidate,
  impactForOption,
  deriveActivePlanBApply,
  createPlanBService,
  planBError,
};

'use strict';

const express = require('express');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { isLinkedActiveParticipant } = require('../services/tripAccess');
const { createTutuMcpAdapter } = require('../services/tutuMcpAdapter');
const { createPlanBService } = require('../services/planB');

const SAFE_MESSAGES = Object.freeze({
  PLAN_B_DISRUPTION_INVALID: 'Demo disruption is invalid',
  PLAN_B_DISRUPTION_REQUIRED: 'An active demo disruption is required',
  PLAN_B_CANONICAL_TRIP_UNSUPPORTED: 'This canonical Trip cannot be recovered by Plan B Core',
  PLAN_B_RECOVERY_UNSUPPORTED: 'This recovery scenario is not supported by Plan B Core',
  PLAN_B_RECOVERY_CUTOFF_INVALID: 'Trusted recovery timestamps cannot establish a safe cutoff',
  PLAN_B_PREFERENCES_INVALID: 'Plan B preferences are invalid',
  PLAN_B_PREFERENCES_REQUIRED: 'Select one to three supported preferences',
  PLAN_B_PREFERENCES_UNAVAILABLE: 'Selected preferences cannot be compared from factual provider data',
  PLAN_B_APPLY_INVALID: 'Plan B apply request is invalid',
  PLAN_B_PROPOSAL_NOT_FOUND: 'Plan B proposal was not found for this Trip',
  PLAN_B_PROPOSAL_INVALID: 'Stored Plan B proposal is invalid',
  PLAN_B_PROPOSAL_STALE: 'Plan B proposal no longer matches the canonical Trip',
  PLAN_B_CANDIDATE_NOT_FOUND: 'Plan B candidate was not found in this proposal',
  PLAN_B_TRIP_NOT_FOUND: 'Trip was not found',
  PLAN_B_SNAPSHOT_INVALID: 'Stored Plan B snapshot is invalid',
  PLAN_B_REVERT_CONFLICT: 'Canonical Trip changed after Plan B apply',
  IDEMPOTENCY_KEY_INVALID: 'Idempotency-Key must contain 16 to 128 characters',
  IDEMPOTENCY_KEY_REUSE: 'Idempotency-Key was already used for a different Plan B apply',
  TUTU_TIMEOUT: 'Tutu request timed out',
  TUTU_UNAVAILABLE: 'Tutu is temporarily unavailable',
  TUTU_TOOL_ERROR: 'Tutu request failed',
  TUTU_INVALID_RESPONSE: 'Tutu returned an unsupported response',
  TRANSPORT_CONTRACT_INVALID: 'Transport response is invalid',
  TUTU_ROUND_TRIP_UNSUPPORTED: 'Round-trip search is unsupported in Transport Contract V1',
  TUTU_MULTI_PASSENGER_UNSUPPORTED: 'Transport Contract V1 supports exactly one adult traveler',
  TUTU_PASSENGER_COMBINATION_UNSUPPORTED: 'Passenger combination is unsupported for this transport mode',
});

function sendError(res, error) {
  const code = error && SAFE_MESSAGES[error.code] ? error.code : 'PLAN_B_INTERNAL_ERROR';
  const status = code === 'PLAN_B_INTERNAL_ERROR' ? 500 : (error.status || 500);
  return res.status(status).json({
    error: {
      code: code,
      message: SAFE_MESSAGES[code] || 'Plan B operation failed',
      retryable: code === 'PLAN_B_INTERNAL_ERROR' ? false : !!error.retryable,
    },
  });
}

async function loadAccessibleTrip(prisma, tripId, userId) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, include: { participants: true } });
  if (!trip) return { error: 404 };
  const isOwner = trip.ownerId === userId;
  const isParticipant = (trip.participants || []).some(function (participant) {
    return isLinkedActiveParticipant(participant, userId);
  });
  if (!isOwner && !isParticipant) return { error: 403 };
  return { trip: trip, isOwner: isOwner };
}

function accessError(res, status) {
  return res.status(status).json({
    error: {
      code: status === 404 ? 'PLAN_B_TRIP_NOT_FOUND' : 'PLAN_B_TRIP_ACCESS_DENIED',
      message: status === 404 ? 'Trip was not found' : 'No access to this Trip',
      retryable: false,
    },
  });
}

function createPlanBRouter(options) {
  const settings = options || {};
  const prisma = settings.prisma || require('../db');
  const auth = settings.requireAuth || requireAuth;
  const adapter = settings.adapter || createTutuMcpAdapter();
  const service = settings.service || createPlanBService({ prisma: prisma, adapter: adapter, clock: settings.clock });
  const router = express.Router();

  async function withTripAccess(req, res) {
    const access = await loadAccessibleTrip(prisma, req.params.tripId, req.user.id);
    if (access.error) {
      accessError(res, access.error);
      return null;
    }
    return access;
  }

  router.post('/trips/:tripId/disruptions/demo', auth, async function (req, res) {
    try {
      const access = await withTripAccess(req, res);
      if (!access) return undefined;
      const disruption = await service.createDemoDisruption({ trip: access.trip, actorId: req.user.id, body: req.body });
      return res.status(201).json({ tripId: access.trip.id, disruption: disruption });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/trips/:tripId/plan-b/preview', auth, async function (req, res) {
    try {
      const access = await withTripAccess(req, res);
      if (!access) return undefined;
      const preview = await service.createPreview({ trip: access.trip, actorId: req.user.id, body: req.body || {} });
      return res.json(preview);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/trips/:tripId/plan-b/apply', auth, async function (req, res) {
    try {
      const access = await withTripAccess(req, res);
      if (!access) return undefined;
      if (!access.isOwner) {
        return res.status(403).json({
          error: { code: 'PLAN_B_OWNER_REQUIRED', message: 'Only the Trip owner can apply Plan B', retryable: false },
        });
      }
      const result = await service.apply({
        trip: access.trip,
        actorId: req.user.id,
        body: req.body,
        idempotencyKey: req.get('Idempotency-Key'),
      });
      return res.status(result.applied ? 201 : 200).json({
        tripId: access.trip.id,
        applyId: result.applyId,
        applied: result.applied,
        purchaseCompleted: false,
        trip: result.trip,
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/trips/:tripId/plan-b/revert', auth, async function (req, res) {
    try {
      const access = await withTripAccess(req, res);
      if (!access) return undefined;
      if (!access.isOwner) {
        return res.status(403).json({
          error: { code: 'PLAN_B_OWNER_REQUIRED', message: 'Only the Trip owner can revert Plan B', retryable: false },
        });
      }
      const result = await service.revert({ trip: access.trip, actorId: req.user.id });
      return res.json({
        tripId: access.trip.id,
        revertId: result.revertId,
        reverted: result.reverted,
        reason: result.reason,
        purchaseCompleted: false,
        trip: result.trip,
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

  return router;
}

const router = createPlanBRouter();
router.createPlanBRouter = createPlanBRouter;
router.loadAccessibleTrip = loadAccessibleTrip;
router.SAFE_MESSAGES = SAFE_MESSAGES;
router.configuredFor = config.nodeEnv;
module.exports = router;

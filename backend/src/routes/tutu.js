'use strict';

const express = require('express');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { validateSearchRequestV1 } = require('../contracts/transportOption');
const { createTutuMcpAdapter } = require('../services/tutuMcpAdapter');
const { createSelectionTokenService } = require('../services/tutuSelectionToken');
const { createTripFactory } = require('../services/tripFactory');

const SAFE_MESSAGES = Object.freeze({
  TRANSPORT_CONTRACT_INVALID: 'Transport request is invalid',
  TUTU_ROUND_TRIP_UNSUPPORTED: 'Round-trip search is unsupported in Transport Contract V1',
  TUTU_MULTI_PASSENGER_UNSUPPORTED: 'Transport Contract V1 supports exactly one adult traveler',
  TUTU_PASSENGER_COMBINATION_UNSUPPORTED: 'Passenger combination is unsupported for this transport mode',
  TUTU_SELECTION_INVALID: 'Transport selection token is invalid',
  TUTU_SELECTION_EXPIRED: 'Transport selection has expired',
  TUTU_SELECTION_USER_MISMATCH: 'Transport selection belongs to another user',
  TUTU_CHECKOUT_UNAVAILABLE: 'Checkout is unavailable for this transport selection',
  TUTU_PROVIDER_ROUND_TRIP_UNSUPPORTED: 'Provider round-trip packages are unsupported in Transport Contract V1',
  TUTU_TIMEOUT: 'Tutu request timed out',
  TUTU_UNAVAILABLE: 'Tutu is temporarily unavailable',
  TUTU_TOOL_ERROR: 'Tutu request failed',
  TUTU_INVALID_RESPONSE: 'Tutu returned an unsupported response',
  IDEMPOTENCY_KEY_INVALID: 'Idempotency-Key must contain 16 to 128 characters',
  IDEMPOTENCY_KEY_REUSE: 'Idempotency-Key was already used for a different transport selection',
});

function sendError(res, error) {
  const code = error && SAFE_MESSAGES[error.code] ? error.code : 'TUTU_INTERNAL_ERROR';
  const status = code === 'TUTU_INTERNAL_ERROR' ? 500 : (error.status || 500);
  return res.status(status).json({
    error: {
      code: code,
      message: SAFE_MESSAGES[code] || 'Transport operation failed',
      retryable: code === 'TUTU_INTERNAL_ERROR' ? false : !!error.retryable,
    },
  });
}

function createTutuRouter(options) {
  const settings = options || {};
  const auth = settings.requireAuth || requireAuth;
  const adapter = settings.adapter || createTutuMcpAdapter();
  const selectionTokens = settings.selectionTokens || createSelectionTokenService({ secret: config.jwtSecret });
  const tripFactory = settings.tripFactory || createTripFactory({ prisma: require('../db') });
  const router = express.Router();

  router.post('/search', auth, async function (req, res) {
    try {
      const request = validateSearchRequestV1(req.body);
      const selections = await adapter.search(request);
      return res.json({
        options: selections.map(function (selection) {
          return {
            option: selection.option,
            selectionToken: selectionTokens.signSelection(req.user.id, Object.assign({}, selection, {
              searchRequest: request,
            })),
          };
        }),
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/checkout-link', auth, async function (req, res) {
    try {
      const token = req.body && req.body.selectionToken;
      if (typeof token !== 'string' || !token) {
        const error = new Error('missing token');
        error.code = 'TUTU_SELECTION_INVALID'; error.status = 400;
        throw error;
      }
      const selection = selectionTokens.verifySelection(req.user.id, token);
      const checkout = await adapter.createCheckoutLink(selection.providerContext);
      return res.json({ checkout: checkout });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/demo-purchase-success', auth, async function (req, res) {
    try {
      const token = req.body && req.body.selectionToken;
      if (typeof token !== 'string' || !token) {
        const error = new Error('missing token');
        error.code = 'TUTU_SELECTION_INVALID'; error.status = 400;
        throw error;
      }
      const selection = selectionTokens.verifySelection(req.user.id, token);
      const result = await tripFactory.createFromSelection({
        user: req.user,
        idempotencyKey: req.get('Idempotency-Key'),
        option: selection.option,
        searchRequest: selection.searchRequest,
      });
      return res.status(result.created ? 201 : 200).json({
        tripId: result.trip.id,
        created: result.created,
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

  return router;
}

const router = createTutuRouter();
router.createTutuRouter = createTutuRouter;
module.exports = router;

'use strict';

const jwt = require('jsonwebtoken');
const {
  validateSearchRequestV1,
  validateTransportOptionV1,
} = require('../contracts/transportOption');

const ISSUER = 'travel-assistant-backend';
const AUDIENCE = 'tutu-transport-selection';
const PURPOSE = 'tutu_transport_selection_v1';
const ALGORITHM = 'HS256';
const TTL_SECONDS = 15 * 60;

function selectionError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.retryable = false;
  return error;
}

function validateProviderContext(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw selectionError('TUTU_SELECTION_INVALID', 'Transport selection provider context is invalid', 400);
  }
  const allowed = ['offerId', 'transport', 'checkoutRef', 'checkoutUrl', 'searchResultsUrl'];
  if (Object.keys(input).some(function (key) { return !allowed.includes(key); })) {
    throw selectionError('TUTU_SELECTION_INVALID', 'Transport selection provider context is invalid', 400);
  }
  if (input.checkoutRef !== null &&
      (!input.checkoutRef || typeof input.checkoutRef !== 'object' || Array.isArray(input.checkoutRef))) {
    throw selectionError('TUTU_SELECTION_INVALID', 'Transport selection checkout reference is invalid', 400);
  }
  return {
    offerId: input.offerId == null ? null : String(input.offerId),
    transport: input.transport == null ? null : String(input.transport),
    checkoutRef: input.checkoutRef === null ? null : Object.assign({}, input.checkoutRef),
    checkoutUrl: input.checkoutUrl == null ? null : String(input.checkoutUrl),
    searchResultsUrl: input.searchResultsUrl == null ? null : String(input.searchResultsUrl),
  };
}

function validateSelection(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(function (key) {
        return key !== 'option' && key !== 'providerContext' && key !== 'searchRequest';
      })) {
    throw selectionError('TUTU_SELECTION_INVALID', 'Transport selection is invalid', 400);
  }
  try {
    const normalized = {
      option: validateTransportOptionV1(input.option),
      providerContext: validateProviderContext(input.providerContext),
    };
    if (Object.hasOwn(input, 'searchRequest')) {
      normalized.searchRequest = validateSearchRequestV1(input.searchRequest);
    }
    return normalized;
  } catch (error) {
    if (error && error.code === 'TUTU_SELECTION_INVALID') throw error;
    throw selectionError('TUTU_SELECTION_INVALID', 'Transport selection is invalid', 400);
  }
}

function createSelectionTokenService(options) {
  const settings = options || {};
  const secret = settings.secret;
  if (typeof secret !== 'string' || !secret) throw new Error('Selection token secret is required');

  return Object.freeze({
    signSelection(userId, selection) {
      const normalized = validateSelection(selection);
      return jwt.sign({ purpose: PURPOSE, selection: normalized }, secret, {
        algorithm: ALGORITHM,
        subject: String(userId),
        issuer: ISSUER,
        audience: AUDIENCE,
        expiresIn: TTL_SECONDS,
      });
    },

    verifySelection(userId, token) {
      let payload;
      try {
        payload = jwt.verify(token, secret, {
          algorithms: [ALGORITHM],
          issuer: ISSUER,
          audience: AUDIENCE,
        });
      } catch (error) {
        if (error && error.name === 'TokenExpiredError') {
          throw selectionError('TUTU_SELECTION_EXPIRED', 'Transport selection has expired', 400);
        }
        throw selectionError('TUTU_SELECTION_INVALID', 'Transport selection token is invalid', 400);
      }
      if (payload.sub !== String(userId)) {
        throw selectionError('TUTU_SELECTION_USER_MISMATCH', 'Transport selection belongs to another user', 403);
      }
      if (payload.purpose !== PURPOSE) {
        throw selectionError('TUTU_SELECTION_INVALID', 'Transport selection token has an invalid purpose', 400);
      }
      return validateSelection(payload.selection);
    },
  });
}

module.exports = {
  createSelectionTokenService,
};

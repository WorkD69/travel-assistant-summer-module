const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');

const { createSelectionTokenService } = require('../src/services/tutuSelectionToken');

const SECRET = 'test-secret-with-sufficient-entropy';

function selection() {
  return {
    option: {
      schemaVersion: '1',
      id: 'to_1234567890abcdef',
      transportType: 'flight',
      segments: [{
        id: 'ts_1234567890abcdef', transportType: 'flight',
        departurePlace: 'Москва', arrivalPlace: 'Санкт-Петербург',
        departureAt: '2026-08-20T07:00:00+03:00', arrivalAt: '2026-08-20T08:30:00+03:00',
        serviceNumber: 'SU-001', carrierName: 'Example Air',
      }],
      price: { amount: 6345.62, currency: 'RUB', kind: 'unknown' },
      availability: null, transferCount: 0, durationMinutes: 90,
      source: { provider: 'tutu-mcp', tool: 'search_avia', serverVersion: '0.38.0' },
      fetchedAt: '2026-08-16T10:00:00.000Z',
    },
    providerContext: {
      offerId: 'avia-offer-1', transport: 'avia',
      checkoutRef: { product_type: 'avia', offer_id: 'avia-offer-1', is_round_trip: false },
      checkoutUrl: null, searchResultsUrl: 'https://www.tutu.ru/example',
    },
  };
}

test('signs and verifies a short-lived user-bound transport selection', () => {
  const service = createSelectionTokenService({ secret: SECRET });
  const token = service.signSelection('user-1', selection());
  const verified = service.verifySelection('user-1', token);

  assert.deepEqual(verified, selection());
  const decoded = jwt.decode(token, { complete: true });
  assert.equal(decoded.header.alg, 'HS256');
  assert.equal(decoded.payload.iss, 'travel-assistant-backend');
  assert.equal(decoded.payload.aud, 'tutu-transport-selection');
  assert.equal(decoded.payload.purpose, 'tutu_transport_selection_v1');
  assert.ok(decoded.payload.exp - decoded.payload.iat <= 15 * 60);
});

test('rejects tampering, the wrong user, and expired tokens with stable codes', () => {
  const service = createSelectionTokenService({ secret: SECRET });
  const token = service.signSelection('user-1', selection());
  assert.throws(() => service.verifySelection('user-1', token.slice(0, -1) + 'x'), function (error) {
    return error && error.code === 'TUTU_SELECTION_INVALID';
  });
  assert.throws(() => service.verifySelection('user-2', token), function (error) {
    return error && error.code === 'TUTU_SELECTION_USER_MISMATCH';
  });

  const expired = jwt.sign({ purpose: 'tutu_transport_selection_v1', selection: selection() }, SECRET, {
    algorithm: 'HS256', subject: 'user-1', issuer: 'travel-assistant-backend',
    audience: 'tutu-transport-selection', expiresIn: -1,
  });
  assert.throws(() => service.verifySelection('user-1', expired), function (error) {
    return error && error.code === 'TUTU_SELECTION_EXPIRED';
  });
});

test('rejects otherwise valid tokens signed with a non-allowlisted algorithm', () => {
  const service = createSelectionTokenService({ secret: SECRET });
  const token = jwt.sign({ purpose: 'tutu_transport_selection_v1', selection: selection() }, SECRET, {
    algorithm: 'HS384', subject: 'user-1', issuer: 'travel-assistant-backend',
    audience: 'tutu-transport-selection', expiresIn: '15m',
  });
  assert.throws(() => service.verifySelection('user-1', token), function (error) {
    return error && error.code === 'TUTU_SELECTION_INVALID';
  });
});

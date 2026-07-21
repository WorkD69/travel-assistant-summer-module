const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const { ApiError, errorEnvelope } = require('../src/errors');
const { assertAllowedOrigin } = require('../src/security/origin');
const {
  authenticateServiceRequest,
  authenticateServiceToken,
  constantTimeEqual,
  parseTelegramUserId,
} = require('../src/security/service-auth');
const { createOpaqueToken, hashToken, verifyToken } = require('../src/security/tokens');

describe('safe API errors', () => {
  test('uses the immutable OpenAPI error envelope', () => {
    assert.deepEqual(errorEnvelope('access_denied', 'Недостаточно прав.'), {
      error: { code: 'access_denied', message_ru: 'Недостаточно прав.' },
    });
    const error = new ApiError(403, 'access_denied', 'Недостаточно прав.');
    assert.equal(error.status, 403);
    assert.deepEqual(error.toJSON(), errorEnvelope('access_denied', 'Недостаточно прав.'));
  });
});

describe('service authentication primitives', () => {
  test('compares tokens without leaking length-specific behavior to callers', () => {
    assert.equal(constantTimeEqual('a'.repeat(64), 'a'.repeat(64)), true);
    assert.equal(constantTimeEqual('a'.repeat(64), 'b'.repeat(64)), false);
    assert.equal(constantTimeEqual('short', 'a'.repeat(64)), false);
  });

  test('accepts only positive decimal Telegram identifiers', () => {
    assert.equal(parseTelegramUserId('1234567890123456'), '1234567890123456');
    for (const value of ['', '0', '-12', '12.5', 'abc', '1e4', '123456789012345678901']) {
      assert.throws(() => parseTelegramUserId(value), (error) => {
        assert.equal(error.code, 'invalid_telegram_user_id');
        return true;
      });
    }
  });

  test('requires both the Bearer service token and Telegram identity', () => {
    const expected = 's'.repeat(64);
    assert.deepEqual(
      authenticateServiceRequest(`Bearer ${expected}`, '42', expected),
      { telegramUserId: '42' },
    );
    assert.throws(
      () => authenticateServiceRequest('Bearer wrong', '42', expected),
      (error) => error.status === 401 && error.code === 'service_unauthorized',
    );
  });

  test('allows service-only polling without a Telegram identity', () => {
    const expected = 's'.repeat(64);
    assert.doesNotThrow(() => authenticateServiceToken(`Bearer ${expected}`, expected));
    assert.throws(
      () => authenticateServiceToken('Bearer wrong', expected),
      (error) => error.status === 401 && error.code === 'service_unauthorized',
    );
  });
});

describe('browser mutation Origin policy', () => {
  const allowlist = ['https://travel-assistant-summer-module.vercel.app'];

  test('allows safe methods and the exact production origin', () => {
    assert.doesNotThrow(() => assertAllowedOrigin('GET', undefined, allowlist, true));
    assert.doesNotThrow(() =>
      assertAllowedOrigin('POST', allowlist[0], allowlist, true),
    );
  });

  test('rejects missing, malformed, and lookalike origins for mutations', () => {
    for (const origin of [
      undefined,
      'not-a-url',
      'https://travel-assistant-summer-module.vercel.app.evil.test',
    ]) {
      assert.throws(
        () => assertAllowedOrigin('PATCH', origin, allowlist, true),
        (error) => error.status === 403 && error.code === 'origin_denied',
      );
    }
  });
});

describe('opaque one-time tokens', () => {
  test('returns only a SHA-256 hash for persistence', () => {
    const token = createOpaqueToken();
    assert.match(token.raw, /^[A-Za-z0-9_-]+$/);
    assert.match(token.hash, /^[a-f0-9]{64}$/);
    assert.notEqual(token.raw, token.hash);
    assert.equal(hashToken(token.raw), token.hash);
    assert.equal(verifyToken(token.raw, token.hash), true);
    assert.equal(verifyToken(`${token.raw}x`, token.hash), false);
  });
});

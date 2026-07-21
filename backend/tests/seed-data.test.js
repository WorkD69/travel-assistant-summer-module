const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const { SEED_DATA } = require('../src/seed-data');

describe('safe deterministic seed data', () => {
  test('uses stable identities required by the existing bot links', () => {
    assert.deepEqual(
      SEED_DATA.users.map((user) => user.id),
      ['u-artem', 'u-anna', 'u-no-access'],
    );
    assert.equal(SEED_DATA.trip.id, 'trip-turkey-2026');
  });

  test('contains exactly three distinct Plan B strategies', () => {
    assert.equal(SEED_DATA.plans.length, 3);
    assert.equal(new Set(SEED_DATA.plans.map((plan) => plan.rank)).size, 3);
    assert.equal(new Set(SEED_DATA.plans.map((plan) => plan.strategy)).size, 3);
  });

  test('contains no credentials, Telegram identifiers, or personal documents', () => {
    const serialized = JSON.stringify(SEED_DATA);
    assert.doesNotMatch(serialized, /password|telegramUserId|passport|bank card/i);
    assert.doesNotMatch(serialized, /Password2026|gsk_|\d{8,12}:[\w-]{30,}/);
    assert.ok(SEED_DATA.documents.every((doc) => doc.safeDemo === true));
  });
});

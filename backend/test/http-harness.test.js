const assert = require('node:assert/strict');
const test = require('node:test');

const { runHarness } = require('../scripts/http-harness');

test('live HTTP harness validates browser auth and Telegram consumer endpoints', async () => {
  const result = await runHarness();

  assert.equal(result.ok, true);
  assert.equal(result.aiConfigured, false);
  assert.deepEqual(result.checked, [
    'health',
    'register-and-restore-session',
    'create-trip',
    'telegram-link-consume',
    'telegram-link-security-lifecycle',
    'owner-only-atomic-trip-patch',
    'telegram-me-and-trips',
    'telegram-assistant-context',
    'structured-plan-b-alternatives',
    'atomic-plan-b-apply',
    'legacy-plan-b-fail-closed-and-idor',
    'plan-b-core-http-preview-apply-revert',
    'typed-change-outbox-events',
    'invitation-1d-3d-7d-lifecycle',
    'telegram-notification-preferences',
    'telegram-sos-idempotency',
    'telegram-notification-queue',
    'service-token-rejection',
    'yellow-zone-access-idor-and-visibility',
  ]);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const helperPath = path.resolve(__dirname, '../src/services/tripAccess.js');

function loadHelper() {
  assert.ok(fs.existsSync(helperPath), 'tripAccess helper must exist');
  return require(helperPath);
}

test('isActiveParticipantAccess allows only confirmed active access semantics', () => {
  const access = loadHelper();

  ['active', ' ACTIVE ', 'Активен', 'АКТИВЕН'].forEach((value) => {
    assert.equal(access.isActiveParticipantAccess(value), true, value);
  });

  ['revoked', 'invited', 'inactive', 'denied', '', '  ', 'unknown', 'Активна'].forEach((value) => {
    assert.equal(access.isActiveParticipantAccess(value), false, value || '(blank)');
  });
  assert.equal(access.isActiveParticipantAccess(null), false);
  assert.equal(access.isActiveParticipantAccess(undefined), false);
});

test('isLinkedActiveParticipant requires the exact linked user and active access', () => {
  const access = loadHelper();
  const active = { userId: 'user-a', access: 'active' };

  assert.equal(access.isLinkedActiveParticipant(active, 'user-a'), true);
  assert.equal(access.isLinkedActiveParticipant({ userId: 'user-a', access: 'Активен' }, 'user-a'), true);
  assert.equal(access.isLinkedActiveParticipant(active, 'user-b'), false);
  assert.equal(access.isLinkedActiveParticipant({ userId: null, access: 'active', name: 'User A' }, 'user-a'), false);
  assert.equal(access.isLinkedActiveParticipant({ userId: 'user-a', access: 'revoked' }, 'user-a'), false);
  assert.equal(access.isLinkedActiveParticipant(null, 'user-a'), false);
  assert.equal(access.isLinkedActiveParticipant(active, null), false);
});

test('canReadDocument is fail-closed for participant visibility while owner or organizer sees all', () => {
  const access = loadHelper();
  const owner = { isOwner: true, isActiveParticipant: false, role: '' };
  const organizer = { isOwner: false, isActiveParticipant: true, role: 'organizer' };
  const participant = { isOwner: false, isActiveParticipant: true, role: 'participant' };
  const denied = { isOwner: false, isActiveParticipant: false, role: 'participant' };

  ['shared', 'organizer_only', 'personal', 'unknown', '', null].forEach((visibility) => {
    assert.equal(access.canReadDocument({ visibility }, owner), true, 'owner: ' + visibility);
    assert.equal(access.canReadDocument({ visibility }, organizer), true, 'organizer: ' + visibility);
  });

  assert.equal(access.canReadDocument({ visibility: 'shared' }, participant), true);
  ['organizer', 'organizer_only', 'personal', 'unknown', '', null].forEach((visibility) => {
    assert.equal(access.canReadDocument({ visibility }, participant), false, 'participant: ' + visibility);
  });
  assert.equal(access.canReadDocument({ visibility: 'shared' }, denied), false);
  assert.equal(access.canReadDocument({ visibility: 'shared' }, null), false);
});

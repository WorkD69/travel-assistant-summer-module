const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  ACTIONS,
  assertCan,
  buildTripAccess,
  scopeChildToTrip,
} = require('../src/access/trip-access');

const trip = { id: 'trip-a', ownerId: 'owner' };

describe('trip access context', () => {
  test('derives organizer status from the database owner', () => {
    const access = buildTripAccess(trip, 'owner', null);
    assert.equal(access.role, 'organizer');
    assert.equal(access.can(ACTIONS.EDIT_TRIP), true);
    assert.equal(access.can(ACTIONS.VIEW_ALL_SOS), true);
  });

  test('gives participants and viewers only their explicit permissions', () => {
    const participant = buildTripAccess(trip, 'member', {
      userId: 'member',
      role: 'participant',
      status: 'active',
    });
    assert.equal(participant.can(ACTIONS.READ_TRIP), true);
    assert.equal(participant.can(ACTIONS.CREATE_OWN_SOS), true);
    assert.equal(participant.can(ACTIONS.EDIT_TRIP), false);
    assert.equal(participant.can(ACTIONS.SELECT_PLAN), false);

    const viewer = buildTripAccess(trip, 'viewer', {
      userId: 'viewer',
      role: 'viewer',
      status: 'active',
    });
    assert.equal(viewer.can(ACTIONS.READ_TRIP), true);
    assert.equal(viewer.can(ACTIONS.CREATE_OWN_SOS), false);
    assert.equal(viewer.can(ACTIONS.USE_ASSISTANT), false);
  });

  test('hides trip existence from revoked and unrelated users', () => {
    for (const membership of [null, { userId: 'x', role: 'participant', status: 'revoked' }]) {
      assert.throws(
        () => buildTripAccess(trip, 'x', membership),
        (error) => error.status === 404 && error.code === 'trip_not_found',
      );
    }
  });

  test('rejects organizer actions for a participant with a safe envelope', () => {
    const access = buildTripAccess(trip, 'member', {
      userId: 'member',
      role: 'participant',
      status: 'active',
    });
    assert.throws(
      () => assertCan(access, ACTIONS.MANAGE_PARTICIPANTS),
      (error) => error.status === 403 && error.code === 'access_denied',
    );
  });
});

describe('cross-trip object scoping', () => {
  test('returns a child only when its parent trip matches the URL trip', () => {
    const child = { id: 'doc-a', tripId: 'trip-a' };
    assert.equal(scopeChildToTrip(child, 'trip-a', 'document_not_found'), child);
  });

  test('hides missing and foreign child identifiers', () => {
    for (const child of [null, { id: 'doc-b', tripId: 'trip-b' }]) {
      assert.throws(
        () => scopeChildToTrip(child, 'trip-a', 'document_not_found'),
        (error) => error.status === 404 && error.code === 'document_not_found',
      );
    }
  });
});

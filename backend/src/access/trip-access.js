const { ApiError } = require('../errors');

const ACTIONS = Object.freeze({
  READ_TRIP: 'read_trip',
  EDIT_TRIP: 'edit_trip',
  DELETE_TRIP: 'delete_trip',
  COMPLETE_TRIP: 'complete_trip',
  MANAGE_PARTICIPANTS: 'manage_participants',
  MANAGE_INVITATIONS: 'manage_invitations',
  MANAGE_DOCUMENTS: 'manage_documents',
  READ_ALLOWED_DOCUMENTS: 'read_allowed_documents',
  CONFIRM_INCIDENT: 'confirm_incident',
  GENERATE_PLANS: 'generate_plans',
  SELECT_PLAN: 'select_plan',
  PUBLISH_MESSAGE: 'publish_message',
  READ_PUBLISHED: 'read_published',
  CREATE_OWN_SOS: 'create_own_sos',
  READ_OWN_SOS: 'read_own_sos',
  VIEW_ALL_SOS: 'view_all_sos',
  USE_ASSISTANT: 'use_assistant',
});

const ORGANIZER_PERMISSIONS = new Set(Object.values(ACTIONS));
const PARTICIPANT_PERMISSIONS = new Set([
  ACTIONS.READ_TRIP,
  ACTIONS.READ_ALLOWED_DOCUMENTS,
  ACTIONS.READ_PUBLISHED,
  ACTIONS.CREATE_OWN_SOS,
  ACTIONS.READ_OWN_SOS,
  ACTIONS.USE_ASSISTANT,
]);
const VIEWER_PERMISSIONS = new Set([
  ACTIONS.READ_TRIP,
  ACTIONS.READ_ALLOWED_DOCUMENTS,
  ACTIONS.READ_PUBLISHED,
]);

function tripNotFound() {
  return new ApiError(404, 'trip_not_found', 'Поездка не найдена.');
}

function buildTripAccess(trip, userId, membership) {
  if (!trip) throw tripNotFound();

  let role;
  let permissions;
  if (trip.ownerId === userId) {
    role = 'organizer';
    permissions = ORGANIZER_PERMISSIONS;
  } else if (
    membership &&
    membership.userId === userId &&
    membership.status === 'active'
  ) {
    role = membership.role;
    if (role === 'organizer') permissions = ORGANIZER_PERMISSIONS;
    else if (role === 'participant') permissions = PARTICIPANT_PERMISSIONS;
    else if (role === 'viewer') permissions = VIEWER_PERMISSIONS;
  }

  if (!permissions) throw tripNotFound();

  return Object.freeze({
    trip,
    userId,
    role,
    membership: membership || null,
    can(action) {
      return permissions.has(action);
    },
  });
}

function assertCan(access, action) {
  if (!access || !access.can(action)) {
    throw new ApiError(403, 'access_denied', 'Недостаточно прав.');
  }
  return access;
}

function scopeChildToTrip(child, tripId, code = 'object_not_found') {
  if (!child || child.tripId !== tripId) {
    throw new ApiError(404, code, 'Объект не найден.');
  }
  return child;
}

async function loadTripAccess(prisma, userId, tripId) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      participants: {
        where: { userId },
        take: 1,
      },
    },
  });
  return buildTripAccess(trip, userId, trip && trip.participants[0]);
}

module.exports = {
  ACTIONS,
  assertCan,
  buildTripAccess,
  loadTripAccess,
  scopeChildToTrip,
};

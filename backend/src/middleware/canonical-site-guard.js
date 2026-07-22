const { ApiError } = require('../errors');

function notFound() {
  return new ApiError(404, 'not_found', 'Ресурс не найден.');
}

function accessDenied() {
  return new ApiError(403, 'access_denied', 'Недостаточно прав.');
}

function createMonitoringAccessGuard({ prisma }) {
  return async function monitoringAccessGuard(req, _res, next) {
    try {
      const trip = await prisma.trip.findUnique({
        where: { id: req.params.tripId },
        include: { participants: { where: { userId: req.user.id, status: 'active' }, take: 1 } },
      });
      if (!trip) {
        const safeRead = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
        const bootstrapPost = req.method === 'POST'
          && ['/', '/assistant', '/plan'].includes(req.path);
        if (safeRead || bootstrapPost) {
          next();
          return;
        }
        throw notFound();
      }
      const membership = trip.participants?.find((item) => item.userId === req.user.id)
        || trip.participants?.[0];
      const isOwner = trip.ownerId === req.user.id;
      const isMember = isOwner || (membership && membership.status !== 'revoked');
      if (!isMember) throw notFound();

      const changesPlan = req.path.startsWith('/plan') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      if (changesPlan && !isOwner && membership?.role !== 'organizer') throw accessDenied();
      next();
    } catch (error) {
      next(error);
    }
  };
}

const CHILD_MODELS = Object.freeze({
  participants: 'participant',
  invitations: 'invitation',
  documents: 'document',
  messages: 'message',
});

function createChildTripScopeGuard({ prisma }) {
  return async function childTripScopeGuard(req, _res, next) {
    try {
      const modelName = CHILD_MODELS[req.params.collection];
      if (!modelName || (req.params.collection === 'documents' && req.params.childId === 'upload')) {
        next();
        return;
      }
      const checksChild = ['PATCH', 'DELETE'].includes(req.method)
        || (req.method === 'GET' && req.params.collection === 'documents');
      if (!checksChild) {
        next();
        return;
      }
      const child = await prisma[modelName].findUnique({ where: { id: req.params.childId } });
      if (!child || child.tripId !== req.params.tripId) throw notFound();
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { createChildTripScopeGuard, createMonitoringAccessGuard };

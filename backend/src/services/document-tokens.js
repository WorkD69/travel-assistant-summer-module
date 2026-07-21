const { ApiError } = require('../errors');
const { createOpaqueToken, hashToken } = require('../security/tokens');

function documentVisible(document, userId, role) {
  if (!document || document.status === 'deleted' || document.status === 'revoked') return false;
  if (role === 'organizer') return true;
  if (document.visibility === 'shared') return true;
  if (document.visibility === 'personal') {
    return document.ownerUserId === userId || document.allowedUserId === userId;
  }
  return false;
}

async function createDocumentToken(prisma, { document, userId, role, ttlSeconds, now = new Date() }) {
  if (!documentVisible(document, userId, role)) {
    throw new ApiError(404, 'not_found', 'Документ не найден.');
  }
  const token = createOpaqueToken();
  await prisma.documentDownloadToken.create({
    data: {
      tokenHash: token.hash,
      documentId: document.id,
      userId,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
    },
  });
  return token.raw;
}

async function resolveDocumentToken(prisma, rawToken, now = new Date()) {
  const record = await prisma.documentDownloadToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: {
      user: true,
      document: { include: { blob: true, trip: true } },
    },
  });
  if (!record || record.revokedAt || record.expiresAt <= now || !record.document?.blob) {
    throw new ApiError(404, 'not_found', 'Ссылка недействительна.');
  }
  const membership = await prisma.participant.findUnique({
    where: { tripId_userId: { tripId: record.document.tripId, userId: record.userId } },
  });
  const role = record.document.trip.ownerId === record.userId ? 'organizer' : membership?.role;
  if (!membership && role !== 'organizer') {
    throw new ApiError(404, 'not_found', 'Ссылка недействительна.');
  }
  if (membership?.status === 'revoked' || !documentVisible(record.document, record.userId, role)) {
    throw new ApiError(404, 'not_found', 'Ссылка недействительна.');
  }
  return record.document;
}

module.exports = { createDocumentToken, documentVisible, resolveDocumentToken };

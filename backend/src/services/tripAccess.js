'use strict';

const ACTIVE_PARTICIPANT_ACCESS = new Set(['active', 'активен']);

function normalizedValue(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isActiveParticipantAccess(value) {
  return ACTIVE_PARTICIPANT_ACCESS.has(normalizedValue(value));
}

function isLinkedActiveParticipant(participant, userId) {
  if (!participant || typeof userId !== 'string' || !userId) return false;
  return participant.userId === userId && isActiveParticipantAccess(participant.access);
}

function canReadDocument(document, access) {
  if (!document || !access) return false;
  if (access.isOwner || access.role === 'organizer') return true;
  if (!access.isActiveParticipant) return false;
  return normalizedValue(document.visibility) === 'shared';
}

module.exports = {
  isActiveParticipantAccess,
  isLinkedActiveParticipant,
  canReadDocument,
};

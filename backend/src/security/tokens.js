const crypto = require('node:crypto');

const { constantTimeEqual } = require('./service-auth');

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw), 'utf8').digest('hex');
}

function createOpaqueToken(bytes = 32) {
  const raw = crypto.randomBytes(bytes).toString('base64url');
  return { raw, hash: hashToken(raw) };
}

function verifyToken(raw, expectedHash) {
  return constantTimeEqual(hashToken(raw), expectedHash);
}

module.exports = { createOpaqueToken, hashToken, verifyToken };

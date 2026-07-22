const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');

const repository = path.join(__dirname, '..', '..');
const manifest = require('./fixtures/canonical-source-manifest.json');

function read(relativePath) {
  return fs.readFileSync(path.join(repository, relativePath));
}

function text(relativePath) {
  return read(relativePath).toString('utf8');
}

function sha256(relativePath) {
  return crypto.createHash('sha256').update(read(relativePath)).digest('hex');
}

describe('canonical teammate source boundary', () => {
  test('keeps every directly restored business file byte-identical', () => {
    for (const [relativePath, expectedHash] of Object.entries(manifest)) {
      assert.equal(sha256(relativePath), expectedHash, relativePath);
    }
  });

  test('mounts teammate site routes instead of replacement site contracts', () => {
    const app = text('backend/src/app.js');
    assert.match(app, /\/api\/auth/);
    assert.match(app, /app\.use\(['"]\/api['"],\s*(?:monitoringRoutes|geoRoutes|tripsRoutes)\)/);
    assert.doesNotMatch(app, /\/api\/site\/trips|\/api\/site\/geo/);
  });

  test('does not load replacement route, assistant, or sync controllers', () => {
    const html = fs.readdirSync(path.join(repository, 'frontend'))
      .filter((name) => name.endsWith('.html'))
      .map((name) => text(`frontend/${name}`))
      .join('\n');
    assert.doesNotMatch(html, /route-experience\.js|site-assistant\.js|site-sync\.js/);
  });
});

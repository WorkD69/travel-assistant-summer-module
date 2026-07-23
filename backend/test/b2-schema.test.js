const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('B2 schema is additive and records trip changes', () => {
  const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
  const migration = fs.readFileSync(
    'prisma/migrations/20260723_version_b2/migration.sql',
    'utf8',
  );

  assert.match(schema, /updatedAt\s+DateTime\s+@updatedAt/);
  assert.match(schema, /model TripChange\s*\{/);
  assert.match(schema, /changes\s+TripChange\[\]/);
  assert.match(migration, /ALTER TABLE "Trip" ADD COLUMN "updatedAt"/);
  assert.match(migration, /CREATE TABLE "TripChange"/);
});


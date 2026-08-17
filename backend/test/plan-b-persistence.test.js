'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { PrismaClient } = require('@prisma/client');
const { createPlanBService } = require('../src/services/planB');

const BACKEND_ROOT = path.resolve(__dirname, '..');

function pushSchema(databaseUrl) {
  const prismaCli = path.join(BACKEND_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
  const result = spawnSync(prismaCli, ['db', 'push', '--skip-generate'], {
    cwd: BACKEND_ROOT,
    env: Object.assign({}, process.env, { DATABASE_URL: databaseUrl }),
    encoding: 'utf8', windowsHide: true,
  });
  assert.equal(result.status, 0, 'temporary Plan B database schema must be ready: ' + String(result.stderr || result.stdout || '').trim());
}

function option(id, departureAt, arrivalAt, amount) {
  return {
    schemaVersion: '1', id: id, transportType: 'flight',
    segments: [{
      id: id + '-segment', transportType: 'flight', departurePlace: 'SVO', arrivalPlace: 'LED', departureAt: departureAt, arrivalAt: arrivalAt,
      serviceNumber: id, carrierName: 'Example Air',
    }],
    price: { amount: amount, currency: 'RUB', kind: 'unknown' }, availability: null,
    transferCount: 0,
    durationMinutes: Math.round((new Date(arrivalAt) - new Date(departureAt)) / 60000),
    source: { provider: 'tutu-mcp', tool: 'search_avia', serverVersion: 'test' },
    fetchedAt: '2026-08-17T08:00:00.000Z',
  };
}

function storedSegments(transport) {
  return transport.segments.map(function (segment, index) {
    return Object.assign({}, segment, { order: index, transportOptionId: transport.id, source: 'tutu-mcp', fetchedAt: transport.fetchedAt });
  });
}

test('real Prisma persistence applies exactly one selected proposal and safely restores the pre-apply canonical snapshot', async () => {
  const databasePath = path.join(os.tmpdir(), 'plan-b-persistence-' + crypto.randomUUID() + '.db');
  const databaseUrl = 'file:' + databasePath;
  let prisma;
  try {
    pushSchema(databaseUrl);
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const owner = await prisma.user.create({ data: {
      email: 'plan-b-' + crypto.randomUUID() + '@example.test', passwordHash: 'not-used-in-this-test', name: 'Plan B Owner', initials: 'PO',
    } });
    const original = option('original-service', '2026-08-20T08:00:00+03:00', '2026-08-20T09:30:00+03:00', 7000);
    const created = await prisma.trip.create({ data: {
      title: 'SVO → LED', route: 'SVO → LED', segments: JSON.stringify(storedSegments(original)),
      startDate: new Date(original.segments[0].departureAt), endDate: new Date(original.segments[0].arrivalAt),
      status: 'active', type: 'solo', ownerId: owner.id,
    } });
    const before = await prisma.trip.findUnique({ where: { id: created.id } });
    const replacement = option('replacement-service', '2026-08-20T10:00:00+03:00', '2026-08-20T11:20:00+03:00', 6800);
    const service = createPlanBService({
      prisma: prisma,
      adapter: { async search() { return [{ option: replacement }]; } },
      clock: function () { return new Date('2026-08-17T09:00:00.000Z'); },
    });
    await service.createDemoDisruption({ trip: before, actorId: owner.id, body: { type: 'CARRIER_CANCELLED' } });
    const preview = await service.createPreview({ trip: before, actorId: owner.id, body: { preferences: ['cheaper'] } });
    assert.equal(preview.candidates.length, 1);

    const applied = await service.apply({
      trip: before,
      actorId: owner.id,
      body: { proposalId: preview.proposalId, candidateId: preview.candidates[0].candidateId },
      idempotencyKey: 'prisma-plan-b-apply-0001',
    });
    assert.equal(applied.applied, true);
    assert.equal(JSON.parse(applied.trip.segments)[0].transportOptionId, 'replacement-service');
    const replay = await service.apply({
      trip: applied.trip,
      actorId: owner.id,
      body: { proposalId: preview.proposalId, candidateId: preview.candidates[0].candidateId },
      idempotencyKey: 'prisma-plan-b-apply-0001',
    });
    assert.equal(replay.applied, false);
    assert.equal(await prisma.tripChange.count({ where: { tripId: created.id, type: 'plan_b_apply' } }), 1);

    const reverted = await service.revert({ trip: applied.trip, actorId: owner.id });
    assert.equal(reverted.reverted, true);
    const restored = reverted.trip;
    assert.equal(restored.route, before.route);
    assert.equal(restored.segments, before.segments);
    assert.equal(restored.startDate.toISOString(), before.startDate.toISOString());
    assert.equal(restored.endDate.toISOString(), before.endDate.toISOString());
    const revertReplay = await service.revert({ trip: restored, actorId: owner.id });
    assert.equal(revertReplay.reverted, false);
    assert.equal(revertReplay.reason, 'PLAN_B_ALREADY_REVERTED');
  } finally {
    if (prisma) await prisma.$disconnect();
    for (const candidate of [databasePath, databasePath + '-journal']) {
      if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
    }
  }
});

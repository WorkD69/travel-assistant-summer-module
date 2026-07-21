const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const { buildPlanCandidates, generatePlans } = require('../src/services/plan-b');

describe('Plan B service', () => {
  test('always returns exactly three distinct human-selectable strategies', () => {
    const candidates = buildPlanCandidates({ id: 'sig-1', type: 'flight_delay', label: 'Flight delayed', detail: 'Delay 4 hours' });
    assert.equal(candidates.length, 3);
    assert.deepEqual(candidates.map((item) => item.rank), [1, 2, 3]);
    assert.deepEqual(new Set(candidates.map((item) => item.strategy)).size, 3);
    assert.deepEqual(candidates.map((item) => item.strategy), ['fast', 'reliable', 'delegate']);
    assert.ok(candidates.every((item) => Array.isArray(item.steps) && item.steps.length >= 2));
    assert.ok(candidates.every((item) => item.status === undefined && item.visibility === undefined));
  });

  test('upserts the three candidates without allowing AI to select one', async () => {
    const writes = [];
    const tx = {
      monitoringSignal: {
        async findFirst() { return { id: 'sig-1', tripId: 't-1', status: 'confirmed', type: 'delay', label: 'Delay', detail: '4 hours' }; },
      },
      tripPlan: {
        async deleteMany() { return { count: 0 }; },
        async upsert(query) { writes.push(query); return query.create; },
      },
    };
    const prisma = { async $transaction(callback) { return callback(tx); } };
    const plans = await generatePlans(prisma, { tripId: 't-1', incidentId: 'sig-1', userId: 'u-1' });
    assert.equal(plans.length, 3);
    assert.ok(writes.every((query) => query.create.status === 'candidate'));
    assert.ok(writes.every((query) => query.create.visibility === 'internal'));
    assert.ok(writes.every((query) => query.create.selectedAt === undefined));
  });
});

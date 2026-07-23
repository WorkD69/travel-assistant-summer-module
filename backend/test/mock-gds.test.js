const assert = require('node:assert/strict');
const test = require('node:test');

const { buildDemoAlternatives } = require('../src/services/mockGds');
const { validatePlansPayload } = require('../src/services/planValidation');

test('Mock GDS returns three distinct structured demo routes', () => {
  const payload = buildDemoAlternatives({
    id: 'trip-1',
    route: 'Санкт-Петербург → Москва',
    startDate: new Date('2026-08-02T08:00:00.000Z'),
    segments: '[]',
  });

  assert.equal(payload.plans.length, 3);
  assert.deepEqual(payload.plans.map((plan) => plan.strategy), ['fastest', 'cheapest', 'reliable']);
  assert.equal(new Set(payload.plans.map((plan) => plan.revisedRoute)).size, 3);
  for (const plan of payload.plans) {
    assert.ok(plan.id);
    assert.ok(plan.title);
    assert.ok(Array.isArray(plan.segments) && plan.segments.length > 0);
    assert.ok(plan.segments.every((segment) => (
      segment.transportType && segment.departurePlace && segment.arrivalPlace &&
      segment.departureAt && segment.arrivalAt
    )));
    assert.equal(typeof plan.estimatedCost, 'number');
    assert.ok(plan.currency);
    assert.equal(typeof plan.transferCount, 'number');
    assert.ok(plan.reliability);
    assert.ok(Array.isArray(plan.risks));
    assert.ok(Array.isArray(plan.assumptions));
    assert.ok(Array.isArray(plan.requiredActions));
    assert.equal(plan.source, 'Mock GDS demo catalog');
    assert.equal(plan.isDemoData, true);
  }
  assert.equal(validatePlansPayload(payload).plans.length, 3);
});


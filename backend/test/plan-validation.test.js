const test = require('node:test');
const assert = require('node:assert/strict');

const { validatePlansPayload } = require('../src/services/planValidation');

function completePlan(title) {
  return {
    id: 'plan-' + title,
    title: title,
    strategy: 'fastest',
    revisedRoute: 'Москва → Казань',
    segments: [{
      transportType: 'train',
      departurePlace: 'Москва',
      arrivalPlace: 'Казань',
      departureAt: '2026-08-02T08:00:00.000Z',
      arrivalAt: '2026-08-02T15:00:00.000Z',
    }],
    totalDuration: '7 ч',
    estimatedCost: 6500,
    currency: 'RUB',
    delayComparedToOriginal: '2 ч',
    transferCount: 0,
    reliability: 'high',
    risks: ['Возможна корректировка расписания'],
    assumptions: ['Места проверяются перед оформлением'],
    requiredActions: ['Проверить расписание у перевозчика'],
    hotelImpact: 'Предупредить о новом времени',
    transferImpact: 'Перенести трансфер',
    activitiesImpact: 'Сдвинуть первую активность',
    source: 'Mock GDS demo catalog',
    isDemoData: true,
    steps: ['Проверить доступные варианты'],
    pros: 'Экономит время',
    cons: 'Требует компромисса',
    whenToUse: 'Когда исходный маршрут недоступен',
  };
}

test('accepts exactly three complete Plan B alternatives', () => {
  const fastest = completePlan('A');
  const cheapest = completePlan('B');
  const reliable = completePlan('C');
  cheapest.strategy = 'cheapest';
  reliable.strategy = 'reliable';
  const payload = {
    summary: 'Требуется изменить маршрут',
    plans: [fastest, cheapest, reliable],
  };

  assert.equal(validatePlansPayload(payload).plans.length, 3);
});

test('rejects any Plan B count other than three', () => {
  assert.throws(
    () => validatePlansPayload({ plans: [] }),
    /ровно 3/i,
  );
  assert.throws(
    () => validatePlansPayload({ plans: [completePlan('A')] }),
    /ровно 3/i,
  );
  assert.throws(
    () => validatePlansPayload({
      plans: [
        completePlan('A'),
        completePlan('B'),
        completePlan('C'),
        completePlan('D'),
      ],
    }),
    /ровно 3/i,
  );
});

test('rejects incomplete Plan B entries', () => {
  assert.throws(
    () => validatePlansPayload({ plans: [{}, {}, {}] }),
    /поле/i,
  );
});

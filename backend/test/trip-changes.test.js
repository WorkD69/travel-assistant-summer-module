const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildTripChangeEvents,
  notificationTypeForChange,
} = require('../src/services/tripChanges');

test('trip diff creates typed route, date, and segment events', () => {
  const before = {
    route: 'Сыктывкар → Москва',
    startDate: new Date('2026-08-01T08:00:00.000Z'),
    endDate: new Date('2026-08-05T20:00:00.000Z'),
    segments: JSON.stringify([{ id: 'old', from: 'Сыктывкар', to: 'Москва' }]),
  };
  const after = {
    route: 'Санкт-Петербург → Москва',
    startDate: new Date('2026-08-02T08:00:00.000Z'),
    endDate: new Date('2026-08-06T20:00:00.000Z'),
    segments: JSON.stringify([{ id: 'new', from: 'Санкт-Петербург', to: 'Москва' }]),
  };

  const events = buildTripChangeEvents(before, after);

  assert.deepEqual(events.map((event) => event.type), [
    'route_changed',
    'dates_changed',
    'segments_changed',
  ]);
  assert.equal(events[0].oldValue, 'Сыктывкар → Москва');
  assert.equal(events[0].newValue, 'Санкт-Петербург → Москва');
  assert.equal(notificationTypeForChange('route_changed'), 'route_changed');
  assert.equal(notificationTypeForChange('dates_changed'), 'dates_changed');
  assert.equal(notificationTypeForChange('segments_changed'), 'segments_changed');
});

test('trip diff is empty when canonical values did not change', () => {
  const value = {
    route: 'Москва → Казань',
    startDate: new Date('2026-09-01T08:00:00.000Z'),
    endDate: null,
    segments: '[{"id":"s1"}]',
  };

  assert.deepEqual(buildTripChangeEvents(value, Object.assign({}, value)), []);
});


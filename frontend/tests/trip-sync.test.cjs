const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadTripSync(updateImpl) {
  const writes = [];
  const current = {
    trip: {
      id: 'trip-1',
      title: 'Old title',
      route: 'Сыктывкар → Москва',
      status: 'active',
      type: 'group',
      segments: [],
    },
  };
  const context = {
    console: { warn() {} },
    document: { readyState: 'complete', addEventListener() {} },
    window: {
      TravelApi: {
        ensureAuth: async () => ({ id: 'owner-1' }),
        updateTrip: updateImpl,
      },
      TravelAppState: {
        getState: () => current,
        setState(partial, meta) {
          writes.push({ partial, meta });
          Object.assign(current, partial);
        },
        createTrip() {},
        updateTrip() {},
      },
    },
  };
  vm.runInNewContext(fs.readFileSync('assets/js/trip-sync.js', 'utf8'), context);
  return { sync: context.window.TravelTripSync, writes, current };
}

test('canonical trip update sends the full patch and replaces shared state from server', async () => {
  const calls = [];
  const fixture = loadTripSync(async (tripId, patch) => {
    calls.push({ tripId, patch });
    return { trip: Object.assign({ id: tripId, updatedAt: '2026-07-23T10:00:00.000Z' }, patch) };
  });
  const patch = {
    title: 'Fresh title',
    route: 'Санкт-Петербург → Москва',
    startDate: '2026-08-02',
    endDate: '2026-08-06',
    type: 'group',
    status: 'active',
    segments: [{
      id: 'segment-1',
      transportType: 'train',
      departurePlace: 'Санкт-Петербург',
      arrivalPlace: 'Москва',
      departureAt: '2026-08-02T08:00:00.000Z',
      arrivalAt: '2026-08-02T12:00:00.000Z',
    }],
  };

  const trip = await fixture.sync.updateCanonicalTrip('trip-1', patch);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].tripId, 'trip-1');
  assert.deepEqual(calls[0].patch, patch);
  assert.equal(trip.route, patch.route);
  assert.equal(fixture.current.trip.route, patch.route);
  assert.equal(fixture.current.trip.updatedAt, '2026-07-23T10:00:00.000Z');
  assert.equal(fixture.current.trip.segments[0].from, 'Санкт-Петербург');
  assert.equal(fixture.current.trip.segments[0].to, 'Москва');
  assert.equal(fixture.writes.at(-1).meta.source, 'server');
});

test('canonical trip update propagates the real HTTP error', async () => {
  const fixture = loadTripSync(async () => { throw new Error('HTTP 503 staging unavailable'); });

  await assert.rejects(
    fixture.sync.updateCanonicalTrip('trip-1', { route: 'Новый маршрут' }),
    /HTTP 503 staging unavailable/,
  );
  assert.equal(fixture.writes.length, 0);
});

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SEARCH_MODES,
  TRANSPORT_SEGMENT_SEMANTICS,
  validateSearchRequestV1,
  validateTransportOptionV1,
} = require('../src/contracts/transportOption');

function validOption(overrides) {
  return Object.assign({
    schemaVersion: '1',
    id: 'to_avia_direct_1',
    transportType: 'flight',
    segments: [{
      id: 'ts_avia_direct_1_0',
      transportType: 'flight',
      departurePlace: 'Москва',
      arrivalPlace: 'Санкт-Петербург',
      departureAt: '2026-08-20T14:30:00+03:00',
      arrivalAt: '2026-08-20T16:00:00+03:00',
      serviceNumber: 'SU-6026',
      carrierName: 'Аэрофлот',
    }],
    price: { amount: 8500, currency: 'RUB', kind: 'total' },
    availability: { status: 'available', seats: 4 },
    transferCount: 0,
    durationMinutes: 90,
    source: {
      provider: 'tutu-mcp',
      tool: 'search_avia',
      serverVersion: '0.32.0',
    },
    fetchedAt: '2026-08-15T12:00:00.000Z',
  }, overrides || {});
}

test('SearchRequestV1 normalizes a provider-independent one-way request', () => {
  const request = validateSearchRequestV1({
    schemaVersion: '1',
    mode: 'train',
    origin: ' Москва ',
    destination: ' Санкт-Петербург ',
    departureDate: '2026-08-20',
    passengers: { adults: 2, children: 1, infants: 0 },
  });

  assert.deepEqual(request, {
    schemaVersion: '1',
    mode: 'train',
    origin: 'Москва',
    destination: 'Санкт-Петербург',
    departureDate: '2026-08-20',
    returnDate: null,
    passengers: { adults: 2, children: 1, infants: 0 },
  });
  assert.deepEqual(SEARCH_MODES, ['flight', 'train', 'bus', 'etrain', 'mixed']);
});

test('SearchRequestV1 rejects round-trip searches with a stable V1 error code', () => {
  const roundTrip = {
    schemaVersion: '1',
    mode: 'flight',
    origin: 'Москва',
    destination: 'Сочи',
    departureDate: '2026-08-20',
    returnDate: '2026-08-27',
    passengers: { adults: 1, children: 0, infants: 0 },
  };

  assert.throws(() => validateSearchRequestV1(roundTrip), function (error) {
    return error && error.code === 'TUTU_ROUND_TRIP_UNSUPPORTED';
  });
});

test('SearchRequestV1 rejects provider-specific fields', () => {
  const oneWay = validateSearchRequestV1({
    schemaVersion: '1',
    mode: 'flight',
    origin: 'Москва',
    destination: 'Сочи',
    departureDate: '2026-08-20',
    returnDate: null,
    passengers: { adults: 1, children: 0, infants: 0 },
  });

  assert.equal(oneWay.returnDate, null);
  assert.throws(() => validateSearchRequestV1(Object.assign({}, oneWay, {
    search_avia_page_size: 30,
  })), /unknown field/i);
});

test('SearchRequestV1 rejects invalid routes, dates, modes, and passenger counts', () => {
  const base = {
    schemaVersion: '1',
    mode: 'mixed',
    origin: 'Москва',
    destination: 'Казань',
    departureDate: '2026-08-20',
    passengers: { adults: 1, children: 0, infants: 0 },
  };

  assert.throws(() => validateSearchRequestV1(Object.assign({}, base, { mode: 'hotel' })), /mode/i);
  assert.throws(() => validateSearchRequestV1(Object.assign({}, base, { destination: 'Москва' })), /different/i);
  assert.throws(() => validateSearchRequestV1(Object.assign({}, base, { departureDate: '20.08.2026' })), /departureDate/i);
  assert.throws(() => validateSearchRequestV1(Object.assign({}, base, {
    passengers: { adults: 0, children: 1, infants: 0 },
  })), /adults/i);
});

test('TransportOptionV1 validates the canonical scheduled transport shape', () => {
  const option = validateTransportOptionV1(validOption());

  assert.equal(option.schemaVersion, '1');
  assert.equal(option.source.provider, 'tutu-mcp');
  assert.equal(option.segments[0].departureAt, '2026-08-20T14:30:00+03:00');
  assert.match(TRANSPORT_SEGMENT_SEMANTICS, /one continuous scheduled travel leg/i);
});

test('TransportSegment means one concrete-service leg and transfers follow normalized segments', () => {
  const twoServices = validOption({
    id: 'to_rail_transfer_1',
    transportType: 'train',
    segments: [
      Object.assign({}, validOption().segments[0], {
        id: 'ts_rail_transfer_1_0',
        transportType: 'train',
        departurePlace: 'Москва',
        arrivalPlace: 'Тверь',
        departureAt: '2026-08-20T10:00:00+03:00',
        arrivalAt: '2026-08-20T12:00:00+03:00',
        serviceNumber: '001А',
        carrierName: null,
      }),
      Object.assign({}, validOption().segments[0], {
        id: 'ts_rail_transfer_1_1',
        transportType: 'train',
        departurePlace: 'Тверь',
        arrivalPlace: 'Санкт-Петербург',
        departureAt: '2026-08-20T13:00:00+03:00',
        arrivalAt: '2026-08-20T18:00:00+03:00',
        serviceNumber: '003А',
        carrierName: null,
      }),
    ],
    transferCount: 1,
    durationMinutes: 480,
  });

  assert.equal(validateTransportOptionV1(twoServices).transferCount, 1);
  assert.throws(() => validateTransportOptionV1(Object.assign({}, twoServices, {
    transferCount: 0,
  })), /transferCount/i);
});

test('price.amount stays in provider-reported major currency units without conversion', () => {
  const option = validOption({
    price: { amount: 8500.75, currency: 'RUB', kind: 'from' },
  });

  assert.equal(validateTransportOptionV1(option).price.amount, 8500.75);
  assert.equal(validateTransportOptionV1(validOption({ price: null })).price, null);
});

test('TransportOptionV1 rejects invented operational facts', () => {
  for (const forbidden of [
    ['delayMinutes', 15],
    ['actualDeparture', '2026-08-20T14:45:00+03:00'],
    ['actualArrival', '2026-08-20T16:15:00+03:00'],
    ['cancellationReason', 'carrier'],
    ['status', 'cancelled'],
  ]) {
    assert.throws(() => validateTransportOptionV1(Object.assign({}, validOption(), {
      [forbidden[0]]: forbidden[1],
    })), /unknown field|operational/i);
  }
});

test('TransportOptionV1 rejects malformed schedules and price metadata', () => {
  const reversed = validOption({
    segments: [Object.assign({}, validOption().segments[0], {
      arrivalAt: '2026-08-20T13:00:00+03:00',
    })],
  });
  assert.throws(() => validateTransportOptionV1(reversed), /arrivalAt/i);
  assert.throws(() => validateTransportOptionV1(validOption({
    price: { amount: 850000, currency: 'kopecks', kind: 'total' },
  })), /currency/i);
});

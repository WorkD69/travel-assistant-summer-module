'use strict';

const SEARCH_MODES = Object.freeze(['flight', 'train', 'bus', 'etrain', 'mixed']);
const SEGMENT_MODES = Object.freeze(['flight', 'train', 'bus', 'etrain']);
const PRICE_KINDS = Object.freeze(['total', 'from', 'unknown']);
const AVAILABILITY_STATUSES = Object.freeze(['available', 'limited', 'sold_out']);
const TRANSPORT_SEGMENT_SEMANTICS =
  'TransportSegment is one continuous scheduled travel leg on one concrete service/vehicle ' +
  'inside one one-way journey. ' +
  'An intermediate stop on the same service does not create another segment.';

// Round-trip packages require explicit journey boundaries. A future V1.1/V2 may
// add journeys[], but V1 must not flatten or split a priced provider package.

function contractError(message) {
  const error = new Error(message);
  error.code = 'TRANSPORT_CONTRACT_INVALID';
  error.status = 400;
  return error;
}

function roundTripUnsupportedError() {
  const error = contractError('SearchRequestV1 returnDate is unsupported by the one-way-only V1 contract');
  error.code = 'TUTU_ROUND_TRIP_UNSUPPORTED';
  return error;
}

function multiPassengerUnsupportedError() {
  const error = contractError(
    'SearchRequestV1 passengers must be exactly one adult, zero children, and zero infants in V1',
  );
  error.code = 'TUTU_MULTI_PASSENGER_UNSUPPORTED';
  return error;
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw contractError(label + ' must be an object');
  }
  return value;
}

function exactFields(value, allowed, label) {
  const unknown = Object.keys(value).filter(function (key) { return !allowed.includes(key); });
  if (unknown.length) throw contractError(label + ' contains unknown field: ' + unknown[0]);
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw contractError(label + ' must be a non-empty string');
  return value.trim();
}

function nullableText(value, label) {
  if (value === null) return null;
  return text(value, label);
}

function dateOnly(value, label) {
  const normalized = text(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw contractError(label + ' must use YYYY-MM-DD');
  const parsed = new Date(normalized + 'T00:00:00.000Z');
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw contractError(label + ' must be a valid calendar date');
  }
  return normalized;
}

function timestamp(value, label) {
  const normalized = text(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(normalized) ||
      Number.isNaN(new Date(normalized).getTime())) {
    throw contractError(label + ' must be an ISO-8601 timestamp with an explicit offset');
  }
  return normalized;
}

function integer(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || (maximum != null && value > maximum)) {
    throw contractError(label + ' must be an integer between ' + minimum + ' and ' + maximum);
  }
  return value;
}

function validateSearchRequestV1(input) {
  const request = object(input, 'SearchRequestV1');
  exactFields(request, [
    'schemaVersion', 'mode', 'origin', 'destination', 'departureDate', 'returnDate', 'passengers',
  ], 'SearchRequestV1');
  if (request.schemaVersion !== '1') throw contractError('SearchRequestV1 schemaVersion must be "1"');
  if (!SEARCH_MODES.includes(request.mode)) throw contractError('SearchRequestV1 mode is not supported');

  const origin = text(request.origin, 'SearchRequestV1 origin');
  const destination = text(request.destination, 'SearchRequestV1 destination');
  if (origin.toLocaleLowerCase('ru-RU') === destination.toLocaleLowerCase('ru-RU')) {
    throw contractError('SearchRequestV1 origin and destination must be different');
  }
  const departureDate = dateOnly(request.departureDate, 'SearchRequestV1 departureDate');
  if (request.returnDate != null) throw roundTripUnsupportedError();
  const returnDate = null;

  const passengers = object(request.passengers, 'SearchRequestV1 passengers');
  exactFields(passengers, ['adults', 'children', 'infants'], 'SearchRequestV1 passengers');
  const normalizedPassengers = {
    adults: integer(passengers.adults, 'SearchRequestV1 passengers.adults', 1, 9),
    children: integer(passengers.children, 'SearchRequestV1 passengers.children', 0, 9),
    infants: integer(passengers.infants, 'SearchRequestV1 passengers.infants', 0, 9),
  };
  if (normalizedPassengers.adults !== 1 ||
      normalizedPassengers.children !== 0 || normalizedPassengers.infants !== 0) {
    throw multiPassengerUnsupportedError();
  }
  if (normalizedPassengers.adults + normalizedPassengers.children + normalizedPassengers.infants > 9) {
    throw contractError('SearchRequestV1 passengers total cannot exceed 9');
  }

  return {
    schemaVersion: '1',
    mode: request.mode,
    origin: origin,
    destination: destination,
    departureDate: departureDate,
    returnDate: returnDate,
    passengers: normalizedPassengers,
  };
}

function validateSegment(segment, index) {
  const value = object(segment, 'TransportOptionV1 segments[' + index + ']');
  exactFields(value, [
    'id', 'transportType', 'departurePlace', 'arrivalPlace', 'departureAt', 'arrivalAt',
    'serviceNumber', 'carrierName',
  ], 'TransportOptionV1 segments[' + index + ']');
  if (!SEGMENT_MODES.includes(value.transportType)) {
    throw contractError('TransportOptionV1 segments[' + index + '].transportType is not supported');
  }
  const departureAt = timestamp(value.departureAt, 'TransportOptionV1 segments[' + index + '].departureAt');
  const arrivalAt = timestamp(value.arrivalAt, 'TransportOptionV1 segments[' + index + '].arrivalAt');
  if (new Date(arrivalAt).getTime() <= new Date(departureAt).getTime()) {
    throw contractError('TransportOptionV1 segments[' + index + '].arrivalAt must follow departureAt');
  }
  return {
    id: text(value.id, 'TransportOptionV1 segments[' + index + '].id'),
    transportType: value.transportType,
    departurePlace: text(value.departurePlace, 'TransportOptionV1 segments[' + index + '].departurePlace'),
    arrivalPlace: text(value.arrivalPlace, 'TransportOptionV1 segments[' + index + '].arrivalPlace'),
    departureAt: departureAt,
    arrivalAt: arrivalAt,
    serviceNumber: nullableText(value.serviceNumber, 'TransportOptionV1 segments[' + index + '].serviceNumber'),
    carrierName: nullableText(value.carrierName, 'TransportOptionV1 segments[' + index + '].carrierName'),
  };
}

function validatePrice(price) {
  if (price === null) return null;
  const value = object(price, 'TransportOptionV1 price');
  exactFields(value, ['amount', 'currency', 'kind'], 'TransportOptionV1 price');
  if (typeof value.amount !== 'number' || !Number.isFinite(value.amount) || value.amount < 0) {
    throw contractError('TransportOptionV1 price.amount must be a non-negative provider amount in major currency units');
  }
  if (typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency)) {
    throw contractError('TransportOptionV1 price.currency must be a three-letter uppercase currency code');
  }
  if (!PRICE_KINDS.includes(value.kind)) throw contractError('TransportOptionV1 price.kind is not supported');
  return { amount: value.amount, currency: value.currency, kind: value.kind };
}

function validateAvailability(availability) {
  if (availability === null) return null;
  const value = object(availability, 'TransportOptionV1 availability');
  exactFields(value, ['status', 'seats'], 'TransportOptionV1 availability');
  if (!AVAILABILITY_STATUSES.includes(value.status)) {
    throw contractError('TransportOptionV1 availability.status is not supported');
  }
  const seats = value.seats === null ? null : integer(value.seats, 'TransportOptionV1 availability.seats', 0, 1000000);
  return { status: value.status, seats: seats };
}

function validateSource(source) {
  const value = object(source, 'TransportOptionV1 source');
  exactFields(value, ['provider', 'tool', 'serverVersion'], 'TransportOptionV1 source');
  if (value.provider !== 'tutu-mcp') throw contractError('TransportOptionV1 source.provider must be tutu-mcp');
  return {
    provider: 'tutu-mcp',
    tool: text(value.tool, 'TransportOptionV1 source.tool'),
    serverVersion: nullableText(value.serverVersion, 'TransportOptionV1 source.serverVersion'),
  };
}

function validateTransportOptionV1(input) {
  const option = object(input, 'TransportOptionV1');
  exactFields(option, [
    'schemaVersion', 'id', 'transportType', 'segments', 'price', 'availability',
    'transferCount', 'durationMinutes', 'source', 'fetchedAt',
  ], 'TransportOptionV1');
  if (option.schemaVersion !== '1') throw contractError('TransportOptionV1 schemaVersion must be "1"');
  if (!SEARCH_MODES.includes(option.transportType)) {
    throw contractError('TransportOptionV1 transportType is not supported');
  }
  if (!Array.isArray(option.segments) || !option.segments.length) {
    throw contractError('TransportOptionV1 segments must contain at least one segment');
  }
  const segments = option.segments.map(validateSegment);
  const modes = Array.from(new Set(segments.map(function (segment) { return segment.transportType; })));
  const expectedMode = modes.length === 1 ? modes[0] : 'mixed';
  if (option.transportType !== expectedMode) {
    throw contractError('TransportOptionV1 transportType must match normalized segment modes');
  }
  const expectedTransfers = Math.max(0, segments.length - 1);
  if (option.transferCount !== expectedTransfers) {
    throw contractError('TransportOptionV1 transferCount must equal normalized segments.length - 1');
  }
  const expectedDuration = Math.round(
    (new Date(segments[segments.length - 1].arrivalAt).getTime() - new Date(segments[0].departureAt).getTime()) / 60000,
  );
  if (!Number.isInteger(option.durationMinutes) || option.durationMinutes !== expectedDuration || expectedDuration <= 0) {
    throw contractError('TransportOptionV1 durationMinutes must match the normalized scheduled itinerary');
  }

  return {
    schemaVersion: '1',
    id: text(option.id, 'TransportOptionV1 id'),
    transportType: option.transportType,
    segments: segments,
    price: validatePrice(option.price),
    availability: validateAvailability(option.availability),
    transferCount: expectedTransfers,
    durationMinutes: expectedDuration,
    source: validateSource(option.source),
    fetchedAt: timestamp(option.fetchedAt, 'TransportOptionV1 fetchedAt'),
  };
}

module.exports = {
  SEARCH_MODES,
  SEGMENT_MODES,
  PRICE_KINDS,
  AVAILABILITY_STATUSES,
  TRANSPORT_SEGMENT_SEMANTICS,
  validateSearchRequestV1,
  validateTransportOptionV1,
};

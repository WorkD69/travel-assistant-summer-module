'use strict';

const crypto = require('node:crypto');
const {
  validateSearchRequestV1,
  validateTransportOptionV1,
} = require('../contracts/transportOption');

const TOOL_BY_MODE = Object.freeze({
  flight: 'search_avia',
  train: 'search_rail',
  bus: 'search_bus',
  etrain: 'search_etrain',
  mixed: 'search_multitransport',
});

const MODE_BY_PROVIDER_TRANSPORT = Object.freeze({
  avia: 'flight',
  railway: 'train',
  rail: 'train',
  bus: 'bus',
  etrain: 'etrain',
});

function adapterError(code, message, status, retryable) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.retryable = !!retryable;
  return error;
}

function unsupportedPassengers(mode) {
  return adapterError(
    'TUTU_PASSENGER_COMBINATION_UNSUPPORTED',
    'The selected transport mode cannot represent this passenger combination',
    400,
    false,
  );
}

function mapSearchRequestToTool(input) {
  const request = validateSearchRequestV1(input);
  const common = {
    origin: request.origin,
    destination: request.destination,
    departure_date: request.departureDate,
  };
  let args;
  if (request.mode === 'flight') {
    args = Object.assign({}, common, {
      adults: request.passengers.adults,
      children: request.passengers.children,
      infants: request.passengers.infants,
      page: 1,
      page_size: 10,
      view: 'compact',
    });
  } else if (request.mode === 'train') {
    if (request.passengers.children || request.passengers.infants) throw unsupportedPassengers(request.mode);
    args = Object.assign({}, common, {
      passengers: request.passengers.adults,
      page: 1,
      page_size: 10,
      view: 'compact',
    });
  } else if (request.mode === 'bus') {
    if (request.passengers.infants) throw unsupportedPassengers(request.mode);
    args = Object.assign({}, common, {
      adults: request.passengers.adults,
      children: request.passengers.children,
      page: 1,
      page_size: 10,
      view: 'compact',
    });
  } else if (request.mode === 'etrain') {
    args = Object.assign({}, common, { page: 1, page_size: 10, view: 'compact' });
  } else {
    if (request.passengers.children || request.passengers.infants) throw unsupportedPassengers(request.mode);
    args = Object.assign({}, common, {
      adults: request.passengers.adults,
      modes: ['avia', 'railway', 'bus', 'etrain'],
      optimize_for: 'price',
      page: 1,
      page_size: 10,
      view: 'compact',
    });
  }
  return { toolName: TOOL_BY_MODE[request.mode], arguments: args };
}

function parseToolPayload(result) {
  if (!result || result.isError === true) {
    throw adapterError('TUTU_TOOL_ERROR', 'Tutu MCP tool returned an error', 502, true);
  }
  if (!Array.isArray(result.content) || result.content.length !== 1 ||
      !result.content[0] || result.content[0].type !== 'text' ||
      typeof result.content[0].text !== 'string') {
    throw adapterError('TUTU_INVALID_RESPONSE', 'Tutu MCP returned an unsupported response envelope', 502, false);
  }
  try {
    const payload = JSON.parse(result.content[0].text);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid');
    return payload;
  } catch (error) {
    throw adapterError('TUTU_INVALID_RESPONSE', 'Tutu MCP returned invalid structured data', 502, false);
  }
}

function hash(prefix, value) {
  return prefix + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

function sameConcreteService(left, right) {
  return !!(
    left && right && left.voyage_no && right.voyage_no &&
    String(left.voyage_no) === String(right.voyage_no) &&
    String(left.carrier || '') === String(right.carrier || '') &&
    String(left.to || '') === String(right.from || '')
  );
}

function collapseContinuousServiceSegments(rawSegments) {
  const collapsed = [];
  rawSegments.forEach(function (segment) {
    if (!segment || typeof segment !== 'object' || Array.isArray(segment)) {
      throw adapterError('TUTU_INVALID_RESPONSE', 'Tutu MCP offer contains an invalid segment', 502, false);
    }
    const previous = collapsed[collapsed.length - 1];
    if (previous && sameConcreteService(previous.raw, segment)) {
      previous.raw = Object.assign({}, previous.raw, {
        to: segment.to,
        arrival_at: segment.arrival_at,
      });
    } else {
      collapsed.push({ raw: Object.assign({}, segment) });
    }
  });
  return collapsed.map(function (entry) { return entry.raw; });
}

function normalizePrice(rawPrice) {
  if (rawPrice == null) return null;
  if (!rawPrice || typeof rawPrice !== 'object' || Array.isArray(rawPrice)) {
    throw adapterError('TUTU_INVALID_RESPONSE', 'Tutu MCP offer contains invalid price data', 502, false);
  }
  return {
    amount: rawPrice.amount,
    currency: rawPrice.currency,
    kind: 'unknown',
  };
}

function normalizeOffer(toolName, rawOffer, context) {
  if (!rawOffer || typeof rawOffer !== 'object' || Array.isArray(rawOffer)) {
    throw adapterError('TUTU_INVALID_RESPONSE', 'Tutu MCP returned an invalid offer', 502, false);
  }
  const providerTransport = String(rawOffer.transport || '');
  const segmentMode = MODE_BY_PROVIDER_TRANSPORT[providerTransport];
  if (!segmentMode) {
    throw adapterError('TUTU_INVALID_RESPONSE', 'Tutu MCP returned an unsupported transport type', 502, false);
  }
  if (!Array.isArray(rawOffer.legs) || rawOffer.legs.length !== 1 ||
      (rawOffer.checkout_ref && rawOffer.checkout_ref.is_round_trip === true) ||
      String(rawOffer.legs[0] && rawOffer.legs[0].label || '').toLowerCase() === 'return') {
    throw adapterError(
      'TUTU_PROVIDER_ROUND_TRIP_UNSUPPORTED',
      'Tutu MCP returned a round-trip package unsupported by TransportOptionV1',
      502,
      false,
    );
  }
  const rawSegments = rawOffer.legs[0] && rawOffer.legs[0].segments;
  if (!Array.isArray(rawSegments) || !rawSegments.length) {
    throw adapterError('TUTU_INVALID_RESPONSE', 'Tutu MCP offer has no scheduled segments', 502, false);
  }
  const collapsed = collapseContinuousServiceSegments(rawSegments);
  const price = normalizePrice(rawOffer.price);
  const optionSeed = {
    toolName: toolName,
    offerId: rawOffer.offer_id || null,
    transport: providerTransport,
    segments: collapsed.map(function (segment) {
      return [segment.from, segment.to, segment.departure_at, segment.arrival_at, segment.voyage_no || null];
    }),
    price: price,
  };
  const optionId = hash('to_', optionSeed);
  const segments = collapsed.map(function (segment, index) {
    return {
      id: hash('ts_', { optionId: optionId, index: index, segment: optionSeed.segments[index] }),
      transportType: segmentMode,
      departurePlace: segment.from,
      arrivalPlace: segment.to,
      departureAt: segment.departure_at,
      arrivalAt: segment.arrival_at,
      serviceNumber: segment.voyage_no == null ? null : String(segment.voyage_no),
      carrierName: segment.carrier == null ? null : String(segment.carrier),
    };
  });
  const durationMinutes = Math.round(
    (new Date(segments[segments.length - 1].arrivalAt).getTime() - new Date(segments[0].departureAt).getTime()) / 60000,
  );
  const option = validateTransportOptionV1({
    schemaVersion: '1',
    id: optionId,
    transportType: segmentMode,
    segments: segments,
    price: price,
    availability: null,
    transferCount: Math.max(0, segments.length - 1),
    durationMinutes: durationMinutes,
    source: {
      provider: 'tutu-mcp',
      tool: toolName,
      serverVersion: context.serverVersion || null,
    },
    fetchedAt: context.fetchedAt,
  });
  return {
    option: option,
    providerContext: {
      offerId: rawOffer.offer_id || null,
      transport: providerTransport,
      checkoutRef: rawOffer.checkout_ref || null,
      checkoutUrl: rawOffer.checkout_url || null,
      searchResultsUrl: rawOffer.search_results_url || null,
    },
  };
}

function parseSearchToolResult(toolName, result, options) {
  if (!Object.values(TOOL_BY_MODE).includes(toolName)) {
    throw adapterError('TUTU_INVALID_RESPONSE', 'Unsupported Tutu MCP search tool', 502, false);
  }
  const payload = parseToolPayload(result);
  const collection = toolName === 'search_multitransport' ? payload.variants : payload.offers;
  if (!Array.isArray(collection)) {
    throw adapterError('TUTU_INVALID_RESPONSE', 'Tutu MCP search response has no offer collection', 502, false);
  }
  const context = {
    fetchedAt: options && options.fetchedAt ? options.fetchedAt : new Date().toISOString(),
    serverVersion: options && options.serverVersion ? options.serverVersion : null,
  };
  const normalized = [];
  let unsupportedRoundTrips = 0;
  collection.forEach(function (offer) {
    try {
      normalized.push(normalizeOffer(toolName, offer, context));
    } catch (error) {
      if (error && error.code === 'TUTU_PROVIDER_ROUND_TRIP_UNSUPPORTED') {
        unsupportedRoundTrips += 1;
        return;
      }
      throw error;
    }
  });
  if (!normalized.length && unsupportedRoundTrips) {
    throw adapterError(
      'TUTU_PROVIDER_ROUND_TRIP_UNSUPPORTED',
      'Tutu MCP returned only round-trip packages unsupported by TransportOptionV1',
      502,
      false,
    );
  }
  return normalized;
}

function createTutuMcpAdapter(options) {
  const settings = options || {};
  const client = settings.client || require('./tutuMcpClient').createTutuMcpClient();
  const clock = settings.clock || function () { return new Date(); };

  return Object.freeze({
    async search(input) {
      const mapped = mapSearchRequestToTool(input);
      const response = await client.callTool(mapped.toolName, mapped.arguments);
      return parseSearchToolResult(mapped.toolName, response.result, {
        fetchedAt: clock().toISOString(),
        serverVersion: response.serverVersion,
      });
    },

    async createCheckoutLink(providerContext) {
      const checkoutRef = providerContext && providerContext.checkoutRef;
      if (!checkoutRef || typeof checkoutRef !== 'object' || Array.isArray(checkoutRef)) {
        throw adapterError('TUTU_CHECKOUT_UNAVAILABLE', 'The selected offer has no checkout reference', 422, false);
      }
      if (checkoutRef.is_round_trip === true) {
        throw adapterError(
          'TUTU_PROVIDER_ROUND_TRIP_UNSUPPORTED',
          'Round-trip checkout packages are unsupported by TransportOptionV1',
          422,
          false,
        );
      }
      const response = await client.callTool('create_checkout_link', Object.assign({}, checkoutRef));
      const payload = parseToolPayload(response.result);
      if (typeof payload.checkout_url !== 'string' || !payload.checkout_url) {
        throw adapterError('TUTU_INVALID_RESPONSE', 'Tutu MCP returned no checkout URL', 502, false);
      }
      return {
        checkoutUrl: payload.checkout_url,
        kind: typeof payload.kind === 'string' ? payload.kind : null,
        searchResultsUrl: typeof payload.search_results_url === 'string' ? payload.search_results_url : null,
        fallbackNote: typeof payload.fallback_note === 'string' ? payload.fallback_note : null,
      };
    },
  });
}

module.exports = {
  TOOL_BY_MODE,
  createTutuMcpAdapter,
  mapSearchRequestToTool,
  parseSearchToolResult,
};

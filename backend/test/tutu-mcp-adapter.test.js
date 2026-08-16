const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  createTutuMcpAdapter,
  mapSearchRequestToTool,
  parseSearchToolResult,
} = require('../src/services/tutuMcpAdapter');

const FIXTURES = path.join(__dirname, 'fixtures', 'tutu');

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

function toolResult(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: false };
}

function request(mode, passengers) {
  return {
    schemaVersion: '1',
    mode: mode,
    origin: 'Москва',
    destination: 'Санкт-Петербург',
    departureDate: '2026-08-20',
    returnDate: null,
    passengers: passengers || { adults: 1, children: 0, infants: 0 },
  };
}

test('maps provider-independent SearchRequestV1 to exact current tool arguments', () => {
  assert.deepEqual(mapSearchRequestToTool(request('flight')), {
    toolName: 'search_avia',
    arguments: {
      origin: 'Москва', destination: 'Санкт-Петербург', departure_date: '2026-08-20',
      adults: 1, children: 0, infants: 0, page: 1, page_size: 10, view: 'compact',
    },
  });
  assert.equal(mapSearchRequestToTool(request('train')).toolName, 'search_rail');
  assert.equal(mapSearchRequestToTool(request('bus')).toolName, 'search_bus');
  assert.equal(mapSearchRequestToTool(request('etrain')).toolName, 'search_etrain');
  assert.equal(mapSearchRequestToTool(request('mixed')).toolName, 'search_multitransport');
});

test('every mapped argument is present in the captured Tutu 0.38.0 tool schema', () => {
  const capture = fixture('tools-list.0.38.0.json');
  for (const mode of ['flight', 'train', 'bus', 'etrain', 'mixed']) {
    const mapped = mapSearchRequestToTool(request(mode));
    const schema = capture.tools.find(function (tool) { return tool.name === mapped.toolName; });
    assert.ok(schema, 'captured schema exists for ' + mapped.toolName);
    assert.deepEqual(
      Object.keys(mapped.arguments).filter(function (name) { return !schema.properties.includes(name); }),
      [],
    );
  }
});

test('rejects passenger combinations outside the single-traveler V1 before tool mapping', () => {
  assert.throws(() => mapSearchRequestToTool(request('train', {
    adults: 1, children: 1, infants: 0,
  })), function (error) { return error && error.code === 'TUTU_MULTI_PASSENGER_UNSUPPORTED'; });
  assert.throws(() => mapSearchRequestToTool(request('bus', {
    adults: 1, children: 0, infants: 1,
  })), function (error) { return error && error.code === 'TUTU_MULTI_PASSENGER_UNSUPPORTED'; });
});

for (const example of [
  ['search_avia', 'search-avia.direct.json', 'flight'],
  ['search_bus', 'search-bus.direct.json', 'bus'],
  ['search_etrain', 'search-etrain.direct.json', 'etrain'],
  ['search_multitransport', 'search-multitransport.direct.json', 'bus'],
]) {
  test('normalizes ' + example[0] + ' into TransportOptionV1', () => {
    const parsed = parseSearchToolResult(example[0], toolResult(fixture(example[1])), {
      fetchedAt: '2026-08-16T10:00:00.000Z',
      serverVersion: '0.38.0',
    });
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].option.transportType, example[2]);
    assert.equal(parsed[0].option.transferCount, 0);
    assert.equal(parsed[0].option.price.amount, fixture(example[1])[example[0] === 'search_multitransport' ? 'variants' : 'offers'][0].price.amount);
    assert.equal(parsed[0].option.source.tool, example[0]);
    assert.ok(parsed[0].providerContext.checkoutRef);
  });
}

test('collapses intermediate stops on one concrete service but keeps a real connection', () => {
  const parsed = parseSearchToolResult('search_rail', toolResult(fixture('search-rail.connection.json')), {
    fetchedAt: '2026-08-16T10:00:00.000Z', serverVersion: '0.38.0',
  });
  assert.equal(parsed[0].option.segments.length, 2);
  assert.equal(parsed[0].option.segments[0].departurePlace, 'Москва');
  assert.equal(parsed[0].option.segments[0].arrivalPlace, 'Тверь');
  assert.equal(parsed[0].option.segments[0].serviceNumber, '001А');
  assert.equal(parsed[0].option.transferCount, 1);
});

test('rejects a priced provider round-trip package without flattening or splitting its price', () => {
  const packageFixture = fixture('search-avia.round-trip.json');
  assert.equal(packageFixture.offers[0].price.amount, 12000);
  assert.throws(() => parseSearchToolResult('search_avia', toolResult(packageFixture), {
    fetchedAt: '2026-08-16T10:00:00.000Z', serverVersion: '0.38.0',
  }), function (error) {
    return error && error.code === 'TUTU_PROVIDER_ROUND_TRIP_UNSUPPORTED' &&
      !String(error.message).includes('6000');
  });
});

test('returns an empty list for a valid no-results payload', () => {
  assert.deepEqual(parseSearchToolResult('search_avia', toolResult(fixture('search-empty.json')), {
    fetchedAt: '2026-08-16T10:00:00.000Z', serverVersion: '0.38.0',
  }), []);
});

test('maps MCP errors and malformed content without leaking raw upstream data', () => {
  assert.throws(() => parseSearchToolResult('search_avia', {
    content: [{ type: 'text', text: 'secret upstream failure body' }], isError: true,
  }, {}), function (error) {
    return error && error.code === 'TUTU_TOOL_ERROR' && !error.message.includes('secret');
  });
  assert.throws(() => parseSearchToolResult('search_avia', {
    content: [{ type: 'text', text: '{not json' }], isError: false,
  }, {}), function (error) { return error && error.code === 'TUTU_INVALID_RESPONSE'; });
});

test('adapter orchestrates the mapped tool call and stamps provider metadata', async () => {
  const calls = [];
  const adapter = createTutuMcpAdapter({
    client: {
      async callTool(name, args) {
        calls.push({ name: name, args: args });
        return {
          serverVersion: '0.38.0',
          protocolEra: 'legacy',
          result: toolResult(fixture('search-avia.direct.json')),
        };
      },
    },
    clock: function () { return new Date('2026-08-16T10:00:00.000Z'); },
  });

  const results = await adapter.search(request('flight'));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'search_avia');
  assert.equal(calls[0].args.return_date, undefined);
  assert.equal(results[0].option.source.serverVersion, '0.38.0');
  assert.equal(results[0].option.fetchedAt, '2026-08-16T10:00:00.000Z');
});

test('checkout forwards only the signed provider checkout_ref and preserves the opaque URL', async () => {
  const checkoutRef = fixture('search-bus.direct.json').offers[0].checkout_ref;
  const calls = [];
  const adapter = createTutuMcpAdapter({
    client: {
      async callTool(name, args) {
        calls.push({ name: name, args: args });
        return {
          serverVersion: '0.38.0', protocolEra: 'legacy',
          result: toolResult({ checkout_url: 'https://bus.tutu.ru/x?b=2&a=1', kind: 'deeplink' }),
        };
      },
    },
  });

  const result = await adapter.createCheckoutLink({ checkoutRef: checkoutRef });

  assert.deepEqual(calls, [{ name: 'create_checkout_link', args: checkoutRef }]);
  assert.deepEqual(result, {
    checkoutUrl: 'https://bus.tutu.ru/x?b=2&a=1', kind: 'deeplink',
    searchResultsUrl: null, fallbackNote: null,
  });
});

test('checkout rejects missing and round-trip checkout references without calling MCP', async () => {
  let calls = 0;
  const adapter = createTutuMcpAdapter({
    client: { async callTool() { calls += 1; } },
  });
  await assert.rejects(adapter.createCheckoutLink({ checkoutRef: null }), function (error) {
    return error && error.code === 'TUTU_CHECKOUT_UNAVAILABLE';
  });
  await assert.rejects(adapter.createCheckoutLink({ checkoutRef: { transport: 'avia', is_round_trip: true } }), function (error) {
    return error && error.code === 'TUTU_PROVIDER_ROUND_TRIP_UNSUPPORTED';
  });
  assert.equal(calls, 0);
});

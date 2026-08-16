'use strict';

const { createTutuMcpClient } = require('../src/services/tutuMcpClient');
const { createTutuMcpAdapter } = require('../src/services/tutuMcpAdapter');

function futureDate(days) {
  const value = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return value.toISOString().slice(0, 10);
}

async function runSmoke() {
  const client = createTutuMcpClient({ timeoutMs: 30000 });
  const adapter = createTutuMcpAdapter({ client: client });
  const discovery = await client.listTools();
  const requiredTools = [
    'search_avia', 'search_rail', 'search_bus', 'search_etrain',
    'search_multitransport', 'get_offer_details', 'create_checkout_link',
  ];
  const available = new Set(discovery.tools.map(function (tool) { return tool.name; }));
  const missing = requiredTools.filter(function (name) { return !available.has(name); });
  if (missing.length) throw new Error('TUTU_SCHEMA_MISMATCH');

  const selections = await adapter.search({
    schemaVersion: '1', mode: 'flight', origin: 'Москва', destination: 'Санкт-Петербург',
    departureDate: futureDate(7), returnDate: null,
    passengers: { adults: 1, children: 0, infants: 0 },
  });
  if (!selections.length) throw new Error('TUTU_SMOKE_NO_RESULTS');
  const checkout = await adapter.createCheckoutLink(selections[0].providerContext);
  const checkoutHost = new URL(checkout.checkoutUrl).hostname;
  return {
    ok: true,
    serverVersion: discovery.serverVersion,
    protocolEra: discovery.protocolEra,
    requiredToolsPresent: true,
    optionCount: selections.length,
    firstOption: {
      schemaVersion: selections[0].option.schemaVersion,
      transportType: selections[0].option.transportType,
      segmentCount: selections[0].option.segments.length,
      transferCount: selections[0].option.transferCount,
      source: selections[0].option.source,
    },
    checkout: { kind: checkout.kind, host: checkoutHost },
  };
}

if (require.main === module) {
  runSmoke().then(function (result) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }).catch(function (error) {
    process.stderr.write(JSON.stringify({
      ok: false,
      code: error && error.code ? error.code : 'TUTU_SMOKE_FAILED',
    }) + '\n');
    process.exitCode = 1;
  });
}

module.exports = { runSmoke };

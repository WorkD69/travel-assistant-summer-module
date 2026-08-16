const assert = require('node:assert/strict');
const test = require('node:test');

const { createTutuMcpClient } = require('../src/services/tutuMcpClient');

function fakeSdk(behavior) {
  const state = { endpoints: [], connected: 0, closed: 0, calls: [] };
  class StreamableHTTPClientTransport {
    constructor(url) { state.endpoints.push(String(url)); }
  }
  class Client {
    async connect() { state.connected += 1; }
    async callTool(request) {
      state.calls.push(request);
      if (behavior && behavior.callTool) return behavior.callTool(request);
      return { content: [{ type: 'text', text: '{"offers":[]}' }], isError: false };
    }
    async listTools() { return { tools: [{ name: 'search_avia', inputSchema: { type: 'object' } }] }; }
    getServerVersion() { return { name: 'tutu-mcp-server', version: '0.38.0' }; }
    getProtocolEra() { return 'legacy'; }
    async close() { state.closed += 1; }
  }
  return { sdk: { Client, StreamableHTTPClientTransport }, state };
}

test('calls a tool through the official Streamable HTTP client and closes the session', async () => {
  const fake = fakeSdk();
  const client = createTutuMcpClient({
    sdkLoader: async () => fake.sdk,
    endpoint: 'https://mcp.tutu.ru/mcp',
    timeoutMs: 100,
  });

  const result = await client.callTool('search_avia', { origin: 'Москва' });

  assert.equal(result.serverVersion, '0.38.0');
  assert.equal(result.protocolEra, 'legacy');
  assert.equal(result.result.isError, false);
  assert.deepEqual(fake.state.calls, [{ name: 'search_avia', arguments: { origin: 'Москва' } }]);
  assert.deepEqual(fake.state.endpoints, ['https://mcp.tutu.ru/mcp']);
  assert.equal(fake.state.connected, 1);
  assert.equal(fake.state.closed, 1);
});

test('returns current tool schemas without exposing the SDK client', async () => {
  const fake = fakeSdk();
  const client = createTutuMcpClient({ sdkLoader: async () => fake.sdk, timeoutMs: 100 });

  const discovery = await client.listTools();

  assert.equal(discovery.serverVersion, '0.38.0');
  assert.equal(discovery.tools[0].name, 'search_avia');
  assert.equal(fake.state.closed, 1);
});

test('maps connection failures to a stable retryable error without leaking details', async () => {
  const fake = fakeSdk();
  fake.sdk.Client.prototype.connect = async function () {
    throw new Error('secret upstream DNS details');
  };
  const client = createTutuMcpClient({ sdkLoader: async () => fake.sdk, timeoutMs: 100 });

  await assert.rejects(client.listTools(), function (error) {
    return error && error.code === 'TUTU_UNAVAILABLE' && error.status === 503 &&
      error.retryable === true && !error.message.includes('secret');
  });
});

test('maps a hanging MCP call to TUTU_TIMEOUT and still closes the client', async () => {
  const fake = fakeSdk({ callTool: async () => new Promise(function () {}) });
  const client = createTutuMcpClient({ sdkLoader: async () => fake.sdk, timeoutMs: 10 });

  await assert.rejects(client.callTool('search_avia', {}), function (error) {
    return error && error.code === 'TUTU_TIMEOUT' && error.status === 504 && error.retryable === true;
  });
  assert.equal(fake.state.closed, 1);
});

'use strict';

const DEFAULT_ENDPOINT = 'https://mcp.tutu.ru/mcp';
const DEFAULT_TIMEOUT_MS = 15000;

function clientError(code, message, status, retryable) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.retryable = retryable;
  return error;
}

function timeoutError() {
  return clientError('TUTU_TIMEOUT', 'Tutu MCP request timed out', 504, true);
}

function unavailableError() {
  return clientError('TUTU_UNAVAILABLE', 'Tutu MCP is unavailable', 503, true);
}

function withTimeout(operation, timeoutMs) {
  let timer;
  const timeout = new Promise(function (_resolve, reject) {
    timer = setTimeout(function () { reject(timeoutError()); }, timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(function () { clearTimeout(timer); });
}

function createTutuMcpClient(options) {
  const settings = options || {};
  const endpoint = settings.endpoint || DEFAULT_ENDPOINT;
  const timeoutMs = settings.timeoutMs || DEFAULT_TIMEOUT_MS;
  const sdkLoader = settings.sdkLoader || function () { return import('@modelcontextprotocol/client'); };

  async function run(operation) {
    let client;
    try {
      const sdk = await sdkLoader();
      client = new sdk.Client({ name: 'travel-assistant-backend', version: '1.0.0' });
      const transport = new sdk.StreamableHTTPClientTransport(new URL(endpoint));
      return await withTimeout((async function () {
        await client.connect(transport);
        const result = await operation(client);
        const server = client.getServerVersion && client.getServerVersion();
        return {
          serverVersion: server && server.version ? String(server.version) : null,
          protocolEra: client.getProtocolEra ? client.getProtocolEra() : null,
          result: result,
        };
      })(), timeoutMs);
    } catch (error) {
      if (error && error.code === 'TUTU_TIMEOUT') throw error;
      throw unavailableError();
    } finally {
      if (client && typeof client.close === 'function') {
        try {
          await client.close();
        } catch (error) {
          // Closing a failed session must not replace the stable operation error.
        }
      }
    }
  }

  return Object.freeze({
    async callTool(name, args) {
      const response = await run(function (client) {
        return client.callTool({ name: name, arguments: args });
      });
      return response;
    },

    async listTools() {
      const response = await run(function (client) { return client.listTools(); });
      return {
        serverVersion: response.serverVersion,
        protocolEra: response.protocolEra,
        tools: response.result.tools,
      };
    },
  });
}

module.exports = {
  DEFAULT_ENDPOINT,
  createTutuMcpClient,
};

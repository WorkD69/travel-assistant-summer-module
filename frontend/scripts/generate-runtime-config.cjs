'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ALLOWED_ENV_NAME = 'TRAVEL_RELEASE_API_BASE';

function normalizePublicOrigin(rawValue) {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    throw new Error(`Release build requires ${ALLOWED_ENV_NAME}`);
  }

  const value = rawValue.trim();
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${ALLOWED_ENV_NAME} must be a valid HTTPS origin`);
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== '/' && parsed.pathname !== '')
  ) {
    throw new Error(`${ALLOWED_ENV_NAME} must be a valid HTTPS origin`);
  }

  return parsed.origin;
}

function renderRuntimeConfig(origin) {
  const serializedOrigin = JSON.stringify(origin);
  return `(function () {\n  "use strict";\n\n  window.TRAVEL_RELEASE_API_BASE = ${serializedOrigin};\n\n  var releaseBase = typeof window.TRAVEL_RELEASE_API_BASE === "string"\n    ? window.TRAVEL_RELEASE_API_BASE\n    : "";\n\n  if (typeof window.TRAVEL_API_BASE !== "string") {\n    window.TRAVEL_API_BASE = releaseBase;\n  }\n}());\n`;
}

function main(env = { [ALLOWED_ENV_NAME]: process.env[ALLOWED_ENV_NAME] }, outputPath) {
  const origin = normalizePublicOrigin(env[ALLOWED_ENV_NAME]);
  if (!outputPath) {
    throw new Error('A deployment output path is required');
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, renderRuntimeConfig(origin), 'utf8');
  return { outputPath, origin };
}

if (require.main === module) {
  try {
    const outputPath = process.argv[2];
    const result = main(undefined, outputPath);
    process.stdout.write(`Generated ${result.outputPath}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { normalizePublicOrigin, renderRuntimeConfig, main };

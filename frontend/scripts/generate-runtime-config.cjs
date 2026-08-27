'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ALLOWED_ENV_NAME = 'TRAVEL_RELEASE_API_BASE';
const DEFAULT_OUTPUT = path.resolve(__dirname, '..', 'assets', 'js', 'runtime-config.js');

function isProductionVercelBuild(env) {
  return env.VERCEL === '1' && env.VERCEL_ENV === 'production';
}

function normalizePublicOrigin(rawValue) {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    throw new Error(`${ALLOWED_ENV_NAME} must be a non-empty HTTPS origin`);
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
  return `(function() {\n  "use strict";\n\n  window.TRAVEL_RELEASE_API_BASE = ${serializedOrigin};\n\n  var releaseBase = typeof window.TRAVEL_RELEASE_API_BASE === "string"\n    ? window.TRAVEL_RELEASE_API_BASE\n    : "";\n\n  if (typeof window.TRAVEL_API_BASE !== "string") {\n    window.TRAVEL_API_BASE = releaseBase;\n  }\n}());\n`;
}

function main(env = process.env, outputPath = process.argv[2] || DEFAULT_OUTPUT) {
  const rawValue = env[ALLOWED_ENV_NAME];
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    if (isProductionVercelBuild(env)) {
      throw new Error(`Production Vercel build requires ${ALLOWED_ENV_NAME}`);
    }
    return { skipped: true, outputPath };
  }

  const origin = normalizePublicOrigin(rawValue);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, renderRuntimeConfig(origin), 'utf8');
  return { skipped: false, outputPath, origin };
}

if (require.main === module) {
  try {
    const result = main();
    if (result.skipped) {
      process.stdout.write('No release API origin configured; keeping local runtime fallback.\n');
    } else {
      process.stdout.write(`Generated ${result.outputPath}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { isProductionVercelBuild, normalizePublicOrigin, renderRuntimeConfig, main };

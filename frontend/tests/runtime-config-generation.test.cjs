'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(FRONTEND_ROOT, 'scripts', 'generate-runtime-config.cjs');
const API_CLIENT = path.join(FRONTEND_ROOT, 'assets', 'js', 'api-client.js');
const RUNTIME_CONFIG = path.join(FRONTEND_ROOT, 'assets', 'js', 'runtime-config.js');

function tempOutput() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'travel-runtime-'));
  return { directory, output: path.join(directory, 'runtime-config.js') };
}

function generate(value, extraEnv = {}) {
  const { directory, output } = tempOutput();
  try {
    execFileSync(process.execPath, [SCRIPT, output], {
      cwd: FRONTEND_ROOT,
      env: { ...process.env, ...extraEnv, TRAVEL_RELEASE_API_BASE: value },
      stdio: 'pipe',
    });
    return fs.readFileSync(output, 'utf8');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('valid public HTTPS origin is generated with one normalized trailing slash policy', () => {
  const source = generate('https://example-backend.test/');
  assert.ok(source.includes('window.TRAVEL_RELEASE_API_BASE = "https://example-backend.test";'));
  assert.doesNotMatch(source, /process\.env|OPENAI_API_KEY|TRAVEL_RELEASE_API_BASE.*process/);
});

test('generated runtime config produces the existing TravelApi base', () => {
  const source = generate('https://example-backend.test/');
  const context = {
    window: {},
    fetch() {},
    navigator: {},
    location: { protocol: 'https:' },
  };
  vm.runInNewContext(source, context);
  vm.runInNewContext(fs.readFileSync(API_CLIENT, 'utf8'), context);
  assert.equal(context.window.TravelApi.base, 'https://example-backend.test');
});

test('malformed, non-HTTPS, credentialed, path, query, and hash values are rejected', () => {
  for (const value of [
    'not-a-url',
    'http://example-backend.test',
    'https://user:pass@example-backend.test',
    'https://example-backend.test/api',
    'https://example-backend.test/?x=1',
    'https://example-backend.test/#fragment',
  ]) {
    assert.throws(() => generate(value), /valid HTTPS origin/);
  }
});

test('javascript injection-like value is rejected and never serialized', () => {
  const malicious = 'https://example.test/"; window.evil = true; //';
  assert.throws(() => generate(malicious), /valid HTTPS origin/);
});

test('production Vercel build fails closed when the required variable is missing', () => {
  const { directory, output } = tempOutput();
  try {
    assert.throws(
      () => execFileSync(process.execPath, [SCRIPT, output], {
        cwd: FRONTEND_ROOT,
        env: { ...process.env, VERCEL: '1', VERCEL_ENV: 'production', TRAVEL_RELEASE_API_BASE: '' },
        stdio: 'pipe',
      }),
      /requires TRAVEL_RELEASE_API_BASE/,
    );
    assert.equal(fs.existsSync(output), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('local build without the variable keeps the existing safe fallback', () => {
  const { directory, output } = tempOutput();
  try {
    execFileSync(process.execPath, [SCRIPT, output], {
      cwd: FRONTEND_ROOT,
      env: { ...process.env, VERCEL: '', VERCEL_ENV: '', TRAVEL_RELEASE_API_BASE: '' },
      stdio: 'pipe',
    });
    assert.equal(fs.existsSync(output), false);
    const context = { window: {} };
    vm.runInNewContext(fs.readFileSync(RUNTIME_CONFIG, 'utf8'), context);
    assert.equal(context.window.TRAVEL_API_BASE, '');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('api-client remains the only request base authority', () => {
  const apiSource = fs.readFileSync(API_CLIENT, 'utf8');
  assert.match(apiSource, /window\.TRAVEL_API_BASE/);
  assert.doesNotMatch(apiSource, /TRAVEL_RELEASE_API_BASE/);
  assert.doesNotMatch(apiSource, /process\.env/);
});

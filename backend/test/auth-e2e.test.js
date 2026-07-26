const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const PRISMA_ROOT = path.join(BACKEND_ROOT, 'prisma');

function pushTemporarySchema(databaseUrl) {
  const prismaCli = process.platform === 'win32'
    ? path.join(BACKEND_ROOT, 'node_modules', '.bin', 'prisma.cmd')
    : path.join(BACKEND_ROOT, 'node_modules', '.bin', 'prisma');
  const command = process.platform === 'win32' ? 'powershell.exe' : prismaCli;
  const args = process.platform === 'win32'
    ? [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "& '" + prismaCli.replace(/'/g, "''") + "' db push --skip-generate",
    ]
    : ['db', 'push', '--skip-generate'];
  const result = spawnSync(command, args, {
    cwd: BACKEND_ROOT,
    env: Object.assign({}, process.env, {
      DATABASE_URL: databaseUrl,
      RUST_BACKTRACE: '1',
      RUST_LOG: 'debug',
    }),
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, 'temporary AUTH database schema must be ready');
}

async function request(baseUrl, pathname, body, headers) {
  const response = await fetch(baseUrl + pathname, {
    method: body === undefined ? 'GET' : 'POST',
    headers: Object.assign(
      body === undefined ? {} : { 'Content-Type': 'application/json' },
      headers || {},
    ),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

test('isolated live AUTH API enforces policy, normalization, uniqueness, and login', async () => {
  const filename = 'auth-e2e-' + crypto.randomUUID() + '.db';
  const databasePath = path.join(PRISMA_ROOT, filename);
  const databaseUrl = 'file:./' + filename;
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('base64url');
  process.env.BOT_SERVICE_TOKEN = crypto.randomBytes(48).toString('base64url');
  process.env.NODE_ENV = 'test';
  process.env.FRONTEND_ORIGIN = 'http://127.0.0.1:8011';
  delete process.env.AI_API_KEY;

  let server;
  let prisma;
  try {
    pushTemporarySchema(databaseUrl);
    const app = require('../src/app');
    prisma = require('../src/db');
    server = await new Promise((resolve, reject) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
      instance.once('error', reject);
    });
    const baseUrl = 'http://127.0.0.1:' + server.address().port;

    const short = await request(baseUrl, '/api/auth/register', {
      email: 'short@example.test',
      password: 'short12',
      name: 'Short Password',
    });
    assert.equal(short.status, 400);
    assert.equal(short.body.errors[0].field, 'password');
    assert.equal(short.body.errors[0].code, 'too_short');

    const common = await request(baseUrl, '/api/auth/register', {
      email: 'common@example.test',
      password: 'password',
      name: 'Common Password',
    });
    assert.equal(common.status, 400);
    assert.equal(common.body.errors[0].code, 'too_common');

    const invalidFields = await request(baseUrl, '/api/auth/register', {
      email: 'invalid email',
      password: '',
      name: '',
    });
    assert.equal(invalidFields.status, 400);
    assert.deepEqual(
      invalidFields.body.errors.map((item) => item.field),
      ['email', 'name', 'password'],
    );

    const exactEmail = '  Exact-' + crypto.randomUUID() + '@Example.TEST  ';
    const exact = await request(baseUrl, '/api/auth/register', {
      email: exactEmail,
      password: 'kfz8mqrt',
      name: '  Иван   Петров  ',
    });
    assert.equal(exact.status, 201);
    assert.equal(exact.body.user.email, exactEmail.replace(/\s+/g, '').toLowerCase());
    assert.equal(exact.body.user.name, 'Иван Петров');

    const phraseEmail = 'phrase-' + crypto.randomUUID() + '@example.test';
    const phrase = await request(baseUrl, '/api/auth/register', {
      email: phraseEmail,
      password: 'жёлтый чемодан едет в Барселону через Лиссабон',
      name: 'Unicode Phrase',
    });
    assert.equal(phrase.status, 201);

    const duplicate = await request(baseUrl, '/api/auth/register', {
      email: exact.body.user.email.toUpperCase(),
      password: 'another-valid-passphrase',
      name: 'Duplicate User',
    });
    assert.equal(duplicate.status, 409);
    assert.equal(
      await prisma.user.count({ where: { email: exact.body.user.email } }),
      1,
    );

    const login = await request(baseUrl, '/api/auth/login', {
      email: exact.body.user.email.toUpperCase(),
      password: 'kfz8mqrt',
      remember: false,
    });
    assert.equal(login.status, 200);
    assert.ok(login.body.token);

    const restored = await request(
      baseUrl,
      '/api/auth/me',
      undefined,
      { Authorization: 'Bearer ' + login.body.token },
    );
    assert.equal(restored.status, 200);
    assert.equal(restored.body.user.id, exact.body.user.id);
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (prisma) await prisma.$disconnect();
    const resolved = path.resolve(databasePath);
    if (
      path.dirname(resolved) === path.resolve(PRISMA_ROOT) &&
      path.basename(resolved).startsWith('auth-e2e-')
    ) {
      for (const candidate of [resolved, resolved + '-journal']) {
        if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
      }
    }
  }
});

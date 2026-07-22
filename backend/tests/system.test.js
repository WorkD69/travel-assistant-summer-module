const assert = require('node:assert/strict');
const { test } = require('node:test');

const request = require('supertest');

const { createApp } = require('../src/app');

const config = {
  nodeEnv: 'test',
  isProduction: false,
  allowedOrigins: [],
  jwtSecret: 'j'.repeat(32),
  serviceToken: 's'.repeat(32),
  sessionTtlSeconds: 3600,
  documentTokenTtlSeconds: 300,
  ai: { apiKey: '', baseUrl: 'https://ai.example.test', model: 'test' },
};

test('health is minimal and readiness checks the database safely', async () => {
  const healthy = createApp({ config, prisma: { async $queryRaw() { return [{ ok: 1 }]; } } });
  assert.deepEqual((await request(healthy).get('/api/health')).body, { ok: true, ai: false, env: 'test' });
  assert.deepEqual((await request(healthy).get('/api/ready')).body, { status: 'ready' });

  const unavailable = createApp({ config, prisma: { async $queryRaw() { throw new Error('postgres secret details'); } } });
  const response = await request(unavailable).get('/api/ready');
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { error: { code: 'not_ready', message_ru: 'Сервис временно не готов.' } });
  assert.doesNotMatch(JSON.stringify(response.body), /postgres secret/i);
});

test('build info exposes only safe deployment metadata', async () => {
  const previous = {
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
    VERCEL_ENV: process.env.VERCEL_ENV,
    BUILD_DATE: process.env.BUILD_DATE,
  };
  process.env.VERCEL_GIT_COMMIT_SHA = 'a'.repeat(40);
  process.env.VERCEL_ENV = 'preview';
  process.env.BUILD_DATE = '2026-07-22T12:00:00.000Z';

  try {
    const app = createApp({
      config: { ...config, publicBaseUrl: 'https://api-preview.example.test' },
      prisma: { async $queryRaw() { return [{ ok: 1 }]; } },
    });
    const response = await request(app).get('/api/build-info');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      commitSha: 'a'.repeat(40),
      buildDate: '2026-07-22T12:00:00.000Z',
      environment: 'preview',
      apiBaseUrl: 'https://api-preview.example.test',
    });
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('build info supports an explicit commit marker for local Preview deploys', async () => {
  const previous = {
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
    BUILD_COMMIT_SHA: process.env.BUILD_COMMIT_SHA,
  };
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  process.env.BUILD_COMMIT_SHA = 'b'.repeat(40);

  try {
    const app = createApp({
      config: { ...config, publicBaseUrl: 'https://api-preview.example.test' },
      prisma: { async $queryRaw() { return [{ ok: 1 }]; } },
    });
    const response = await request(app).get('/api/build-info');
    assert.equal(response.body.commitSha, 'b'.repeat(40));
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

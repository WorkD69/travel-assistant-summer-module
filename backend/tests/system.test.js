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

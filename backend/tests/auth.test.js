const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const bcrypt = require('bcryptjs');
const request = require('supertest');

const { createApp } = require('../src/app');

function config(overrides = {}) {
  return {
    isProduction: false,
    allowedOrigins: [],
    jwtSecret: 'j'.repeat(32),
    serviceToken: 's'.repeat(32),
    sessionTtlSeconds: 3600,
    documentTokenTtlSeconds: 300,
    ...overrides,
  };
}

function fakePrisma(initialUsers = []) {
  const users = [...initialUsers];
  return {
    users,
    user: {
      async findUnique({ where }) {
        if (where.email) return users.find((user) => user.email === where.email) || null;
        if (where.id) return users.find((user) => user.id === where.id) || null;
        return null;
      },
      async create({ data }) {
        if (users.some((user) => user.email === data.email)) {
          const error = new Error('unique');
          error.code = 'P2002';
          throw error;
        }
        const user = { ...data, id: `u-${users.length + 1}` };
        users.push(user);
        return user;
      },
    },
    async $queryRaw() { return [{ ok: 1 }]; },
  };
}

describe('site authentication', () => {
  test('registers with a hashed password and returns only a secure session cookie', async () => {
    const prisma = fakePrisma();
    const app = createApp({
      config: config({ isProduction: true, allowedOrigins: ['https://travel.example'] }),
      prisma,
    });
    const response = await request(app)
      .post('/api/auth/register')
      .set('Origin', 'https://travel.example')
      .send({ name: 'Anna', email: 'ANNA@example.test', password: 'correct horse battery' });

    assert.equal(response.status, 201);
    assert.deepEqual(response.body, { user: { id: 'u-1', name: 'Anna', email: 'anna@example.test' } });
    assert.equal('token' in response.body, false);
    assert.match(response.headers['set-cookie'][0], /travel_session=/);
    assert.match(response.headers['set-cookie'][0], /HttpOnly/);
    assert.match(response.headers['set-cookie'][0], /Secure/);
    assert.match(response.headers['set-cookie'][0], /SameSite=Lax/);
    assert.notEqual(prisma.users[0].passwordHash, 'correct horse battery');
  });

  test('supports login, me, and logout without exposing the JWT', async () => {
    const passwordHash = await bcrypt.hash('correct horse battery', 4);
    const app = createApp({
      config: config(),
      prisma: fakePrisma([{ id: 'u-1', name: 'Anna', email: 'anna@example.test', passwordHash }]),
    });
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: 'anna@example.test', password: 'correct horse battery' });
    assert.equal(login.status, 200);
    assert.equal('token' in login.body, false);

    const me = await agent.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.id, 'u-1');

    const logout = await agent.post('/api/auth/logout');
    assert.equal(logout.status, 204);
    assert.equal((await agent.get('/api/auth/me')).status, 401);
  });

  test('uses one generic response for unknown email and wrong password', async () => {
    const passwordHash = await bcrypt.hash('correct horse battery', 4);
    const app = createApp({
      config: config(),
      prisma: fakePrisma([{ id: 'u-1', name: 'Anna', email: 'anna@example.test', passwordHash }]),
    });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@example.test', password: 'wrong password' });
    const wrong = await request(app).post('/api/auth/login').send({ email: 'anna@example.test', password: 'wrong password' });
    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.deepEqual(unknown.body, wrong.body);
    assert.equal(unknown.body.error.code, 'invalid_credentials');
  });

  test('rejects production browser mutations from an untrusted origin', async () => {
    const app = createApp({
      config: config({ isProduction: true, allowedOrigins: ['https://travel.example'] }),
      prisma: fakePrisma(),
    });
    const response = await request(app)
      .post('/api/auth/register')
      .set('Origin', 'https://evil.example')
      .send({ name: 'Anna', email: 'anna@example.test', password: 'correct horse battery' });
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'origin_denied');
  });
});

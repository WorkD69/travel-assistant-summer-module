const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const bcrypt = require('bcryptjs');
const request = require('supertest');

const { createApp } = require('../src/app');

const config = {
  nodeEnv: 'test', isProduction: false, jwtSecret: 'j'.repeat(32), serviceToken: 's'.repeat(32),
  telegramBotUsername: 'travel_helper_bot', linkTokenTtlSeconds: 600, documentTokenTtlSeconds: 300,
  ai: { apiKey: '', baseUrl: 'https://ai.example.test', model: 'test' },
};

function fakePhysical(initialUsers = []) {
  const users = [...initialUsers];
  return {
    users,
    user: {
      async findUnique({ where }) {
        return users.find((user) => (where.email ? user.email === where.email : user.id === where.id)) || null;
      },
      async create({ data }) {
        const row = { id: `u-${users.length + 1}`, createdAt: new Date(), ...data };
        users.push(row);
        return row;
      },
      async update({ where, data }) {
        const row = users.find((user) => user.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    async $queryRaw() { return [{ ok: 1 }]; },
  };
}

describe('canonical teammate authentication contract', () => {
  test('registers with the original token-and-cookie response', async () => {
    const prisma = fakePhysical();
    const response = await request(createApp({ config, prisma }))
      .post('/api/auth/register')
      .send({ name: 'Anna', email: 'ANNA@example.test', password: 'correct horse battery' });

    assert.equal(response.status, 201);
    assert.equal(response.body.user.email, 'anna@example.test');
    assert.equal(typeof response.body.token, 'string');
    assert.match(response.headers['set-cookie'][0], /^token=/);
    assert.match(response.headers['set-cookie'][0], /HttpOnly/);
    assert.match(response.headers['set-cookie'][0], /SameSite=Lax/);
    assert.notEqual(prisma.users[0].passwordHash, 'correct horse battery');
  });

  test('supports original login, me, and logout endpoints', async () => {
    const passwordHash = await bcrypt.hash('correct horse battery', 4);
    const app = createApp({
      config,
      prisma: fakePhysical([{
        id: 'u-1', name: 'Anna', initials: 'A', email: 'anna@example.test', passwordHash, createdAt: new Date(),
      }]),
    });
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login')
      .send({ email: 'anna@example.test', password: 'correct horse battery' });
    assert.equal(login.status, 200);
    assert.equal(typeof login.body.token, 'string');
    assert.equal((await agent.get('/api/auth/me')).body.user.id, 'u-1');
    assert.deepEqual((await agent.post('/api/auth/logout')).body, { ok: true });
  });
});

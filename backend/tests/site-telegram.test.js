const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const request = require('supertest');

const { createApp } = require('../src/app');
const { COOKIE_NAME, issueSession } = require('../src/security/site-auth');
const { hashToken } = require('../src/security/tokens');

const user = { id: 'u-new', name: 'New User', email: 'new@example.test' };
const config = {
  isProduction: false,
  allowedOrigins: [],
  jwtSecret: 'j'.repeat(32),
  serviceToken: 's'.repeat(32),
  sessionTtlSeconds: 3600,
  documentTokenTtlSeconds: 300,
  linkTokenTtlSeconds: 600,
  telegramBotUsername: 'travel_assistent10_bot',
};

function fixture() {
  const tokens = [];
  const links = [];
  const calls = [];
  let sequence = 0;
  const prisma = {
    tokens,
    links,
    calls,
    user: {
      async findUnique({ where }) {
        return where.id === user.id ? user : null;
      },
    },
    telegramLinkToken: {
      async create({ data }) {
        calls.push('create');
        const row = { id: `token-${++sequence}`, consumedAt: null, createdAt: new Date(), ...data };
        tokens.push(row);
        return row;
      },
      async findUnique({ where, include }) {
        const row = tokens.find((item) => item.tokenHash === where.tokenHash) || null;
        return row && include?.siteUser ? { ...row, siteUser: user } : row;
      },
      async findFirst({ where }) {
        return tokens
          .filter((item) => item.siteUserId === where.siteUserId)
          .filter((item) => where.consumedAt !== null || item.consumedAt === null)
          .filter((item) => !where.expiresAt?.gt || item.expiresAt > where.expiresAt.gt)
          .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
      },
      async updateMany({ where, data }) {
        if (where.siteUserId && where.consumedAt === null && !where.id) calls.push('invalidate');
        const matches = tokens.filter((item) => {
          if (where.id && item.id !== where.id) return false;
          if (where.siteUserId && item.siteUserId !== where.siteUserId) return false;
          if (where.consumedAt === null && item.consumedAt !== null) return false;
          if (where.expiresAt?.gt && item.expiresAt <= where.expiresAt.gt) return false;
          return true;
        });
        matches.forEach((item) => Object.assign(item, data));
        return { count: matches.length };
      },
    },
    telegramAccountLink: {
      async findUnique({ where }) {
        if (where.siteUserId) return links.find((item) => item.siteUserId === where.siteUserId) || null;
        if (where.telegramUserId) return links.find((item) => item.telegramUserId === where.telegramUserId) || null;
        return null;
      },
      async create({ data }) {
        const row = { id: `link-${links.length + 1}`, linkedAt: new Date(), revokedAt: null, ...data };
        links.push(row);
        return row;
      },
      async update({ where, data }) {
        const row = links.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
      async updateMany({ where, data }) {
        const matches = links.filter((item) => item.siteUserId === where.siteUserId && (!where.revokedAt || item.revokedAt === null));
        matches.forEach((item) => Object.assign(item, data));
        return { count: matches.length };
      },
    },
    async $transaction(callback) { return callback(prisma); },
    async $queryRaw() { calls.push('lock'); return [{ id: user.id }]; },
  };
  return prisma;
}

function cookie() {
  return `${COOKIE_NAME}=${issueSession(user, config)}`;
}

function tokenFromDeepLink(deepLink) {
  const payload = new URL(deepLink).searchParams.get('start');
  assert.match(payload, /^link_[A-Za-z0-9_-]{16,59}$/);
  return payload.slice('link_'.length);
}

describe('site Telegram account linking', () => {
  test('creates a ten-minute deep link for a user with no trips and stores only its hash', async () => {
    const prisma = fixture();
    const before = Date.now();
    const response = await request(createApp({ config, prisma }))
      .post('/api/site/integrations/telegram/link-token')
      .set('Cookie', cookie());

    assert.equal(response.status, 201);
    assert.equal(response.body.status, 'pending');
    assert.match(response.body.deepLink, /^https:\/\/t\.me\/travel_assistent10_bot\?start=link_/);
    const expiresAt = new Date(response.body.expiresAt).getTime();
    assert.ok(expiresAt >= before + 599_000 && expiresAt <= Date.now() + 601_000);
    const raw = tokenFromDeepLink(response.body.deepLink);
    assert.equal(prisma.tokens.length, 1);
    assert.equal(prisma.tokens[0].tokenHash, hashToken(raw));
    assert.equal(JSON.stringify(prisma.tokens).includes(raw), false);
    assert.equal('token' in response.body, false);
    assert.deepEqual(prisma.calls.slice(0, 3), ['lock', 'invalidate', 'create']);
  });

  test('reports connected status after one-time consume, rejects reuse, and supports unlink/relink', async () => {
    const prisma = fixture();
    const app = createApp({ config, prisma });
    const created = await request(app)
      .post('/api/site/integrations/telegram/link-token')
      .set('Cookie', cookie());
    const raw = tokenFromDeepLink(created.body.deepLink);
    const consume = () => request(app)
      .post('/api/integrations/telegram/link-token/consume')
      .set('Authorization', `Bearer ${config.serviceToken}`)
      .set('X-Telegram-User-Id', '424242')
      .send({ token: raw });

    assert.equal((await consume()).status, 200);
    const reused = await consume();
    assert.equal(reused.status, 409);
    assert.equal(reused.body.error.code, 'link_token_used');

    const status = await request(app)
      .get('/api/site/integrations/telegram')
      .set('Cookie', cookie());
    assert.equal(status.status, 200);
    assert.equal(status.body.status, 'connected');
    assert.ok(status.body.connectedAt);
    assert.equal(JSON.stringify(status.body).includes('424242'), false);

    const unlinked = await request(app)
      .delete('/api/site/integrations/telegram')
      .set('Cookie', cookie());
    assert.equal(unlinked.status, 204);
    const afterUnlink = await request(app)
      .get('/api/site/integrations/telegram')
      .set('Cookie', cookie());
    assert.equal(afterUnlink.body.status, 'not_connected');

    const relink = await request(app)
      .post('/api/site/integrations/telegram/link-token')
      .set('Cookie', cookie());
    const relinkRaw = tokenFromDeepLink(relink.body.deepLink);
    assert.notEqual(relinkRaw, raw);
    assert.equal((await request(app)
      .post('/api/integrations/telegram/link-token/consume')
      .set('Authorization', `Bearer ${config.serviceToken}`)
      .set('X-Telegram-User-Id', '424242')
      .send({ token: relinkRaw })).status, 200);
  });

  test('invalidates a previous pending link when a new one is created', async () => {
    const prisma = fixture();
    const app = createApp({ config, prisma });
    const first = await request(app).post('/api/site/integrations/telegram/link-token').set('Cookie', cookie());
    const second = await request(app).post('/api/site/integrations/telegram/link-token').set('Cookie', cookie());
    const oldToken = tokenFromDeepLink(first.body.deepLink);
    const newToken = tokenFromDeepLink(second.body.deepLink);
    assert.notEqual(oldToken, newToken);
    const oldConsume = await request(app)
      .post('/api/integrations/telegram/link-token/consume')
      .set('Authorization', `Bearer ${config.serviceToken}`)
      .set('X-Telegram-User-Id', '424242')
      .send({ token: oldToken });
    assert.equal(oldConsume.status, 409);
    assert.equal(oldConsume.body.error.code, 'link_token_used');
  });
});

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const request = require('supertest');

const { createApp } = require('../src/app');
const { COOKIE_NAME, issueSession } = require('../src/security/site-auth');

const user = { id: 'u-1', name: 'Anna', email: 'anna@example.test' };
const config = {
  isProduction: false,
  allowedOrigins: [],
  jwtSecret: 'j'.repeat(32),
  serviceToken: 's'.repeat(32),
  sessionTtlSeconds: 3600,
  documentTokenTtlSeconds: 300,
  linkTokenTtlSeconds: 600,
  ai: {},
};

function fixture(role = 'organizer') {
  const writes = [];
  const document = {
    id: 'd-1', tripId: 't-1', ownerUserId: 'u-1', name: 'ticket.png', mimeType: 'image/png',
    status: 'pending', visibility: 'shared', ocrStatus: 'not_requested', extractedData: null,
    blob: { bytes: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]) },
  };
  const prisma = {
    user: { async findUnique() { return user; } },
    trip: { async findUnique() { return {
      id: 't-1', title: 'Trip', ownerId: role === 'organizer' ? 'u-1' : 'u-owner',
      participants: role === 'organizer' ? [] : [{ userId: 'u-1', role, status: 'active' }],
    }; } },
    participant: {},
    document: {
      async findUnique() { return document; },
      async update(input) {
        writes.push(input.data);
        Object.assign(document, input.data);
        return document;
      },
    },
    async $queryRaw() { return [{ ok: 1 }]; },
  };
  return { prisma, writes, document };
}

describe('site document OCR routes', () => {
  test('processes an owned document and stores bounded extracted fields for review', async () => {
    const { prisma, writes } = fixture();
    const cookie = `${COOKIE_NAME}=${issueSession(user, config)}`;
    const response = await request(createApp({
      config,
      prisma,
      ocrExtractor: async () => ({
        status: 'extracted', errorCode: null, engine: 'tesseract', text: 'Flight SU 2142',
        data: { documentType: 'flight_ticket', flightNumber: 'SU 2142' },
      }),
    }))
      .post('/api/site/trips/t-1/documents/d-1/ocr')
      .set('Cookie', cookie);
    assert.equal(response.status, 200);
    assert.equal(response.body.document.ocrStatus, 'extracted');
    assert.equal(response.body.document.extractedData.flightNumber, 'SU 2142');
    assert.ok(writes.some((data) => data.extractedText === 'Flight SU 2142'));
    assert.doesNotMatch(JSON.stringify(response.body), /blob|bytes/);
  });

  test('lets only the organizer confirm reviewed flat metadata', async () => {
    const { prisma, writes } = fixture();
    const cookie = `${COOKIE_NAME}=${issueSession(user, config)}`;
    const response = await request(createApp({ config, prisma }))
      .patch('/api/site/trips/t-1/documents/d-1/ocr')
      .set('Cookie', cookie)
      .send({ extractedData: { documentType: 'flight_ticket', flightNumber: 'SU 2142', dates: ['2026-07-22'] } });
    assert.equal(response.status, 200);
    assert.equal(response.body.document.status, 'confirmed');
    assert.ok(writes.some((data) => data.reviewedAt instanceof Date));
  });

  test('keeps the uploaded document available when the OCR engine is unavailable', async () => {
    const { prisma } = fixture();
    const cookie = `${COOKIE_NAME}=${issueSession(user, config)}`;
    const response = await request(createApp({
      config, prisma, ocrExtractor: async () => { throw new Error('provider details must stay private'); },
    }))
      .post('/api/site/trips/t-1/documents/d-1/ocr')
      .set('Cookie', cookie);
    assert.equal(response.status, 200);
    assert.equal(response.body.document.ocrStatus, 'failed');
    assert.equal(response.body.document.ocrErrorCode, 'ocr_unavailable');
    assert.doesNotMatch(JSON.stringify(response.body), /provider details/);
  });

  test('rejects nested unbounded review payloads and participant processing', async () => {
    const organizer = fixture();
    const cookie = `${COOKIE_NAME}=${issueSession(user, config)}`;
    const invalid = await request(createApp({ config, prisma: organizer.prisma }))
      .patch('/api/site/trips/t-1/documents/d-1/ocr')
      .set('Cookie', cookie)
      .send({ extractedData: { nested: { secret: 'value' } } });
    assert.equal(invalid.status, 422);

    const participant = fixture('participant');
    const denied = await request(createApp({ config, prisma: participant.prisma, ocrExtractor: async () => { throw new Error('must not run'); } }))
      .post('/api/site/trips/t-1/documents/d-1/ocr')
      .set('Cookie', cookie);
    assert.equal(denied.status, 403);
  });

  test('rejects an image whose signature does not match the declared format before persistence', async () => {
    const { prisma } = fixture();
    prisma.$transaction = async () => { throw new Error('must not persist'); };
    const cookie = `${COOKIE_NAME}=${issueSession(user, config)}`;
    const response = await request(createApp({ config, prisma }))
      .post('/api/site/trips/t-1/documents')
      .set('Cookie', cookie)
      .attach('file', Buffer.from('not a png'), { filename: 'fake.png', contentType: 'image/png' });
    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'validation_error');
  });

  test('downloads an authorized trip-scoped document with safe attachment headers', async () => {
    const { prisma, document } = fixture();
    document.name = 'ticket 2026.png';
    const cookie = `${COOKIE_NAME}=${issueSession(user, config)}`;
    const response = await request(createApp({ config, prisma }))
      .get('/api/site/trips/t-1/documents/d-1/file')
      .set('Cookie', cookie);
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-type'], 'image/png');
    assert.match(response.headers['content-disposition'], /attachment; filename="ticket_2026\.png"/);
    assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.deepEqual(response.body, document.blob.bytes);
  });

  test('hides organizer-only and cross-trip document downloads from participants', async () => {
    const participant = fixture('participant');
    participant.document.visibility = 'organizer_only';
    const cookie = `${COOKIE_NAME}=${issueSession(user, config)}`;
    const hidden = await request(createApp({ config, prisma: participant.prisma }))
      .get('/api/site/trips/t-1/documents/d-1/file')
      .set('Cookie', cookie);
    assert.equal(hidden.status, 404);

    const foreign = fixture();
    foreign.document.tripId = 't-2';
    const wrongTrip = await request(createApp({ config, prisma: foreign.prisma }))
      .get('/api/site/trips/t-1/documents/d-1/file')
      .set('Cookie', cookie);
    assert.equal(wrongTrip.status, 404);
  });
});

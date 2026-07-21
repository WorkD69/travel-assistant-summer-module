const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');

function schema() {
  return fs.readFileSync(schemaPath, 'utf8');
}

describe('Prisma production schema', () => {
  test('uses PostgreSQL with separate runtime and migration URLs', () => {
    const text = schema();
    assert.match(text, /provider\s*=\s*"postgresql"/);
    assert.match(text, /url\s*=\s*env\("DATABASE_URL"\)/);
    assert.match(text, /directUrl\s*=\s*env\("DIRECT_URL"\)/);
    assert.doesNotMatch(text, /provider\s*=\s*"sqlite"/);
  });

  test('defines every shared site and Telegram model', () => {
    const text = schema();
    const models = [
      'User',
      'Trip',
      'Participant',
      'Invitation',
      'TripEvent',
      'MonitoringSignal',
      'TripPlan',
      'Document',
      'DocumentBlob',
      'DocumentDownloadToken',
      'Message',
      'TelegramAccountLink',
      'TelegramLinkToken',
      'BotUserState',
      'SosTicket',
      'NotificationPreference',
      'NotificationEvent',
    ];

    for (const model of models) {
      assert.match(text, new RegExp(`model\\s+${model}\\s+\\{`), model);
    }
  });

  test('stores Telegram identifiers and one-time credentials safely', () => {
    const text = schema();
    assert.match(text, /telegramUserId\s+String\s+@unique/);
    assert.match(text, /model\s+TelegramLinkToken[\s\S]*tokenHash\s+String\s+@unique/);
    assert.match(text, /model\s+DocumentDownloadToken[\s\S]*tokenHash\s+String\s+@unique/);
    assert.doesNotMatch(text, /\n\s+(rawToken|serviceToken|password)\s+String/);
  });

  test('enforces SOS and outbox idempotency in the database', () => {
    const text = schema();
    assert.match(text, /@@unique\(\[authorUserId, idempotencyKey\]\)/);
    assert.match(text, /model\s+NotificationEvent[\s\S]*eventId\s+String\s+@unique/);
    assert.match(text, /@@index\(\[status, availableAt, createdAt\]\)/);
  });

  test('stores every Telegram notification preference explicitly', () => {
    const text = schema();
    const preferenceModel = text.match(/model\s+NotificationPreference\s+\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const fields = [
      'segmentReminders',
      'timeChanges',
      'departureChanges',
      'delaysCancellations',
      'transferChanges',
      'hotelChanges',
      'newDocuments',
      'invitations',
      'ownSos',
      'violations',
      'planB',
      'organizerMessages',
      'quietHoursEnabled',
      'quietHoursStart',
      'quietHoursEnd',
      'timezone',
    ];

    for (const field of fields) {
      assert.match(preferenceModel, new RegExp(`\\b${field}\\b`), field);
    }
  });
});

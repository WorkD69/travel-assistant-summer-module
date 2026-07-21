const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const { createSos } = require('../src/services/sos');

function database() {
  const tickets = [];
  const notifications = [];
  const trip = {
    id: 't-1',
    title: 'Turkey',
    owner: { telegramLink: { telegramUserId: '111', revokedAt: null } },
    participants: [
      { role: 'organizer', status: 'active', user: { telegramLink: { telegramUserId: '222', revokedAt: null } } },
      { role: 'participant', status: 'active', user: { telegramLink: { telegramUserId: '333', revokedAt: null } } },
    ],
  };
  const tx = {
    trip: { async findUnique() { return trip; } },
    sosTicket: {
      async findUnique({ where }) {
        return tickets.find((item) => item.authorUserId === where.authorUserId_idempotencyKey.authorUserId
          && item.idempotencyKey === where.authorUserId_idempotencyKey.idempotencyKey) || null;
      },
      async create({ data }) {
        const item = { ...data, createdAt: new Date('2026-07-22T12:00:00Z') };
        tickets.push(item);
        return item;
      },
    },
    notificationEvent: {
      async create({ data }) { notifications.push(data); return data; },
    },
  };
  return {
    tickets,
    notifications,
    async $transaction(callback) { return callback(tx); },
  };
}

describe('SOS service', () => {
  test('requires a bounded idempotency key and valid content', async () => {
    const prisma = database();
    await assert.rejects(
      createSos(prisma, { userId: 'u-1', tripId: 't-1', category: 'late', description: 'Help', idempotencyKey: 'short' }),
      (error) => error.code === 'validation_error',
    );
    assert.equal(prisma.tickets.length, 0);
  });

  test('creates exactly one ticket and organizer events across duplicate requests', async () => {
    const prisma = database();
    const input = {
      userId: 'u-1', telegramUserId: '333', tripId: 't-1', category: 'transport',
      description: 'Transfer did not arrive', segmentId: 'e-1', idempotencyKey: '12f7c681-29c7-4c30-83f2-9d2dfba241a8',
      idFactory: () => 'fixed-id',
    };
    const first = await createSos(prisma, input);
    const duplicate = await createSos(prisma, input);

    assert.deepEqual(duplicate, first);
    assert.equal(prisma.tickets.length, 1);
    assert.equal(prisma.notifications.length, 2);
    assert.deepEqual(prisma.notifications.map((item) => item.recipientTelegramId).sort(), ['111', '222']);
    assert.ok(prisma.notifications.every((item) => item.type === 'sos_received'));
    assert.ok(prisma.notifications.every((item) => item.eventId.includes(first.id)));
  });
});

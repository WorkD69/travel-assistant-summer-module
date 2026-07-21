const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const { listPendingNotifications, markDelivered, markFailed } = require('../src/services/outbox');

describe('notification outbox', () => {
  test('lists only available pending events with bounded pagination', async () => {
    let captured;
    const rows = [{ id: 'n-1' }, { id: 'n-2' }, { id: 'n-3' }];
    const prisma = {
      notificationEvent: {
        async findMany(query) { captured = query; return rows; },
      },
    };
    const page = await listPendingNotifications(prisma, { limit: 2, now: new Date('2026-07-22T12:00:00Z') });
    assert.equal(captured.take, 3);
    assert.equal(captured.where.status, 'pending');
    assert.deepEqual(page.items, rows.slice(0, 2));
    assert.ok(page.next_cursor);
  });

  test('delivered and failed acknowledgements are idempotent and do not expose reasons', async () => {
    const records = new Map([['n-1', { id: 'n-1', status: 'pending', attempts: 0 }]]);
    const prisma = {
      notificationEvent: {
        async findUnique({ where }) { return records.get(where.id) || null; },
        async update({ where, data }) {
          const next = { ...records.get(where.id), ...data };
          if (data.attempts?.increment) next.attempts = records.get(where.id).attempts + data.attempts.increment;
          records.set(where.id, next);
          return next;
        },
      },
    };

    await markDelivered(prisma, 'n-1', new Date('2026-07-22T12:00:00Z'));
    await markDelivered(prisma, 'n-1', new Date('2026-07-22T13:00:00Z'));
    assert.equal(records.get('n-1').status, 'delivered');
    assert.equal(records.get('n-1').deliveredAt.toISOString(), '2026-07-22T12:00:00.000Z');

    records.set('n-2', { id: 'n-2', status: 'pending', attempts: 0 });
    await markFailed(prisma, 'n-2', 'Telegram raw secret detail', new Date('2026-07-22T12:00:00Z'));
    await markFailed(prisma, 'n-2', 'different', new Date('2026-07-22T13:00:00Z'));
    assert.equal(records.get('n-2').status, 'failed');
    assert.equal(records.get('n-2').attempts, 1);
    assert.equal(records.get('n-2').lastErrorCode, 'delivery_failed');
    assert.equal(JSON.stringify(records.get('n-2')).includes('Telegram raw secret'), false);
  });

  test('hides unknown notification identifiers', async () => {
    const prisma = { notificationEvent: { async findUnique() { return null; } } };
    await assert.rejects(markDelivered(prisma, 'missing'), (error) => error.code === 'not_found');
  });
});

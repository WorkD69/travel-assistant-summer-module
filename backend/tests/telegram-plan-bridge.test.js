const assert = require('node:assert/strict');
const { test } = require('node:test');

const { publishAppliedPlanToTelegram } = require('../src/storage/telegram-plan-bridge');

test('publishes an original applied Plan B into Telegram context and outbox', async () => {
  const created = { messages: [], notifications: [] };
  const now = new Date('2026-07-22T12:00:00.000Z');
  const physical = {
    trip: { async findUnique() { return { id: 'trip-1', title: 'Москва — Казань' }; } },
    participant: { async findMany() { return [
      { userId: 'organizer-1', user: { telegramLink: { telegramUserId: '100', revokedAt: null } } },
      { userId: 'member-1', user: { telegramLink: { telegramUserId: '200', revokedAt: null } } },
      { userId: 'member-2', user: { telegramLink: { telegramUserId: '300', revokedAt: new Date() } } },
    ]; } },
    message: { async create({ data }) {
      created.messages.push(data);
      return { id: 'message-1', createdAt: now, ...data };
    } },
    notificationEvent: { async create({ data }) { created.notifications.push(data); return data; } },
  };
  const plan = {
    id: 'plan-1', tripId: 'trip-1', title: 'Надёжный вариант',
    summary: 'Перенести выезд и предупредить участников.', publishedAt: now,
  };

  await publishAppliedPlanToTelegram(physical, plan, { appliedById: 'organizer-1' }, now);

  assert.deepEqual(created.messages, [{
    tripId: 'trip-1',
    authorUserId: 'organizer-1',
    planId: 'plan-1',
    title: 'Plan B: Надёжный вариант',
    content: 'Перенести выезд и предупредить участников.',
    audience: 'participants',
    status: 'published',
    publishedAt: now,
  }]);
  assert.equal(created.notifications.length, 1);
  assert.equal(created.notifications[0].recipientSiteUserId, 'member-1');
  assert.equal(created.notifications[0].recipientTelegramId, '200');
  assert.equal(created.notifications[0].type, 'plan_b_published');
  assert.equal(created.notifications[0].payload.what_changed, plan.summary);
  assert.equal(created.notifications[0].payload.deep_link_target, 'messages');
});

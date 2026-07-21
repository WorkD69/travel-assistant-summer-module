const { ApiError } = require('../errors');
const { decodeCursor, pageResult } = require('../pagination');

function boundedLimit(value) {
  const parsed = Number(value ?? 50);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new ApiError(422, 'validation_error', 'Лимит должен быть от 1 до 100.');
  }
  return parsed;
}

async function listPendingNotifications(prisma, options = {}) {
  const limit = boundedLimit(options.limit);
  const decoded = options.cursor ? decodeCursor(options.cursor) : null;
  const cursorId = typeof decoded === 'string' ? decoded : decoded?.id;
  const rows = await prisma.notificationEvent.findMany({
    where: {
      status: 'pending',
      availableAt: { lte: options.now || new Date() },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
  });
  return pageResult(rows, limit, (row) => ({ id: row.id }));
}

async function getNotification(prisma, id) {
  const notification = await prisma.notificationEvent.findUnique({ where: { id } });
  if (!notification) throw new ApiError(404, 'not_found', 'Уведомление не найдено.');
  return notification;
}

async function markDelivered(prisma, id, now = new Date()) {
  const notification = await getNotification(prisma, id);
  if (notification.status === 'delivered') return notification;
  return prisma.notificationEvent.update({
    where: { id },
    data: {
      status: 'delivered',
      deliveredAt: now,
      failedAt: null,
      lastErrorCode: null,
    },
  });
}

async function markFailed(prisma, id, _reason, now = new Date()) {
  const notification = await getNotification(prisma, id);
  if (notification.status === 'failed') return notification;
  if (notification.status === 'delivered') return notification;
  return prisma.notificationEvent.update({
    where: { id },
    data: {
      status: 'failed',
      failedAt: now,
      attempts: { increment: 1 },
      lastErrorCode: 'delivery_failed',
    },
  });
}

module.exports = { boundedLimit, listPendingNotifications, markDelivered, markFailed };

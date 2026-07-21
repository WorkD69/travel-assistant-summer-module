const crypto = require('node:crypto');

const { ApiError } = require('../errors');

const SOS_CATEGORIES = new Set(['late', 'lost_document', 'transport', 'accommodation', 'need_help', 'other']);

function validateInput(input) {
  const idempotencyKey = String(input.idempotencyKey || '');
  if (idempotencyKey.length < 16 || idempotencyKey.length > 100) {
    throw new ApiError(422, 'validation_error', 'Некорректный ключ идемпотентности.');
  }
  if (!SOS_CATEGORIES.has(input.category)) {
    throw new ApiError(422, 'validation_error', 'Некорректная категория SOS.');
  }
  const description = String(input.description || '').trim();
  if (description.length < 3 || description.length > 2000) {
    throw new ApiError(422, 'validation_error', 'Описание SOS должно содержать от 3 до 2000 символов.');
  }
  return { description, idempotencyKey };
}

function organizerTelegramIds(trip, senderTelegramId) {
  const links = [
    trip.owner?.telegramLink,
    ...(trip.participants || [])
      .filter((membership) => membership.status === 'active' && membership.role === 'organizer')
      .map((membership) => membership.user?.telegramLink),
  ];
  return [...new Set(links
    .filter((link) => link && !link.revokedAt)
    .map((link) => link.telegramUserId)
    .filter((telegramId) => telegramId && telegramId !== senderTelegramId))];
}

async function createInTransaction(tx, input, validated) {
  const unique = {
    authorUserId: input.userId,
    idempotencyKey: validated.idempotencyKey,
  };
  const existing = await tx.sosTicket.findUnique({
    where: { authorUserId_idempotencyKey: unique },
  });
  if (existing) return existing;

  const trip = await tx.trip.findUnique({
    where: { id: input.tripId },
    include: {
      owner: { include: { telegramLink: true } },
      participants: {
        where: { role: 'organizer', status: 'active' },
        include: { user: { include: { telegramLink: true } } },
      },
    },
  });
  if (!trip) throw new ApiError(404, 'not_found', 'Поездка не найдена.');

  const idFactory = input.idFactory || crypto.randomUUID;
  const ticketId = `sos-${idFactory()}`;
  const ticket = await tx.sosTicket.create({
    data: {
      id: ticketId,
      number: `SOS-${idFactory()}`,
      tripId: input.tripId,
      authorUserId: input.userId,
      telegramUserId: input.telegramUserId || null,
      category: input.category,
      description: validated.description,
      segment: input.segmentId || null,
      idempotencyKey: validated.idempotencyKey,
    },
  });

  for (const telegramId of organizerTelegramIds(trip, input.telegramUserId)) {
    await tx.notificationEvent.create({
      data: {
        eventId: `sos:${ticket.id}:received:${telegramId}`,
        recipientTelegramId: telegramId,
        tripId: trip.id,
        type: 'sos_received',
        payload: {
          trip_title: trip.title,
          title: 'Получен новый SOS',
          what_changed: validated.description,
          occurred_at: ticket.createdAt.toISOString(),
          source: 'backend',
          sos_id: ticket.id,
          deep_link_target: 'sos',
        },
      },
    });
  }
  return ticket;
}

async function createSos(prisma, input) {
  const validated = validateInput(input);
  try {
    return await prisma.$transaction((tx) => createInTransaction(tx, input, validated));
  } catch (error) {
    if (error?.code !== 'P2002' || !prisma.sosTicket) throw error;
    const existing = await prisma.sosTicket.findUnique({
      where: {
        authorUserId_idempotencyKey: {
          authorUserId: input.userId,
          idempotencyKey: validated.idempotencyKey,
        },
      },
    });
    if (existing) return existing;
    throw error;
  }
}

module.exports = { SOS_CATEGORIES, createSos, organizerTelegramIds, validateInput };

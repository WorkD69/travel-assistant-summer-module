async function publishAppliedPlanToTelegram(physical, plan, input, now = new Date()) {
  const authorUserId = input.appliedById;
  if (!authorUserId) return;

  const trip = await physical.trip.findUnique({ where: { id: plan.tripId } });
  if (!trip) return;

  const content = plan.summary || plan.title;
  const message = await physical.message.create({
    data: {
      tripId: plan.tripId,
      authorUserId,
      planId: plan.id,
      title: `Plan B: ${plan.title}`,
      content,
      audience: 'participants',
      status: 'published',
      publishedAt: now,
    },
  });

  const participants = await physical.participant.findMany({
    where: { tripId: plan.tripId, status: 'active', userId: { not: authorUserId } },
    include: { user: { include: { telegramLink: true } } },
  });
  for (const participant of participants) {
    const link = participant.user?.telegramLink;
    if (participant.userId === authorUserId || !link || link.revokedAt) continue;
    await physical.notificationEvent.create({
      data: {
        eventId: `plan:${plan.id}:${link.telegramUserId}`,
        recipientTelegramId: link.telegramUserId,
        recipientSiteUserId: participant.userId,
        tripId: plan.tripId,
        type: 'plan_b_published',
        payload: {
          trip_title: trip.title,
          title: message.title,
          what_changed: content,
          occurred_at: now.toISOString(),
          source: 'backend',
          deep_link_target: 'messages',
        },
      },
    });
  }
}

module.exports = { publishAppliedPlanToTelegram };

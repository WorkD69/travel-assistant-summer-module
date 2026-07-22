const express = require('express');

const { ACTIONS, assertCan, loadTripAccess } = require('../../access/trip-access');
const { ApiError } = require('../../errors');
const { generateAssistantAnswer, loadSafeContext } = require('../../services/assistant');

function questionFrom(value) {
  const question = String(value || '').trim();
  if (question.length < 1 || question.length > 2000) {
    throw new ApiError(422, 'validation_error', 'Вопрос должен содержать от 1 до 2000 символов.');
  }
  return question;
}

function publicAssistantMessage(message) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    mode: message.mode,
    createdAt: message.createdAt,
  };
}

function createSiteAssistantRouter({ config, prisma, fetchImpl }) {
  const router = express.Router();

  router.get('/:trip_id/assistant/history', async (req, res) => {
    const access = await loadTripAccess(prisma, req.siteUser.id, req.params.trip_id);
    assertCan(access, ACTIONS.USE_ASSISTANT);
    const items = await prisma.assistantMessage.findMany({
      where: { tripId: access.trip.id, userId: req.siteUser.id },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    res.json({ items: items.map(publicAssistantMessage) });
  });

  router.post('/:trip_id/assistant', async (req, res) => {
    const access = await loadTripAccess(prisma, req.siteUser.id, req.params.trip_id);
    assertCan(access, ACTIONS.USE_ASSISTANT);
    const question = questionFrom(req.body?.question);
    await prisma.assistantMessage.create({
      data: { tripId: access.trip.id, userId: req.siteUser.id, role: 'user', content: question, mode: 'dialog' },
    });
    const context = await loadSafeContext(prisma, { access, userId: req.siteUser.id });
    const generated = await generateAssistantAnswer(question, context, { ai: config.ai || {}, fetchImpl });
    const message = await prisma.assistantMessage.create({
      data: { tripId: access.trip.id, userId: req.siteUser.id, role: 'assistant', content: generated.answer, mode: 'dialog' },
    });
    res.json({ message: publicAssistantMessage(message), answer: generated.answer, source: generated.source });
  });

  return router;
}

module.exports = { createSiteAssistantRouter, publicAssistantMessage, questionFrom };

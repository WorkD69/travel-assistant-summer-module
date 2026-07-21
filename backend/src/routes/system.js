const express = require('express');

function createSystemRouter({ prisma }) {
  const router = express.Router();
  router.get('/health', (_req, res) => res.json({ status: 'ok' }));
  router.get('/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({
        error: { code: 'not_ready', message_ru: 'Сервис временно не готов.' },
      });
    }
  });
  return router;
}

module.exports = { createSystemRouter };

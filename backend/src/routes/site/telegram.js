const express = require('express');

const { ApiError } = require('../../errors');
const { createOpaqueToken } = require('../../security/tokens');

function publicStatus(link, pending) {
  if (link && !link.revokedAt) {
    return {
      status: 'connected',
      connectedAt: link.linkedAt.toISOString(),
      displayName: null,
    };
  }
  if (pending) {
    return {
      status: 'pending',
      expiresAt: pending.expiresAt.toISOString(),
    };
  }
  return { status: 'not_connected' };
}

function createSiteTelegramRouter({ config, prisma, now = () => new Date() }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const current = now();
    const [link, pending] = await Promise.all([
      prisma.telegramAccountLink.findUnique({ where: { siteUserId: req.siteUser.id } }),
      prisma.telegramLinkToken.findFirst({
        where: {
          siteUserId: req.siteUser.id,
          consumedAt: null,
          expiresAt: { gt: current },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    res.json(publicStatus(link, pending));
  });

  router.post('/link-token', async (req, res) => {
    const createdAt = now();
    const expiresAt = new Date(createdAt.getTime() + config.linkTokenTtlSeconds * 1000);
    const token = createOpaqueToken();
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${req.siteUser.id} FOR UPDATE`;
      const activeLink = await tx.telegramAccountLink.findUnique({
        where: { siteUserId: req.siteUser.id },
      });
      if (activeLink && !activeLink.revokedAt) {
        throw new ApiError(409, 'link_conflict', 'Telegram уже подключён к этому аккаунту.');
      }
      await tx.telegramLinkToken.updateMany({
        where: { siteUserId: req.siteUser.id, consumedAt: null },
        data: { consumedAt: createdAt },
      });
      await tx.telegramLinkToken.create({
        data: {
          tokenHash: token.hash,
          siteUserId: req.siteUser.id,
          expiresAt,
        },
      });
    });

    const payload = `link_${token.raw}`;
    res.status(201).json({
      deepLink: `https://t.me/${config.telegramBotUsername}?start=${payload}`,
      expiresAt: expiresAt.toISOString(),
      status: 'pending',
    });
  });

  router.delete('/', async (req, res) => {
    const revokedAt = now();
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${req.siteUser.id} FOR UPDATE`;
      await tx.telegramAccountLink.updateMany({
        where: { siteUserId: req.siteUser.id, revokedAt: null },
        data: { revokedAt },
      });
      await tx.telegramLinkToken.updateMany({
        where: { siteUserId: req.siteUser.id, consumedAt: null },
        data: { consumedAt: revokedAt },
      });
    });
    res.status(204).end();
  });

  return router;
}

module.exports = { createSiteTelegramRouter, publicStatus };

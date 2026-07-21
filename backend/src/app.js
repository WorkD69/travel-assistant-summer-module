const cookieParser = require('cookie-parser');
const express = require('express');
const helmet = require('helmet');

const { ApiError } = require('./errors');
const { createAuthRouter } = require('./routes/site/auth');
const { createBotRouter } = require('./routes/bot');
const { createSiteTripsRouter } = require('./routes/site/trips');
const { createSiteOperationsRouter } = require('./routes/site/operations');
const { createGeoRouter } = require('./routes/site/geo');
const { createSystemRouter } = require('./routes/system');
const { createOriginMiddleware } = require('./security/origin');
const { createSiteAuthMiddleware } = require('./security/site-auth');

function createApp({ config, prisma }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.isProduction) app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  app.use('/api', createSystemRouter({ prisma }));
  app.use('/api/auth', createOriginMiddleware(config), createAuthRouter({ config, prisma }));
  app.use(
    '/api/site/trips',
    createOriginMiddleware(config),
    createSiteAuthMiddleware(config, prisma),
    createSiteTripsRouter({ config, prisma }),
  );
  app.use(
    '/api/site/trips',
    createOriginMiddleware(config),
    createSiteAuthMiddleware(config, prisma),
    createSiteOperationsRouter({ config, prisma }),
  );
  app.use(
    '/api/site/geo',
    createOriginMiddleware(config),
    createSiteAuthMiddleware(config, prisma),
    createGeoRouter(),
  );
  app.use(createBotRouter({ config, prisma }));

  app.use((_req, _res, next) => {
    next(new ApiError(404, 'not_found', 'Ресурс не найден.'));
  });

  app.use((error, req, res, _next) => {
    let safe;
    if (error instanceof ApiError) safe = error;
    else if (error?.type === 'entity.parse.failed') safe = new ApiError(400, 'validation_error', 'Некорректный JSON.');
    else if (error?.code === 'LIMIT_FILE_SIZE') safe = new ApiError(422, 'validation_error', 'Файл превышает допустимый размер.');
    else safe = new ApiError(500, 'internal_error', 'Внутренняя ошибка сервиса.');
    if (req.botContract) {
      const { botErrorCode } = require('./errors');
      res.status(safe.status).json({ error: { code: botErrorCode(safe.code), message_ru: safe.messageRu } });
      return;
    }
    res.status(safe.status).json(safe.toJSON());
  });

  return app;
}

module.exports = { createApp };

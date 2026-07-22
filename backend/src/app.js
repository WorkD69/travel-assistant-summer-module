const cookieParser = require('cookie-parser');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');

const configModule = require('./config');
const db = require('./db');
const { ApiError, botErrorCode } = require('./errors');
const { createChildTripScopeGuard, createMonitoringAccessGuard } = require('./middleware/canonical-site-guard');
const { requireAuth } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const { createBotRouter } = require('./routes/bot');
const geoRoutes = require('./routes/geo');
const monitoringRoutes = require('./routes/monitoring');
const { createSiteTelegramRouter } = require('./routes/site/telegram');
const { createSystemRouter } = require('./routes/system');
const { createOriginMiddleware } = require('./security/origin');
const tripsRoutes = require('./routes/trips');
const ai = require('./services/ai');

function createApp({ config, prisma, now }) {
  db.setPrisma(prisma);
  configModule.setRuntimeConfig(config);
  const app = express();
  app.disable('x-powered-by');
  if (config.isProduction) app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      if (!config.isProduction || !origin || config.allowedOrigins.includes(origin)) callback(null, true);
      else callback(null, false);
    },
  }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use((_req, _res, next) => db.runWithTeammatePrisma(next));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ai: ai.hasKey(), env: configModule.nodeEnv });
  });
  app.get('/api/build-info', (_req, res) => {
    res.json({
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      buildDate: process.env.BUILD_DATE || null,
      environment: process.env.VERCEL_ENV || config.nodeEnv,
      apiBaseUrl: config.publicBaseUrl || null,
    });
  });
  app.use('/api', createSystemRouter({ prisma }));
  const browserOrigin = createOriginMiddleware(config);
  app.use('/api/auth', browserOrigin, authRoutes);
  app.use('/api/trips', browserOrigin);
  app.use('/api/geo', browserOrigin);
  app.use('/api/weather', browserOrigin);
  app.use('/api/trips/:tripId/monitoring', requireAuth, createMonitoringAccessGuard({ prisma }));
  app.use(
    '/api/trips/:tripId/:collection/:childId',
    requireAuth,
    createChildTripScopeGuard({ prisma }),
  );
  app.use('/api', monitoringRoutes);
  app.use('/api', geoRoutes);
  app.use('/api', tripsRoutes);

  app.use(
    '/api/site/integrations/telegram',
    browserOrigin,
    requireAuth,
    (req, _res, next) => { req.siteUser = req.user; next(); },
    createSiteTelegramRouter({ config, prisma }),
  );
  app.use(createBotRouter({ config, prisma, now }));

  app.use((_req, _res, next) => {
    next(new ApiError(404, 'not_found', 'Ресурс не найден.'));
  });

  app.use((error, req, res, _next) => {
    let safe;
    if (error instanceof ApiError) safe = error;
    else if (error?.type === 'entity.parse.failed') {
      safe = new ApiError(400, 'validation_error', 'Некорректный JSON.');
    } else if (error?.code === 'LIMIT_FILE_SIZE') {
      safe = new ApiError(422, 'validation_error', 'Файл превышает допустимый размер.');
    } else {
      safe = new ApiError(500, 'internal_error', 'Внутренняя ошибка сервиса.');
    }
    if (req.botContract) {
      res.status(safe.status).json({
        error: { code: botErrorCode(safe.code), message_ru: safe.messageRu },
      });
      return;
    }
    res.status(safe.status).json(safe.toJSON());
  });

  return app;
}

module.exports = { createApp };

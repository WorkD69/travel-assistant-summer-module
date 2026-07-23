const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const ai = require('./services/ai');

const app = express();

app.use(cors({
  origin: function (origin, callback) {
    if (config.isCorsOriginAllowed(origin, config.corsOrigins)) {
      return callback(null, true);
    }
    const error = new Error('CORS origin denied');
    error.status = 403;
    return callback(error);
  },
  credentials: true,
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Telegram-User-Id',
    'Idempotency-Key',
  ],
}));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({ ok: true, ai: ai.hasKey(), env: config.nodeEnv });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/monitoring'));
app.use('/api', require('./routes/geo'));
app.use('/api', require('./routes/trips'));
// Telegram bot bridge (its routes use absolute /api/bot and /api/integrations paths).
app.use(require('./routes/bot'));

if (config.frontendDir && fs.existsSync(config.frontendDir)) {
  app.use(express.static(config.frontendDir));
  app.get('*', (req, res, next) => {
    if (req.path.indexOf('/api/') === 0) return next();
    res.sendFile(path.join(config.frontendDir, 'index.html'));
  });
}

module.exports = app;

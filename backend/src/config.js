require('dotenv').config();

const DEVELOPMENT_ORIGINS = [
  'http://localhost:8011',
  'http://127.0.0.1:8011',
];

function parseCorsOrigins(rawValue, isProduction) {
  const values = String(rawValue || '')
    .split(',')
    .map(function (value) { return value.trim(); })
    .filter(Boolean);

  if (!values.length) {
    if (isProduction) {
      throw new Error('FRONTEND_ORIGIN is required in production');
    }
    return DEVELOPMENT_ORIGINS.slice();
  }

  const origins = values.map(function (value) {
    if (value === '*') {
      throw new Error('CORS wildcard is not allowed');
    }

    let parsed;
    try {
      parsed = new URL(value);
    } catch (error) {
      throw new Error('Invalid FRONTEND_ORIGIN: ' + value);
    }

    const hasExtraUrlParts = (
      parsed.username || parsed.password || parsed.search || parsed.hash ||
      (parsed.pathname && parsed.pathname !== '/')
    );
    if (hasExtraUrlParts) {
      throw new Error('FRONTEND_ORIGIN must be an origin without path or credentials');
    }

    const localHostname = (
      parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '[::1]'
    );
    if (isProduction && (parsed.protocol !== 'https:' || localHostname)) {
      throw new Error('Production FRONTEND_ORIGIN must use HTTPS and cannot be localhost');
    }

    return parsed.origin;
  });

  return Array.from(new Set(origins));
}

function isCorsOriginAllowed(origin, allowedOrigins) {
  if (!origin) return true;
  try {
    return allowedOrigins.indexOf(new URL(origin).origin) !== -1;
  } catch (error) {
    return false;
  }
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';
const corsOrigins = parseCorsOrigins(process.env.FRONTEND_ORIGIN, isProd);

module.exports = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  nodeEnv: nodeEnv,
  isProd: isProd,
  corsOrigins: corsOrigins,
  frontendOrigin: corsOrigins[0],
  parseCorsOrigins: parseCorsOrigins,
  isCorsOriginAllowed: isCorsOriginAllowed,
  // Universal OpenAI-compatible AI provider config.
  // Works with Groq, OpenRouter, YandexGPT, GigaChat, OpenAI, etc.
  ai: {
    baseUrl: process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1',
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
  },
  frontendDir: process.env.FRONTEND_DIR || '',
  // Telegram bot integration (service-to-service).
  bot: {
    // Shared secret the Telegram bot sends as `Authorization: Bearer <token>`.
    serviceToken: process.env.BOT_SERVICE_TOKEN || '',
    // Bot username (without @) used to build deep links t.me/<username>?start=link_<token>.
    username: process.env.TELEGRAM_BOT_USERNAME || '',
    // Minutes a Telegram account-link token stays valid.
    linkTokenTtlMinutes: Number(process.env.BOT_LINK_TOKEN_TTL_MINUTES || 10),
    // Minutes a temporary document download link stays valid.
    fileLinkTtlMinutes: Number(process.env.BOT_FILE_LINK_TTL_MINUTES || 10),
  },
  // Public base URL of this backend, used to build absolute file links for the bot.
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || ('http://localhost:' + (process.env.PORT || 3000))).replace(/\/$/, ''),
};

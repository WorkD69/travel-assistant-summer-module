const REQUIRED_PRODUCTION_KEYS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'TRAVEL_API_SERVICE_TOKEN',
  'TELEGRAM_BOT_USERNAME',
];

function parseInteger(name, value, fallback, minimum, maximum) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function parseOrigins(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      let url;
      try {
        url = new URL(item);
      } catch {
        throw new Error('ALLOWED_ORIGINS contains an invalid URL');
      }
      if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/') {
        throw new Error('ALLOWED_ORIGINS must contain HTTP origins without paths');
      }
      return url.origin;
    });
}

function parseTelegramBotUsername(value) {
  const username = String(value || '').trim().replace(/^@/, '');
  if (username && !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) {
    throw new Error('TELEGRAM_BOT_USERNAME must be a valid Telegram username');
  }
  return username;
}

function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  if (isProduction) {
    const missing = REQUIRED_PRODUCTION_KEYS.filter((key) => !env[key]);
    if (missing.length) {
      throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
    }
  }

  const invalidSecretNames = [];
  if (env.JWT_SECRET && env.JWT_SECRET.length < 32) invalidSecretNames.push('JWT_SECRET');
  if (env.TRAVEL_API_SERVICE_TOKEN && env.TRAVEL_API_SERVICE_TOKEN.length < 32) {
    invalidSecretNames.push('TRAVEL_API_SERVICE_TOKEN');
  }
  if (invalidSecretNames.length) {
    throw new Error(`${invalidSecretNames.join(', ')} must be at least 32 characters`);
  }

  const allowedOrigins = parseOrigins(env.ALLOWED_ORIGINS);
  if (isProduction && allowedOrigins.length === 0) {
    throw new Error('ALLOWED_ORIGINS is required in production');
  }

  return Object.freeze({
    nodeEnv,
    isProduction,
    port: parseInteger('PORT', env.PORT, 3100, 1, 65535),
    databaseUrl: env.DATABASE_URL || '',
    directUrl: env.DIRECT_URL || env.DATABASE_URL || '',
    jwtSecret: env.JWT_SECRET || '',
    serviceToken: env.TRAVEL_API_SERVICE_TOKEN || '',
    allowedOrigins: Object.freeze([...new Set(allowedOrigins)]),
    sessionTtlSeconds: parseInteger(
      'SESSION_TTL_SECONDS',
      env.SESSION_TTL_SECONDS,
      43_200,
      300,
      2_592_000,
    ),
    documentTokenTtlSeconds: parseInteger(
      'DOCUMENT_TOKEN_TTL_SECONDS',
      env.DOCUMENT_TOKEN_TTL_SECONDS,
      300,
      30,
      3_600,
    ),
    linkTokenTtlSeconds: parseInteger(
      'LINK_TOKEN_TTL_SECONDS',
      env.LINK_TOKEN_TTL_SECONDS,
      600,
      60,
      3_600,
    ),
    telegramBotUsername: parseTelegramBotUsername(env.TELEGRAM_BOT_USERNAME),
    publicBaseUrl: env.BACKEND_PUBLIC_URL
      || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
      || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : ''),
    ai: Object.freeze({
      baseUrl: env.AI_BASE_URL || 'https://api.groq.com/openai/v1',
      apiKey: env.AI_API_KEY || '',
      model: env.AI_MODEL || 'llama-3.3-70b-versatile',
    }),
  });
}

module.exports = {
  REQUIRED_PRODUCTION_KEYS,
  loadConfig,
  parseTelegramBotUsername,
};

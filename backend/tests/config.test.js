const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const { loadConfig } = require('../src/config');

describe('loadConfig', () => {
  test('rejects production startup when required secrets are missing', () => {
    assert.throws(
      () => loadConfig({ NODE_ENV: 'production' }),
      /DATABASE_URL, JWT_SECRET, TRAVEL_API_SERVICE_TOKEN, TELEGRAM_BOT_USERNAME/,
    );
  });

  test('does not include secret values in validation errors', () => {
    const env = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://secret-database-value',
      JWT_SECRET: 'short-secret-value',
      TRAVEL_API_SERVICE_TOKEN: 'short-service-value',
    };

    let error;
    try {
      loadConfig(env);
    } catch (caught) {
      error = caught;
    }

    assert.ok(error instanceof Error);
    assert.ok(!error.message.includes(env.DATABASE_URL));
    assert.ok(!error.message.includes(env.JWT_SECRET));
    assert.ok(!error.message.includes(env.TRAVEL_API_SERVICE_TOKEN));
  });

  test('parses a valid production configuration', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://database.example/app',
      DIRECT_URL: 'postgresql://database.example/app',
      JWT_SECRET: 'j'.repeat(64),
      TRAVEL_API_SERVICE_TOKEN: 's'.repeat(64),
      TELEGRAM_BOT_USERNAME: 'travel_assistent10_bot',
      ALLOWED_ORIGINS: 'https://travel-assistant-summer-module.vercel.app',
      SESSION_TTL_SECONDS: '3600',
      GROQ_API_KEY: 'g'.repeat(48),
      GROQ_MODEL: 'llama-3.3-70b-versatile',
      GROQ_FALLBACK_MODEL: 'openai/gpt-oss-20b',
    });

    assert.equal(config.isProduction, true);
    assert.equal(config.port, 3100);
    assert.deepEqual(config.allowedOrigins, [
      'https://travel-assistant-summer-module.vercel.app',
    ]);
    assert.equal(config.sessionTtlSeconds, 3600);
    assert.equal(config.telegramBotUsername, 'travel_assistent10_bot');
    assert.equal(config.ai.apiKey, 'g'.repeat(48));
    assert.equal(config.ai.model, 'llama-3.3-70b-versatile');
    assert.equal(config.ai.fallbackModel, 'openai/gpt-oss-20b');
  });

  test('keeps legacy AI variable names as a non-breaking fallback', () => {
    const config = loadConfig({ AI_API_KEY: 'legacy-key', AI_MODEL: 'legacy-model' });
    assert.equal(config.ai.apiKey, 'legacy-key');
    assert.equal(config.ai.model, 'legacy-model');
  });
});

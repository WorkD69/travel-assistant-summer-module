const crypto = require('crypto');
const https = require('https');

const domain = process.env.E2E_BACKEND_DOMAIN;
const address = process.env.E2E_BACKEND_IP;
const serviceToken = process.env.BOT_SERVICE_TOKEN;

function ensure(value, message) {
  if (!value) throw new Error(message);
}

ensure(domain, 'E2E_BACKEND_DOMAIN is unavailable');
ensure(address, 'E2E_BACKEND_IP is unavailable');
ensure(serviceToken, 'BOT_SERVICE_TOKEN is unavailable');

function request(method, pathname, options) {
  const settings = options || {};
  const payload = settings.body === undefined
    ? null
    : Buffer.from(JSON.stringify(settings.body));
  const headers = Object.assign({ Accept: 'application/json' }, settings.headers || {});
  if (payload) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = String(payload.length);
  }
  return new Promise(function (resolve, reject) {
    const req = https.request({
      host: address,
      servername: domain,
      method: method,
      path: pathname,
      headers: Object.assign({ Host: domain }, headers),
      timeout: 30000,
    }, function (response) {
      const chunks = [];
      response.on('data', function (chunk) { chunks.push(chunk); });
      response.on('end', function () {
        const text = Buffer.concat(chunks).toString('utf8');
        let body = null;
        if (text) {
          try { body = JSON.parse(text); } catch (error) { body = text; }
        }
        resolve({ status: response.statusCode, body: body });
      });
    });
    req.once('timeout', function () { req.destroy(new Error('request timeout')); });
    req.once('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function auth(token) {
  return { Authorization: 'Bearer ' + token };
}

function botHeaders(telegramId) {
  return {
    Authorization: 'Bearer ' + serviceToken,
    'X-Telegram-User-Id': telegramId,
  };
}

async function register(name) {
  const response = await request('POST', '/api/auth/register', {
    body: {
      email: 'link-e2e-' + crypto.randomUUID() + '@example.test',
      password: crypto.randomBytes(24).toString('base64url'),
      name: name,
    },
  });
  ensure(response.status === 201 && response.body.token, 'registration failed');
  return response.body.token;
}

async function makeLink(jwt) {
  const response = await request('POST', '/api/integrations/telegram/link-token', {
    headers: auth(jwt),
    body: {},
  });
  ensure(response.status === 201 && response.body.token, 'link token creation failed');
  ensure(response.body.bot_username === 'travel_assistent10_bot', 'bot username mismatch');
  ensure(
    response.body.deep_link ===
      'https://t.me/travel_assistent10_bot?start=link_' + response.body.token,
    'deep link mismatch',
  );
  return response.body.token;
}

async function consume(token, telegramId) {
  return request('POST', '/api/integrations/telegram/link-token/consume', {
    headers: botHeaders(telegramId),
    body: { token: token },
  });
}

async function status(jwt) {
  return request('GET', '/api/integrations/telegram/status', { headers: auth(jwt) });
}

async function main() {
  const checked = [];
  const health = await request('GET', '/api/health');
  ensure(health.status === 200 && health.body.ok && health.body.ai, 'health failed');
  checked.push('health-ai');

  const firstJwt = await register('Live Link E2E A');
  const secondJwt = await register('Live Link E2E B');
  const firstTelegramId = String(920000000 + Math.floor(Math.random() * 1000000));
  const secondTelegramId = String(Number(firstTelegramId) + 1);

  const firstToken = await makeLink(firstJwt);
  let response = await consume(firstToken, firstTelegramId);
  ensure(response.status === 200, 'first consume failed');
  response = await status(firstJwt);
  ensure(response.status === 200 && response.body.linked === true, 'first status failed');
  checked.push('link-token-deep-link-consume');

  response = await consume(firstToken, firstTelegramId);
  ensure(
    response.status === 409 && response.body.error.code === 'link_token_used',
    'single-use enforcement failed',
  );
  checked.push('single-use-token');

  const secondToken = await makeLink(secondJwt);
  response = await consume(secondToken, secondTelegramId);
  ensure(response.status === 200, 'second consume failed');

  response = await request('DELETE', '/api/integrations/telegram/link', {
    headers: auth(firstJwt),
  });
  ensure(response.status === 204, 'unlink failed');
  const firstAfterUnlink = await status(firstJwt);
  const secondAfterUnlink = await status(secondJwt);
  ensure(firstAfterUnlink.body.linked === false, 'first user remained linked');
  ensure(secondAfterUnlink.body.linked === true, 'unlink affected another user');
  checked.push('unlink-isolation');

  const freshToken = await makeLink(firstJwt);
  response = await consume(freshToken, firstTelegramId);
  ensure(response.status === 200, 'relink failed');
  const firstAfterRelink = await status(firstJwt);
  const secondAfterRelink = await status(secondJwt);
  ensure(firstAfterRelink.body.linked === true, 'first relink status failed');
  ensure(secondAfterRelink.body.linked === true, 'relink affected another user');
  checked.push('relink-no-duplicates');

  process.stdout.write(JSON.stringify({ ok: true, checked: checked }) + '\n');
}

main().catch(function (error) {
  process.stderr.write('Live Telegram link E2E failed: ' + error.message + '\n');
  process.exitCode = 1;
});

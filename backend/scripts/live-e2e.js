const https = require('https');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { createCanvas } = require('@napi-rs/canvas');

const domain = process.env.E2E_BACKEND_DOMAIN;
const address = process.env.E2E_BACKEND_IP;
const serviceToken = process.env.BOT_SERVICE_TOKEN;
const railwayCli = process.env.E2E_RAILWAY_CLI;

function ensure(value, message) {
  if (!value) throw new Error(message);
}

ensure(domain && address, 'Backend endpoint is unavailable');
ensure(serviceToken, 'BOT_SERVICE_TOKEN is unavailable');
ensure(railwayCli, 'Railway CLI path is unavailable');

function request(method, pathname, options) {
  const settings = options || {};
  let body = settings.body;
  const headers = Object.assign({ Host: domain, Accept: 'application/json' }, settings.headers || {});
  if (body !== undefined && !Buffer.isBuffer(body)) {
    body = Buffer.from(JSON.stringify(body));
    headers['Content-Type'] = 'application/json';
  }
  if (Buffer.isBuffer(body)) headers['Content-Length'] = String(body.length);

  return new Promise(function (resolve, reject) {
    const req = https.request({
      host: address,
      port: 443,
      servername: domain,
      method: method,
      path: pathname,
      headers: headers,
      rejectUnauthorized: true,
    }, function (res) {
      const chunks = [];
      res.on('data', function (chunk) { chunks.push(chunk); });
      res.on('end', function () {
        const buffer = Buffer.concat(chunks);
        let parsed = buffer;
        if (!settings.raw) {
          const text = buffer.toString('utf8');
          try { parsed = text ? JSON.parse(text) : null; }
          catch (error) { parsed = { raw: text }; }
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.setTimeout(settings.timeout || 120000, function () {
      req.destroy(new Error('HTTP timeout'));
    });
    req.on('error', reject);
    if (body) req.write(body);
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

function delay(milliseconds) {
  return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
}

async function main() {
  const checked = [];
  let response = await request('GET', '/api/health');
  ensure(response.status === 200 && response.body.ok === true && response.body.ai === true,
    'health/AI configuration failed');
  checked.push('health-ai');

  response = await request('GET', '/api/health', {
    headers: { Origin: 'https://travel-assistant-teammate-preview.vercel.app' },
  });
  ensure(response.status === 200 &&
    response.headers['access-control-allow-origin'] === 'https://travel-assistant-teammate-preview.vercel.app',
  'allowed CORS origin failed');
  response = await request('GET', '/api/health', { headers: { Origin: 'https://example.invalid' } });
  ensure(response.status === 403, 'disallowed CORS origin was accepted');
  checked.push('cors');

  const email = 'e2e-' + crypto.randomUUID() + '@example.test';
  const password = crypto.randomBytes(24).toString('base64url');
  response = await request('POST', '/api/auth/register', {
    body: { email: email, password: password, name: 'Isolated E2E' },
  });
  ensure(response.status === 201 && response.body.token, 'registration failed');
  const jwt = response.body.token;
  response = await request('GET', '/api/auth/me', { headers: auth(jwt) });
  ensure(response.status === 200 && response.body.user.email === email, 'JWT restore failed');
  checked.push('jwt-session');

  response = await request('POST', '/api/trips', {
    headers: auth(jwt),
    body: {
      title: 'Isolated Railway E2E',
      route: 'Moscow - Kazan',
      startDate: '2026-08-01T08:00:00.000Z',
      endDate: '2026-08-05T20:00:00.000Z',
      status: 'active',
    },
  });
  ensure(response.status === 201 && response.body.trip.id, 'trip creation failed');
  const tripId = response.body.trip.id;
  checked.push('trip-sqlite');

  response = await request('POST', '/api/integrations/telegram/link-token', {
    headers: auth(jwt), body: {},
  });
  ensure(response.status === 201 && response.body.token, 'Telegram link token failed');
  const linkToken = response.body.token;
  const telegramId = String(910000000 + Math.floor(Math.random() * 8999999));
  response = await request('POST', '/api/integrations/telegram/link-token/consume', {
    headers: botHeaders(telegramId), body: { token: linkToken },
  });
  ensure(response.status === 200, 'Telegram link consume failed');
  response = await request('GET', '/api/bot/me', { headers: botHeaders(telegramId) });
  ensure(response.status === 200, 'Telegram consumer me failed');
  response = await request('GET', '/api/bot/trips?limit=100', { headers: botHeaders(telegramId) });
  ensure(response.status === 200 && response.body.items.some(function (item) { return item.id === tripId; }),
    'Telegram trips failed');
  response = await request('GET', '/api/bot/trips/' + tripId + '/assistant-context', {
    headers: botHeaders(telegramId),
  });
  ensure(response.status === 200 && response.body.trip.id === tripId, 'Telegram assistant context failed');
  const idempotencyKey = crypto.randomUUID();
  const sosOptions = {
    headers: Object.assign(botHeaders(telegramId), { 'Idempotency-Key': idempotencyKey }),
    body: { category: 'late', description: 'Isolated live E2E' },
  };
  const firstSos = await request('POST', '/api/bot/trips/' + tripId + '/sos', sosOptions);
  const repeatedSos = await request('POST', '/api/bot/trips/' + tripId + '/sos', sosOptions);
  ensure(firstSos.status === 201 && repeatedSos.status === 201 && firstSos.body.id === repeatedSos.body.id,
    'Telegram SOS idempotency failed');
  response = await request('GET', '/api/bot/notifications/pending?limit=50', {
    headers: { Authorization: 'Bearer ' + serviceToken },
  });
  ensure(response.status === 200 && response.body.items.some(function (item) {
    return item.sos_id === firstSos.body.id;
  }), 'Telegram notification queue failed');
  checked.push('telegram-consumer');

  const canvas = createCanvas(1000, 220);
  const context = canvas.getContext('2d');
  context.fillStyle = 'white';
  context.fillRect(0, 0, 1000, 220);
  context.fillStyle = 'black';
  context.font = 'bold 58px Arial';
  context.fillText('TRAVEL E2E 2026', 35, 135);
  const png = canvas.toBuffer('image/png');
  const boundary = '----travel-e2e-' + crypto.randomUUID();
  const prefix = Buffer.from('--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="file"; filename="travel-e2e.png"\r\n' +
    'Content-Type: image/png\r\n\r\n');
  const suffix = Buffer.from('\r\n--' + boundary + '--\r\n');
  const multipart = Buffer.concat([prefix, png, suffix]);
  response = await request('POST', '/api/trips/' + tripId + '/documents/upload', {
    headers: Object.assign(auth(jwt), { 'Content-Type': 'multipart/form-data; boundary=' + boundary }),
    body: multipart,
    timeout: 120000,
  });
  ensure(response.status === 201 && response.body.document.id, 'document upload failed');
  const documentId = response.body.document.id;
  ensure(response.body.document.ocrStatus === 'done' && /TRAVEL/i.test(response.body.document.ocrText || ''),
    'real OCR did not recognize the sample');
  response = await request('GET', '/api/trips/' + tripId + '/documents/' + documentId + '/file', {
    headers: auth(jwt), raw: true,
  });
  ensure(response.status === 200 && Buffer.compare(response.body, png) === 0,
    'document binary roundtrip failed');
  checked.push('ocr-document-volume');

  const incident = 'Рейс отменён, я в аэропорту Казани, следующий сегмент завтра утром. ' +
    'Нужны три самостоятельных варианта решения.';
  response = await request('POST', '/api/trips/' + tripId + '/monitoring/assistant', {
    headers: auth(jwt),
    body: { mode: 'dialog', messages: [{ role: 'user', content: incident }] },
    timeout: 120000,
  });
  ensure(response.status === 200 && typeof response.body.reply === 'string' && response.body.reply.length > 30,
    'real AI dialog failed');
  response = await request('POST', '/api/trips/' + tripId + '/monitoring/assistant', {
    headers: auth(jwt),
    body: { mode: 'plans', messages: [{ role: 'user', content: incident }] },
    timeout: 150000,
  });
  ensure(response.status === 200 && Array.isArray(response.body.plans) && response.body.plans.length === 3,
    'real Plan B cardinality failed');
  response.body.plans.forEach(function (plan, index) {
    ensure(plan && plan.title && Array.isArray(plan.steps) && plan.steps.length &&
      plan.pros && plan.cons && plan.whenToUse, 'Plan B item ' + index + ' is incomplete');
  });
  const firstPlan = response.body.plans[0];
  response = await request('POST', '/api/trips/' + tripId + '/monitoring/plan', {
    headers: auth(jwt),
    body: Object.assign({}, firstPlan, { summary: 'Applied by isolated E2E' }),
  });
  ensure(response.status === 201 && response.body.plan.status === 'active', 'Plan B apply failed');
  const appliedPlanId = response.body.plan.id;
  checked.push('groq-dialog-plan-b');

  const restart = spawnSync(railwayCli, [
    'service', 'restart',
    '--project', '1a4f7ee9-b0e5-472c-af11-86ed0a8a98b3',
    '--service', 'travel-assistant-teammate-backend',
    '--environment', 'production',
    '--yes', '--json',
  ], { env: process.env, stdio: 'ignore', timeout: 60000, windowsHide: true });
  ensure(restart.status === 0, 'Railway restart command failed');
  await delay(12000);
  let healthy = false;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    try {
      const health = await request('GET', '/api/health', { timeout: 10000 });
      if (health.status === 200 && health.body.ok) { healthy = true; break; }
    } catch (error) {}
    await delay(5000);
  }
  ensure(healthy, 'backend did not recover after restart');

  response = await request('GET', '/api/auth/me', { headers: auth(jwt) });
  ensure(response.status === 200 && response.body.user.email === email, 'user/JWT did not persist');
  response = await request('GET', '/api/trips/' + tripId, { headers: auth(jwt) });
  ensure(response.status === 200 && response.body.trip.id === tripId, 'trip did not persist');
  response = await request('GET', '/api/trips/' + tripId + '/documents', { headers: auth(jwt) });
  ensure(response.status === 200 && response.body.documents.some(function (doc) {
    return doc.id === documentId && doc.hasFile;
  }), 'document did not persist');
  response = await request('GET', '/api/trips/' + tripId + '/monitoring/assistant/history', {
    headers: auth(jwt),
  });
  ensure(response.status === 200 && response.body.history.length >= 4, 'assistant history did not persist');
  response = await request('GET', '/api/trips/' + tripId + '/monitoring/plan', { headers: auth(jwt) });
  ensure(response.status === 200 && response.body.plan && response.body.plan.id === appliedPlanId,
    'applied Plan B did not persist');
  response = await request('GET', '/api/bot/me', { headers: botHeaders(telegramId) });
  ensure(response.status === 200, 'Telegram link did not persist');
  checked.push('restart-persistence');

  process.stdout.write(JSON.stringify({
    ok: true,
    checked: checked,
    planCount: 3,
    ocr: 'done',
    restart: 'healthy',
  }) + '\n');
}

main().catch(function (error) {
  process.stderr.write('Live E2E failed: ' + error.message + '\n');
  process.exitCode = 1;
});

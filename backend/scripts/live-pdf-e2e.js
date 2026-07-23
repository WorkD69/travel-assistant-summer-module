const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

const domain = process.env.E2E_BACKEND_DOMAIN;
const address = process.env.E2E_BACKEND_IP;
const pdfPath = process.env.E2E_PDF_PATH;

function ensure(value, message) {
  if (!value) throw new Error(message);
}

ensure(domain && address && pdfPath, 'PDF E2E inputs are unavailable');

function request(method, pathname, options) {
  const settings = options || {};
  let body = settings.body;
  const headers = Object.assign({ Host: domain, Accept: 'application/json' }, settings.headers || {});
  if (body !== undefined && !Buffer.isBuffer(body)) {
    body = Buffer.from(JSON.stringify(body));
    headers['Content-Type'] = 'application/json';
  }
  if (Buffer.isBuffer(body)) headers['Content-Length'] = String(body.length);

  return new Promise((resolve, reject) => {
    const req = https.request({
      host: address,
      port: 443,
      servername: domain,
      method,
      path: pathname,
      headers,
      rejectUnauthorized: true,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (settings.raw) return resolve({ status: res.statusCode, body: buffer });
        const text = buffer.toString('utf8');
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; }
        catch (error) { parsed = { raw: text }; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.setTimeout(settings.timeout || 120000, () => req.destroy(new Error('HTTP timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function main() {
  const email = `pdf-e2e-${crypto.randomUUID()}@example.test`;
  const password = crypto.randomBytes(24).toString('base64url');
  let response = await request('POST', '/api/auth/register', {
    body: { email, password, name: 'PDF E2E' },
  });
  ensure(response.status === 201 && response.body.token, 'registration failed');
  const jwt = response.body.token;

  response = await request('GET', '/api/geo/search?q=%D0%A1%D1%8B%D0%BA', { headers: auth(jwt) });
  ensure(response.status === 200 && Array.isArray(response.body.results) && response.body.results.length > 0,
    'city autocomplete search failed');

  response = await request('POST', '/api/trips', {
    headers: auth(jwt),
    body: {
      title: 'PDF OCR E2E',
      route: 'Syktyvkar - Moscow - Antalya',
      startDate: '2026-08-10T08:00:00.000Z',
      endDate: '2026-08-20T20:00:00.000Z',
      status: 'active',
    },
  });
  ensure(response.status === 201 && response.body.trip.id, 'trip creation failed');
  const tripId = response.body.trip.id;

  const pdf = fs.readFileSync(pdfPath);
  const boundary = `----travel-pdf-e2e-${crypto.randomUUID()}`;
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="version-b-e2e-ticket.pdf"\r\n` +
    'Content-Type: application/pdf\r\n\r\n',
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  response = await request('POST', `/api/trips/${tripId}/documents/upload`, {
    headers: Object.assign(auth(jwt), { 'Content-Type': `multipart/form-data; boundary=${boundary}` }),
    body: Buffer.concat([prefix, pdf, suffix]),
    timeout: 150000,
  });
  ensure(response.status === 201 && response.body.document, 'PDF upload failed');
  const document = response.body.document;
  const normalizedOcr = String(document.ocrText || '').replace(/\s+/g, ' ').trim();
  const textRecognized = /TRAVEL\s+E2E\s+TICKET\s+2026/i.test(normalizedOcr);
  ensure(document.ocrStatus === 'done' && textRecognized,
    `PDF text/OCR extraction failed (status=${document.ocrStatus}, length=${normalizedOcr.length}, marker=${textRecognized})`);

  response = await request('GET', `/api/trips/${tripId}/documents/${document.id}/file`, {
    headers: auth(jwt),
    raw: true,
  });
  ensure(response.status === 200 && Buffer.compare(response.body, pdf) === 0, 'PDF roundtrip failed');

  process.stdout.write(JSON.stringify({
    ok: true,
    autocomplete: true,
    pdf: true,
    ocr: 'done',
    roundtrip: true,
  }) + '\n');
}

main().catch((error) => {
  process.stderr.write(`Live PDF E2E failed: ${error.message}\n`);
  process.exitCode = 1;
});

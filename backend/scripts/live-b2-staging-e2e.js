const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createCanvas } = require('@napi-rs/canvas');

const EXPECTED_BASE = 'https://travel-assistant-teammate-backend-b2-staging-staging-b2.up.railway.app';
const EXPECTED_FRONTEND = 'https://travel-assistant-teammate-preview-quon6nily-workd69s-projects.vercel.app';
const PROJECT_ID = '1a4f7ee9-b0e5-472c-af11-86ed0a8a98b3';
const ENVIRONMENT_ID = '086b515b-8243-4eda-9afe-6ce3b6e1c279';
const SERVICE_ID = '10d60116-41b9-428b-a0b1-300ac40dad0e';

const baseUrl = String(process.env.E2E_BASE_URL || '').replace(/\/$/, '');
const frontendOrigin = String(process.env.E2E_FRONTEND_ORIGIN || '').replace(/\/$/, '');
const serviceToken = process.env.BOT_SERVICE_TOKEN || '';

assert.equal(baseUrl, EXPECTED_BASE, 'Refusing to run outside the isolated B2 backend');
assert.equal(frontendOrigin, EXPECTED_FRONTEND, 'Refusing to run against another frontend');
assert.equal(process.env.RAILWAY_ENVIRONMENT_NAME, 'staging-b2', 'Railway environment guard failed');
assert.equal(
  process.env.RAILWAY_SERVICE_NAME,
  'travel-assistant-teammate-backend-b2-staging',
  'Railway service guard failed',
);
assert.ok(serviceToken.length >= 32, 'Staging BOT_SERVICE_TOKEN is unavailable');

function auth(token) {
  return { Authorization: 'Bearer ' + token };
}

function botHeaders(telegramUserId) {
  return {
    Authorization: 'Bearer ' + serviceToken,
    'X-Telegram-User-Id': String(telegramUserId),
  };
}

async function request(method, pathname, options) {
  const settings = options || {};
  const headers = Object.assign({ Accept: 'application/json' }, settings.headers || {});
  let body = settings.body;
  if (body !== undefined && !(body instanceof FormData)) {
    body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(baseUrl + pathname, {
    method: method,
    headers: headers,
    body: body,
    redirect: 'manual',
  });
  if (settings.raw) {
    return { status: response.status, headers: response.headers, body: Buffer.from(await response.arrayBuffer()) };
  }
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch (error) { parsed = { text: text }; }
  return { status: response.status, headers: response.headers, body: parsed };
}

function expectStatus(response, status, label) {
  assert.equal(response.status, status, label + ' returned HTTP ' + response.status);
  return response.body;
}

function restartStagingService() {
  const result = spawnSync('npx.cmd', [
    '--yes', '@railway/cli', 'service', 'restart',
    '--project', PROJECT_ID,
    '--environment', ENVIRONMENT_ID,
    '--service', SERVICE_ID,
    '--yes', '--json',
  ], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    windowsHide: true,
    shell: true,
    timeout: 90000,
  });
  if (result.status !== 0) {
    throw new Error('Staging-only Railway restart failed: ' + String(result.stderr || '').trim());
  }
}

function delay(milliseconds) {
  return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
}

async function register(name) {
  const email = 'b2-' + crypto.randomUUID() + '@example.test';
  const password = crypto.randomBytes(32).toString('base64url');
  const body = expectStatus(await request('POST', '/api/auth/register', {
    body: { email: email, password: password, name: name },
  }), 201, 'register ' + name);
  assert.ok(body.token && body.user && body.user.id);
  return { email: email, password: password, token: body.token, user: body.user };
}

async function linkTelegram(siteToken, telegramUserId) {
  const link = expectStatus(await request('POST', '/api/integrations/telegram/link-token', {
    headers: auth(siteToken), body: {},
  }), 201, 'create Telegram link token');
  assert.ok(link.token);
  expectStatus(await request('POST', '/api/integrations/telegram/link-token/consume', {
    headers: botHeaders(telegramUserId), body: { token: link.token },
  }), 200, 'consume Telegram link token');
}

async function main() {
  const checks = [];
  const health = expectStatus(await request('GET', '/api/health'), 200, 'health');
  assert.equal(health.ok, true);
  checks.push('health');

  const cors = await request('OPTIONS', '/api/health', {
    headers: {
      Origin: frontendOrigin,
      'Access-Control-Request-Method': 'GET',
    },
  });
  assert.equal(cors.status, 204);
  assert.equal(cors.headers.get('access-control-allow-origin'), frontendOrigin);
  const deniedCors = await request('OPTIONS', '/api/health', {
    headers: {
      Origin: 'https://travel-assistant-summer-module.vercel.app',
      'Access-Control-Request-Method': 'GET',
    },
  });
  assert.equal(deniedCors.status, 403);
  checks.push('exact-preview-cors');

  const owner = await register('B2 Staging Owner');
  const participant = await register('B2 Staging Participant');
  const wrongUser = await register('B2 Wrong Invitee');
  const ownerHeaders = auth(owner.token);
  const participantHeaders = auth(participant.token);
  const wrongHeaders = auth(wrongUser.token);

  const restoredOwner = expectStatus(await request('GET', '/api/auth/me', { headers: ownerHeaders }), 200, 'JWT restore');
  assert.equal(restoredOwner.user.id, owner.user.id);
  checks.push('register-and-jwt-restore');

  const created = expectStatus(await request('POST', '/api/trips', {
    headers: ownerHeaders,
    body: {
      title: 'B2: Сыктывкар — Москва',
      route: 'Сыктывкар → Москва',
      startDate: '2026-08-10T06:00:00.000Z',
      endDate: '2026-08-12T18:00:00.000Z',
      type: 'group',
      status: 'active',
    },
  }), 201, 'create trip');
  const tripId = created.trip.id;
  checks.push('create-syktyvkar-moscow-trip');

  const participantInvitation = expectStatus(await request('POST', '/api/trips/' + tripId + '/invitations', {
    headers: ownerHeaders,
    body: { email: participant.email, role: 'participant', expiresInDays: 1 },
  }), 201, 'create participant invitation').invitation;
  assert.equal(participantInvitation.expiresInDays, 1);
  assert.ok(participantInvitation.link.startsWith(frontendOrigin + '/invitation.html?token='));
  expectStatus(await request('POST', '/api/invitations/' + encodeURIComponent(participantInvitation.token) + '/accept', {
    headers: wrongHeaders, body: {},
  }), 403, 'reject invitation email mismatch');
  expectStatus(await request('POST', '/api/invitations/' + encodeURIComponent(participantInvitation.token) + '/accept', {
    headers: participantHeaders, body: {},
  }), 200, 'accept invitation');
  expectStatus(await request('POST', '/api/invitations/' + encodeURIComponent(participantInvitation.token) + '/accept', {
    headers: participantHeaders, body: {},
  }), 409, 'reject invitation reuse');
  checks.push('invitation-accept-email-single-use');

  const ownerTelegramId = String(930000000 + Math.floor(Math.random() * 1000000));
  const participantTelegramId = String(940000000 + Math.floor(Math.random() * 1000000));
  await linkTelegram(owner.token, ownerTelegramId);
  await linkTelegram(participant.token, participantTelegramId);
  const botMe = expectStatus(await request('GET', '/api/bot/me', {
    headers: botHeaders(ownerTelegramId),
  }), 200, 'Telegram consumer me');
  assert.equal(botMe.site_user_id, owner.user.id);
  checks.push('http-telegram-link-and-consumer');

  const revisedSegments = [{
    id: 'b2-live-train-1',
    transportType: 'train',
    departurePlace: 'Санкт-Петербург',
    arrivalPlace: 'Москва',
    departureAt: '2026-08-10T07:00:00.000Z',
    arrivalAt: '2026-08-10T11:00:00.000Z',
    title: 'Санкт-Петербург → Москва',
  }];
  expectStatus(await request('PATCH', '/api/trips/' + tripId, {
    headers: participantHeaders,
    body: { route: 'Участник не должен изменить маршрут' },
  }), 403, 'participant owner-only PATCH');
  const patched = expectStatus(await request('PATCH', '/api/trips/' + tripId, {
    headers: ownerHeaders,
    body: {
      title: 'B2 Canonical Санкт-Петербург — Москва',
      route: 'Санкт-Петербург → Москва',
      startDate: '2026-08-10T07:00:00.000Z',
      endDate: '2026-08-12T18:00:00.000Z',
      type: 'group',
      status: 'active',
      segments: revisedSegments,
    },
  }), 200, 'owner canonical PATCH').trip;
  assert.equal(patched.route, 'Санкт-Петербург → Москва');
  assert.deepEqual(patched.segments, revisedSegments);
  assert.ok(patched.updatedAt);
  checks.push('owner-only-canonical-patch');

  const canonical = expectStatus(await request('GET', '/api/trips/' + tripId, {
    headers: ownerHeaders,
  }), 200, 'server-authoritative GET').trip;
  assert.equal(canonical.route, patched.route);
  assert.deepEqual(canonical.segments, revisedSegments);
  checks.push('server-authoritative-hydration-data');

  const freshLogin = expectStatus(await request('POST', '/api/auth/login', {
    body: { email: owner.email, password: owner.password, remember: false },
  }), 200, 'fresh login');
  const afterLogin = expectStatus(await request('GET', '/api/trips/' + tripId, {
    headers: auth(freshLogin.token),
  }), 200, 'trip after relogin').trip;
  assert.equal(afterLogin.route, patched.route);
  checks.push('refresh-and-relogin-persistence');

  const botTrips = expectStatus(await request('GET', '/api/bot/trips?limit=100', {
    headers: botHeaders(ownerTelegramId),
  }), 200, 'Telegram trip list');
  assert.ok(botTrips.items.some(function (trip) { return trip.id === tripId && trip.route === patched.route; }));
  let context = expectStatus(await request('GET', '/api/bot/trips/' + tripId + '/assistant-context', {
    headers: botHeaders(ownerTelegramId),
  }), 200, 'fresh Telegram assistant context');
  assert.equal(context.trip.route, patched.route);
  assert.ok(context.recent_changes.some(function (change) { return change.type === 'route_changed'; }));
  assert.ok(Array.isArray(context.events) && context.events.length === 1);
  checks.push('bot-api-fresh-route-and-deep-link-target');

  assert.ok(Array.isArray(context.weather) && context.weather.length > 0, 'Open-Meteo route weather is empty');
  assert.ok(context.weather.every(function (weather) {
    return weather.source === 'Open-Meteo' && weather.city && Number.isFinite(weather.temperature) && weather.updatedAt;
  }));
  checks.push('server-side-open-meteo-context');

  const risk = expectStatus(await request('POST', '/api/trips/' + tripId + '/monitoring', {
    headers: participantHeaders,
    body: {
      label: 'Задержка пересадки',
      severity: 'high',
      status: 'new',
      detail: 'Контролируемый B2 staging-сценарий задержки',
    },
  }), 201, 'create delay risk');
  assert.ok(risk.signal && risk.signal.id);
  checks.push('delay-transfer-risk-scenario');

  const plansResponse = expectStatus(await request('POST', '/api/trips/' + tripId + '/monitoring/assistant', {
    headers: ownerHeaders,
    body: { mode: 'plans', messages: [{ role: 'user', content: 'Перестрой маршрут после задержки пересадки' }] },
  }), 200, 'structured Plan B');
  const plans = plansResponse.plans;
  assert.equal(plans.length, 3);
  assert.deepEqual(plans.map(function (plan) { return plan.strategy; }), ['fastest', 'cheapest', 'reliable']);
  assert.ok(plans.every(function (plan) {
    return plan.id && plan.title && plan.revisedRoute && plan.isDemoData === true &&
      plan.source && Array.isArray(plan.segments) && plan.segments.length > 0 &&
      plan.totalDuration && Number.isFinite(plan.estimatedCost) && plan.currency &&
      Number.isFinite(plan.transferCount) &&
      ((typeof plan.reliability === 'string' && plan.reliability.length > 0) || Number.isFinite(plan.reliability)) &&
      Array.isArray(plan.risks) && Array.isArray(plan.assumptions) && Array.isArray(plan.requiredActions);
  }));
  assert.equal(new Set(plans.map(function (plan) { return plan.revisedRoute; })).size, 3);
  checks.push('three-distinct-structured-demo-plan-b-routes');

  expectStatus(await request('POST', '/api/trips/' + tripId + '/monitoring/plan', {
    headers: participantHeaders,
    body: plans[1],
  }), 403, 'participant Plan B apply');
  const applied = expectStatus(await request('POST', '/api/trips/' + tripId + '/monitoring/plan', {
    headers: ownerHeaders,
    body: plans[1],
  }), 201, 'atomic Plan B apply');
  assert.equal(applied.plan.status, 'applied');
  assert.equal(applied.trip.route, plans[1].revisedRoute);
  assert.deepEqual(applied.trip.segments, plans[1].segments);
  checks.push('owner-only-atomic-plan-b-apply');

  const persistedPlanTrip = expectStatus(await request('GET', '/api/trips/' + tripId, {
    headers: auth(freshLogin.token),
  }), 200, 'Plan B after refresh').trip;
  assert.equal(persistedPlanTrip.route, plans[1].revisedRoute);
  assert.deepEqual(persistedPlanTrip.segments, plans[1].segments);
  context = expectStatus(await request('GET', '/api/bot/trips/' + tripId + '/assistant-context', {
    headers: botHeaders(ownerTelegramId),
  }), 200, 'context after Plan B');
  assert.equal(context.trip.route, plans[1].revisedRoute);
  assert.equal(context.selected_plan.strategy, plans[1].strategy);
  assert.equal(context.events.length, plans[1].segments.length);
  checks.push('plan-b-refresh-timeline-map-and-context');

  const canvas = createCanvas(1000, 240);
  const drawing = canvas.getContext('2d');
  drawing.fillStyle = 'white';
  drawing.fillRect(0, 0, 1000, 240);
  drawing.fillStyle = 'black';
  drawing.font = 'bold 64px Arial';
  drawing.fillText('B2 TRAVEL OCR 2026', 40, 145);
  const png = canvas.toBuffer('image/png');
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'b2-travel-ocr.png');
  const uploaded = expectStatus(await request('POST', '/api/trips/' + tripId + '/documents/upload', {
    headers: ownerHeaders,
    body: form,
  }), 201, 'OCR document upload').document;
  assert.equal(uploaded.ocrStatus, 'done');
  assert.match(uploaded.ocrText || '', /B2|TRAVEL|2026/i);
  const downloaded = await request('GET', '/api/trips/' + tripId + '/documents/' + uploaded.id + '/file', {
    headers: ownerHeaders,
    raw: true,
  });
  assert.equal(downloaded.status, 200);
  assert.equal(Buffer.compare(downloaded.body, png), 0);
  checks.push('ocr-and-volume-binary-roundtrip');

  expectStatus(await request('POST', '/api/trips/' + tripId + '/messages', {
    headers: ownerHeaders,
    body: { kind: 'announcement', status: 'published', title: 'B2 Plan applied', body: 'Use the selected route.' },
  }), 201, 'organizer message');
  checks.push('organizer-message-outbox');

  const sosKey = crypto.randomUUID();
  const firstSos = expectStatus(await request('POST', '/api/bot/trips/' + tripId + '/sos', {
    headers: Object.assign({}, botHeaders(participantTelegramId), { 'Idempotency-Key': sosKey }),
    body: { category: 'late', description: 'B2 isolated SOS test' },
  }), 201, 'create SOS');
  const repeatedSos = expectStatus(await request('POST', '/api/bot/trips/' + tripId + '/sos', {
    headers: Object.assign({}, botHeaders(participantTelegramId), { 'Idempotency-Key': sosKey }),
    body: { category: 'late', description: 'B2 isolated SOS test' },
  }), 201, 'idempotent SOS retry');
  assert.equal(firstSos.id, repeatedSos.id);
  expectStatus(await request('PATCH', '/api/trips/' + tripId + '/monitoring/' + firstSos.id, {
    headers: ownerHeaders,
    body: { status: 'in_review' },
  }), 200, 'SOS status change');
  checks.push('sos-idempotency-and-status-change');

  const pending = expectStatus(await request('GET', '/api/bot/notifications/pending?limit=100', {
    headers: { Authorization: 'Bearer ' + serviceToken },
  }), 200, 'Telegram pending notification API');
  const tripNotifications = pending.items.filter(function (item) { return item.trip_id === tripId; });
  const types = Array.from(new Set(tripNotifications.map(function (item) { return item.type; }))).sort();
  ['route_changed', 'segments_changed', 'plan_b_applied', 'document_added', 'organizer_message', 'risk_detected', 'sos_created', 'sos_status_changed'].forEach(function (type) {
    assert.ok(types.includes(type), 'Missing pending outbox type ' + type);
  });
  const routeNotification = tripNotifications.find(function (item) {
    return item.type === 'route_changed' && String(item.recipient_telegram_id) === participantTelegramId;
  });
  assert.ok(routeNotification, 'Participant route notification is missing');
  expectStatus(await request('POST', '/api/bot/notifications/' + routeNotification.id + '/delivered', {
    headers: { Authorization: 'Bearer ' + serviceToken }, body: {},
  }), 204, 'consumer delivered acknowledgement');
  checks.push('outbox-pending-consumer-delivered');

  const invitation3d = expectStatus(await request('POST', '/api/trips/' + tripId + '/invitations', {
    headers: ownerHeaders,
    body: { email: 'b2-revoked-' + crypto.randomUUID() + '@example.test', role: 'participant', expiresInDays: 3 },
  }), 201, '3-day invitation').invitation;
  assert.equal(invitation3d.expiresInDays, 3);
  expectStatus(await request('DELETE', '/api/trips/' + tripId + '/invitations/' + invitation3d.id, {
    headers: ownerHeaders,
  }), 200, 'revoke invitation');
  expectStatus(await request('GET', '/api/invitations/resolve/' + encodeURIComponent(invitation3d.token)), 410, 'resolve revoked invitation');

  const invitation7d = expectStatus(await request('POST', '/api/trips/' + tripId + '/invitations', {
    headers: ownerHeaders,
    body: { email: 'b2-expired-' + crypto.randomUUID() + '@example.test', role: 'participant', expiresInDays: 7 },
  }), 201, '7-day invitation').invitation;
  assert.equal(invitation7d.expiresInDays, 7);
  const sevenDayDuration = new Date(invitation7d.expiresAt).getTime() - new Date(invitation7d.createdAt).getTime();
  assert.ok(sevenDayDuration >= 7 * 24 * 60 * 60 * 1000 - 2000);
  checks.push('invitation-1d-3d-7d-deadlines-and-revoke');

  restartStagingService();
  let recovered = false;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    try {
      const probe = await request('GET', '/api/health');
      if (probe.status === 200 && probe.body && probe.body.ok) {
        recovered = true;
        break;
      }
    } catch (error) {}
    await delay(5000);
  }
  assert.equal(recovered, true, 'Staging backend did not recover after restart');
  const postRestartLogin = expectStatus(await request('POST', '/api/auth/login', {
    body: { email: owner.email, password: owner.password, remember: false },
  }), 200, 'login after staging restart');
  const postRestartTrip = expectStatus(await request('GET', '/api/trips/' + tripId, {
    headers: auth(postRestartLogin.token),
  }), 200, 'SQLite trip after staging restart').trip;
  assert.equal(postRestartTrip.route, plans[1].revisedRoute);
  assert.deepEqual(postRestartTrip.segments, plans[1].segments);
  const postRestartBot = expectStatus(await request('GET', '/api/bot/me', {
    headers: botHeaders(ownerTelegramId),
  }), 200, 'Telegram link after staging restart');
  assert.equal(postRestartBot.site_user_id, owner.user.id);
  checks.push('sqlite-volume-and-links-survive-container-restart');

  const persistenceEvidence = {
    route: postRestartTrip.route,
    segments: postRestartTrip.segments.length,
    updatedAt: postRestartTrip.updatedAt,
    changeTypes: Array.from(new Set(context.recent_changes.map(function (change) { return change.type; }))).sort(),
    notifications: tripNotifications.length,
  };

  process.stdout.write(JSON.stringify({
    ok: true,
    healthAiConfigured: health.ai,
    tripId: tripId,
    checks: checks,
    weather: context.weather,
    plans: plans.map(function (plan) {
      return {
        id: plan.id,
        strategy: plan.strategy,
        title: plan.title,
        revisedRoute: plan.revisedRoute,
        segmentCount: plan.segments.length,
        totalDuration: plan.totalDuration,
        estimatedCost: plan.estimatedCost,
        currency: plan.currency,
        transferCount: plan.transferCount,
        reliability: plan.reliability,
        source: plan.source,
        isDemoData: plan.isDemoData,
      };
    }),
    selectedPlan: context.selected_plan && {
      strategy: context.selected_plan.strategy,
      revisedRoute: context.selected_plan.revisedRoute,
    },
    notificationTypes: types,
    persistenceEvidence: persistenceEvidence,
  }, null, 2) + '\n');
}

main().catch(function (error) {
  process.stderr.write('B2 staging E2E failed: ' + error.message + '\n');
  process.exitCode = 1;
});

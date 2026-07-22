const assert = require('node:assert/strict');
const { afterEach, describe, mock, test } = require('node:test');

const jwt = require('jsonwebtoken');
const request = require('supertest');

const { createApp } = require('../src/app');

function config(overrides = {}) {
  return {
    nodeEnv: 'test',
    isProduction: false,
    jwtSecret: 'j'.repeat(32),
    serviceToken: 's'.repeat(32),
    telegramBotUsername: 'travel_helper_bot',
    linkTokenTtlSeconds: 600,
    documentTokenTtlSeconds: 300,
    ai: {
      baseUrl: 'https://ai.example/v1',
      apiKey: 'test-only-key',
      model: 'canonical-model',
    },
    ...overrides,
  };
}

function fakePhysical() {
  const user = {
    id: 'user-1', email: 'owner@example.test', passwordHash: 'unused',
    name: 'Организатор', initials: 'О', createdAt: new Date('2026-07-01T00:00:00Z'),
  };
  const state = {
    trips: [], participants: [], events: [], assistantMessages: [], signals: [], plans: [],
    messages: [], notifications: [], documents: [],
  };

  function tripRow(row) {
    if (!row) return null;
    return {
      ...row,
      participants: state.participants.filter((item) => item.tripId === row.id)
        .map((item) => ({ ...item, user })),
      events: state.events.filter((item) => item.tripId === row.id),
      invitations: [], documents: state.documents.filter((item) => item.tripId === row.id),
      messages: state.messages.filter((item) => item.tripId === row.id), offlineCopies: [],
      monitoringSignals: state.signals.filter((item) => item.tripId === row.id),
      plans: state.plans.filter((item) => item.tripId === row.id),
      _count: {
        participants: state.participants.filter((item) => item.tripId === row.id).length,
        documents: 0,
        monitoringSignals: state.signals.filter((item) => item.tripId === row.id).length,
      },
    };
  }

  const physical = {
    state,
    user: {
      async findUnique({ where }) {
        return where.id === user.id || where.email === user.email ? user : null;
      },
    },
    trip: {
      async findUnique({ where }) { return tripRow(state.trips.find((item) => item.id === where.id)); },
      async findMany() { return state.trips.map(tripRow); },
      async create({ data }) {
        const row = {
          id: data.id, title: data.title, route: data.route, startDate: data.startDate,
          endDate: data.endDate, status: data.status, type: data.type, ownerId: data.ownerId,
          createdAt: new Date('2026-07-22T00:00:00Z'),
        };
        state.trips.push(row);
        for (const item of data.participants?.create || []) {
          state.participants.push({
            id: `participant-${state.participants.length + 1}`, tripId: row.id,
            joinedAt: new Date('2026-07-22T00:00:00Z'), ...item,
          });
        }
        for (const item of data.events?.create || []) state.events.push({ ...item, tripId: row.id });
        return tripRow(row);
      },
      async update({ where, data }) {
        const row = state.trips.find((item) => item.id === where.id);
        Object.assign(row, data);
        return tripRow(row);
      },
      async delete({ where }) {
        const index = state.trips.findIndex((item) => item.id === where.id);
        return state.trips.splice(index, 1)[0];
      },
    },
    tripEvent: {
      async deleteMany({ where }) {
        state.events = state.events.filter((item) => item.tripId !== where.tripId);
      },
      async createMany({ data }) { state.events.push(...data); return { count: data.length }; },
    },
    participant: {
      async findMany({ where }) {
        return state.participants
          .filter((item) => item.tripId === where.tripId && item.userId !== where.userId?.not)
          .map((item) => ({ ...item, user: { ...user, telegramLink: null } }));
      },
    },
    message: {
      async create({ data }) {
        const row = { id: `message-${state.messages.length + 1}`, createdAt: new Date(), ...data };
        state.messages.push(row);
        return row;
      },
    },
    notificationEvent: {
      async create({ data }) { state.notifications.push(data); return data; },
    },
    document: {
      async findMany({ where }) { return state.documents.filter((item) => item.tripId === where.tripId); },
      async findUnique({ where }) { return state.documents.find((item) => item.id === where.id) || null; },
      async create({ data }) {
        const row = {
          id: `document-${state.documents.length + 1}`,
          createdAt: new Date('2026-07-22T00:00:00Z'),
          ...data,
          blob: data.blob?.create ? { id: 'blob-1', bytes: data.blob.create.bytes } : null,
        };
        state.documents.push(row);
        return row;
      },
      async update({ where, data }) {
        const row = state.documents.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
      async delete({ where }) {
        const index = state.documents.findIndex((item) => item.id === where.id);
        return state.documents.splice(index, 1)[0];
      },
    },
    assistantMessage: {
      async findMany({ where }) {
        return state.assistantMessages.filter((item) => item.tripId === where.tripId && item.userId === where.userId);
      },
      async create({ data }) {
        const row = { id: `assistant-${state.assistantMessages.length + 1}`, createdAt: new Date(), ...data };
        state.assistantMessages.push(row);
        return row;
      },
    },
    monitoringSignal: {
      async findMany({ where }) { return state.signals.filter((item) => item.tripId === where.tripId); },
      async findFirst({ where }) { return state.signals.find((item) => item.tripId === where.tripId) || null; },
      async create({ data }) {
        const row = { id: `signal-${state.signals.length + 1}`, createdAt: new Date(), ...data };
        state.signals.push(row);
        return row;
      },
    },
    tripPlan: {
      async findFirst({ where }) {
        return state.plans.find((item) => item.tripId === where.tripId && item.status === where.status) || null;
      },
      async findMany({ where }) { return state.plans.filter((item) => item.tripId === where.tripId); },
      async count({ where }) { return state.plans.filter((item) => item.incidentId === where.incidentId).length; },
      async create({ data }) {
        const row = { id: `plan-${state.plans.length + 1}`, createdAt: new Date(), ...data };
        state.plans.push(row);
        return row;
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const item of state.plans) {
          if (item.tripId === where.tripId && item.status === where.status) { Object.assign(item, data); count += 1; }
        }
        return { count };
      },
      async update({ where, data }) {
        const row = state.plans.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
      async delete({ where }) {
        const index = state.plans.findIndex((item) => item.id === where.id);
        return state.plans.splice(index, 1)[0];
      },
    },
    async $transaction(callback) { return callback(physical); },
    async $queryRaw() { return [{ ok: 1 }]; },
  };
  return physical;
}

function authCookie(settings) {
  return `token=${jwt.sign({ sub: 'user-1', email: 'owner@example.test' }, settings.jwtSecret)}`;
}

afterEach(() => mock.restoreAll());

describe('canonical teammate site HTTP contracts', () => {
  test('round-trips trip.route and trip.segments through /api/trips', async () => {
    const settings = config();
    const physical = fakePhysical();
    const app = createApp({ config: settings, prisma: physical });
    const segments = [{
      id: 'seg-1', type: 'flight', from: 'Сыктывкар', to: 'Москва',
      start: '2026-08-01T06:00:00.000Z', end: '2026-08-01T08:00:00.000Z',
      ref: 'SU-100', provider: 'Аэрофлот', status: 'scheduled', note: 'Терминал', order: 0,
    }];

    const created = await request(app).post('/api/trips')
      .set('Cookie', authCookie(settings))
      .send({
        title: 'Летняя поездка', route: 'Сыктывкар → Москва', status: 'active', type: 'group',
        startDate: '2026-08-01', endDate: '2026-08-03', segments: JSON.stringify(segments),
      });
    assert.equal(created.status, 201);
    assert.deepEqual(created.body.trip.segments, segments);

    const detail = await request(app).get(`/api/trips/${created.body.trip.id}`)
      .set('Cookie', authCookie(settings));
    assert.equal(detail.status, 200);
    assert.equal(detail.body.trip.route, 'Сыктывкар → Москва');
    assert.deepEqual(detail.body.trip.segments, segments);
    assert.equal('routePoints' in detail.body, false);
    assert.equal('events' in detail.body, false);
  });

  test('uses the original Open-Meteo geo and weather contracts', async () => {
    const settings = config();
    const app = createApp({ config: settings, prisma: fakePhysical() });
    const urls = [];
    mock.method(global, 'fetch', async (url) => {
      urls.push(String(url));
      if (String(url).includes('geocoding-api.open-meteo.com')) {
        return { ok: true, async json() { return { results: [{
          id: 1, name: 'Москва', country: 'Россия', country_code: 'RU', admin1: 'Москва',
          latitude: 55.75, longitude: 37.61, population: 13000000,
        }] }; } };
      }
      return { ok: true, async json() { return {
        current: { temperature_2m: 23.4, relative_humidity_2m: 61, weather_code: 2, wind_speed_10m: 12.8 },
        daily: { time: ['2026-07-22'], temperature_2m_max: [26], temperature_2m_min: [17], weather_code: [2] },
      }; } };
    });

    const geo = await request(app).get('/api/geo/search?q=Москва').set('Cookie', authCookie(settings));
    assert.equal(geo.status, 200);
    assert.equal(geo.body.results[0].label, 'Москва, Москва, Россия');
    const weather = await request(app).get('/api/weather?lat=55.75&lon=37.61').set('Cookie', authCookie(settings));
    assert.equal(weather.status, 200);
    assert.deepEqual(Object.keys(weather.body.current).sort(),
      ['description', 'humidity', 'temperature', 'weatherCode', 'windSpeed'].sort());
    assert.match(urls[0], /^https:\/\/geocoding-api\.open-meteo\.com\/v1\/search/);
    assert.match(urls[1], /^https:\/\/api\.open-meteo\.com\/v1\/forecast/);
    assert.equal(urls.some((url) => /nominatim/i.test(url)), false);
  });

  test('keeps the original monitoring assistant and Plan B apply flow', async () => {
    const settings = config();
    const physical = fakePhysical();
    const app = createApp({ config: settings, prisma: physical });
    const created = await request(app).post('/api/trips')
      .set('Cookie', authCookie(settings))
      .send({ title: 'Поездка', route: 'Москва → Анталья', segments: '[]' });
    const tripId = created.body.trip.id;
    let aiPayload;
    mock.method(global, 'fetch', async (_url, options) => {
      aiPayload = JSON.parse(options.body);
      return { ok: true, async json() { return { choices: [{ message: { content: JSON.stringify({
        summary: 'Три альтернативы', clarifyingQuestions: [],
        plans: [
          { title: 'Быстро', strategy: 'fast', steps: ['Шаг 1'], pros: 'Быстро', cons: 'Риск', whenToUse: 'Срочно' },
          { title: 'Надёжно', strategy: 'reliable', steps: ['Шаг 1'], pros: 'Надёжно', cons: 'Дороже', whenToUse: 'Важен комфорт' },
          { title: 'Делегировать', strategy: 'delegate', steps: ['Шаг 1'], pros: 'Просто', cons: 'Контроль', whenToUse: 'Нет времени' },
        ], emailDraft: null,
      }) } }] }; } };
    });

    const generated = await request(app)
      .post(`/api/trips/${tripId}/monitoring/assistant`)
      .set('Cookie', authCookie(settings))
      .send({ mode: 'plans', messages: [{ role: 'user', content: 'Рейс отменён' }] });
    assert.equal(generated.status, 200);
    assert.deepEqual(generated.body.plans.map((item) => item.strategy), ['fast', 'reliable', 'delegate']);
    assert.match(aiPayload.messages[0].content, /fast\|reliable\|delegate/);

    const chosen = generated.body.plans[1];
    const applied = await request(app)
      .post(`/api/trips/${tripId}/monitoring/plan`)
      .set('Cookie', authCookie(settings))
      .send(chosen);
    assert.equal(applied.status, 201);
    assert.equal(applied.body.plan.title, 'Надёжно');
    assert.equal(applied.body.plan.status, 'active');
    assert.deepEqual(applied.body.plan.steps, ['Шаг 1']);

    const active = await request(app).get(`/api/trips/${tripId}/monitoring/plan`)
      .set('Cookie', authCookie(settings));
    assert.equal(active.status, 200);
    assert.equal(active.body.plan.title, 'Надёжно');
  });

  test('uploads and downloads real bytes through the original document routes', async () => {
    const settings = config();
    const app = createApp({ config: settings, prisma: fakePhysical() });
    const created = await request(app).post('/api/trips')
      .set('Cookie', authCookie(settings))
      .send({ title: 'Documents', route: 'A to B', segments: '[]' });
    const tripId = created.body.trip.id;
    const bytes = Buffer.from('Flight SU 2142 Moscow - Antalya 22.07.2026');

    const uploaded = await request(app)
      .post(`/api/trips/${tripId}/documents/upload`)
      .set('Cookie', authCookie(settings))
      .attach('file', bytes, { filename: 'ticket.txt', contentType: 'text/plain' });
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.body.document.hasFile, true);

    const downloaded = await request(app)
      .get(`/api/trips/${tripId}/documents/${uploaded.body.document.id}/file`)
      .set('Cookie', authCookie(settings));
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.text, bytes.toString('utf8'));
  });

  test('does not expose replacement site endpoints', async () => {
    const settings = config();
    const app = createApp({ config: settings, prisma: fakePhysical() });
    assert.equal((await request(app).get('/api/site/geo/search?q=Москва')).status, 404);
    assert.equal((await request(app).get('/api/site/trips')).status, 404);
  });
});

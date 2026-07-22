const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  canonicalPlanData,
  createTeammatePrismaAdapter,
  eventToSegment,
  physicalPlanData,
  segmentToEvent,
} = require('../src/storage/teammate-prisma-adapter');

describe('teammate PostgreSQL compatibility adapter', () => {
  test('round-trips every canonical route segment field', () => {
    const segment = {
      id: 'seg-1',
      type: 'flight',
      from: 'Сыктывкар',
      to: 'Москва',
      start: '2026-08-01T06:00:00.000Z',
      end: '2026-08-01T08:00:00.000Z',
      ref: 'SU-100',
      provider: 'Аэрофлот',
      status: 'scheduled',
      note: 'Терминал уточнить',
      order: 2,
    };

    const event = segmentToEvent(segment, 'trip-1', 0);
    assert.deepEqual(event, {
      id: 'seg-1',
      tripId: 'trip-1',
      type: 'flight',
      title: 'flight: Сыктывкар → Москва',
      startsAt: new Date('2026-08-01T06:00:00.000Z'),
      endsAt: new Date('2026-08-01T08:00:00.000Z'),
      status: 'scheduled',
      departure: 'Сыктывкар',
      arrival: 'Москва',
      detail: 'Терминал уточнить',
      source: 'Аэрофлот',
      reference: 'SU-100',
      sortOrder: 2,
    });
    assert.deepEqual(eventToSegment(event), segment);
  });

  test('maps an original active plan to physical storage and back', () => {
    const original = {
      tripId: 'trip-1',
      title: 'Надёжно и комфортно',
      summary: 'Перенести перелёт и трансфер.',
      steps: JSON.stringify(['Связаться с авиакомпанией', 'Перенести трансфер']),
      pros: 'Меньше риска',
      cons: 'Дороже',
      whenToUse: 'Если важна надёжность',
      emailTo: 'support@example.invalid',
      emailSubject: 'Перенос',
      emailBody: 'Прошу перенести бронь.',
      source: 'ai',
      status: 'active',
      appliedById: 'user-1',
    };
    const now = new Date('2026-07-22T10:00:00.000Z');
    const stored = physicalPlanData(original, {
      incidentId: 'signal-1', rank: 1, now,
    });
    assert.equal(stored.status, 'published');
    assert.equal(stored.visibility, 'published');
    assert.deepEqual(stored.steps, ['Связаться с авиакомпанией', 'Перенести трансфер']);
    assert.deepEqual(stored.emailDraft, {
      to: 'support@example.invalid', subject: 'Перенос', body: 'Прошу перенести бронь.',
    });

    const restored = canonicalPlanData({ id: 'plan-1', createdAt: now, ...stored });
    assert.equal(restored.status, 'active');
    assert.equal(restored.appliedById, 'user-1');
    assert.equal(restored.steps, original.steps);
    assert.equal(restored.emailTo, original.emailTo);
    assert.equal(restored.emailSubject, original.emailSubject);
    assert.equal(restored.emailBody, original.emailBody);
  });

  test('archives, selects, publishes, and enqueues an applied plan in one transaction', async () => {
    const calls = [];
    const now = new Date('2026-07-22T10:00:00.000Z');
    const tx = {
      tripPlan: {
        async updateMany() { calls.push('archive'); return { count: 1 }; },
        async count() { calls.push('count'); return 0; },
        async create({ data }) { calls.push('create-plan'); return { id: 'plan-1', createdAt: now, ...data }; },
      },
      monitoringSignal: {
        async findFirst() { calls.push('find-signal'); return { id: 'signal-1' }; },
      },
      trip: {
        async update() { calls.push('select-plan'); },
      },
    };
    const physical = {
      async $transaction(callback) { calls.push('begin'); return callback(tx); },
      tripPlan: { async updateMany() { throw new Error('archive escaped transaction'); } },
    };
    const adapter = createTeammatePrismaAdapter(physical, {
      now: () => now,
      async onPlanApplied(client) {
        assert.equal(client, tx);
        calls.push('telegram-bridge');
      },
    });

    await adapter.tripPlan.updateMany({
      where: { tripId: 'trip-1', status: 'active' }, data: { status: 'archived' },
    });
    await adapter.tripPlan.create({
      data: {
        tripId: 'trip-1', title: 'Plan B', steps: '[]', status: 'active', appliedById: 'user-1',
      },
    });

    assert.deepEqual(calls, [
      'begin', 'archive', 'find-signal', 'count', 'create-plan', 'select-plan', 'telegram-bridge',
    ]);
  });

  test('round-trips original document metadata without exposing adapter metadata', async () => {
    let stored;
    const physical = {
      document: {
        async create({ data }) {
          stored = { id: 'doc-1', createdAt: new Date(), ...data };
          return stored;
        },
        async findUnique() { return stored; },
        async update({ data }) { Object.assign(stored, data); return stored; },
      },
    };
    const adapter = createTeammatePrismaAdapter(physical);
    const created = await adapter.document.create({ data: {
      tripId: 'trip-1', uploadedById: 'user-1', name: 'ticket.bin', type: 'ticket',
      format: 'PDF', sizeLabel: '2 МБ', sizeMb: 2, source: 'mail', ocrConfirmed: true,
    } });
    assert.equal(created.format, 'PDF');
    assert.equal(created.sizeLabel, '2 МБ');
    assert.equal(created.sizeMb, 2);
    assert.equal(created.source, 'mail');
    assert.equal(created.ocrConfirmed, true);
    assert.doesNotMatch(created.ocrData, /__teammate/);

    const updated = await adapter.document.update({
      where: { id: 'doc-1' }, data: { source: 'upload', ocrData: '{"flight":"SU 100"}' },
    });
    assert.equal(updated.source, 'upload');
    assert.deepEqual(JSON.parse(updated.ocrData), { flight: 'SU 100' });
  });

  test('round-trips original message presentation fields through JSON storage', async () => {
    let stored;
    const physical = {
      message: {
        async create({ data }) {
          stored = { id: 'message-1', createdAt: new Date(), ...data };
          return stored;
        },
        async findUnique() { return stored; },
        async update({ data }) { Object.assign(stored, data); return stored; },
      },
    };
    const adapter = createTeammatePrismaAdapter(physical);
    const created = await adapter.message.create({ data: {
      tripId: 'trip-1', authorId: 'user-1', channel: 'telegram', kind: 'notice',
      title: 'Update', body: 'Changed', recipients: 'participants', planBLinked: true,
    } });
    assert.equal(created.channel, 'telegram');
    assert.equal(created.kind, 'notice');
    assert.equal(created.recipients, 'participants');
    assert.equal(created.planBLinked, true);

    const updated = await adapter.message.update({
      where: { id: 'message-1' }, data: { channel: 'system', planBLinked: false },
    });
    assert.equal(updated.channel, 'system');
    assert.equal(updated.kind, 'notice');
    assert.equal(updated.recipients, 'participants');
    assert.equal(updated.planBLinked, false);
  });
});

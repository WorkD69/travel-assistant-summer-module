const crypto = require('node:crypto');

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function segmentToEvent(segment, tripId, index) {
  const from = segment?.from == null ? null : String(segment.from);
  const to = segment?.to == null ? null : String(segment.to);
  const type = String(segment?.type || 'other');
  return {
    ...(segment?.id ? { id: String(segment.id) } : {}),
    tripId,
    type,
    title: `${type}: ${from || '?'} → ${to || '?'}`,
    startsAt: dateOrNull(segment?.start) || new Date(0),
    endsAt: dateOrNull(segment?.end),
    status: String(segment?.status || 'scheduled'),
    departure: from,
    arrival: to,
    detail: segment?.note == null ? null : String(segment.note),
    source: segment?.provider == null ? null : String(segment.provider),
    reference: segment?.ref == null ? null : String(segment.ref),
    sortOrder: Number.isInteger(segment?.order) ? segment.order : index,
  };
}

function eventToSegment(event) {
  return {
    id: event.id,
    type: event.type,
    from: event.departure,
    to: event.arrival,
    start: event.startsAt instanceof Date ? event.startsAt.toISOString() : String(event.startsAt),
    end: event.endsAt
      ? (event.endsAt instanceof Date ? event.endsAt.toISOString() : String(event.endsAt))
      : null,
    ref: event.reference,
    provider: event.source,
    status: event.status,
    note: event.detail,
    order: event.sortOrder,
  };
}

function physicalPlanData(data, { incidentId, rank = 1, now = new Date() }) {
  const emailDraft = data.emailTo || data.emailSubject || data.emailBody
    ? { to: data.emailTo || null, subject: data.emailSubject || null, body: data.emailBody || null }
    : null;
  const active = data.status === 'active';
  return {
    tripId: data.tripId,
    incidentId,
    createdByUserId: data.appliedById || null,
    rank,
    strategy: 'applied',
    title: data.title,
    summary: data.summary || null,
    steps: parseJson(data.steps, []),
    pros: data.pros || null,
    cons: data.cons || null,
    whenToUse: data.whenToUse || null,
    emailDraft,
    generationSource: data.source || 'ai',
    status: active ? 'published' : 'archived',
    visibility: active ? 'published' : 'internal',
    selectedAt: active ? now : null,
    publishedAt: active ? now : null,
  };
}

function canonicalPlanData(row) {
  if (!row) return null;
  const email = row.emailDraft && typeof row.emailDraft === 'object' ? row.emailDraft : {};
  return {
    id: row.id,
    tripId: row.tripId,
    title: row.title,
    summary: row.summary || null,
    steps: JSON.stringify(Array.isArray(row.steps) ? row.steps : []),
    pros: row.pros || null,
    cons: row.cons || null,
    whenToUse: row.whenToUse || null,
    emailTo: email.to || null,
    emailSubject: email.subject || null,
    emailBody: email.body || null,
    source: row.generationSource || 'ai',
    status: ['published', 'selected'].includes(row.status) ? 'active' : row.status,
    appliedById: row.createdByUserId || null,
    createdAt: row.createdAt,
  };
}

function canonicalUser(row) {
  if (!row) return row;
  const prefs = row.notificationPreference
    ? JSON.stringify(row.notificationPreference)
    : null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    name: row.name,
    initials: row.initials,
    telegram: row.telegramLink && !row.telegramLink.revokedAt
      ? String(row.telegramLink.telegramUserId)
      : null,
    emailContact: row.email,
    notifyPrefs: prefs,
    appearance: null,
    createdAt: row.createdAt,
  };
}

function canonicalParticipant(row) {
  if (!row) return row;
  return {
    id: row.id,
    tripId: row.tripId,
    userId: row.userId,
    user: row.user ? canonicalUser(row.user) : undefined,
    name: row.displayName || row.user?.name || '',
    initials: row.user?.initials || '',
    shortLabel: null,
    role: row.role,
    access: row.status === 'active' ? 'Активен' : 'Отозван',
    telegram: row.user?.telegramLink && !row.user.telegramLink.revokedAt
      ? String(row.user.telegramLink.telegramUserId)
      : 'none',
    joined: row.joinedAt,
    tone: null,
  };
}

function canonicalInvitation(row) {
  if (!row) return row;
  return {
    id: row.id,
    tripId: row.tripId,
    email: row.email,
    role: row.role,
    status: row.status,
    token: row.id,
    active: !['revoked', 'expired', 'rejected'].includes(row.status),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

function canonicalDocument(row) {
  if (!row) return row;
  const stored = row.extractedData && typeof row.extractedData === 'object' ? row.extractedData : {};
  const meta = stored.__teammate && typeof stored.__teammate === 'object' ? stored.__teammate : {};
  const data = { ...stored };
  delete data.__teammate;
  return {
    id: row.id,
    tripId: row.tripId,
    name: row.name,
    type: row.type || null,
    format: meta.format || (row.name && row.name.includes('.') ? row.name.split('.').pop().toUpperCase() : null),
    sizeLabel: meta.sizeLabel || (row.sizeBytes == null ? null : `${row.sizeBytes} Б`),
    sizeMb: meta.sizeMb ?? (row.sizeBytes == null ? null : row.sizeBytes / 1024 / 1024),
    status: row.status === 'confirmed' ? 'confirmed' : 'review',
    ocrConfirmed: meta.ocrConfirmed ?? (row.status === 'confirmed'),
    visibility: row.visibility === 'organizer_only' ? 'private' : row.visibility,
    segment: row.segment,
    source: meta.source || null,
    uploadedById: row.ownerUserId,
    uploadedAt: row.createdAt,
    processedAt: row.processedAt,
    mimeType: row.mimeType,
    ocrStatus: row.ocrStatus === 'extracted' ? 'done' : row.ocrStatus,
    ocrText: row.extractedText,
    ocrData: JSON.stringify(data),
    blob: row.blob ? { id: row.blob.id, data: row.blob.bytes } : undefined,
  };
}

function canonicalMessage(row) {
  if (!row) return row;
  const meta = row.audience && typeof row.audience === 'object' && !Array.isArray(row.audience)
    ? row.audience.__teammate || {}
    : {};
  return {
    id: row.id,
    tripId: row.tripId,
    channel: meta.channel || 'system',
    kind: meta.kind || row.status,
    title: row.title,
    body: row.content,
    recipients: meta.recipients !== undefined
      ? meta.recipients
      : row.audience == null
        ? null
        : (typeof row.audience === 'string' ? row.audience : JSON.stringify(row.audience)),
    status: row.status,
    planBLinked: meta.planBLinked ?? Boolean(row.planId),
    authorId: row.authorUserId,
    author: row.author ? canonicalUser(row.author) : undefined,
    createdAt: row.createdAt,
  };
}

function physicalMessageAudience(data, previous) {
  const previousMeta = previous && typeof previous === 'object' && !Array.isArray(previous)
    ? previous.__teammate || {}
    : {};
  const recipients = data.recipients !== undefined
    ? parseJson(data.recipients, data.recipients)
    : (previousMeta.recipients !== undefined ? previousMeta.recipients : previous);
  let audience;
  if (Array.isArray(recipients)) audience = { user_ids: recipients };
  else if (recipients && typeof recipients === 'object') audience = { ...recipients };
  else if (recipients === 'participants' || recipients === 'all' || recipients == null) {
    audience = { type: 'all-participants' };
  } else audience = { type: String(recipients) };
  audience.__teammate = {
    recipients,
    channel: data.channel ?? previousMeta.channel ?? 'system',
    kind: data.kind ?? previousMeta.kind ?? data.status ?? 'draft',
    planBLinked: data.planBLinked ?? previousMeta.planBLinked ?? false,
  };
  return audience;
}

function canonicalSignal(row) {
  if (!row) return row;
  const originalStatus = String(row.type || '').startsWith('teammate-status:')
    ? String(row.type).slice('teammate-status:'.length)
    : row.status;
  return {
    id: row.id,
    tripId: row.tripId,
    label: row.label,
    status: originalStatus,
    severity: row.severity,
    segment: row.segment,
    source: row.source,
    detail: row.detail,
    createdAt: row.createdAt || row.occurredAt,
  };
}

function canonicalOffline(row) {
  if (!row) return row;
  return { id: row.id, tripId: row.tripId, ...(row.payload || {}) };
}

function canonicalAssistantMessage(row) {
  if (!row) return row;
  return {
    id: row.id,
    tripId: row.tripId,
    userId: row.userId,
    role: row.role,
    content: row.content,
    mode: row.mode,
    createdAt: row.createdAt,
  };
}

function canonicalTrip(row) {
  if (!row) return row;
  const segments = (row.events || []).slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(eventToSegment);
  const offline = Array.isArray(row.offlineCopies) ? row.offlineCopies[0] : row.offlineCopy;
  return {
    id: row.id,
    title: row.title,
    route: row.route,
    segments: JSON.stringify(segments),
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    type: row.type,
    ownerId: row.ownerId,
    owner: row.owner ? canonicalUser(row.owner) : undefined,
    createdAt: row.createdAt,
    participants: row.participants?.map(canonicalParticipant),
    invitations: row.invitations?.map(canonicalInvitation),
    documents: row.documents?.map(canonicalDocument),
    messages: row.messages?.map(canonicalMessage),
    monitoringSignals: row.monitoringSignals?.map(canonicalSignal),
    offlineCopy: offline ? canonicalOffline(offline) : null,
    assistantMsgs: row.assistantMessages?.map(canonicalAssistantMessage),
    plans: row.plans?.map(canonicalPlanData),
    _count: row._count,
  };
}

function physicalTripInclude(include = {}) {
  const output = { events: { orderBy: [{ sortOrder: 'asc' }, { startsAt: 'asc' }] } };
  if (include.participants) output.participants = { include: { user: { include: { telegramLink: true } } } };
  if (include.invitations) output.invitations = true;
  if (include.documents) output.documents = true;
  if (include.messages) output.messages = { ...include.messages, include: { author: true } };
  if (include.monitoringSignals) output.monitoringSignals = include.monitoringSignals;
  if (include.offlineCopy) output.offlineCopies = true;
  if (include.plans) output.plans = include.plans;
  if (include._count) output._count = include._count;
  return output;
}

function statusForPhysical(value) {
  return value === 'completed' ? 'completed' : value === 'draft' ? 'draft' : 'active';
}

function signalStatus(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('реш') || text.includes('resolved')) return 'resolved';
  if (text.includes('подтверж') || text.includes('примен') || text.includes('confirmed')) return 'confirmed';
  return 'detected';
}

function createTeammatePrismaAdapter(physical, options = {}) {
  const now = options.now || (() => new Date());
  const pendingPlanArchives = new Map();

  async function shadowUser(data) {
    const id = data.userId || `participant-${crypto.randomUUID()}`;
    if (data.userId) return id;
    await physical.user.create({
      data: {
        id,
        email: `${id}@invalid.local`,
        passwordHash: `disabled:${crypto.randomUUID()}`,
        name: String(data.name || 'Участник'),
        initials: String(data.initials || String(data.name || 'У').charAt(0)),
      },
    });
    return id;
  }

  const adapter = {
    user: {
      async findUnique(args) {
        const row = await physical.user.findUnique({
          ...args,
          include: { telegramLink: true, notificationPreference: true },
        });
        return canonicalUser(row);
      },
      async create(args) {
        const data = args.data || {};
        const row = await physical.user.create({
          data: {
            id: data.id || `user-${crypto.randomUUID()}`,
            email: data.email,
            passwordHash: data.passwordHash,
            name: data.name,
            initials: data.initials || null,
          },
          include: { telegramLink: true, notificationPreference: true },
        });
        return canonicalUser(row);
      },
      async update(args) {
        const data = args.data || {};
        const row = await physical.user.update({
          where: args.where,
          data: {
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.initials !== undefined ? { initials: data.initials } : {}),
          },
          include: { telegramLink: true, notificationPreference: true },
        });
        return canonicalUser(row);
      },
    },

    trip: {
      async findMany(args = {}) {
        const rows = await physical.trip.findMany({
          ...args,
          include: physicalTripInclude(args.include),
        });
        return rows.map(canonicalTrip);
      },
      async findUnique(args) {
        const row = await physical.trip.findUnique({
          ...args,
          include: physicalTripInclude(args.include),
        });
        return canonicalTrip(row);
      },
      async create(args) {
        const data = args.data || {};
        const id = data.id || `trip-${crypto.randomUUID()}`;
        const segments = parseJson(data.segments, []);
        const participants = data.participants?.create || [];
        const row = await physical.trip.create({
          data: {
            id,
            title: data.title,
            route: data.route || null,
            startDate: data.startDate || null,
            endDate: data.endDate || null,
            status: statusForPhysical(data.status),
            type: data.type || 'group',
            ownerId: data.ownerId,
            ...(participants.length ? {
              participants: {
                create: participants.map((item) => ({
                  userId: item.userId,
                  role: item.role || 'participant',
                  status: 'active',
                  displayName: item.name || null,
                })),
              },
            } : {}),
            ...(segments.length ? {
              events: { create: segments.map((item, index) => {
                const event = segmentToEvent(item, id, index);
                delete event.tripId;
                return event;
              }) },
            } : {}),
          },
          include: physicalTripInclude(args.include),
        });
        return canonicalTrip(row);
      },
      async update(args) {
        const input = args.data || {};
        const data = {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.route !== undefined ? { route: input.route } : {}),
          ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
          ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
          ...(input.status !== undefined ? { status: statusForPhysical(input.status) } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
        };
        const update = async (client) => {
          const row = await client.trip.update({
            where: args.where,
            data,
            include: physicalTripInclude(args.include),
          });
          if (input.segments !== undefined) {
            const segments = parseJson(input.segments, []);
            await client.tripEvent.deleteMany({ where: { tripId: args.where.id } });
            if (segments.length) {
              await client.tripEvent.createMany({
                data: segments.map((item, index) => segmentToEvent(item, args.where.id, index)),
              });
            }
            return client.trip.findUnique({
              where: args.where,
              include: physicalTripInclude(args.include),
            }).then(canonicalTrip);
          }
          return canonicalTrip(row);
        };
        return typeof physical.$transaction === 'function'
          ? physical.$transaction((tx) => update(tx))
          : update(physical);
      },
      delete(args) { return physical.trip.delete(args); },
    },

    participant: {
      async findMany(args = {}) {
        const rows = await physical.participant.findMany({
          ...args,
          orderBy: args.orderBy?.joined ? { joinedAt: args.orderBy.joined } : args.orderBy,
          include: { user: { include: { telegramLink: true } } },
        });
        return rows.map(canonicalParticipant);
      },
      async create(args) {
        const userId = await shadowUser(args.data || {});
        const row = await physical.participant.create({
          data: {
            tripId: args.data.tripId,
            userId,
            role: args.data.role || 'participant',
            status: 'active',
            displayName: args.data.name || null,
          },
          include: { user: { include: { telegramLink: true } } },
        });
        return canonicalParticipant(row);
      },
      async update(args) {
        const data = args.data || {};
        const row = await physical.participant.update({
          where: args.where,
          data: {
            ...(data.name !== undefined ? { displayName: data.name } : {}),
            ...(data.role !== undefined ? { role: data.role } : {}),
            ...(data.access !== undefined ? {
              status: /отоз|revoked/i.test(String(data.access)) ? 'revoked' : 'active',
            } : {}),
          },
          include: { user: { include: { telegramLink: true } } },
        });
        return canonicalParticipant(row);
      },
      delete(args) { return physical.participant.delete(args); },
    },

    invitation: {
      async findMany(args = {}) {
        const rows = await physical.invitation.findMany(args);
        return rows.map(canonicalInvitation);
      },
      async create(args) {
        const data = args.data || {};
        const row = await physical.invitation.create({
          data: {
            tripId: data.tripId,
            email: data.email,
            role: data.role || 'participant',
            tokenHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
            status: data.status || 'pending',
            expiresAt: data.expiresAt,
          },
        });
        return canonicalInvitation(row);
      },
      async update(args) {
        const data = args.data || {};
        const row = await physical.invitation.update({
          where: args.where,
          data: {
            ...(data.email !== undefined ? { email: data.email } : {}),
            ...(data.role !== undefined ? { role: data.role } : {}),
            ...(data.status !== undefined ? { status: data.status } : {}),
            ...(data.active === false ? { status: 'revoked' } : {}),
          },
        });
        return canonicalInvitation(row);
      },
      delete(args) { return physical.invitation.delete(args); },
    },

    document: {
      async findMany(args = {}) {
        const includeBlob = Boolean(args.include?.blob);
        const rows = await physical.document.findMany({
          ...args,
          orderBy: args.orderBy?.uploadedAt ? { createdAt: args.orderBy.uploadedAt } : args.orderBy,
          include: includeBlob ? { blob: true } : undefined,
        });
        return rows.map(canonicalDocument);
      },
      async findUnique(args) {
        const row = await physical.document.findUnique({
          ...args,
          include: args.include?.blob ? { blob: true } : undefined,
        });
        return canonicalDocument(row);
      },
      async create(args) {
        const data = args.data || {};
        const bytes = data.blob?.create?.data;
        const row = await physical.document.create({
          data: {
            tripId: data.tripId,
            ownerUserId: data.uploadedById,
            name: data.name,
            type: data.type || 'document',
            mimeType: data.mimeType || null,
            sizeBytes: Number.isFinite(Number(data.sizeMb)) ? Math.round(Number(data.sizeMb) * 1024 * 1024) : null,
            visibility: data.visibility === 'private' ? 'personal' : (data.visibility || 'shared'),
            status: data.status === 'confirmed' ? 'confirmed' : 'pending',
            segment: data.segment || null,
            ocrStatus: data.ocrStatus === 'failed' ? 'failed' : 'not_requested',
            extractedData: {
              __teammate: {
                format: data.format || null,
                sizeLabel: data.sizeLabel || null,
                sizeMb: data.sizeMb ?? null,
                source: data.source || null,
                ocrConfirmed: Boolean(data.ocrConfirmed),
              },
            },
            ...(bytes ? {
              blob: {
                create: {
                  bytes,
                  sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
                },
              },
            } : {}),
          },
          include: bytes ? { blob: true } : undefined,
        });
        return canonicalDocument(row);
      },
      async update(args) {
        const data = args.data || {};
        const current = await physical.document.findUnique({ where: args.where });
        const stored = current?.extractedData && typeof current.extractedData === 'object'
          ? current.extractedData
          : {};
        const previousMeta = stored.__teammate && typeof stored.__teammate === 'object'
          ? stored.__teammate
          : {};
        const extractedData = data.ocrData !== undefined
          ? parseJson(data.ocrData, {})
          : Object.fromEntries(Object.entries(stored).filter(([key]) => key !== '__teammate'));
        extractedData.__teammate = {
          ...previousMeta,
          ...(data.format !== undefined ? { format: data.format } : {}),
          ...(data.sizeLabel !== undefined ? { sizeLabel: data.sizeLabel } : {}),
          ...(data.sizeMb !== undefined ? { sizeMb: data.sizeMb } : {}),
          ...(data.source !== undefined ? { source: data.source } : {}),
          ...(data.ocrConfirmed !== undefined ? { ocrConfirmed: Boolean(data.ocrConfirmed) } : {}),
        };
        const row = await physical.document.update({
          where: args.where,
          data: {
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.type !== undefined ? { type: data.type || 'document' } : {}),
            ...(data.visibility !== undefined ? {
              visibility: data.visibility === 'private' ? 'personal' : data.visibility,
            } : {}),
            ...(data.status !== undefined ? {
              status: data.status === 'confirmed' ? 'confirmed' : 'pending',
            } : {}),
            ...(data.segment !== undefined ? { segment: data.segment } : {}),
            ...(data.ocrText !== undefined ? { extractedText: data.ocrText } : {}),
            ...((data.ocrData !== undefined
              || ['format', 'sizeLabel', 'sizeMb', 'source', 'ocrConfirmed'].some((key) => data[key] !== undefined))
              ? { extractedData }
              : {}),
            ...(data.ocrStatus !== undefined ? {
              ocrStatus: data.ocrStatus === 'done' ? 'extracted'
                : data.ocrStatus === 'failed' ? 'failed' : 'manual_review',
            } : {}),
            ...(data.processedAt !== undefined ? { processedAt: data.processedAt } : {}),
          },
        });
        return canonicalDocument(row);
      },
      delete(args) { return physical.document.delete(args); },
    },

    message: {
      async findMany(args = {}) {
        const rows = await physical.message.findMany({ ...args, include: { author: true } });
        return rows.map(canonicalMessage);
      },
      async create(args) {
        const data = args.data || {};
        const row = await physical.message.create({
          data: {
            tripId: data.tripId,
            authorUserId: data.authorId,
            title: data.title || null,
            content: data.body || '',
            audience: physicalMessageAudience(data),
            status: data.status === 'published' || data.kind === 'published' ? 'published' : 'draft',
            publishedAt: data.status === 'published' || data.kind === 'published' ? now() : null,
          },
          include: { author: true },
        });
        return canonicalMessage(row);
      },
      async update(args) {
        const data = args.data || {};
        const current = await physical.message.findUnique({ where: args.where });
        const row = await physical.message.update({
          where: args.where,
          data: {
            ...(data.title !== undefined ? { title: data.title } : {}),
            ...(data.body !== undefined ? { content: data.body } : {}),
            ...((data.recipients !== undefined
              || ['channel', 'kind', 'planBLinked'].some((key) => data[key] !== undefined))
              ? { audience: physicalMessageAudience(data, current?.audience) }
              : {}),
            ...(data.status !== undefined ? { status: data.status } : {}),
          },
          include: { author: true },
        });
        return canonicalMessage(row);
      },
      delete(args) { return physical.message.delete(args); },
    },

    monitoringSignal: {
      async findMany(args = {}) {
        const rows = await physical.monitoringSignal.findMany(args);
        return rows.map(canonicalSignal);
      },
      async create(args) {
        const data = args.data || {};
        const originalStatus = data.status == null ? '' : String(data.status);
        const row = await physical.monitoringSignal.create({
          data: {
            tripId: data.tripId,
            type: `teammate-status:${originalStatus}`,
            label: data.label,
            detail: data.detail || null,
            severity: data.severity || 'info',
            segment: data.segment || null,
            source: data.source || null,
            status: signalStatus(originalStatus),
            occurredAt: now(),
          },
        });
        return canonicalSignal(row);
      },
    },

    assistantMessage: {
      async findMany(args = {}) {
        const rows = await physical.assistantMessage.findMany(args);
        return rows.map(canonicalAssistantMessage);
      },
      async create(args) {
        const row = await physical.assistantMessage.create({ data: args.data });
        return canonicalAssistantMessage(row);
      },
    },

    offlineCopy: {
      async findUnique(args) {
        const trip = await physical.trip.findUnique({ where: { id: args.where.tripId } });
        if (!trip) return null;
        const row = await physical.offlineCopy.findUnique({
          where: { tripId_userId: { tripId: trip.id, userId: trip.ownerId } },
        });
        return canonicalOffline(row);
      },
      async upsert(args) {
        const trip = await physical.trip.findUnique({ where: { id: args.where.tripId } });
        const payload = args.update || args.create || {};
        const row = await physical.offlineCopy.upsert({
          where: { tripId_userId: { tripId: trip.id, userId: trip.ownerId } },
          update: { payload },
          create: { tripId: trip.id, userId: trip.ownerId, payload },
        });
        return canonicalOffline(row);
      },
    },

    tripPlan: {
      async findFirst(args) {
        const where = { ...args.where };
        if (where.status === 'active') where.status = 'published';
        const row = await physical.tripPlan.findFirst({ ...args, where });
        return canonicalPlanData(row);
      },
      async findMany(args = {}) {
        const where = { ...(args.where || {}) };
        if (where.status === 'active') where.status = 'published';
        const rows = await physical.tripPlan.findMany({ ...args, where });
        return rows.map(canonicalPlanData);
      },
      async updateMany(args) {
        const where = { ...args.where };
        const data = { ...args.data };
        if (where.tripId && where.status === 'active' && data.status === 'archived') {
          pendingPlanArchives.set(where.tripId, { where, data });
          return { count: 0 };
        }
        if (where.status === 'active') where.status = 'published';
        if (data.status === 'archived') {
          data.status = 'archived';
          data.visibility = 'internal';
        }
        return physical.tripPlan.updateMany({ where, data });
      },
      async create(args) {
        const apply = async (client) => {
          const stagedArchive = pendingPlanArchives.get(args.data.tripId);
          if (stagedArchive) {
            await client.tripPlan.updateMany({
              where: { ...stagedArchive.where, status: 'published' },
              data: { ...stagedArchive.data, visibility: 'internal' },
            });
          }
          const latest = await client.monitoringSignal.findFirst({
            where: { tripId: args.data.tripId },
            orderBy: { occurredAt: 'desc' },
          });
          const incident = latest || await client.monitoringSignal.create({
            data: {
              tripId: args.data.tripId,
              type: 'teammate-plan',
              label: args.data.title,
              severity: 'info',
              status: 'confirmed',
              occurredAt: now(),
            },
          });
          const count = await client.tripPlan.count({ where: { incidentId: incident.id } });
          const row = await client.tripPlan.create({
            data: physicalPlanData(args.data, { incidentId: incident.id, rank: count + 1, now: now() }),
          });
          if (args.data.status === 'active') {
            await client.trip.update({ where: { id: args.data.tripId }, data: { selectedPlanId: row.id } });
            if (typeof options.onPlanApplied === 'function') {
              await options.onPlanApplied(client, row, args.data, now());
            }
          }
          return row;
        };
        let row;
        try {
          row = typeof physical.$transaction === 'function'
            ? await physical.$transaction((tx) => apply(tx))
            : await apply(physical);
        } finally {
          pendingPlanArchives.delete(args.data.tripId);
        }
        return canonicalPlanData(row);
      },
      async update(args) {
        const data = { ...args.data };
        if (data.status === 'active') {
          data.status = 'published';
          data.visibility = 'published';
        }
        const row = await physical.tripPlan.update({ where: args.where, data });
        return canonicalPlanData(row);
      },
      delete(args) { return physical.tripPlan.delete(args); },
    },
  };

  return adapter;
}

module.exports = {
  canonicalPlanData,
  createTeammatePrismaAdapter,
  eventToSegment,
  physicalPlanData,
  segmentToEvent,
};

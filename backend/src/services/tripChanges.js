const botNotify = require('./botNotify');

function normalizedDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizedJson(value) {
  if (value === null || value === undefined || value === '') return [];
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (error) { return value; }
}

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + stableJson(value[key]);
    }).join(',') + '}';
  }
  return JSON.stringify(value);
}

function event(type, oldValue, newValue, details) {
  return {
    type: type,
    oldValue: typeof oldValue === 'string' ? oldValue : JSON.stringify(oldValue),
    newValue: typeof newValue === 'string' ? newValue : JSON.stringify(newValue),
    details: details || null,
  };
}

function buildTripChangeEvents(before, after) {
  const events = [];
  const oldRoute = before.route || '';
  const newRoute = after.route || '';
  if (oldRoute !== newRoute) events.push(event('route_changed', oldRoute, newRoute));

  const oldDates = { startDate: normalizedDate(before.startDate), endDate: normalizedDate(before.endDate) };
  const newDates = { startDate: normalizedDate(after.startDate), endDate: normalizedDate(after.endDate) };
  if (stableJson(oldDates) !== stableJson(newDates)) events.push(event('dates_changed', oldDates, newDates));

  const oldSegments = normalizedJson(before.segments);
  const newSegments = normalizedJson(after.segments);
  if (stableJson(oldSegments) !== stableJson(newSegments)) {
    events.push(event('segments_changed', oldSegments, newSegments));
  }

  const oldMeta = { title: before.title || '', type: before.type || '', status: before.status || '' };
  const newMeta = { title: after.title || '', type: after.type || '', status: after.status || '' };
  if (stableJson(oldMeta) !== stableJson(newMeta)) {
    events.push(event('event_changed', oldMeta, newMeta, { fields: ['title', 'type', 'status'] }));
  }
  return events;
}

function notificationTypeForChange(type) { return type; }

async function recordTripChangeEvents(tx, options) {
  const events = buildTripChangeEvents(options.before, options.after);
  for (const change of events) {
    await tx.tripChange.create({ data: {
      tripId: options.tripId,
      actorId: options.actorId || null,
      type: change.type,
      oldValue: change.oldValue,
      newValue: change.newValue,
      details: change.details ? JSON.stringify(change.details) : null,
    } });
    await botNotify.enqueueInTransaction(tx, {
      tripId: options.tripId,
      tripTitle: options.after.title || null,
      type: notificationTypeForChange(change.type),
      title: options.after.title || null,
      whatChanged: change.type,
      oldValue: change.oldValue,
      newValue: change.newValue,
      deepLinkTarget: 'trip',
      excludeUserId: options.actorId || null,
    });
  }
  return events;
}

async function recordCustomChangeEvent(tx, options) {
  const oldValue = options.oldValue == null
    ? null
    : (typeof options.oldValue === 'string' ? options.oldValue : JSON.stringify(options.oldValue));
  const newValue = options.newValue == null
    ? null
    : (typeof options.newValue === 'string' ? options.newValue : JSON.stringify(options.newValue));
  const change = await tx.tripChange.create({ data: {
    tripId: options.tripId,
    actorId: options.actorId || null,
    type: options.type,
    oldValue: oldValue,
    newValue: newValue,
    details: options.details ? JSON.stringify(options.details) : null,
  } });
  await botNotify.enqueueInTransaction(tx, {
    tripId: options.tripId,
    tripTitle: options.tripTitle || null,
    type: options.type,
    title: options.title || options.tripTitle || null,
    whatChanged: options.whatChanged || options.type,
    oldValue: oldValue,
    newValue: newValue,
    deepLinkTarget: options.deepLinkTarget || 'trip',
    excludeUserId: options.excludeUserId || options.actorId || null,
  });
  return change;
}

module.exports = {
  buildTripChangeEvents,
  notificationTypeForChange,
  recordTripChangeEvents,
  recordCustomChangeEvent,
};

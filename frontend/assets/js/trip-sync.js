(function tripSyncModule() {
  "use strict";
  var originalCreate = null;
  var originalUpdate = null;
  var MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

  function api() { return window.TravelApi || null; }
  function store() { return window.TravelAppState || null; }

  // Build the full ordered route chain from all segments (keeps middle cities,
  // collapses only consecutive duplicates). Samara -> SPb -> Samara stays intact.
  function routeFrom(payload) {
    var d = (payload && payload.data) || {};
    var segs = (payload && payload.segments) || [];
    if (segs.length) {
      var ordered = segs.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      var chain = [];
      ordered.forEach(function (s) {
        if (s.from && chain[chain.length - 1] !== s.from) chain.push(s.from);
        if (s.to && chain[chain.length - 1] !== s.to) chain.push(s.to);
      });
      if (chain.length) return chain.join(" → ");
    }
    if (d.from && d.to) return String(d.from) + " → " + String(d.to);
    return d.title ? String(d.title) : "";
  }

  function toBody(payload) {
    var d = (payload && payload.data) || {};
    return {
      title: d.title || "Новая поездка",
      route: routeFrom(payload),
      startDate: d.start || null,
      endDate: d.end || null,
      type: d.type === "solo" ? "solo" : "group",
      status: "active",
      segments: JSON.stringify((payload && payload.segments) || [])
    };
  }

  function fmtRange(startIso, endIso) {
    function one(iso) { if (!iso) return null; var dt = new Date(iso); if (isNaN(dt.getTime())) return null; return { day: dt.getDate(), m: dt.getMonth(), y: dt.getFullYear() }; }
    var a = one(startIso), b = one(endIso);
    if (a && b) {
      if (a.m === b.m && a.y === b.y) return a.day + "–" + b.day + " " + MONTHS[b.m] + " " + b.y;
      if (a.y === b.y) return a.day + " " + MONTHS[a.m] + " – " + b.day + " " + MONTHS[b.m] + " " + b.y;
      return a.day + " " + MONTHS[a.m] + " " + a.y + " – " + b.day + " " + MONTHS[b.m] + " " + b.y;
    }
    var x = a || b; return x ? (x.day + " " + MONTHS[x.m] + " " + x.y) : "";
  }

  function toStoreTrip(t, payload) {
    var d = (payload && payload.data) || {};
    return {
      id: t.id,
      title: t.title,
      route: t.route || "",
      dates: fmtRange(t.startDate, t.endDate),
      kind: t.type === "solo" ? "Соло" : "Групповая",
      role: t.role || "Организатор",
      risk: "низкий",
      participants: Number(t.participantCount || 1),
      documents: Number(t.documentCount || 0),
      monitoring: t.monitoring || "Не настроен",
      status: t.status || "active",
      type: t.type || "group",
      start: t.startDate || d.start || "",
      end: t.endDate || d.end || "",
      segments: (payload && payload.segments) ? payload.segments.slice() : [],
      invitationDrafts: (d.invitationDrafts || []).slice(),
      documentSetup: (d.documentSetup || []).slice()
    };
  }

  function unwrap(res) { return (res && res.trip) ? res.trip : res; }

  function createTrip(payload) {
    if (!payload || !payload.data) {
      return originalCreate ? originalCreate.apply(store(), arguments) : null;
    }
    var a = api();
    if (!a) return originalCreate ? originalCreate.apply(store(), arguments) : null;
    return a.ensureAuth(a.demo)
      .then(function () { return a.createTrip(toBody(payload)); })
      .then(function (res) { return toStoreTrip(unwrap(res), payload); });
  }

  function updateTrip(id, payload) {
    if (typeof id !== "string" || !payload || !payload.data) {
      return originalUpdate ? originalUpdate.apply(store(), arguments) : null;
    }
    var a = api();
    if (!a) return originalUpdate ? originalUpdate.apply(store(), arguments) : null;
    return a.ensureAuth(a.demo)
      .then(function () { return a.updateTrip(id, toBody(payload)); })
      .then(function (res) { return toStoreTrip(unwrap(res), payload); })
      .catch(function (e) { console.warn("[trip-sync] update " + (e && e.message)); return null; });
  }

  function patch() {
    var s = store();
    if (!s) return;
    if (!originalCreate && typeof s.createTrip === "function") originalCreate = s.createTrip;
    if (!originalUpdate && typeof s.updateTrip === "function") originalUpdate = s.updateTrip;
    s.createTrip = createTrip;
    s.updateTrip = updateTrip;
  }

  function boot() { patch(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.TravelTripSync = { patch: patch };
})();

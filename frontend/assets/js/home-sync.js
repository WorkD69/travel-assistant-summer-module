(function homeSyncModule() {
  "use strict";
  var refreshing = false;
  var MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

  function api() { return window.TravelApi || null; }
  function store() { return window.TravelAppState || null; }

  function fmtRange(startIso, endIso) {
    function one(iso) {
      if (!iso) return null;
      var d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      return { day: d.getDate(), m: d.getMonth(), y: d.getFullYear() };
    }
    var a = one(startIso), b = one(endIso);
    if (a && b) {
      if (a.m === b.m && a.y === b.y) return a.day + "–" + b.day + " " + MONTHS[b.m] + " " + b.y;
      if (a.y === b.y) return a.day + " " + MONTHS[a.m] + " – " + b.day + " " + MONTHS[b.m] + " " + b.y;
      return a.day + " " + MONTHS[a.m] + " " + a.y + " – " + b.day + " " + MONTHS[b.m] + " " + b.y;
    }
    var x = a || b;
    return x ? (x.day + " " + MONTHS[x.m] + " " + x.y) : "";
  }

  function mapTrip(t) {
    return {
      id: t.id,
      title: t.title,
      route: t.route || "",
      dates: fmtRange(t.startDate, t.endDate),
      kind: t.type === "solo" ? "Соло" : "Групповая",
      role: t.role || "Участник",
      risk: "низкий",
      participants: Number(t.participantCount || 0),
      documents: Number(t.documentCount || 0),
      monitoring: t.monitoring || "Не настроен",
      status: t.status || "active",
      type: t.type || "group",
      start: t.startDate || "",
      end: t.endDate || ""
    };
  }

  function refresh() {
    var a = api(), s = store();
    if (!a || !s || refreshing) return Promise.resolve();
    refreshing = true;
    return a.ensureAuth(a.demo)
      .then(function () { return a.listTrips(); })
      .then(function (res) {
        var list = (res && res.trips) || [];
        s.setState({ trips: list.map(mapTrip) }, { source: "backend" });
      })
      .catch(function (e) { console.warn("[home-sync] " + (e && e.message)); })
      .then(function () { refreshing = false; });
  }

  function boot() { refresh(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.TravelHomeSync = { refresh: refresh };
})();

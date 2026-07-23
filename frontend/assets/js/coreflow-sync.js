/*
 * coreflow-sync.js — мост между вкладками «Мониторинг» / «Сообщения»
 * (core-flow адаптер) и бэкендом. Бэкенд = единый источник правды.
 *
 *  Гидрация: тянем сигналы мониторинга и сообщения с бэкенда и
 *  кладём их в общий store под ключ coreFlow. Адаптер сам
 *  подхватывает это через coreFlowSyncExternalState.
 *  Пуш: оборачиваем фабрику coreFlowCreateStateAdapter, чтобы
 *  addSignal (SOS) / saveMessage / sendMessage дополнительно писали на бэкенд.
 */
(function coreflowSyncModule(){
  "use strict";

  function store(){ return window.TravelAppState || null; }
  function api(){ return window.TravelApi || null; }

  function getTripId(){
    try {
      var u = new URL(location.href);
      var t = u.searchParams.get("tripId") || u.searchParams.get("trip");
      if (t) return t;
    } catch (e) {}
    var s = (store() && store().getState) ? store().getState() : null;
    if (s && s.activeTripId) return s.activeTripId;
    if (s && s.trip && s.trip.id) return s.trip.id;
    return "trip-turkey-2026";
  }

  function withAuth(fn){
    var a = api();
    if (!a) return;
    if (a.getToken && !a.getToken() && a.ensureAuth){
      a.ensureAuth().then(fn).catch(function(){});
    } else { fn(); }
  }

  function fmtTime(iso){
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var months = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
    return d.getDate() + " " + months[d.getMonth()] + ", " + ("0"+d.getHours()).slice(-2) + ":" + ("0"+d.getMinutes()).slice(-2);
  }

  /* ---------- severity <-> urgency ---------- */
  function urgencyToSeverity(u){
    var s = String(u || "").toLowerCase();
    if (s.indexOf("выс") === 0 || s === "critical" || s === "high") return "critical";
    if (s.indexOf("сред") === 0 || s === "warning" || s === "medium") return "warning";
    return "info";
  }
  function severityToUrgency(sev){
    var s = String(sev || "").toLowerCase();
    if (s === "critical" || s === "danger" || s === "high") return "Высокая";
    if (s === "warning" || s === "warn" || s === "medium") return "Средняя";
    return "Низкая";
  }

  /* ---------- backend -> coreFlow ---------- */
  function mapSignalIn(s){
    return {
      id: s.id,
      authorId: "",
      authorName: s.source || "Мониторинг",
      type: s.label || "Сигнал",
      segmentId: "",
      segment: s.segment || "Маршрут целиком",
      urgency: severityToUrgency(s.severity),
      source: s.source || "Бэкенд",
      confidence: "Данные бэкенда",
      time: fmtTime(s.createdAt),
      description: s.detail || "",
      status: s.status || "Сигнал требует проверки",
      audience: { type: "organizer", participantIds: [] }
    };
  }
  function parseRecipients(v){
    var fallback = { type: "all-participants", participantIds: [], providerType: null };
    if (v && typeof v === "object") return v;
    if (!v) return fallback;
    try { var o = JSON.parse(v); return (o && typeof o === "object") ? o : fallback; }
    catch (e){ return fallback; }
  }
  function statusLabelIn(kind, status){
    if (status) return status;
    if (kind === "system") return "Системное сообщение";
    return "Черновик";
  }
  function mapMessageIn(m){
    return {
      id: m.id,
      topic: m.title || "Сообщение",
      recipients: parseRecipients(m.recipients),
      channel: m.channel || "Системное",
      author: (m.kind === "system") ? "Система" : "Артём (Вы)",
      time: fmtTime(m.createdAt),
      status: statusLabelIn(m.kind, m.status),
      segment: "Маршрут целиком",
      planB: m.planBLinked ? "planB" : "",
      text: m.body || "",
      type: m.kind || "provider"
    };
  }

  /* ---------- coreFlow -> backend ---------- */
  function mapSignalOut(sig){
    return {
      label: sig.type || "Сигнал",
      status: sig.status || "Сигнал требует проверки",
      severity: urgencyToSeverity(sig.urgency),
      segment: sig.segment || "",
      source: sig.source || "SOS",
      detail: sig.description || ""
    };
  }
  function mapMessageOut(msg, statusOverride){
    return {
      channel: msg.channel || "system",
      kind: msg.type || "draft",
      title: msg.topic || "",
      body: msg.text || "",
      recipients: msg.recipients || null,
      status: statusOverride || msg.status || null,
      planBLinked: !!msg.planB
    };
  }

  /* ---------- Гидрация в store.coreFlow ---------- */
  function seedIntoStore(signals, messages){
    var s = store();
    if (!s || !s.setState || !s.getState) return;
    var cur = (s.getState() && s.getState().coreFlow) || {};
    var next = {};
    for (var k in cur) { if (Object.prototype.hasOwnProperty.call(cur, k)) next[k] = cur[k]; }
    if (signals) {
      next.signals = signals;
      if (signals.length) next.selectedSignalId = signals[0].id;
    }
    if (messages) next.messages = messages;
    s.setState({ coreFlow: next }, { source: "coreflow-backend" });
  }

  function refresh(){
    var a = api();
    if (!a) return;
    var id = getTripId();
    withAuth(function(){
      var jobs = [];
      jobs.push(a.monitoringSignals ? a.monitoringSignals(id).then(function(r){ return (r && r.signals) ? r.signals : []; }).catch(function(){ return null; }) : Promise.resolve(null));
      jobs.push(a.listMessages ? a.listMessages(id).then(function(r){ return (r && r.messages) ? r.messages : []; }).catch(function(){ return null; }) : Promise.resolve(null));
      Promise.all(jobs).then(function(res){
        var signals = res[0] ? res[0].map(mapSignalIn) : null;
        var messages = res[1] ? res[1].map(mapMessageIn) : null;
        if (signals || messages) seedIntoStore(signals, messages);
      }).catch(function(){});
    });
  }

  /* ---------- Пуш на бэкенд ---------- */
  function isLocalId(id){ return !id || /^(message|signal|history)-/.test(String(id)); }

  function pushSignal(sig){
    var a = api(); if (!a || !a.createSignal) return;
    var id = getTripId();
    withAuth(function(){
      a.createSignal(id, mapSignalOut(sig)).then(function(){
        document.dispatchEvent(new CustomEvent("travel:data-changed"));
        refresh();
      }).catch(function(){});
    });
  }
  function pushMessageSave(msg){
    var a = api(); if (!a) return;
    var id = getTripId();
    withAuth(function(){
      if (isLocalId(msg.id)){
        if (a.addMessage) a.addMessage(id, mapMessageOut(msg)).then(function(){ document.dispatchEvent(new CustomEvent("travel:data-changed")); }).catch(function(){});
      } else if (a.updateMessage) {
        a.updateMessage(id, msg.id, mapMessageOut(msg)).catch(function(){});
      }
    });
  }
  function pushMessageSend(msg){
    var a = api(); if (!a) return;
    var id = getTripId();
    withAuth(function(){
      if (isLocalId(msg.id)){
        if (a.addMessage) a.addMessage(id, mapMessageOut(msg, "Отправлено")).then(function(){ document.dispatchEvent(new CustomEvent("travel:data-changed")); }).catch(function(){});
      } else if (a.updateMessage) {
        a.updateMessage(id, msg.id, { status: "Отправлено" }).catch(function(){});
      }
    });
  }

  function findMessage(adapter, id){
    try {
      var st = adapter.getState();
      var list = st.messages || [];
      for (var i = 0; i < list.length; i++){ if (list[i].id === id) return list[i]; }
      return null;
    } catch (e){ return null; }
  }

  /* ---------- Обёртка фабрики адаптера ---------- */
  function wrapFactory(){
    var orig = window.coreFlowCreateStateAdapter;
    if (typeof orig !== "function" || orig.__backendWrapped) return;
    var wrapped = function(opts){
      var adapter = orig(opts);
      if (adapter && !adapter.__backendWrapped){
        var origAdd = adapter.addSignal;
        if (typeof origAdd === "function") adapter.addSignal = function(sig){
          var r = origAdd.apply(adapter, arguments);
          if (r) { try { pushSignal(sig || {}); } catch (e){} }
          return r;
        };
        var origSave = adapter.saveMessage;
        if (typeof origSave === "function") adapter.saveMessage = function(msg){
          var r = origSave.apply(adapter, arguments);
          if (r) { try { pushMessageSave(msg || {}); } catch (e){} }
          return r;
        };
        var origSend = adapter.sendMessage;
        if (typeof origSend === "function") adapter.sendMessage = function(mid){
          var msg = findMessage(adapter, mid);
          var r = origSend.apply(adapter, arguments);
          if (r) { try { pushMessageSend(msg || { id: mid }); } catch (e){} }
          return r;
        };
        adapter.__backendWrapped = true;
      }
      return adapter;
    };
    wrapped.__backendWrapped = true;
    window.coreFlowCreateStateAdapter = wrapped;
  }

  // Оборачиваем фабрику СРАЗУ (до того, как workspace-integration создаст адаптер на DOMContentLoaded).
  wrapFactory();

  function boot(){ wrapFactory(); refresh(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.TravelCoreFlowSync = { refresh: refresh };
})();

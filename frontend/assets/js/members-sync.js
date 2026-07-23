/*
 * members-sync.js — слой синхронизации вкладки «Участники» с бэкендом.
 * Принцип: бэкенд — единый источник правды. Реальные участники и приглашения
 * пушатся в общий store (TravelAppState.participants / .invitations) — модуль
 * features/trip-members.js сам перерисовывает списки. Обратно: модуль коммитит
 * изменения через setState({source:'members'}) — мы ловим это, сравниваем с
 * последним снимком бэкенда и пушим разницу (create / update / delete).
 */
(function membersSyncModule(){
  "use strict";

  function store(){ return window.TravelAppState || null; }
  function api(){ return window.TravelApi || null; }
  function toast(m){ if (typeof window.toastInfo === "function") window.toastInfo(m); }

  function getTripId(){
    try {
      var u = new URL(location.href);
      var t = u.searchParams.get("tripId") || u.searchParams.get("trip");
      if (t) return t;
    } catch (e) {}
    var s = store() && store().getState ? store().getState() : null;
    if (s && s.activeTripId) return s.activeTripId;
    if (s && s.trip && s.trip.id) return s.trip.id;
    return "trip-turkey-2026";
  }

  function withAuth(fn){
    var a = api();
    if (!a) return;
    if (a.getToken && !a.getToken() && a.ensureAuth){
      a.ensureAuth().then(fn).catch(function(){});
    } else {
      fn();
    }
  }

  // ---- Форматирование меток ----
  function fmtDate(iso){
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  }
  function fmtDateTime(iso){
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var day = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
    var time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    return day + ", " + time;
  }
  function initialsFrom(name){
    var s = String(name || "").trim();
    if (!s) return "?";
    return s.charAt(0).toUpperCase();
  }
  function tgLabel(v){
    if (v === "Подключён" || v === "connected" || v === true || v === "yes") return "Подключён";
    if (!v || v === "none" || v === "Не подключён") return "Не подключён";
    return String(v);
  }

  var TONES = ["a", "b", "c", "d", "e", "f"];

  function mapParticipant(p, i){
    return {
      id: p.id,
      name: p.name || "Участник",
      initials: p.initials || initialsFrom(p.name),
      shortLabel: p.shortLabel || "",
      role: (p.role === "organizer") ? "organizer" : "participant",
      isCurrent: false,
      access: p.access || "Активен",
      telegram: tgLabel(p.telegram),
      joined: p.joined ? fmtDate(p.joined) : "—",
      tone: p.tone || TONES[i % TONES.length]
    };
  }

  function invStatusLabel(inv){
    if (inv.active === false){
      if (inv.status === "expired") return "Срок истёк";
      return "Отозвано";
    }
    if (inv.status === "accepted") return "Принято";
    if (inv.status === "rejected") return "Отклонено";
    if (inv.status === "expired") return "Срок истёк";
    if (inv.expiresAt && new Date(inv.expiresAt).getTime() < Date.now()) return "Срок истёк";
    return "Ожидает ответа";
  }

  function mapInvite(inv){
    var label = invStatusLabel(inv);
    var isActive = (label === "Ожидает ответа");
    var prefix = "Истекает";
    if (label === "Отозвано") prefix = "Отозвано";
    else if (label === "Срок истёк") prefix = "Истекло";
    return {
      id: inv.id,
      recipient: inv.email || "Получатель не указан",
      email: inv.email || "",
      status: label,
      created: inv.createdAt ? fmtDateTime(inv.createdAt) : "—",
      expiresLabel: inv.expiresAt ? fmtDateTime(inv.expiresAt) : "—",
      expiresPrefix: prefix,
      active: isActive,
      link: inv.link || (window.location.origin + "/invitation.html?token=" + encodeURIComponent(inv.token || inv.id)),
      expiresInDays: inv.expiresInDays || null
    };
  }

  // Снимки последнего состояния бэкенда (в store-форме) для реконсиляции.
  var snapParts = [];   // [{id, role, access, telegram}]
  var snapInvites = []; // [{id, active, email}]

  var applying = false; // применяем backend -> store
  var pushing = false;  // идёт пуш store -> backend

  function applyToStore(parts, invites){
    var s = store();
    if (!s || !s.setState) return;
    applying = true;
    s.setState({ participants: parts, invitations: invites }, { source: "backend" });
    applying = false;
  }

  // Загрузить участников/приглашения из бэкенда и отдать в store.
  function refresh(){
    var a = api();
    if (!a || !a.listParticipants) return;
    var id = getTripId();
    withAuth(function(){
      Promise.all([
        a.listParticipants(id).catch(function(){ return { participants: [] }; }),
        a.listInvitations(id).catch(function(){ return { invitations: [] }; })
      ]).then(function(res){
        var praw = (res[0] && res[0].participants) ? res[0].participants : [];
        var iraw = (res[1] && res[1].invitations) ? res[1].invitations : [];
        var parts = praw.map(mapParticipant);
        var invites = iraw.map(mapInvite);
        snapParts = parts.map(function(p){ return { id: p.id, role: p.role, access: p.access, telegram: p.telegram }; });
        snapInvites = invites.map(function(iv){ return { id: iv.id, active: iv.active, email: iv.email }; });
        applyToStore(parts, invites);
      }).catch(function(){});
    });
  }

  function indexById(arr){
    var m = {};
    arr.forEach(function(x){ m[x.id] = x; });
    return m;
  }

  // Сравнить store с последним снимком бэкенда и пушнуть разницу.
  function reconcile(state){
    var a = api();
    if (!a) return;
    var tid = getTripId();
    var parts = (state.participants || []);
    var invites = (state.invitations || []);
    var pById = indexById(parts);
    var spById = indexById(snapParts);
    var iById = indexById(invites);
    var siById = indexById(snapInvites);
    var ops = [];

    // --- Участники: удаления ---
    snapParts.slice().forEach(function(sp){
      if (!pById[sp.id]){
        ops.push(a.removeParticipant(tid, sp.id).catch(function(){}));
        snapParts = snapParts.filter(function(x){ return x.id !== sp.id; });
      }
    });
    // --- Участники: изменения роли/доступа/telegram ---
    parts.forEach(function(p){
      var sp = spById[p.id];
      if (!sp) return;
      var patch = {};
      if (p.role !== sp.role) patch.role = p.role;
      if (p.access !== sp.access) patch.access = p.access;
      if (p.telegram !== sp.telegram) patch.telegram = p.telegram;
      if (Object.keys(patch).length){
        ops.push(a.updateParticipant(tid, p.id, patch).catch(function(){}));
        sp.role = p.role; sp.access = p.access; sp.telegram = p.telegram;
      }
    });

    // --- Приглашения: новые (созданы в UI) ---
    invites.forEach(function(iv){
      if (!siById[iv.id]){
        ops.push(a.createInvitation(tid, {
          email: iv.email || "",
          role: "participant",
          expiresInDays: iv.expiresInDays || 7
        }).catch(function(){}));
        snapInvites.push({ id: iv.id, active: iv.active !== false, email: iv.email || "" });
      } else {
        var si = siById[iv.id];
        // Отозвано: было активно, стало неактивным (остаётся в списке)
        if (iv.active === false && si.active !== false){
          ops.push(a.updateInvitation(tid, iv.id, { active: false, status: "revoked" }).catch(function(){}));
          si.active = false;
        }
      }
    });
    // --- Приглашения: удалённые записи ---
    snapInvites.slice().forEach(function(si){
      if (!iById[si.id] && String(si.id).indexOf("invite-local-") !== 0){
        ops.push(a.revokeInvitation(tid, si.id).catch(function(){}));
        snapInvites = snapInvites.filter(function(x){ return x.id !== si.id; });
      }
    });

    if (!ops.length) return;
    pushing = true;
    Promise.all(ops).then(function(){
      pushing = false;
      refresh();
      document.dispatchEvent(new CustomEvent("travel:data-changed"));
    }).catch(function(){ pushing = false; });
  }

  function onStoreChange(state, changedKeys, meta){
    if (!meta || meta.source !== "members") return;
    if (applying) return;
    var keys = changedKeys || [];
    if (keys.indexOf("participants") === -1 && keys.indexOf("invitations") === -1) return;
    reconcile(state);
  }

  function boot(){
    var s = store();
    if (s && s.subscribe) s.subscribe(onStoreChange);
    refresh();
    var tab = document.getElementById("tab-members");
    if (tab) tab.addEventListener("click", function(){ setTimeout(refresh, 40); });
    document.addEventListener("travel:trip-changed", function(){ refresh(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  function createInvitation(payload) {
    var a = api();
    if (!a || !a.createInvitation) return Promise.reject(new Error("Сервис приглашений недоступен"));
    return Promise.resolve(a.ensureAuth ? a.ensureAuth() : null)
      .then(function(){ return a.createInvitation(getTripId(), payload); })
      .then(function(result){ refresh(); return result && result.invitation ? result.invitation : result; });
  }

  window.TravelMembersSync = { refresh: refresh, createInvitation: createInvitation };
})();

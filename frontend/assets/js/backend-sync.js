/**
 * backend-sync.js — слой синхронизации между бэкендом и клиентским UI прототипа.
 *
 * Цель: действия, выполненные в одном месте (панель ИИ, документы, мониторинг),
 * отражались на главной странице поездки. Бэкенд = источник правды.
 * Работает поверх integration-controller.js: подписан на стор ПОСЛЕ контроллера,
 * поэтому переприменяет своё состояние последним и его данные не затираются.
 */
(function backendSyncModule(){
  "use strict";

  var store = window.TravelAppState || null;
  function api(){ return window.TravelApi || null; }

  // Кэш последних данных бэкенда. undefined = ещё не загружали (не трогаем UI).
  var data = { tripId: null, plan: undefined, documents: undefined, signals: undefined };

  function esc(v){
    return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function getTripId(){
    try {
      var u = new URL(window.location.href);
      var t = u.searchParams.get("tripId") || u.searchParams.get("trip");
      if (t) return t;
    } catch (e) {}
    var s = (store && store.getState) ? store.getState() : null;
    if (s && s.activeTripId) return s.activeTripId;
    if (s && s.trip && s.trip.id) return s.trip.id;
    return "trip-turkey-2026";
  }

  /* ==================== Plan B ==================== */

  function planbCard(){ return document.querySelector('[data-od-id="card-planb"]'); }

  function stepsOf(plan){
    if (Array.isArray(plan.steps)) return plan.steps;
    try { var a = JSON.parse(plan.steps || "[]"); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }

  function renderPlanEmpty(card){
    var body = card.querySelector(".card-body");
    if (body && !body.querySelector(".planb-empty")){
      body.innerHTML = '<div class="planb-empty calm"><p>Подтверждённых нарушений нет. Plan B появится после подтверждения конкретной проблемы.</p></div>';
    }
  }

  function renderPlan(card, plan){
    var badge = card.querySelector(".card-header .badge");
    var body = card.querySelector(".card-body");
    var done = plan.status === "done";
    if (badge){
      badge.textContent = done ? "План Б выполнен" : "План Б применён";
      badge.className = "badge badge-dot " + (done ? "badge-success" : "badge-accent");
    }
    if (body){
      var steps = stepsOf(plan);
      var h = '<div class="planb-applied' + (done ? ' is-done' : '') + '">';
      h += '<span class="planb-applied__tag">' + (done ? 'Выполнен' : 'Активный план Б') + '</span>';
      h += '<h3 class="planb-applied__title">' + esc(plan.title || 'План Б') + '</h3>';
      if (plan.summary) h += '<p class="planb-applied__summary">' + esc(plan.summary) + '</p>';
      if (steps.length){
        h += '<ol class="planb-applied__steps">';
        steps.forEach(function(s){ h += '<li>' + esc(s) + '</li>'; });
        h += '</ol>';
      }
      if (plan.whenToUse) h += '<p class="planb-applied__meta"><span>Когда:</span> ' + esc(plan.whenToUse) + '</p>';
      h += '<button type="button" class="btn btn-secondary planb-applied__open" style="width:100%">Открыть в мониторинге</button>';
      h += '</div>';
      body.innerHTML = h;
    }
  }

  function renderPlanCard(){
    var card = planbCard();
    if (!card) return;
    if (data.plan === undefined) return;
    if (data.plan) renderPlan(card, data.plan);
    else renderPlanEmpty(card);
  }

  /* ==================== Документы ==================== */

  function renderDocsCard(){
    if (data.documents === undefined) return;
    var card = document.querySelector('[data-od-id="card-documents"]');
    if (!card) return;
    var docs = data.documents || [];
    var total = docs.length;
    var confirmed = docs.filter(function(d){ return d.status === "confirmed"; }).length;
    var toCheck = total - confirmed;
    var vals = card.querySelectorAll(".doc-metric-value");
    if (vals[0]) vals[0].textContent = String(total);
    if (vals[1]) vals[1].textContent = String(confirmed);
    if (vals[2]) vals[2].textContent = String(toCheck);
    var line = card.querySelector(".doc-checkline");
    if (line){
      var svg = line.querySelector("svg");
      line.innerHTML = (svg ? svg.outerHTML : "") + " Требует проверки: " + toCheck;
    }
  }

  /* ==================== Мониторинг: сигналы ==================== */

  function sevClass(sev){
    if (sev === "critical" || sev === "danger") return "sig--danger";
    if (sev === "warning" || sev === "warn") return "sig--warn";
    return "sig--info";
  }

  function renderSignals(){
    if (data.signals === undefined) return;
    var card = document.querySelector('[data-od-id="card-monitoring"]');
    if (!card) return;
    var body = card.querySelector(".card-body");
    if (!body) return;
    var wrap = body.querySelector(".mon-signals");
    var list = data.signals || [];
    if (!list.length){
      if (wrap) wrap.parentNode.removeChild(wrap);
      return;
    }
    if (!wrap){
      wrap = document.createElement("div");
      wrap.className = "mon-signals";
      body.appendChild(wrap);
    }
    var top = list.slice(0, 3);
    var h = '<p class="mon-signals__title">Сигналы мониторинга</p>';
    top.forEach(function(s){
      h += '<div class="mon-signal ' + sevClass(s.severity) + '">';
      h += '<span class="mon-signal__dot"></span>';
      h += '<div class="mon-signal__body">';
      h += '<span class="mon-signal__label">' + esc(s.label || s.status || "Сигнал") + '</span>';
      if (s.detail) h += '<span class="mon-signal__detail">' + esc(s.detail) + '</span>';
      h += '</div>';
      if (s.status) h += '<span class="mon-signal__status">' + esc(s.status) + '</span>';
      h += '</div>';
    });
    if (list.length > 3) h += '<p class="mon-signals__more">и ещё ' + (list.length - 3) + '</p>';
    wrap.innerHTML = h;
  }

  /* ==================== Общий рендер / загрузка ==================== */

  function renderAll(){
    renderPlanCard();
    renderDocsCard();
    renderSignals();
  }

  function refresh(){
    var a = api();
    if (!a) return;
    var id = getTripId();
    data.tripId = id;
    var run = function(){
      a.getActivePlan(id).then(function(r){ data.plan = (r && r.plan) ? r.plan : null; renderPlanCard(); }).catch(function(){});
      if (a.listDocuments) a.listDocuments(id).then(function(r){ data.documents = (r && r.documents) ? r.documents : []; renderDocsCard(); }).catch(function(){});
      if (a.monitoringSignals) a.monitoringSignals(id).then(function(r){ data.signals = (r && r.signals) ? r.signals : []; renderSignals(); }).catch(function(){});
    };
    if (a.getToken && !a.getToken() && a.ensureAuth){
      a.ensureAuth().then(run).catch(function(){});
    } else {
      run();
    }
  }

  // Переприменяем после каждого рендера контроллера (мы подписаны позже — идём после него).
  if (store && store.subscribe){ store.subscribe(function(){ renderAll(); }); }

  // События изменений от разделов — перечитываем бэкенд.
  document.addEventListener("travel:plan-changed", refresh);
  document.addEventListener("travel:data-changed", refresh);

  // Переход на вкладку мониторинга по кнопке в карточке Plan B.
  document.addEventListener("click", function(e){
    var t = e.target;
    var b = t && t.closest ? t.closest(".planb-applied__open") : null;
    if (b && typeof window.switchTab === "function"){ window.switchTab("monitor"); }
  });

  function boot(){ refresh(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.TravelBackendSync = { refresh: refresh };
})();

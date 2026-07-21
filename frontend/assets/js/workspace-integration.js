/* workspace-integration.js — склейка рабочего пространства основы с ветками:
   выбор поездки по ?tripId, единый core-flow adapter для вкладок Мониторинг/Сообщения,
   единый глобальный SOS, completed-banner, auth guard и безопасный No Access. */
(function () {
  "use strict";

  function app() { return window.TravelAppState; }
  function state() { return (app() && app().getState()) || {}; }

  function renderNoAccess() {
    const page = document.querySelector('[data-od-id="app-shell"]') || document.querySelector(".page") || document.body;
    document.title = "Нет доступа · Тревел-помощник";
    document.querySelectorAll(".modal.open, .dropdown-menu.open").forEach((el) => el.classList.remove("open"));
    const sos = document.querySelector("[data-sos-button], .sos-btn, #sos-button");
    if (sos) sos.style.display = "none";
    page.innerHTML =
      '<section class="card" style="max-width:520px;margin:48px auto;padding:32px;text-align:center;" aria-live="polite">' +
      "<h1 style=\"margin:0 0 12px;font-size:22px;\">Нет доступа</h1>" +
      "<p style=\"margin:0 0 20px;color:var(--fg-secondary);\">У Вас нет доступа к этой поездке или доступ был отозван.</p>" +
      '<button type="button" class="btn btn-primary" onclick="AppRoutes.goToHome()" style="min-height:44px;">Вернуться на Главную</button>' +
      "</section>";
  }

  let completedBannerEl = null;
  function syncCompletedBanner() {
    const trip = state().trip || {};
    const isCompleted = trip.status === "completed";
    const host = document.querySelector(".trip-header");
    if (isCompleted && host && !completedBannerEl) {
      completedBannerEl = document.createElement("div");
      completedBannerEl.className = "completed-trip-banner";
      completedBannerEl.setAttribute("role", "status");
      completedBannerEl.style.cssText = "display:flex;align-items:center;gap:10px;padding:12px 16px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--accent-soft);color:var(--fg);font-size:var(--fs-md);";
      completedBannerEl.textContent = "Завершённая поездка. Доступен только просмотр.";
      host.insertBefore(completedBannerEl, host.firstChild);
    } else if (!isCompleted && completedBannerEl) {
      completedBannerEl.remove();
      completedBannerEl = null;
    }
    const sosButton = document.getElementById("sos-open") || document.querySelector('[onclick*="appHandleGlobalSos"]');
    if (sosButton) sosButton.style.display = isCompleted ? "none" : "";
  }

  window.appHandleGlobalSos = function () {
    const s = state();
    const trip = s.trip || {};
    if (trip.status === "completed") return false;
    if (typeof window.coreFlowOpenSos === "function" && window.coreFlowActiveAdapter) {
      const segments = Array.isArray(trip.segments) ? trip.segments : [];
      return window.coreFlowOpenSos({
        source: "global-sos",
        tripId: trip.id,
        currentUserId: s.currentUser && s.currentUser.id,
        role: (s.currentUser && (s.currentUser.currentTripRole || s.currentUser.role)) || "organizer",
        currentSegmentId: segments.length ? segments[0].id : null,
        networkState: s.networkState || "online",
        accessState: s.accessState || "granted"
      });
    }
    if (typeof window.openModal === "function") { window.openModal("modal-sos"); return true; }
    return false;
  };

  async function boot() {
    if (window.TravelSite && window.TravelSite.ready) await window.TravelSite.ready;
    // dev override
    try {
      if (new URLSearchParams(window.location.search).get("env") === "development") {
        document.body.setAttribute("data-app-environment", "development");
      }
    } catch (error) { /* ignore */ }

    // auth guard
    const session = (state().accountPages && state().accountPages.session) || {};
    if (!session.isAuthenticated) {
      const here = window.location.pathname.split("/").pop() + window.location.search;
      window.location.replace("login.html?returnUrl=" + encodeURIComponent(here));
      return;
    }

    // выбор поездки по URL
    const params = new URLSearchParams(window.location.search);
    const tripId = params.get("tripId") || params.get("trip");
    if (tripId) {
      const found = app().setActiveTrip ? app().setActiveTrip(tripId) : null;
      if (!found) { renderNoAccess(); return; }
    }

    // единый core-flow adapter для Мониторинга и Сообщений
    if (typeof window.coreFlowCreateStateAdapter === "function") {
      const adapter = window.coreFlowCreateStateAdapter({
        modalRoot: document.getElementById("coreflow-shared-modal-root") || undefined,
        toastRoot: document.getElementById("coreflow-shared-toast-root") || undefined
      });
      window.coreFlowActiveAdapter = adapter;
      const monitoringRoot = document.querySelector("#panel-monitor .monitoring-surface");
      const messagesRoot = document.querySelector("#panel-messages .messages-surface");
      if (monitoringRoot && typeof window.monitoringInit === "function") window.monitoringInit(monitoringRoot, adapter);
      if (messagesRoot && typeof window.messagesInit === "function") window.messagesInit(messagesRoot, adapter);
      window.coreFlowActiveAdapter = adapter;
    }

    syncCompletedBanner();
    if (app() && typeof app().subscribe === "function") {
      app().subscribe(syncCompletedBanner);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

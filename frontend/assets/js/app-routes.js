/* app-routes.js — единый маршрутизатор финальной сборки (AppRoutes).
   Объединяет маршруты основы, trip-pages и account-pages.
   Все переходы между страницами выполняются через этот адаптер. */
(function () {
  "use strict";

  const KNOWN_PAGES = [
    "index.html",
    "login.html",
    "register.html",
    "password-recovery.html",
    "invitation.html",
    "profile.html",
    "home.html",
    "history.html",
    "trip-wizard.html",
    "trip-overview.html"
  ];

  function appendQuery(url, params) {
    const clean = Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null && value !== "");
    if (!clean.length) return url;
    const joiner = url.includes("?") ? "&" : "?";
    return url + joiner + clean.map(([key, value]) => encodeURIComponent(key) + "=" + encodeURIComponent(value)).join("&");
  }

  // Безопасный внутренний return: только известные страницы проекта,
  // без внешних URL и без протокольных схем.
  function isSafeReturn(value) {
    if (!value) return false;
    const text = String(value).trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return false;
    if (text.startsWith("//") || text.includes("\\")) return false;
    const file = text.split("?")[0].split("#")[0];
    return KNOWN_PAGES.indexOf(file) !== -1;
  }

  function go(url) {
    window.location.assign(url);
  }

  function withReturn(options) {
    const opts = options || {};
    const out = {};
    if (opts.returnUrl && isSafeReturn(opts.returnUrl)) out.returnUrl = opts.returnUrl;
    if (opts.return) out.return = opts.return;
    if (opts.invitationId) out.invitationId = opts.invitationId;
    if (opts.userId) out.userId = opts.userId;
    return out;
  }

  const AppRoutes = {
    isSafeReturn,
    appendQuery,

    goToLogin(options) { go(appendQuery("login.html", withReturn(options))); },
    goToRegister(options) { go(appendQuery("register.html", withReturn(options))); },
    goToRecovery(options) { go(appendQuery("password-recovery.html", withReturn(options))); },

    goToInvitation(invitationId, options) {
      const opts = options || {};
      go(appendQuery("invitation.html", {
        invitationId: invitationId || "",
        auth: opts.auth,
        userId: opts.userId
      }));
    },

    goToHome() { go("home.html"); },
    goToHistory() { go("history.html"); },

    goToProfile(section) {
      go(appendQuery("profile.html", { section: section || "" }));
    },

    goToWizard(options) {
      const opts = options || {};
      go(appendQuery("trip-wizard.html", {
        mode: opts.mode || "create",
        tripId: opts.tripId,
        draft: opts.draftId || opts.draft
      }));
    },

    goToTrip(tripId, options) {
      const opts = options || {};
      go(appendQuery("trip-overview.html", { tripId: tripId || "", tab: opts.tab }));
    },

    logout() {
      if (window.TravelAPI && window.TravelAPI.auth) {
        window.TravelAPI.auth.logout().catch(function () { /* clear local state regardless */ });
      }
      try {
        const app = window.TravelAppState;
        if (app && typeof app.logoutSession === "function") app.logoutSession();
      } catch (error) { /* ignore */ }
      go("login.html");
    },

    // Возврат после авторизации: только безопасные внутренние адреса.
    routeAfterAuthReturn(fallback) {
      const params = new URLSearchParams(window.location.search);
      const returnUrl = params.get("returnUrl");
      if (returnUrl && isSafeReturn(returnUrl)) { go(returnUrl); return true; }
      if (params.get("return") === "invitation") {
        AppRoutes.goToInvitation(params.get("invitationId") || "invite-001", { auth: "1", userId: params.get("userId") || "" });
        return true;
      }
      go(fallback || "home.html");
      return true;
    }
  };

  window.AppRoutes = AppRoutes;

  // Фасад для модулей trip-pages: тот же единый маршрутизатор.
  window.TripPagesRoutes = {
    workspaceHref: "./trip-overview.html",
    goToHome() { AppRoutes.goToHome(); },
    goToHistory() { AppRoutes.goToHistory(); },
    goToProfile(section) { AppRoutes.goToProfile(section); },
    goToInvitation(id) { AppRoutes.goToInvitation(id); },
    goToTrip(id, options) { AppRoutes.goToTrip(id, options); },
    goToWizard(options) { AppRoutes.goToWizard(options); },
    logout() { AppRoutes.logout(); }
  };

  // Конфигурация account-routes: единые production-адреса.
  window.AccountRoutesConfig = Object.assign({}, window.AccountRoutesConfig || {}, {
    login: "login.html",
    register: "register.html",
    recovery: "password-recovery.html",
    invitation: "invitation.html",
    home: "home.html",
    trip: "trip-overview.html?tripId={tripId}",
    history: "history.html",
    profile: "profile.html"
  });
})();

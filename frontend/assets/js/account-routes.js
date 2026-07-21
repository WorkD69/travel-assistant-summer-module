(function () {
  "use strict";

  const DEFAULT_ROUTES = {
    login: "login.html",
    register: "register.html",
    recovery: "password-recovery.html",
    invitation: "invitation.html",
    home: "home.html",
    trip: "trip-overview.html?tripId={tripId}",
    history: "history.html",
    profile: "profile.html"
  };

  let config = Object.assign({}, DEFAULT_ROUTES, window.AccountRoutesConfig || {});

  function configure(nextConfig) {
    config = Object.assign({}, config, nextConfig || {});
    return Object.assign({}, config);
  }

  function interpolate(template, params) {
    return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
      return encodeURIComponent(params && params[key] != null ? params[key] : "");
    });
  }

  function appendQuery(url, params) {
    const cleanParams = Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null && value !== "");
    if (!cleanParams.length) return url;
    const hashIndex = url.indexOf("#");
    const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
    const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
    const joiner = base.includes("?") ? "&" : "?";
    const query = cleanParams.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
    return `${base}${joiner}${query}${hash}`;
  }

  function isSafeReturn(value) {
    if (!value) return false;
    const text = String(value);
    if (/^\s*(javascript|data|vbscript):/i.test(text)) return false;
    if (/^https?:\/\//i.test(text)) {
      try {
        const url = new URL(text);
        return url.origin === window.location.origin;
      } catch (error) {
        return false;
      }
    }
    return !text.includes("\\") && !text.startsWith("//");
  }

  function go(url) {
    window.location.assign(url);
  }

  function buildReturnFromOptions(options) {
    const opts = options || {};
    if (opts.returnUrl && isSafeReturn(opts.returnUrl)) return opts.returnUrl;
    if (opts.return === "invitation") {
      return appendQuery(config.invitation, {
        invitationId: opts.invitationId || "invite-001",
        auth: "1",
        userId: opts.userId || "invitee-001"
      });
    }
    return "";
  }

  function goToLogin(options) {
    go(appendQuery(config.login, {
      return: options && options.return,
      invitationId: options && options.invitationId,
      returnUrl: buildReturnFromOptions(options)
    }));
  }

  function goToRegister(options) {
    go(appendQuery(config.register, {
      return: options && options.return,
      invitationId: options && options.invitationId,
      returnUrl: buildReturnFromOptions(options)
    }));
  }

  function goToRecovery(options) {
    go(appendQuery(config.recovery, options || {}));
  }

  function goToHome() {
    go(config.home);
  }

  function goToHistory() {
    go(config.history);
  }

  function goToInvitation(invitationId, options) {
    go(appendQuery(config.invitation, Object.assign({}, options || {}, {
      invitationId: invitationId || (options && options.invitationId) || "invite-001"
    })));
  }

  function goToProfile(section) {
    go(appendQuery(config.profile, { section }));
  }

  function goToTrip(tripId, options) {
    const url = interpolate(config.trip, { tripId });
    go(appendQuery(url, options || {}));
  }

  function routeAfterAuth(adapter) {
    const stored = adapter && typeof adapter.consumeReturn === "function" ? adapter.consumeReturn() : "";
    if (isSafeReturn(stored)) {
      go(stored);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const returnUrl = params.get("returnUrl");
    if (isSafeReturn(returnUrl)) {
      go(returnUrl);
      return;
    }
    if (params.get("return") === "invitation") {
      const state = adapter && typeof adapter.getState === "function" ? adapter.getState() : null;
      const user = adapter && typeof adapter.getCurrentUser === "function" ? adapter.getCurrentUser(state) : null;
      goToInvitation(params.get("invitationId") || "invite-001", {
        auth: "1",
        userId: params.get("userId") || (user && user.id) || "invitee-001"
      });
      return;
    }
    goToHome();
  }

  function logout(adapter) {
    if (adapter && typeof adapter.logout === "function") adapter.logout();
    goToLogin();
  }

  window.AccountRoutes = {
    configure,
    getConfig: () => Object.assign({}, config),
    goToLogin,
    goToRegister,
    goToRecovery,
    goToHome,
    goToHistory,
    goToInvitation,
    goToProfile,
    goToTrip,
    routeAfterAuth,
    logout,
    isSafeReturn,
    _resolve: {
      interpolate,
      appendQuery,
      buildReturnFromOptions
    }
  };
}());

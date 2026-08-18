(function (global, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (global) global.TravelAuthSession = api.createSessionBootstrap(global);
}(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  function isLoopback(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  }

  function isExplicitPreview(root) {
    try {
      var environment = root.document && root.document.body && root.document.body.getAttribute("data-app-environment");
      var preview = new URLSearchParams(root.location.search || "").get("preview");
      return isLoopback(root.location.hostname) &&
        (environment === "development" || environment === "test") &&
        (preview === "legacy-fixtures" || preview === "smart-workspace");
    } catch (error) {
      return false;
    }
  }

  function splitName(user) {
    var parts = String(user.name || "").trim().split(/\s+/).filter(Boolean);
    return {
      firstName: parts.shift() || String(user.email || "").split("@")[0] || "Пользователь",
      lastName: parts.join(" "),
    };
  }

  function projectAuthenticated(root, backendUser) {
    var app = root.TravelAppState;
    var current = (app && app.getState && app.getState()) || {};
    var id = String(backendUser.id);
    var email = String(backendUser.email);
    var names = splitName(backendUser);
    var existingAccountPages = current.accountPages || {};
    var existingAccountUsers = existingAccountPages.users || {};
    var existingUsers = current.users || {};
    var existing = existingAccountUsers[id] || existingUsers[id] || {};
    var factualUser = Object.assign({}, existing, backendUser, names, {
      id: id,
      email: email,
      name: String(backendUser.name || [names.firstName, names.lastName].filter(Boolean).join(" ")),
      accountStatus: "active",
    });
    var session = {
      isAuthenticated: true,
      userId: id,
      email: email,
      remember: Boolean(existingAccountPages.session && existingAccountPages.session.remember),
      lastLoginAt: (existingAccountPages.session && existingAccountPages.session.lastLoginAt) || "",
    };
    var accountUsers = Object.assign({}, existingAccountUsers);
    var users = Object.assign({}, existingUsers);
    accountUsers[id] = factualUser;
    users[id] = factualUser;
    app.setState({
      accountPages: Object.assign({}, existingAccountPages, { session: session, users: accountUsers }),
      users: users,
      currentUser: factualUser,
    }, { source: "auth-session-bootstrap", action: "hydrate" });
  }

  function projectUnauthenticated(root) {
    var app = root.TravelAppState;
    var current = (app && app.getState && app.getState()) || {};
    var accountPages = current.accountPages || {};
    app.setState({
      accountPages: Object.assign({}, accountPages, {
        session: { isAuthenticated: false, userId: "", email: "", remember: false, lastLoginAt: "" },
      }),
    }, { source: "auth-session-bootstrap", action: "unauthorized" });
  }

  function renderUnavailable(root, retry) {
    var documentRef = root.document;
    if (!documentRef || !documentRef.body) return;
    var previous = documentRef.getElementById("auth-session-error");
    if (previous && previous.remove) previous.remove();
    var section = documentRef.createElement("section");
    section.id = "auth-session-error";
    section.className = "auth-session-error";
    section.setAttribute("role", "alert");
    section.textContent = "Не удалось проверить сессию. Проверьте соединение и попробуйте снова. ";
    if (typeof retry === "function") {
      var button = documentRef.createElement("button");
      button.type = "button";
      button.textContent = "Повторить";
      button.addEventListener("click", retry);
      section.appendChild(button);
    }
    documentRef.body.appendChild(section);
  }

  function createSessionBootstrap(root) {
    async function hydrate() {
      if (isExplicitPreview(root)) return { ok: true, kind: "preview", user: null };
      if (!root.TravelApi || typeof root.TravelApi.me !== "function" ||
          !root.TravelAppState || typeof root.TravelAppState.setState !== "function") {
        return { ok: false, kind: "unavailable", error: new Error("Auth session bootstrap is unavailable") };
      }
      try {
        var response = await root.TravelApi.me();
        var user = response && response.user;
        if (!user || !user.id || !user.email) throw new Error("Invalid auth session response");
        projectAuthenticated(root, user);
        return { ok: true, kind: "authenticated", user: user };
      } catch (error) {
        if (error && (error.status === 401 || error.status === 403)) {
          if (root.TravelApi && typeof root.TravelApi.clearAuth === "function") root.TravelApi.clearAuth();
          else if (root.TravelAuthStorage && typeof root.TravelAuthStorage.clear === "function") root.TravelAuthStorage.clear();
          projectUnauthenticated(root);
          return { ok: false, kind: "unauthorized", error: error };
        }
        return { ok: false, kind: "unavailable", error: error };
      }
    }

    async function runProtected(shellOptions, initialize) {
      var result = await hydrate();
      if (!result.ok) {
        if (result.kind === "unauthorized" && typeof root.appShellInit === "function") root.appShellInit(shellOptions || {});
        if (result.kind === "unavailable") renderUnavailable(root, function () { runProtected(shellOptions, initialize); });
        return result;
      }
      var shellReady = typeof root.appShellInit !== "function" || root.appShellInit(shellOptions || {});
      if (shellReady && typeof initialize === "function") initialize(result.user);
      return shellReady ? result : { ok: false, kind: "unauthorized" };
    }

    return {
      hydrate: hydrate,
      runProtected: runProtected,
      renderUnavailable: function (retry) { renderUnavailable(root, retry); },
    };
  }

  return { createSessionBootstrap: createSessionBootstrap };
}));

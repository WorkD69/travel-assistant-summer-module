(function configurePreviewApiSession(window) {
  "use strict";

  var api = window.TravelApi;
  if (!api || typeof window.fetch !== "function") return;

  var SESSION_TOKEN_KEY = "travelAssistant.apiToken.session";
  var PERSISTENT_TOKEN_KEY = "travelAssistant.apiToken.persistent";
  var nativeFetch = window.fetch.bind(window);
  var originalLogin = api.login.bind(api);
  var originalRegister = api.register.bind(api);
  var originalLogout = api.logout.bind(api);
  var originalGetToken = api.getToken.bind(api);
  var originalEnsureAuth = api.ensureAuth.bind(api);
  var authPromise = null;

  function readStoredToken() {
    try {
      return window.sessionStorage.getItem(SESSION_TOKEN_KEY)
        || window.localStorage.getItem(PERSISTENT_TOKEN_KEY);
    } catch (error) {
      return null;
    }
  }

  function writeStoredToken(token, remember) {
    try {
      window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
      window.localStorage.removeItem(PERSISTENT_TOKEN_KEY);
      if (token) {
        (remember ? window.localStorage : window.sessionStorage)
          .setItem(remember ? PERSISTENT_TOKEN_KEY : SESSION_TOKEN_KEY, token);
      }
    } catch (error) {
      // The canonical HttpOnly cookie remains the fallback.
    }
  }

  function isApiRequest(input) {
    var value = typeof input === "string" ? input : (input && input.url) || "";
    if (value.indexOf("/api/") === 0) return true;
    try { return new URL(value, window.location.href).origin === window.location.origin && new URL(value, window.location.href).pathname.indexOf("/api/") === 0; }
    catch (error) { return false; }
  }

  window.fetch = function sessionAwareFetch(input, init) {
    var options = Object.assign({}, init || {});
    var token = readStoredToken();
    if (token && isApiRequest(input)) {
      options.headers = Object.assign({}, options.headers || {});
      if (!options.headers.Authorization && !options.headers.authorization) {
        options.headers.Authorization = "Bearer " + token;
      }
    }
    return nativeFetch(input, options);
  };

  function localAccount() {
    try {
      var state = window.TravelAppState && window.TravelAppState.getState();
      var accountPages = state && state.accountPages;
      var session = accountPages && accountPages.session;
      var users = (accountPages && accountPages.users) || {};
      var user = session && users[session.userId];
      var email = String((session && session.email) || (user && user.email) || "").trim().toLowerCase();
      var credentials = (accountPages && accountPages.credentials) || {};
      var password = credentials[email];
      if (!session || !session.isAuthenticated || !email || !password) return null;
      return {
        email: email,
        password: password,
        remember: Boolean(session.remember),
        name: [user && user.firstName, user && user.lastName].filter(Boolean).join(" ") || email.split("@")[0]
      };
    } catch (error) {
      return null;
    }
  }

  api.login = async function login(email, password, remember) {
    var result = await originalLogin(email, password, remember);
    if (result && result.token) writeStoredToken(result.token, Boolean(remember));
    return result;
  };

  api.register = async function register(payload) {
    var result = await originalRegister(payload);
    var account = localAccount();
    if (result && result.token) writeStoredToken(result.token, Boolean(account && account.remember));
    return result;
  };

  api.logout = async function logout() {
    try { return await originalLogout(); }
    finally { writeStoredToken(null, false); }
  };

  api.getToken = function getToken() {
    return originalGetToken() || readStoredToken();
  };

  async function ensurePreviewAuth(creds) {
    try {
      return await api.me();
    } catch (error) {
      if (!error || error.status !== 401) throw error;
    }

    var account = localAccount();
    if (!account) return originalEnsureAuth(creds);

    try {
      await api.login(account.email, account.password, account.remember);
    } catch (loginError) {
      if (!loginError || (loginError.status !== 401 && loginError.status !== 404)) throw loginError;
      try {
        await api.register({ name: account.name, email: account.email, password: account.password });
      } catch (registerError) {
        if (registerError && registerError.status === 409) throw loginError;
        throw registerError;
      }
    }
    return api.me();
  }

  api.ensureAuth = function ensureAuth(creds) {
    if (!authPromise) {
      authPromise = ensurePreviewAuth(creds).finally(function () { authPromise = null; });
    }
    return authPromise;
  };
}(window));

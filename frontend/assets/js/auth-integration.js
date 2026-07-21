(function () {
  "use strict";

  const adapter = window.AccountStateAdapter;
  const api = window.TravelAPI;
  if (!adapter || !api) return;

  function splitName(name) {
    const parts = String(name || "Пользователь").trim().split(/\s+/);
    return { firstName: parts.shift() || "Пользователь", lastName: parts.join(" ") };
  }

  function commitUser(apiUser, remember) {
    const current = adapter.getState();
    const names = splitName(apiUser.name);
    const user = Object.assign({}, current.users[apiUser.id] || {}, apiUser, names, {
      id: apiUser.id,
      email: apiUser.email,
      accountStatus: "active"
    });
    current.users = Object.assign({}, current.users, { [user.id]: user });
    current.credentials = {};
    current.session = {
      isAuthenticated: true,
      userId: user.id,
      email: user.email,
      remember: Boolean(remember),
      lastLoginAt: new Date().toISOString()
    };
    adapter.setState(current, { source: "backend-auth" });
    return user;
  }

  function authFailure(error) {
    return { ok: false, code: error && error.code || "request_failed", message: error && error.message };
  }

  adapter.authenticate = async function (payload) {
    try {
      const result = await api.auth.login({ email: payload.email, password: payload.password });
      return { ok: true, user: commitUser(result.user, payload.remember) };
    } catch (error) {
      return authFailure(error);
    }
  };

  adapter.register = async function (payload) {
    try {
      const result = await api.auth.register({
        name: [payload.firstName, payload.lastName].filter(Boolean).join(" "),
        email: payload.email,
        password: payload.password
      });
      return { ok: true, user: commitUser(result.user, true) };
    } catch (error) {
      if (error && error.code === "email_already_used") error.code = "email_taken";
      return authFailure(error);
    }
  };

  const localLogout = adapter.logout.bind(adapter);
  adapter.logout = function () {
    api.auth.logout().catch(function () { /* local session is cleared regardless */ });
    return localLogout();
  };
})();

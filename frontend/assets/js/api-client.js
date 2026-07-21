(function () {
  "use strict";

  async function request(path, options) {
    const opts = Object.assign({}, options || {});
    opts.headers = Object.assign({ Accept: "application/json" }, opts.headers || {});
    opts.credentials = "include";
    if (opts.body && typeof opts.body !== "string" && !(opts.body instanceof FormData)) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    let response;
    try {
      response = await fetch(path.startsWith("/api/") ? path : "/api/" + String(path).replace(/^\/+/, ""), opts);
    } catch (cause) {
      const error = new Error("Нет соединения с сервером");
      error.code = "network_error";
      error.cause = cause;
      throw error;
    }
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : null;
    if (!response.ok) {
      const error = new Error(payload && payload.error && payload.error.message_ru || "Не удалось выполнить запрос");
      error.code = payload && payload.error && payload.error.code || "request_failed";
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  window.TravelAPI = {
    request,
    auth: {
      login(payload) { return request("/api/auth/login", { method: "POST", body: payload }); },
      register(payload) { return request("/api/auth/register", { method: "POST", body: payload }); },
      me() { return request("/api/auth/me"); },
      logout() { return request("/api/auth/logout", { method: "POST", keepalive: true }); }
    },
    trips: {
      list() { return request("/api/site/trips"); },
      get(id) { return request("/api/site/trips/" + encodeURIComponent(id)); },
      create(payload) { return request("/api/site/trips", { method: "POST", body: payload }); },
      update(id, payload) { return request("/api/site/trips/" + encodeURIComponent(id), { method: "PATCH", body: payload }); },
      remove(id) { return request("/api/site/trips/" + encodeURIComponent(id), { method: "DELETE" }); },
      telegramLinkToken(id) { return request("/api/site/trips/" + encodeURIComponent(id) + "/telegram-link-token", { method: "POST" }); }
    }
  };
})();

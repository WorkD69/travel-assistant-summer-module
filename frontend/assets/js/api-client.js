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
    telegram: {
      status() { return request("/api/site/integrations/telegram"); },
      createLink() { return request("/api/site/integrations/telegram/link-token", { method: "POST" }); },
      disconnect() { return request("/api/site/integrations/telegram", { method: "DELETE" }); }
    },
    geo: {
      search(query, signal) {
        return request("/api/site/geo/search?q=" + encodeURIComponent(query), { signal });
      },
      weather(latitude, longitude, refresh) {
        const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) });
        if (refresh) params.set("refresh", "1");
        return request("/api/site/geo/weather?" + params.toString());
      }
    },
    trips: {
      list() { return request("/api/site/trips"); },
      get(id) { return request("/api/site/trips/" + encodeURIComponent(id)); },
      create(payload) { return request("/api/site/trips", { method: "POST", body: payload }); },
      update(id, payload) { return request("/api/site/trips/" + encodeURIComponent(id), { method: "PATCH", body: payload }); },
      remove(id) { return request("/api/site/trips/" + encodeURIComponent(id), { method: "DELETE" }); },
      telegramLinkToken(id) { return request("/api/site/trips/" + encodeURIComponent(id) + "/telegram-link-token", { method: "POST" }); },
      createSos(id, payload, idempotencyKey) {
        return request("/api/site/trips/" + encodeURIComponent(id) + "/sos", {
          method: "POST", body: payload, headers: { "Idempotency-Key": idempotencyKey }
        });
      },
      confirmSignal(id, signalId) {
        return request("/api/site/trips/" + encodeURIComponent(id) + "/monitoring/" + encodeURIComponent(signalId) + "/confirm", { method: "POST" });
      },
      generatePlans(id, signalId) {
        return request("/api/site/trips/" + encodeURIComponent(id) + "/monitoring/" + encodeURIComponent(signalId) + "/plans", { method: "POST" });
      },
      assistantHistory(id) {
        return request("/api/site/trips/" + encodeURIComponent(id) + "/assistant/history");
      },
      askAssistant(id, question) {
        return request("/api/site/trips/" + encodeURIComponent(id) + "/assistant", { method: "POST", body: { question } });
      },
      selectPlan(id, planId) {
        return request("/api/site/trips/" + encodeURIComponent(id) + "/plans/" + encodeURIComponent(planId) + "/select", { method: "POST" });
      },
      publishPlan(id, planId) {
        return request("/api/site/trips/" + encodeURIComponent(id) + "/plans/" + encodeURIComponent(planId) + "/publish", { method: "POST" });
      },
      createMessage(id, payload) {
        return request("/api/site/trips/" + encodeURIComponent(id) + "/messages", { method: "POST", body: payload });
      },
      uploadDocument(id, formData) {
        return request("/api/site/trips/" + encodeURIComponent(id) + "/documents", { method: "POST", body: formData });
      },
      removeDocument(id, documentId) {
        return request("/api/site/trips/" + encodeURIComponent(id) + "/documents/" + encodeURIComponent(documentId), { method: "DELETE" });
      }
    }
  };
})();

(function(){
  "use strict";

  function stripTrail(b){
    while (b.length && b.charAt(b.length - 1) === "/") b = b.slice(0, -1);
    return b;
  }

  // The only production origin is injected by runtime-config.js before this
  // client loads. A same-origin empty base is a safe fallback, not a release
  // configuration substitute.
  var BUILD_ID = "final-frontend-integration-phase-a";

  window.TRAVEL_BUILD = Object.freeze({
    version: "FINAL",
    buildId: BUILD_ID,
    apiBaseRuntimeConfigured: typeof window.TRAVEL_API_BASE === "string"
  });

  if (typeof navigator !== "undefined" && "serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", function(){
      navigator.serviceWorker.register("/service-worker.js?v=" + BUILD_ID).catch(function(){});
    });
  }
  var BASE = (typeof window.TRAVEL_API_BASE === "string") ? window.TRAVEL_API_BASE : "";
  BASE = stripTrail(BASE);

  var authStorage = window.TravelAuthStorage || {
    load: function(){ return null; },
    save: function(){},
    clear: function(){}
  };
  var authToken = authStorage.load();

  function clearAuth(){
    authToken = null;
    authStorage.clear();
  }

  async function req(path, opts){
    opts = opts || {};
    var headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    if (authToken) headers["Authorization"] = "Bearer " + authToken;
    var res = await fetch(BASE + path, {
      method: opts.method || "GET",
      headers: headers,
      credentials: "include",
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok){
      var err = new Error((data && data.error) || ("HTTP " + res.status));
      err.status = res.status;
      err.data = data;
      if (res.status === 401) clearAuth();
      throw err;
    }
    return data;
  }

  function tp(tripId){ return "/api/trips/" + encodeURIComponent(tripId); }

  var TravelApi = {
    base: BASE,
    getToken: function(){ return authToken; },
    request: req,
    health: function(){ return req("/api/health"); },
    me: function(){ return req("/api/auth/me"); },
    login: async function(email, password, remember){
      var data = await req("/api/auth/login", { method: "POST", body: { email: email, password: password, remember: !!remember } });
      if (data && data.token){
        authToken = data.token;
        authStorage.save(data.token, !!remember);
      }
      return data;
    },
    register: async function(payload){
      var data = await req("/api/auth/register", { method: "POST", body: payload });
      if (data && data.token){
        authToken = data.token;
        authStorage.save(data.token, false);
      }
      return data;
    },
    updateProfile: function(patch){
      return req("/api/auth/profile", { method: "PATCH", body: patch });
    },
    logout: async function(){
      try {
        return await req("/api/auth/logout", { method: "POST" });
      } finally {
        clearAuth();
      }
    },
    ensureAuth: async function(){
      return TravelApi.me();
    },

    // Trips
    listTrips: function(){ return req("/api/trips"); },
    createTrip: function(payload){ return req("/api/trips", { method: "POST", body: payload }); },
    getTrip: function(tripId){ return req(tp(tripId)); },
    updateTrip: function(tripId, patch){ return req(tp(tripId), { method: "PATCH", body: patch }); },
    deleteTrip: function(tripId){ return req(tp(tripId), { method: "DELETE" }); },

    // Tutu Transport Contract V1
    tutuSearch: function(request){
      return req("/api/tutu/search", { method: "POST", body: request });
    },
    tutuCheckoutLink: function(selectionToken){
      return req("/api/tutu/checkout-link", { method: "POST", body: { selectionToken: selectionToken } });
    },
    tutuDemoPurchaseSuccess: function(selectionToken, idempotencyKey){
      return req("/api/tutu/demo-purchase-success", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: { selectionToken: selectionToken }
      });
    },

    // Canonical Plan B Core V5
    triggerPlanBDemo: function(tripId, body){
      return req(tp(tripId) + "/disruptions/demo", { method: "POST", body: body });
    },
    previewPlanB: function(tripId, preferences){
      var body = Array.isArray(preferences) && preferences.length ? { preferences: preferences } : {};
      return req(tp(tripId) + "/plan-b/preview", { method: "POST", body: body });
    },
    applyPlanB: function(tripId, body, idempotencyKey){
      return req(tp(tripId) + "/plan-b/apply", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: body
      });
    },
    revertPlanB: function(tripId){
      return req(tp(tripId) + "/plan-b/revert", { method: "POST", body: {} });
    },

    // Geo & weather
    geoSearch: function(q){ return req("/api/geo/search?q=" + encodeURIComponent(q || "")); },
    weather: function(lat, lon){ return req("/api/weather?lat=" + encodeURIComponent(lat) + "&lon=" + encodeURIComponent(lon)); },

    // Participants
    listParticipants: function(tripId){ return req(tp(tripId) + "/participants"); },
    addParticipant: function(tripId, payload){ return req(tp(tripId) + "/participants", { method: "POST", body: payload }); },
    updateParticipant: function(tripId, pid, patch){ return req(tp(tripId) + "/participants/" + encodeURIComponent(pid), { method: "PATCH", body: patch }); },
    removeParticipant: function(tripId, pid){ return req(tp(tripId) + "/participants/" + encodeURIComponent(pid), { method: "DELETE" }); },

    // Invitations
    listInvitations: function(tripId){ return req(tp(tripId) + "/invitations"); },
    createInvitation: function(tripId, payload){ return req(tp(tripId) + "/invitations", { method: "POST", body: payload }); },
    revokeInvitation: function(tripId, iid){ return req(tp(tripId) + "/invitations/" + encodeURIComponent(iid), { method: "DELETE" }); },
    updateInvitation: function(tripId, iid, patch){ return req(tp(tripId) + "/invitations/" + encodeURIComponent(iid), { method: "PATCH", body: patch }); },
    resolveInvitation: function(token){ return req("/invitations/resolve/" + encodeURIComponent(token)); },
    acceptInvitation: function(token){ return req("/invitations/" + encodeURIComponent(token) + "/accept", { method: "POST", body: {} }); },

    // Documents
    listDocuments: function(tripId){ return req(tp(tripId) + "/documents"); },
    addDocument: function(tripId, payload){ return req(tp(tripId) + "/documents", { method: "POST", body: payload }); },
    updateDocument: function(tripId, did, patch){ return req(tp(tripId) + "/documents/" + encodeURIComponent(did), { method: "PATCH", body: patch }); },
    removeDocument: function(tripId, did){ return req(tp(tripId) + "/documents/" + encodeURIComponent(did), { method: "DELETE" }); },

    // Messages
    listMessages: function(tripId){ return req(tp(tripId) + "/messages"); },
    addMessage: function(tripId, payload){ return req(tp(tripId) + "/messages", { method: "POST", body: payload }); },
    updateMessage: function(tripId, mid, patch){ return req(tp(tripId) + "/messages/" + encodeURIComponent(mid), { method: "PATCH", body: patch }); },
    removeMessage: function(tripId, mid){ return req(tp(tripId) + "/messages/" + encodeURIComponent(mid), { method: "DELETE" }); },

    // Offline copy
    getOffline: function(tripId){ return req(tp(tripId) + "/offline"); },
    saveOffline: function(tripId, payload){ return req(tp(tripId) + "/offline", { method: "PUT", body: payload }); },

    // Monitoring + assistant
    monitoringSignals: function(tripId){ return req(tp(tripId) + "/monitoring"); },
    createSignal: function(tripId, payload){ return req(tp(tripId) + "/monitoring", { method: "POST", body: payload }); },
    assistantHistory: function(tripId){ return req(tp(tripId) + "/monitoring/assistant/history"); },
    assistant: function(tripId, messages, mode){
      return req(tp(tripId) + "/monitoring/assistant", { method: "POST", body: { messages: messages, mode: mode || "dialog" } });
    },

    // Загрузка файла (multipart) + доступ к файлу
    uploadDocument: function(tripId, file, meta){
      var fd = new FormData();
      fd.append("file", file);
      if (meta){ Object.keys(meta).forEach(function(k){ if (meta[k] != null) fd.append(k, meta[k]); }); }
      var headers = {};
      if (authToken) headers["Authorization"] = "Bearer " + authToken;
      return fetch(BASE + tp(tripId) + "/documents/upload", { method: "POST", headers: headers, credentials: "include", body: fd }).then(function(res){
        return res.json().then(function(d){
          if (!res.ok){ var e = new Error((d && d.error) || ("HTTP " + res.status)); e.status = res.status; throw e; }
          return d;
        }, function(){ if (!res.ok) throw new Error("HTTP " + res.status); return {}; });
      });
    },
    // Telegram linking (site side)
    telegramStatus: function(){ return req("/api/integrations/telegram/status"); },
    telegramLinkToken: function(){ return req("/api/integrations/telegram/link-token", { method: "POST", body: {} }); },
    telegramUnlink: function(){ return req("/api/integrations/telegram/link", { method: "DELETE" }); },

    fileUrl: function(tripId, did, download){ return BASE + tp(tripId) + "/documents/" + encodeURIComponent(did) + "/file" + (download ? "?download=1" : ""); },
    fetchFileBlob: function(tripId, did){
      var headers = {};
      if (authToken) headers["Authorization"] = "Bearer " + authToken;
      return fetch(BASE + tp(tripId) + "/documents/" + encodeURIComponent(did) + "/file", { headers: headers, credentials: "include" }).then(function(res){ if (!res.ok) throw new Error("HTTP " + res.status); return res.blob(); });
    }
  };

  window.TravelApi = TravelApi;
})();

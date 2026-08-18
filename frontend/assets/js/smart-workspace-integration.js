(function smartWorkspaceIntegrationModule(root, factory) {
  "use strict";
  var api = factory(root || {});
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SmartWorkspaceIntegration = api;
}(typeof window !== "undefined" ? window : globalThis, function smartWorkspaceIntegrationFactory(root) {
  "use strict";

  var PREVIEW_STAGES = ["normal", "disruption", "planb", "impact", "applied"];
  var PREFERENCES = ["faster", "cheaper", "fewer_transfers"];

  function isSmartWorkspacePreview(params) {
    return !!params && (params.env === "development" || params.env === "test") && params.preview === "smart-workspace";
  }

  function runtimeEnvironment(bodyEnvironment, requestedEnvironment, hostname) {
    var local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    if (local && (requestedEnvironment === "development" || requestedEnvironment === "test")) return requestedEnvironment;
    if (!local) return "production";
    return bodyEnvironment || "production";
  }

  function previewCandidates() {
    return [
      { id: "candidate-a", from: "Москва → Санкт-Петербург", departure: { time: "15:40", place: "Москва" }, arrival: { time: "17:20", place: "Санкт-Петербург" }, duration: "1ч 40м", transfers: "Без пересадок", price: 7150, carrierName: null, serviceNumber: null, availability: "available" },
      { id: "candidate-b", from: "Москва → Санкт-Петербург", departure: { time: "18:20", place: "Москва" }, arrival: { time: "20:05", place: "Санкт-Петербург" }, duration: "1ч 45м", transfers: "Без пересадок", price: 8900, carrierName: null, serviceNumber: null, availability: "available" },
      { id: "candidate-c", from: "Москва → Санкт-Петербург", departure: { time: "16:10", place: "Москва" }, arrival: { time: "21:35", place: "Санкт-Петербург" }, duration: "5ч 25м", transfers: "1 пересадка", price: 5240, carrierName: null, serviceNumber: null, availability: "available" }
    ];
  }

  function previewMock(requestedStage) {
    var stage = PREVIEW_STAGES.indexOf(requestedStage) !== -1 ? requestedStage : "normal";
    var isDisrupted = stage !== "normal";
    return {
      stage: stage,
      trip: {
        id: "preview-flight", route: "Москва → Санкт-Петербург", dateLabel: "15 августа · перелёт · в одну сторону · 1 взрослый",
        departure: { date: "15 авг, пт", time: "12:30", place: "Москва" }, arrival: { date: "15 авг, пт", time: "14:05", place: "Санкт-Петербург" },
        duration: "1ч 35м", nextEvent: "Вылет · 15 авг, 12:30 · Москва"
      },
      disruption: isDisrupted ? { type: "CARRIER_CANCELLED", source: "DEMO_SIMULATION", impact: "Этот вариант перелёта больше недоступен. Нужно подобрать новый вариант поездки." } : null,
      candidates: isDisrupted ? previewCandidates() : [],
      ranking: {
        fastest: { status: "available", candidateId: "candidate-a" },
        cheapest: { status: "available", candidateId: "candidate-c" },
        personalized: { status: "available", candidateId: "candidate-c", reasons: ["минимальная цена"] }
      },
      preferences: stage === "planb" || stage === "impact" || stage === "applied" ? ["cheaper"] : [],
      impact: { candidateId: "candidate-a", arrivalAt: "17:20", arrivalDeltaMinutes: 195, duration: "1ч 40м", durationMinutes: 100, durationDeltaMinutes: 5, transferCount: 0, transferCountDelta: 0, price: 7150, priceDelta: null, priceDeltaStatus: "unavailable" },
      appliedTrip: stage === "applied" ? { route: "Москва → Санкт-Петербург", dateLabel: "15 августа · перелёт · в одну сторону · 1 взрослый" } : null,
      apply: { status: stage === "applied" ? "applied" : "idle", candidateId: stage === "applied" ? "candidate-a" : null },
      revert: { status: stage === "applied" ? "available" : "disabled" }, documents: [], contextRows: []
    };
  }

  function resolveSmartWorkspaceInput(options) {
    var input = options || {};
    if (input.supplied) return input.supplied;
    return isSmartWorkspacePreview(input) ? previewMock(input.smartState) : null;
  }

  function parseTripId(search) {
    var params = new URLSearchParams(search || "");
    var value = params.get("tripId");
    if (typeof value !== "string") return null;
    value = value.trim();
    return value && value.length <= 200 ? value : null;
  }

  function backendCode(error) {
    return error && error.data && error.data.error && error.data.error.code || null;
  }

  function errorPresentation(error, operation) {
    var status = error && error.status;
    var code = backendCode(error);
    if (status === 401) return { kind: "auth", message: "Сессия истекла. Войдите снова, чтобы открыть поездку.", retryable: false };
    if (status === 403) return { kind: "forbidden", message: "У вас нет доступа к этой поездке или операции.", retryable: false };
    if (status === 404 && operation === "load") return { kind: "not_found", message: "Поездка не найдена.", retryable: false };
    if (operation === "preview_timeout") return { kind: "preview_timeout", message: "Подбор Plan B занял слишком много времени. Повторите попытку.", retryable: true };
    if (operation === "apply" && status === 409) return { kind: "apply_conflict", code: code, message: "Поездка или предложение изменились. Получите новые варианты Plan B.", retryable: true };
    if (operation === "revert" && status === 409) return { kind: "revert_conflict", code: code, message: "Не удалось вернуть маршрут: состояние поездки изменилось.", retryable: true };
    var messages = {
      load: "Не удалось загрузить поездку.",
      disruption: "Не удалось запустить демонстрационное событие.",
      preview: "Не удалось получить варианты Plan B.",
      apply: "Не удалось применить Plan B.",
      revert: "Не удалось вернуть предыдущий вариант."
    };
    return { kind: operation || "network", code: code, message: messages[operation] || "Не удалось выполнить запрос.", retryable: status !== 403 && status !== 404 };
  }

  function createIdempotencyKey(randomBytes) {
    var bytes = randomBytes();
    if (!bytes || bytes.length < 16) throw new Error("Secure idempotency key generation is unavailable");
    return Array.prototype.map.call(bytes, function hex(value) { return Number(value).toString(16).padStart(2, "0"); }).join("");
  }

  function createController(options) {
    var settings = options || {};
    var api = settings.api;
    var viewModel = settings.viewModel;
    var render = typeof settings.render === "function" ? settings.render : function () {};
    var randomBytes = typeof settings.randomBytes === "function" ? settings.randomBytes : function secureBytes() {
      var bytes = new Uint8Array(24);
      root.crypto.getRandomValues(bytes);
      return bytes;
    };
    var timeoutMs = Number.isFinite(settings.previewTimeoutMs) ? settings.previewTimeoutMs : 15000;
    var state = {
      tripId: settings.tripId || null,
      status: "idle",
      model: null,
      selectedCandidateId: null,
      preferences: [],
      pendingAction: null,
      error: null,
      applyIntent: null
    };

    function selectedImpact() {
      if (!state.model || !state.selectedCandidateId) return null;
      var selected = state.model.candidates.find(function findCandidate(candidate) { return candidate.id === state.selectedCandidateId; });
      return selected && selected.impact ? Object.assign({ candidateId: selected.id }, selected.impact) : null;
    }

    function presentation() {
      return {
        selectedCandidateId: state.selectedCandidateId,
        preferences: state.preferences.slice(),
        pendingAction: state.pendingAction,
        error: state.error,
        impact: selectedImpact()
      };
    }

    function publish() {
      var model = state.model ? Object.assign({}, state.model, { impact: selectedImpact(), preferences: state.preferences.slice() }) : null;
      render(model, presentation());
    }

    function getState() {
      return Object.assign({}, state, { preferences: state.preferences.slice(), presentation: presentation() });
    }

    async function loadCanonicalTrip() {
      var response = await api.getTrip(state.tripId);
      var trip = response && response.trip;
      if (!trip || trip.id !== state.tripId) throw new Error("Canonical Trip response is invalid");
      state.model = viewModel.projectCanonicalTrip(trip);
      state.status = "ready";
      state.selectedCandidateId = null;
      state.preferences = [];
      state.applyIntent = null;
      return state.model;
    }

    async function start() {
      if (!state.tripId) {
        state.status = "error";
        state.error = { kind: "invalid_trip", message: "Не указан корректный идентификатор поездки.", retryable: false };
        publish();
        return false;
      }
      state.status = "loading";
      state.pendingAction = "load";
      state.error = null;
      publish();
      try {
        await loadCanonicalTrip();
        return true;
      } catch (error) {
        state.status = "error";
        state.error = errorPresentation(error, "load");
        return false;
      } finally {
        state.pendingAction = null;
        publish();
      }
    }

    async function triggerDemoDisruption() {
      if (state.pendingAction || !state.tripId) return false;
      state.pendingAction = "disruption";
      state.error = null;
      publish();
      try {
        await api.triggerPlanBDemo(state.tripId, { type: "CARRIER_CANCELLED" });
        await loadCanonicalTrip();
        return true;
      } catch (error) {
        state.error = errorPresentation(error, "disruption");
        return false;
      } finally {
        state.pendingAction = null;
        publish();
      }
    }

    function withPreviewTimeout(promise) {
      return new Promise(function settle(resolve, reject) {
        var done = false;
        var timer = setTimeout(function timeoutPreview() {
          if (done) return;
          done = true;
          reject(Object.assign(new Error("Plan B preview timeout"), { phaseBPreviewTimeout: true }));
        }, timeoutMs);
        Promise.resolve(promise).then(function resolved(value) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(value);
        }, function rejected(error) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(error);
        });
      });
    }

    async function requestPreview(nextPreferences) {
      if (state.pendingAction || !state.model) return false;
      var requested = Array.isArray(nextPreferences) ? nextPreferences.slice() : state.preferences.slice();
      state.pendingAction = "preview";
      state.error = null;
      publish();
      try {
        var response = await withPreviewTimeout(api.previewPlanB(state.tripId, requested));
        var base = viewModel.projectCanonicalTrip(state.model.canonicalTrip);
        state.model = viewModel.mergePlanBPreview(base, response);
        state.preferences = requested;
        if (!state.model.candidates.some(function hasSelected(candidate) { return candidate.id === state.selectedCandidateId; })) state.selectedCandidateId = null;
        state.applyIntent = null;
        state.status = "ready";
        return true;
      } catch (error) {
        state.error = error.phaseBPreviewTimeout ? errorPresentation(error, "preview_timeout") : errorPresentation(error, "preview");
        return false;
      } finally {
        state.pendingAction = null;
        publish();
      }
    }

    function showPlanB() { return requestPreview(state.preferences); }

    async function togglePreference(preference) {
      if (PREFERENCES.indexOf(preference) === -1 || state.pendingAction) return false;
      var next = state.preferences.slice();
      var index = next.indexOf(preference);
      if (index === -1) {
        if (next.length >= 3) return false;
        next.push(preference);
      } else next.splice(index, 1);
      return requestPreview(next);
    }

    function selectCandidate(candidateId) {
      if (state.pendingAction || !state.model || !state.model.candidates.some(function exists(candidate) { return candidate.id === candidateId; })) return false;
      state.selectedCandidateId = candidateId;
      state.applyIntent = null;
      publish();
      return true;
    }

    async function apply() {
      if (state.pendingAction || !state.model || !state.model.proposalId || !state.selectedCandidateId) return false;
      var selected = state.model.candidates.some(function exists(candidate) { return candidate.id === state.selectedCandidateId; });
      if (!selected) return false;
      if (!state.applyIntent || state.applyIntent.proposalId !== state.model.proposalId || state.applyIntent.candidateId !== state.selectedCandidateId) {
        state.applyIntent = { proposalId: state.model.proposalId, candidateId: state.selectedCandidateId, key: createIdempotencyKey(randomBytes) };
      }
      var intent = state.applyIntent;
      state.pendingAction = "apply";
      state.error = null;
      publish();
      try {
        await api.applyPlanB(state.tripId, { proposalId: intent.proposalId, candidateId: intent.candidateId }, intent.key);
        await loadCanonicalTrip();
        return true;
      } catch (error) {
        if (error && error.status === 409) {
          try { await loadCanonicalTrip(); } catch (reloadError) { state.status = "error"; }
        }
        state.error = errorPresentation(error, "apply");
        return false;
      } finally {
        state.pendingAction = null;
        publish();
      }
    }

    async function revert() {
      if (state.pendingAction || !state.model || state.model.stage !== "applied") return false;
      state.pendingAction = "revert";
      state.error = null;
      publish();
      try {
        await api.revertPlanB(state.tripId);
        await loadCanonicalTrip();
        return true;
      } catch (error) {
        if (error && error.status === 409) {
          try { await loadCanonicalTrip(); } catch (reloadError) { state.status = "error"; }
        }
        state.error = errorPresentation(error, "revert");
        return false;
      } finally {
        state.pendingAction = null;
        publish();
      }
    }

    return Object.freeze({
      start: start,
      triggerDemoDisruption: triggerDemoDisruption,
      showPlanB: showPlanB,
      togglePreference: togglePreference,
      selectCandidate: selectCandidate,
      apply: apply,
      revert: revert,
      getState: getState
    });
  }

  function boot() {
    if (!root.document || !root.SmartWorkspaceRenderer || !root.SmartWorkspaceViewModel) return;
    var rootElement = root.document.getElementById("smart-workspace-root");
    if (!rootElement) return;
    var params = new URLSearchParams(root.location.search);
    var environment = runtimeEnvironment(
      root.document.body.getAttribute("data-app-environment"),
      params.get("env"),
      root.location.hostname
    );
    var supplied = resolveSmartWorkspaceInput({
      env: environment, preview: params.get("preview"), smartState: params.get("smartState"), supplied: root.__SMART_WORKSPACE_VIEW_MODEL__ || null
    });
    if (supplied) {
      root.document.body.classList.add("smart-workspace-production");
      root.SmartWorkspaceRenderer.mount(
        rootElement,
        root.SmartWorkspaceViewModel.buildSmartWorkspaceViewModel(supplied),
        { presentation: {
          selectedCandidateId: params.get("smartState") === "impact" ? "candidate-a" : null,
          preferences: supplied.preferences || [],
          pendingAction: null,
          error: null,
          impact: supplied.impact || null
        } }
      );
      return;
    }

    root.document.body.classList.add("smart-workspace-production");
    var surface = null;
    var controller = createController({
      tripId: parseTripId(root.location.search),
      api: root.TravelApi,
      viewModel: root.SmartWorkspaceViewModel,
      render: function renderProduction(model, presentation) {
        if (!surface) {
          surface = root.SmartWorkspaceRenderer.mount(rootElement, model, {
            presentation: presentation,
            onAction: function onAction(action, value) {
              if (action === "demo-disruption") controller.triggerDemoDisruption();
              if (action === "show-plan-b" || action === "retry-preview") controller.showPlanB();
              if (action === "select") controller.selectCandidate(value);
              if (action === "preference") controller.togglePreference(value);
              if (action === "apply") controller.apply();
              if (action === "revert") controller.revert();
              if (action === "retry-load") controller.start();
            }
          });
        } else surface.update(model, presentation);
      }
    });
    root.SmartWorkspaceController = controller;
    controller.start();
  }

  if (root.document) root.document.addEventListener("DOMContentLoaded", boot);

  return {
    isSmartWorkspacePreview: isSmartWorkspacePreview,
    previewMock: previewMock,
    resolveSmartWorkspaceInput: resolveSmartWorkspaceInput,
    runtimeEnvironment: runtimeEnvironment,
    parseTripId: parseTripId,
    errorPresentation: errorPresentation,
    createController: createController,
    boot: boot
  };
}));

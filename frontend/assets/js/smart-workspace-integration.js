(function smartWorkspaceIntegrationModule(root, factory) {
  "use strict";

  var api = factory(root || {});
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SmartWorkspaceIntegration = api;
}(typeof window !== "undefined" ? window : globalThis, function smartWorkspaceIntegrationFactory(root) {
  "use strict";

  var PREVIEW_STAGES = ["normal", "disruption", "planb", "impact", "applied"];

  function isSmartWorkspacePreview(params) {
    return !!params &&
      (params.env === "development" || params.env === "test") &&
      params.preview === "smart-workspace";
  }

  function previewCandidates() {
    return [
      {
        id: "candidate-a",
        from: "Москва → Санкт-Петербург",
        departure: { time: "15:40", place: "Москва" },
        arrival: { time: "17:20", place: "Санкт-Петербург" },
        duration: "1ч 40м",
        transfers: "Без пересадок",
        price: 7150,
        carrierName: null,
        serviceNumber: null,
        availability: "available"
      },
      {
        id: "candidate-b",
        from: "Москва → Санкт-Петербург",
        departure: { time: "18:20", place: "Москва" },
        arrival: { time: "20:05", place: "Санкт-Петербург" },
        duration: "1ч 45м",
        transfers: "Без пересадок",
        price: 8900,
        carrierName: null,
        serviceNumber: null,
        availability: "available"
      },
      {
        id: "candidate-c",
        from: "Москва → Санкт-Петербург",
        departure: { time: "16:10", place: "Москва" },
        arrival: { time: "21:35", place: "Санкт-Петербург" },
        duration: "5ч 25м",
        transfers: "1 пересадка",
        price: 5240,
        carrierName: null,
        serviceNumber: null,
        availability: "available"
      }
    ];
  }

  function previewMock(requestedStage) {
    var stage = PREVIEW_STAGES.indexOf(requestedStage) !== -1 ? requestedStage : "normal";
    var isDisrupted = stage !== "normal";
    return {
      stage: stage,
      trip: {
        id: "preview-flight",
        route: "Москва → Санкт-Петербург",
        dateLabel: "15 августа · перелёт · в одну сторону · 1 взрослый",
        departure: { date: "15 авг, пт", time: "12:30", place: "Москва" },
        arrival: { date: "15 авг, пт", time: "14:05", place: "Санкт-Петербург" },
        duration: "1ч 35м",
        nextEvent: "Вылет · 15 авг, 12:30 · Москва"
      },
      disruption: isDisrupted ? {
        type: "CARRIER_CANCELLED",
        source: "DEMO_SIMULATION",
        impact: "Этот вариант перелёта больше недоступен. Нужно подобрать новый вариант поездки."
      } : null,
      candidates: isDisrupted ? previewCandidates() : [],
      ranking: {
        fastest: { status: "available", candidateId: "candidate-a" },
        cheapest: { status: "available", candidateId: "candidate-c" },
        personalized: { status: "available", candidateId: "candidate-c", reasons: ["минимальная цена"] }
      },
      preferences: stage === "planb" || stage === "impact" || stage === "applied" ? ["Дешевле"] : [],
      impact: {
        candidateId: "candidate-a",
        arrivalAt: "17:20",
        arrivalDeltaMinutes: 195,
        duration: "1ч 40м",
        durationMinutes: 100,
        durationDeltaMinutes: 5,
        transferCount: 0,
        transferCountDelta: 0,
        price: 7150,
        priceDelta: null,
        priceDeltaStatus: "unavailable"
      },
      apply: { status: stage === "applied" ? "applied" : "idle" },
      revert: { status: stage === "applied" ? "available" : "disabled" },
      documents: [],
      contextRows: []
    };
  }

  function resolveSmartWorkspaceInput(options) {
    var input = options || {};
    if (input.supplied) return input.supplied;
    return isSmartWorkspacePreview(input) ? previewMock(input.smartState) : null;
  }

  function boot() {
    if (!root.document || !root.SmartWorkspaceRenderer || !root.SmartWorkspaceViewModel) return;
    var rootElement = root.document.getElementById("smart-workspace-root");
    if (!rootElement) return;

    var params = new URLSearchParams(root.location.search);
    var input = resolveSmartWorkspaceInput({
      env: root.document.body.getAttribute("data-app-environment"),
      preview: params.get("preview"),
      smartState: params.get("smartState"),
      supplied: root.__SMART_WORKSPACE_VIEW_MODEL__ || null
    });
    if (!input) return;

    root.SmartWorkspaceRenderer.mount(
      rootElement,
      root.SmartWorkspaceViewModel.buildSmartWorkspaceViewModel(input)
    );
  }

  if (root.document) {
    root.document.addEventListener("DOMContentLoaded", boot);
  }

  return {
    isSmartWorkspacePreview: isSmartWorkspacePreview,
    previewMock: previewMock,
    resolveSmartWorkspaceInput: resolveSmartWorkspaceInput,
    boot: boot
  };
}));

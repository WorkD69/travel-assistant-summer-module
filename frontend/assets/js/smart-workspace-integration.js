(function smartWorkspaceIntegrationModule(root, factory) {
  "use strict";

  var api = factory(root || {});
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SmartWorkspaceIntegration = api;
}(typeof window !== "undefined" ? window : globalThis, function smartWorkspaceIntegrationFactory(root) {
  "use strict";

  function isSmartWorkspacePreview(params) {
    return !!params &&
      (params.env === "development" || params.env === "test") &&
      params.preview === "smart-workspace";
  }

  function previewMock() {
    return {
      trip: {
        id: "preview-flight",
        route: "Москва → Санкт-Петербург",
        dateLabel: "15 августа · перелёт · в одну сторону · 1 взрослый",
        departure: { date: "15 авг, пт", time: "12:30", place: "Москва" },
        arrival: { date: "15 авг, пт", time: "14:05", place: "Санкт-Петербург" },
        duration: "1ч 35м"
      },
      disruption: null,
      candidates: [],
      ranking: {},
      documents: [],
      contextRows: []
    };
  }

  function resolveSmartWorkspaceInput(options) {
    var input = options || {};
    if (input.supplied) return input.supplied;
    return isSmartWorkspacePreview(input) ? previewMock() : null;
  }

  function boot() {
    if (!root.document || !root.SmartWorkspaceRenderer || !root.SmartWorkspaceViewModel) return;
    var rootElement = root.document.getElementById("smart-workspace-root");
    if (!rootElement) return;

    var params = new URLSearchParams(root.location.search);
    var input = resolveSmartWorkspaceInput({
      env: root.document.body.getAttribute("data-app-environment"),
      preview: params.get("preview"),
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

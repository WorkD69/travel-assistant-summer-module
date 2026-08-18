(function smartWorkspaceViewModelModule(root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SmartWorkspaceViewModel = api;
}(typeof window !== "undefined" ? window : globalThis, function smartWorkspaceViewModelFactory() {
  "use strict";

  var RANKING_LABELS = ["fastest", "cheapest", "personalized"];

  function normalizeCandidate(candidate) {
    return Object.assign({
      id: "",
      carrierName: null,
      serviceNumber: null,
      price: null,
      availability: null,
      rankingLabels: []
    }, candidate || {});
  }

  function labelsByCandidate(candidates, ranking) {
    var labels = {};
    candidates.forEach(function addCandidate(candidate) {
      labels[candidate.id] = [];
    });

    RANKING_LABELS.forEach(function addRankingLabel(label) {
      var reference = ranking && ranking[label];
      if (reference && reference.status === "available" && labels[reference.candidateId]) {
        labels[reference.candidateId].push(label);
      }
    });

    return labels;
  }

  function buildSmartWorkspaceViewModel(input) {
    var source = input || {};
    var candidates = (Array.isArray(source.candidates) ? source.candidates : []).map(normalizeCandidate);
    var labels = labelsByCandidate(candidates, source.ranking || {});

    return Object.assign({
      trip: {},
      disruption: null,
      ranking: {},
      preferences: [],
      impact: null,
      apply: { status: "idle" },
      revert: { status: "disabled" },
      documents: [],
      contextRows: [],
      selectedCandidateId: null
    }, source, {
      candidates: candidates.map(function attachLabels(candidate) {
        return Object.assign({}, candidate, { rankingLabels: labels[candidate.id] || [] });
      }),
      selectedCandidateId: null
    });
  }

  return {
    buildSmartWorkspaceViewModel: buildSmartWorkspaceViewModel,
    labelsByCandidate: labelsByCandidate,
    normalizeCandidate: normalizeCandidate
  };
}));

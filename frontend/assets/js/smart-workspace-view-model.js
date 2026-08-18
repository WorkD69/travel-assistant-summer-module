(function smartWorkspaceViewModelModule(root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SmartWorkspaceViewModel = api;
}(typeof window !== "undefined" ? window : globalThis, function smartWorkspaceViewModelFactory() {
  "use strict";

  var RANKING_LABELS = ["fastest", "cheapest", "personalized"];
  var MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

  function asArray(value) { return Array.isArray(value) ? value : []; }

  function parseObject(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
    if (typeof value !== "string") return null;
    try {
      var parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch (error) { return null; }
  }

  function isoTime(value) {
    var match = String(value || "").match(/T(\d{2}:\d{2})/);
    return match ? match[1] : "";
  }

  function shortDate(value) {
    var match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? Number(match[3]) + " " + MONTHS[Number(match[2]) - 1] : "";
  }

  function formatDuration(minutes) {
    var value = Number(minutes);
    if (!Number.isFinite(value) || value < 0) return "";
    var rounded = Math.round(value);
    var hours = Math.floor(rounded / 60);
    var remainder = rounded % 60;
    return (hours ? hours + "ч" : "") + (hours && remainder ? " " : "") + (remainder ? remainder + "м" : "");
  }

  function transferLabel(count) {
    if (!Number.isInteger(count) || count < 0) return "";
    if (count === 0) return "Без пересадок";
    return count + (count === 1 ? " пересадка" : " пересадки");
  }

  function durationFromSegments(segments) {
    if (!segments.length) return null;
    var start = new Date(segments[0].departureAt).getTime();
    var end = new Date(segments[segments.length - 1].arrivalAt).getTime();
    return Number.isNaN(start) || Number.isNaN(end) || end < start ? null : Math.round((end - start) / 60000);
  }

  function matchingDemoDisruption(trip) {
    var signals = asArray(trip && trip.monitoringSignals);
    for (var index = 0; index < signals.length; index += 1) {
      var signal = signals[index];
      if (!signal || signal.category !== "plan_b_disruption" || signal.source !== "DEMO_SIMULATION" || signal.status !== "active") continue;
      var detail = parseObject(signal.detail) || {};
      return {
        id: signal.id || null,
        type: detail.type || "CARRIER_CANCELLED",
        source: signal.source,
        occurredAt: detail.occurredAt || null,
        segmentId: detail.segmentId || signal.segment || null,
        note: detail.note || null,
        impact: "Этот вариант поездки больше недоступен. Нужно подобрать новый вариант поездки."
      };
    }
    return null;
  }

  function tripPresentation(trip) {
    var canonical = trip || {};
    var segments = asArray(canonical.segments).slice();
    var first = segments[0] || {};
    var last = segments[segments.length - 1] || {};
    var dateParts = [shortDate(canonical.startDate || first.departureAt)];
    if (canonical.type === "solo") dateParts.push("1 взрослый");
    return {
      id: canonical.id || "",
      title: canonical.title || "",
      route: canonical.route || "",
      dateLabel: dateParts.filter(Boolean).join(" · "),
      departure: { date: shortDate(first.departureAt), time: isoTime(first.departureAt), place: first.departurePlace || "" },
      arrival: { date: shortDate(last.arrivalAt), time: isoTime(last.arrivalAt), place: last.arrivalPlace || "" },
      duration: formatDuration(durationFromSegments(segments)),
      nextEvent: first.departureAt ? ["Отправление", shortDate(first.departureAt), isoTime(first.departureAt), first.departurePlace].filter(Boolean).join(" · ") : "",
      timeline: segments.reduce(function buildTimeline(rows, segment) {
        if (segment.departureAt || segment.departurePlace) rows.push({ time: isoTime(segment.departureAt), label: ["Отправление", segment.departurePlace].filter(Boolean).join(" · ") });
        if (segment.arrivalAt || segment.arrivalPlace) rows.push({ time: isoTime(segment.arrivalAt), label: ["Прибытие", segment.arrivalPlace].filter(Boolean).join(" · ") });
        return rows;
      }, [])
    };
  }

  function normalizeDocuments(documents) {
    return asArray(documents).map(function mapDocument(document) {
      return { id: document && document.id || "", title: document && (document.title || document.name) || "Документ" };
    });
  }

  function projectCanonicalTrip(trip) {
    var canonical = trip || {};
    var disruption = matchingDemoDisruption(canonical);
    var activeApply = canonical.activePlanBApply || null;
    var presentationTrip = tripPresentation(canonical);
    return {
      stage: activeApply ? "applied" : (disruption ? "disruption" : "normal"),
      trip: presentationTrip,
      canonicalTrip: canonical,
      disruption: activeApply ? null : disruption,
      candidates: [],
      ranking: {},
      preferences: [],
      impact: null,
      proposalId: null,
      apply: activeApply ? {
        status: "applied",
        applyId: activeApply.applyId,
        proposalId: activeApply.proposalId,
        candidateId: activeApply.candidateId,
        optionId: activeApply.optionId,
        appliedAt: activeApply.appliedAt
      } : { status: "idle" },
      revert: { status: activeApply ? "available" : "disabled" },
      appliedTrip: activeApply ? presentationTrip : null,
      documents: normalizeDocuments(canonical.documents),
      contextRows: []
    };
  }

  function normalizeCandidate(candidate) {
    var source = candidate || {};
    var option = source.option || {};
    var segments = asArray(option.segments);
    var first = segments[0] || {};
    var last = segments[segments.length - 1] || {};
    return {
      id: source.candidateId || source.id || "",
      optionId: option.id || null,
      from: [first.departurePlace, last.arrivalPlace].filter(Boolean).join(" → "),
      departure: { date: shortDate(first.departureAt), time: isoTime(first.departureAt), place: first.departurePlace || "" },
      arrival: { date: shortDate(last.arrivalAt), time: isoTime(last.arrivalAt), place: last.arrivalPlace || "" },
      duration: formatDuration(option.durationMinutes),
      durationMinutes: Number.isFinite(option.durationMinutes) ? option.durationMinutes : null,
      transfers: transferLabel(option.transferCount),
      transferCount: Number.isInteger(option.transferCount) ? option.transferCount : null,
      price: option.price || null,
      carrierName: first.carrierName || null,
      serviceNumber: first.serviceNumber || null,
      availability: option.availability || null,
      impact: source.impact || null,
      rankingLabels: []
    };
  }

  function labelsByCandidate(candidates, ranking) {
    var labels = {};
    candidates.forEach(function addCandidate(candidate) { labels[candidate.id] = []; });
    RANKING_LABELS.forEach(function addRankingLabel(label) {
      var reference = ranking && ranking[label];
      if (reference && reference.status === "available" && labels[reference.candidateId]) labels[reference.candidateId].push(label);
    });
    return labels;
  }

  function mergePlanBPreview(baseModel, preview) {
    var response = preview || {};
    var candidates = asArray(response.candidates).map(normalizeCandidate);
    var ranking = {
      fastest: response.fastest || { status: "unavailable" },
      cheapest: response.cheapest || { status: "unavailable" },
      personalized: response.personalized || { status: "unavailable" }
    };
    var labels = labelsByCandidate(candidates, ranking);
    return Object.assign({}, baseModel || {}, {
      stage: "planb",
      disruption: response.disruption || (baseModel && baseModel.disruption) || null,
      proposalId: response.proposalId || null,
      ranking: ranking,
      candidates: candidates.map(function attachLabels(candidate) {
        return Object.assign({}, candidate, { rankingLabels: labels[candidate.id] || [] });
      }),
      impact: null
    });
  }

  function buildSmartWorkspaceViewModel(input) {
    var source = input || {};
    if (source.canonicalTrip) return projectCanonicalTrip(source.canonicalTrip);
    var candidates = asArray(source.candidates).map(function normalizePresentationCandidate(candidate) {
      return Object.assign({ id: "", carrierName: null, serviceNumber: null, price: null, availability: null, rankingLabels: [] }, candidate || {});
    });
    var labels = labelsByCandidate(candidates, source.ranking || {});
    return Object.assign({
      trip: {}, disruption: null, ranking: {}, preferences: [], impact: null,
      apply: { status: "idle" }, revert: { status: "disabled" }, documents: [], contextRows: [], selectedCandidateId: null
    }, source, {
      candidates: candidates.map(function attachLabels(candidate) {
        return Object.assign({}, candidate, { rankingLabels: labels[candidate.id] || candidate.rankingLabels || [] });
      }),
      selectedCandidateId: null
    });
  }

  return {
    buildSmartWorkspaceViewModel: buildSmartWorkspaceViewModel,
    projectCanonicalTrip: projectCanonicalTrip,
    mergePlanBPreview: mergePlanBPreview,
    matchingDemoDisruption: matchingDemoDisruption,
    labelsByCandidate: labelsByCandidate,
    normalizeCandidate: normalizeCandidate,
    tripPresentation: tripPresentation
  };
}));

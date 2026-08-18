(function smartWorkspaceRendererModule(root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SmartWorkspaceRenderer = api;
}(typeof window !== "undefined" ? window : globalThis, function smartWorkspaceRendererFactory() {
  "use strict";

  var LABELS = {
    fastest: "⚡ БЫСТРЕЕ ВСЕГО",
    cheapest: "💰 ДЕШЕВЛЕ ВСЕГО",
    personalized: "✨ ДЛЯ ВАС"
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function replaceCharacter(character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character];
    });
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function createPresentationState() {
    return {
      selectedCandidateId: null,
      preferences: [],
      applied: false,
      revertStatus: "disabled"
    };
  }

  function selectCandidate(state, candidateId) {
    return Object.assign({}, state || createPresentationState(), {
      selectedCandidateId: candidateId || null
    });
  }

  function togglePreference(state, preference) {
    var current = asArray(state && state.preferences);
    var exists = current.indexOf(preference) !== -1;
    var next = exists ? current.filter(function removeValue(value) { return value !== preference; }) : current.concat([preference]).slice(0, 3);
    return Object.assign({}, state || createPresentationState(), { preferences: next });
  }

  function formatPrice(price) {
    if (price === null || price === undefined || price === "") return "Цена не указана";
    var numeric = Number(price);
    return Number.isFinite(numeric) ? numeric.toLocaleString("ru-RU") + " ₽" : escapeHtml(price);
  }

  function formatDelta(minutes) {
    if (minutes === null || minutes === undefined) return "Недоступно";
    if (Number(minutes) === 0) return "без изменений";
    var absolute = Math.abs(Number(minutes));
    var hours = Math.floor(absolute / 60);
    var remainder = absolute % 60;
    var duration = (hours ? hours + "ч " : "") + (remainder ? remainder + "м" : "");
    return (Number(minutes) > 0 ? "+" : "−") + duration.trim();
  }

  function labelMarkup(labels) {
    return asArray(labels).map(function renderLabel(label) {
      return LABELS[label] ? '<span class="smart-workspace__ranking smart-workspace__ranking--' + escapeHtml(label) + '">' + LABELS[label] + "</span>" : "";
    }).join("");
  }

  function candidateTitle(candidate) {
    var descriptor = [candidate.carrierName, candidate.serviceNumber].filter(Boolean).join(" · ");
    if (descriptor) return descriptor;
    return "Рейс · " + escapeHtml(candidate.from || "Маршрут уточняется");
  }

  function routeFactsMarkup(trip) {
    var departure = trip.departure || {};
    var arrival = trip.arrival || {};
    return '<section class="smart-workspace__native-card smart-workspace__route-facts" aria-label="Факты поездки">' +
      '<div><span>' + escapeHtml(departure.date || "") + '</span><strong>' + escapeHtml(departure.time || "—") + '</strong><small>' + escapeHtml(departure.place || "") + '</small></div>' +
      '<div><span>' + escapeHtml(arrival.date || "") + '</span><strong>' + escapeHtml(arrival.time || "—") + '</strong><small>' + escapeHtml(arrival.place || "") + '</small></div>' +
      '<div class="smart-workspace__duration"><strong>' + escapeHtml(trip.duration || "") + '</strong><small>время местное</small></div>' +
      '</section>';
  }

  function normalStatusMarkup(model) {
    var trip = model.trip || {};
    return '<section class="smart-workspace__status smart-workspace__status--normal">' +
      '<div class="smart-workspace__status-head"><span>✨ СОПРОВОЖДЕНИЕ ПОЕЗДКИ</span><button type="button" class="smart-workspace__minor-action" data-smart-action="companion">Спросить AI</button></div>' +
      '<h2>Всё идёт по плану</h2><p>Следующее событие</p><strong>' + escapeHtml(trip.nextEvent || "События появятся, когда они будут переданы поездкой") + '</strong>' +
      '<div class="smart-workspace__progress" aria-hidden="true"><span></span></div><small>' + escapeHtml(trip.route || "") + '</small>' +
      '</section>';
  }

  function disruptionMarkup(disruption) {
    var impact = disruption && disruption.impact ? disruption.impact : "Этот вариант поездки больше недоступен. Нужно подобрать новый вариант поездки.";
    return '<div class="smart-workspace__section-label"><span>✨ СОПРОВОЖДЕНИЕ ПОЕЗДКИ</span></div>' +
      '<section class="smart-workspace__status smart-workspace__status--disruption">' +
      '<span class="smart-workspace__eyebrow">⚠ ДЕМО-СОБЫТИЕ</span><h2>Поездка изменилась</h2><h3>Рейс отменён</h3>' +
      '<p>' + escapeHtml(impact) + '</p><div class="smart-workspace__actions"><button type="button" class="smart-workspace__primary-action" data-smart-action="show-plan-b">Найти Plan B</button><button type="button" class="smart-workspace__secondary-action" data-smart-action="companion">Спросить AI</button></div>' +
      '<small>Симулированное событие демо-режима</small></section>';
  }

  function timelineMarkup(model) {
    var trip = model.trip || {};
    var isCancelled = model.disruption && model.disruption.type === "CARRIER_CANCELLED";
    var rows = asArray(trip.timeline);
    if (!rows.length) {
      rows = [
        { time: trip.departure && trip.departure.time, label: "Вылет · " + ((trip.departure && trip.departure.place) || "") },
        { time: trip.arrival && trip.arrival.time, label: "Прибытие · " + ((trip.arrival && trip.arrival.place) || "") }
      ];
    }
    return '<section class="smart-workspace__native-card smart-workspace__timeline"><div class="smart-workspace__card-heading"><h2>Таймлайн поездки</h2>' + (isCancelled ? '<span>⚠ рейс отменён</span>' : "") + '</div>' +
      rows.map(function renderRow(row) {
        return '<div class="smart-workspace__timeline-row' + (isCancelled ? ' is-cancelled' : '') + '"><time>' + escapeHtml(row.time || "—") + '</time><span class="smart-workspace__timeline-dot" aria-hidden="true"></span><div>' + escapeHtml(row.label || "") + (isCancelled ? '<em>не состоится</em>' : "") + '</div></div>';
      }).join("") +
      '<p class="smart-workspace__card-note">Заселение и события появляются в таймлайне, только если они есть в поездке.</p></section>';
  }

  function factualPanelMarkup(kind, title, factual) {
    if (!factual) return "";
    var detail = factual.detail || factual.summary || factual.description || factual.label || "";
    return '<section class="smart-workspace__native-card smart-workspace__presentation-card smart-workspace__presentation-card--' + kind + '"><h2>' + escapeHtml(title) + '</h2>' + (detail ? '<p class="smart-workspace__factual-panel-copy">' + escapeHtml(detail) + '</p>' : "") + '</section>';
  }

  function documentsMarkup(documents) {
    if (!documents.length) return "";
    return '<section class="smart-workspace__native-card smart-workspace__documents"><h2>Документы поездки</h2><ul>' + documents.map(function renderDocument(document) { return '<li>' + escapeHtml(document.title || document.name || "Документ") + '</li>'; }).join("") + '</ul></section>';
  }

  function companionMarkup(disrupted) {
    return '<section class="smart-workspace__companion"><span>✨ AI-ПОМОЩНИК</span><h2>' + (disrupted ? "Я уже знаю, что рейс отменён" : "Я знаю контекст этой поездки") + '</h2><p>' + (disrupted ? "Спросите, какие варианты есть, или попросите разобрать их за вас." : "Спросите про поездку, время в пути или что делать, если что-то изменится.") + '</p><button type="button" class="smart-workspace__secondary-action" data-smart-action="companion">Спросить о поездке</button></section>';
  }

  function candidateMarkup(candidate, state) {
    var selected = state.selectedCandidateId === candidate.id;
    var labels = asArray(candidate.rankingLabels);
    var cardClass = "smart-workspace__candidate" + (labels.indexOf("fastest") !== -1 ? " is-fastest" : "") + (labels.indexOf("cheapest") !== -1 ? " is-cheapest" : "") + (labels.indexOf("personalized") !== -1 ? " is-personalized" : "") + (selected ? " is-selected" : "");
    var departure = candidate.departure || {};
    var arrival = candidate.arrival || {};
    return '<article class="' + cardClass + '">' + (selected ? '<div class="smart-workspace__selected-banner">✓ Вы выбрали этот вариант</div>' : "") + labelMarkup(labels) +
      '<p class="smart-workspace__candidate-title">' + candidateTitle(candidate) + '</p><div class="smart-workspace__candidate-times"><strong>' + escapeHtml(departure.time || "—") + '</strong><span>→</span><strong>' + escapeHtml(arrival.time || "—") + '</strong></div>' +
      '<div class="smart-workspace__candidate-places"><span>' + escapeHtml(departure.place || "") + '</span><span>' + escapeHtml(arrival.place || "") + '</span></div>' +
      '<dl><div><dt>В пути</dt><dd>' + escapeHtml(candidate.duration || "Недоступно") + '</dd></div><div><dt>Пересадки</dt><dd>' + escapeHtml(candidate.transfers || "Недоступно") + '</dd></div><div><dt>Цена</dt><dd>' + formatPrice(candidate.price) + '</dd></div></dl>' +
      '<button type="button" class="smart-workspace__candidate-action" data-smart-action="select" data-candidate-id="' + escapeHtml(candidate.id) + '"' + (selected ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + (selected ? "Выбрано вами" : "Выбрать этот вариант") + '</button><small>Кандидат получен через Tutu MCP</small></article>';
  }

  function preferencesMarkup(state) {
    var choices = ["Быстрее", "Дешевле", "Меньше пересадок"];
    return '<section class="smart-workspace__preferences"><span>✨ ПРЕДПОЧТЕНИЯ</span><h2>Что для вас важнее в этой поездке?</h2><div class="smart-workspace__chips">' + choices.map(function renderChoice(choice) {
      var chosen = state.preferences.indexOf(choice) !== -1;
      return '<button type="button" class="smart-workspace__chip' + (chosen ? ' is-active' : '') + '" data-smart-action="preference" data-preference="' + choice + '" aria-pressed="' + chosen + '">' + (chosen ? "✓ " : "") + choice + '</button>';
    }).join("") + '</div><p>Выберите от одного до трёх. Рекомендации поступают из данных поездки.</p></section>';
  }

  function planBMarkup(model, state) {
    var candidates = asArray(model.candidates);
    return '<section class="smart-workspace__plan-b"><div class="smart-workspace__demo-reminder"><strong>⚠ ДЕМО-СОБЫТИЕ</strong><span>Рейс отменён. Ниже — варианты из переданных данных.</span></div><div class="smart-workspace__section-heading"><h2>Варианты поездки · ' + candidates.length + '</h2><span>Кандидаты и порядок получены через Tutu MCP</span></div>' +
      (candidates.length ? '<div class="smart-workspace__candidate-grid">' + candidates.map(function renderCandidate(candidate) { return candidateMarkup(candidate, state); }).join("") + '</div>' : '<div class="smart-workspace__empty-state">Варианты пока не переданы.</div>') + preferencesMarkup(state) + impactMarkup(model, state) + applyMarkup(model, state) + '</section>';
  }

  function impactMarkup(model, state) {
    var impact = model.impact;
    if (!impact || !state.selectedCandidateId || impact.candidateId !== state.selectedCandidateId) return "";
    var priceComparison = impact.priceDelta === null || impact.priceDeltaStatus === "unavailable" ? "Сравнение с исходной ценой недоступно" : escapeHtml(impact.priceDelta);
    return '<section class="smart-workspace__impact"><span>✨ ОБЪЯСНЕНИЕ</span><h2>Что изменится</h2><p>Прибытие сдвигается на ' + formatDelta(impact.arrivalDeltaMinutes) + '.</p><dl><div><dt>Прибытие</dt><dd>' + escapeHtml(impact.arrivalAt || "Недоступно") + '</dd><em>' + formatDelta(impact.arrivalDeltaMinutes) + '</em></div><div><dt>В пути</dt><dd>' + escapeHtml(impact.duration || (impact.durationMinutes ? formatDelta(impact.durationMinutes) : "Недоступно")) + '</dd><em>' + formatDelta(impact.durationDeltaMinutes) + '</em></div><div><dt>Пересадки</dt><dd>' + escapeHtml(impact.transferCount == null ? "Недоступно" : impact.transferCount) + '</dd><em>' + formatDelta(impact.transferCountDelta) + '</em></div><div><dt>Цена нового варианта</dt><dd>' + formatPrice(impact.price) + '</dd><em>' + priceComparison + '</em></div></dl>' + contextRowsMarkup(model.contextRows) + '</section>';
  }

  function contextRowsMarkup(contextRows) {
    if (!asArray(contextRows).length) return '<p class="smart-workspace__card-note">Заселение, багаж, компенсации и события не оцениваются, если данных нет в поездке.</p>';
    return '<ul class="smart-workspace__context-rows">' + contextRows.map(function renderContext(row) { return '<li><strong>' + escapeHtml(row.label) + '</strong><span>' + escapeHtml(row.value) + '</span></li>'; }).join("") + '</ul>';
  }

  function applyMarkup(model, state) {
    var selected = asArray(model.candidates).filter(function findCandidate(candidate) { return candidate.id === state.selectedCandidateId; })[0];
    return '<section class="smart-workspace__apply" aria-label="Применение Plan B"><div><span>ГОТОВ К ПРИМЕНЕНИЮ</span><strong>' + escapeHtml(selected ? ((model.trip && model.trip.route) || "Вариант выбран") : "Выберите вариант") + '</strong><p>Маршрут поездки в Travel Assistant будет обновлён. Переоформление у перевозчика не выполняется.</p></div><button type="button" class="smart-workspace__apply-button" data-smart-action="apply"' + (selected ? "" : " disabled") + '>Применить Plan B</button></section>';
  }

  function revertStatusCopy(status) {
    return {
      available: "Предыдущий вариант можно вернуть",
      pending: "Возврат обрабатывается",
      success: "Предыдущий вариант возвращён",
      already_reverted: "Предыдущий вариант уже возвращён",
      nothing_applied: "Нет применённого варианта для возврата",
      conflict: "Возврат недоступен: состояние изменилось"
    }[status] || "";
  }

  function afterApplyMarkup(model, state) {
    var appliedTrip = model.appliedTrip || model.trip || {};
    var apply = model.apply || {};
    var candidateId = state.selectedCandidateId || apply.candidateId || null;
    var selected = asArray(model.candidates).filter(function findCandidate(candidate) { return candidate.id === candidateId; })[0] || {};
    var departure = selected.departure || {};
    var arrival = selected.arrival || {};
    var status = state.applied
      ? (state.revertStatus || (model.revert && model.revert.status) || "disabled")
      : ((model.revert && model.revert.status) || state.revertStatus || "disabled");
    var statusCopy = revertStatusCopy(status);
    var disabled = status === "disabled" || status === "pending" || status === "success" || status === "already_reverted" || status === "nothing_applied" || status === "conflict";
    return '<section class="smart-workspace__applied"><span>✓ PLAN B ПРИМЕНЁН</span><h2>Маршрут обновлён</h2><div class="smart-workspace__applied-route"><span>АКТУАЛЬНЫЙ МАРШРУТ</span><strong>' + escapeHtml(appliedTrip.route || "Маршрут уточняется") + '</strong><p>' + escapeHtml(appliedTrip.dateLabel || "") + '</p><div><b>' + escapeHtml(departure.time || "—") + '</b><i>' + escapeHtml(departure.place || "") + '</i><em>→</em><b>' + escapeHtml(arrival.time || "—") + '</b><i>' + escapeHtml(arrival.place || "") + '</i></div><small>' + escapeHtml(selected.duration || "") + (selected.transfers ? " · " + escapeHtml(selected.transfers) : "") + '</small></div><p>Переоформление у перевозчика не выполнялось.</p><div class="smart-workspace__history"><span>Демо-событие</span><span>Кандидаты</span><span>Предпочтения</span><strong>Применён Plan B</strong></div><button type="button" class="smart-workspace__revert" data-smart-action="revert"' + (disabled ? " disabled" : "") + '>Вернуть предыдущий вариант</button>' + (statusCopy ? '<small>' + escapeHtml(statusCopy) + '</small>' : "") + '</section>';
  }

  function renderMarkup(model, state) {
    var safeModel = model || {};
    var safeState = state || createPresentationState();
    var trip = safeModel.trip || {};
    var disrupted = safeModel.disruption && safeModel.disruption.type === "CARRIER_CANCELLED";
    var showPlanB = safeModel.stage === "planb" || safeModel.stage === "impact";
    if (safeState.applied || safeModel.stage === "applied") {
      return '<section class="smart-workspace" aria-label="Сопровождение поездки">' + afterApplyMarkup(safeModel, safeState) + documentsMarkup(asArray(safeModel.documents)) + '</section>';
    }
    return '<section class="smart-workspace" aria-label="Сопровождение поездки"><header class="smart-workspace__header"><div><h1>' + escapeHtml(trip.route || "Поездка") + '</h1><p>' + escapeHtml(trip.dateLabel || "") + '</p></div><span class="smart-workspace__trip-badge">' + (disrupted ? "⚠ Требуется внимание" : "✨ Сопровождение включено") + '</span></header>' + routeFactsMarkup(trip) + (disrupted ? disruptionMarkup(safeModel.disruption) : normalStatusMarkup(safeModel)) + '<div class="smart-workspace__module-grid">' + factualPanelMarkup("map", "Карта маршрута", safeModel.map) + timelineMarkup(safeModel) + factualPanelMarkup("weather", "Погода", safeModel.weather) + documentsMarkup(asArray(safeModel.documents)) + '</div>' + (showPlanB ? planBMarkup(safeModel, safeState) : "") + companionMarkup(disrupted) + '</section>';
  }

  function nextRevertStatus(status) {
    var sequence = { available: "pending", pending: "success", success: "already_reverted" };
    return sequence[status] || status;
  }

  function mount(rootElement, model) {
    if (!rootElement) return null;
    var state = createPresentationState();
    rootElement.innerHTML = renderMarkup(model, state);

    function rerender() {
      rootElement.innerHTML = renderMarkup(model, state);
    }

    if (!rootElement.__smartWorkspaceBound) {
      rootElement.__smartWorkspaceBound = true;
      rootElement.addEventListener("click", function handleInteraction(event) {
        var control = event.target.closest("[data-smart-action]");
        if (!control || control.disabled) return;
        var action = control.getAttribute("data-smart-action");
        if (action === "select") state = selectCandidate(state, control.getAttribute("data-candidate-id"));
        if (action === "preference") state = togglePreference(state, control.getAttribute("data-preference"));
        if (action === "apply" && state.selectedCandidateId) {
          state = Object.assign({}, state, { applied: true, revertStatus: (model.revert && model.revert.status) || "available" });
        }
        if (action === "revert") state = Object.assign({}, state, { revertStatus: nextRevertStatus(state.revertStatus) });
        rerender();
      });
    }

    return { getState: function getState() { return Object.assign({}, state); }, rerender: rerender };
  }

  return {
    createPresentationState: createPresentationState,
    selectCandidate: selectCandidate,
    togglePreference: togglePreference,
    renderMarkup: renderMarkup,
    mount: mount
  };
}));

(function monitoringModule() {
  const monitoringInstances = new WeakMap();

  function monitoringInit(rootElement, adapter) {
    if (!rootElement || !adapter) return null;
    if (monitoringInstances.has(rootElement)) return monitoringInstances.get(rootElement);

    const monitoringAbort = new AbortController();
    const monitoringTimers = new Set();
    const monitoringState = {
      root: rootElement,
      adapter,
      unsubscribe: null,
      unregisterSos: null,
      abort: monitoringAbort,
      timers: monitoringTimers
    };

    monitoringInstances.set(rootElement, monitoringState);
    window.coreFlowActiveAdapter = adapter;
    monitoringState.unregisterSos = adapter.registerSosHandler(function monitoringRegisteredSos(options) {
      return monitoringOpenSosModal(monitoringState, options || {});
    });
    monitoringState.unsubscribe = adapter.subscribe(function monitoringSubscriber() {
      monitoringRender(monitoringState);
    });

    rootElement.addEventListener("click", function monitoringClick(event) {
      monitoringHandleClick(monitoringState, event);
    }, { signal: monitoringAbort.signal });

    monitoringRender(monitoringState);
    return monitoringState;
  }

  function monitoringDestroy(rootElement) {
    const monitoringState = monitoringInstances.get(rootElement);
    if (!monitoringState) return;
    monitoringState.abort.abort();
    monitoringState.timers.forEach(function monitoringClearTimer(timer) { clearTimeout(timer); });
    monitoringState.timers.clear();
    if (monitoringState.unsubscribe) monitoringState.unsubscribe();
    if (monitoringState.unregisterSos) monitoringState.unregisterSos();
    monitoringState.adapter.closeSharedUi();
    if (window.coreFlowActiveAdapter === monitoringState.adapter) window.coreFlowActiveAdapter = null;
    monitoringInstances.delete(rootElement);
  }

  function monitoringEscape(monitoringState, value) {
    return monitoringState.adapter.escape(value);
  }

  function monitoringBadge(status) {
    if (/Нет доступа|Наруш|Высок|SOS/.test(status)) return "coreflow-badge--danger";
    if (/Офлайн|устар|провер|измен|вним|готов/.test(status)) return "coreflow-badge--warning";
    if (/Норма|выбран|отправ|создан|Актив/.test(status)) return "coreflow-badge--success";
    return "coreflow-badge--info";
  }

  function monitoringStatus(monitoringState, coreFlowState) {
    if (coreFlowState.accessState !== "granted") return "Нет доступа";
    if (coreFlowState.trip && coreFlowState.trip.status === "completed") return "Завершённая поездка";
    if (coreFlowState.violationConfirmed) return "Подтверждённое нарушение";
    if (coreFlowState.networkState === "offline") return "Офлайн";
    if (coreFlowState.scenario === "sourceDown" || coreFlowState.scenario === "stale") return "Высокий риск";
    if (monitoringVisibleSignals(monitoringState).length) return "Требует внимания";
    return "Норма";
  }

  function monitoringVisibleSignals(monitoringState) {
    return typeof monitoringState.adapter.visibleSignals === "function" ? monitoringState.adapter.visibleSignals() : [];
  }

  function monitoringRender(monitoringState) {
    if (!monitoringState.root.isConnected) return;
    const coreFlowState = monitoringState.adapter.getState();
    const monitoringRoot = monitoringState.root;
    const monitoringContent = monitoringRoot.querySelector("#monitoring-content");
    const monitoringStatusNode = monitoringRoot.querySelector("#monitoring-status");
    const monitoringUpdatedNode = monitoringRoot.querySelector("#monitoring-updated");
    const monitoringSourceNode = monitoringRoot.querySelector("#monitoring-source");
    const monitoringRefreshButton = monitoringRoot.querySelector("#monitoring-refresh");
    const monitoringCurrentStatus = monitoringStatus(monitoringState, coreFlowState);
    const monitoringTop = monitoringRoot.querySelector(".monitoring-top");
    if (!monitoringContent || !monitoringStatusNode || !monitoringUpdatedNode || !monitoringSourceNode || !monitoringRefreshButton || !monitoringTop) return;
    monitoringTop.hidden = coreFlowState.accessState !== "granted";

    monitoringStatusNode.textContent = monitoringCurrentStatus;
    monitoringStatusNode.className = "coreflow-badge " + monitoringBadge(monitoringCurrentStatus);
    monitoringUpdatedNode.textContent = "Обновлено " + coreFlowState.lastUpdated;
    monitoringSourceNode.textContent = coreFlowState.scenario === "sourceDown" ? "Резервные данные" : coreFlowState.sourceStatus;
    monitoringRefreshButton.disabled = !monitoringState.adapter.canMutate("refresh");
    monitoringRefreshButton.title = monitoringRefreshButton.disabled ? "Офлайн или завершённая поездка: доступен только просмотр" : "";

    if (coreFlowState.accessState !== "granted") {
      monitoringContent.innerHTML = `
        <section class="monitoring-safe-screen" data-od-id="monitoring-no-access">
          <span class="coreflow-badge coreflow-badge--danger">Нет доступа</span>
          <h2>Нет доступа</h2>
          <p>У Вас нет доступа к этой поездке или доступ был отозван</p>
          <button class="coreflow-button coreflow-button--secondary" type="button" data-monitoring-action="safe-return">Вернуться</button>
        </section>`;
      return;
    }

    if (coreFlowState.scenario === "loading") {
      monitoringContent.innerHTML = monitoringStatePanel("Загрузка", "Получаем сохранённое состояние маршрута и сигналов.", "loading");
      return;
    }
    if (coreFlowState.scenario === "empty") {
      monitoringContent.innerHTML = monitoringStatePanel("Пустое состояние", "Активных сигналов и изменений пока нет.", "empty");
      return;
    }
    if (coreFlowState.scenario === "error") {
      monitoringContent.innerHTML = monitoringStatePanel("Ошибка", "Не удалось обновить демонстрационный источник. Сохранённые данные остаются доступны.", "error");
      return;
    }

    monitoringContent.innerHTML = `
      ${monitoringBanner(monitoringState, coreFlowState)}
      <div class="monitoring-main-grid">
        <div class="monitoring-stack">
          ${monitoringCurrentStateCard(monitoringState, coreFlowState)}
          ${coreFlowState.role === "organizer" ? monitoringVerificationCard(monitoringState, coreFlowState) : monitoringParticipantStatus(monitoringState, coreFlowState)}
          ${monitoringConsequences(monitoringState, coreFlowState)}
          ${monitoringPlanB(monitoringState, coreFlowState)}
          ${monitoringSegments(monitoringState, coreFlowState)}
        </div>
        <aside class="monitoring-stack">
          ${coreFlowState.role === "organizer" ? monitoringIncomingSos(monitoringState, coreFlowState) : ""}
          ${monitoringSources(monitoringState, coreFlowState)}
          ${monitoringHistory(monitoringState)}
        </aside>
      </div>`;
  }

  function monitoringStatePanel(title, text, tone) {
    return `
      <section class="monitoring-safe-screen" data-od-id="monitoring-state-${tone}">
        <span class="coreflow-badge ${monitoringBadge(title)}">${title}</span>
        <h2>${title}</h2>
        <p>${text}</p>
      </section>`;
  }

  function monitoringBanner(monitoringState, coreFlowState) {
    if (coreFlowState.networkState === "offline") {
      return `<div class="coreflow-banner coreflow-banner--warning" data-od-id="monitoring-offline-banner"><strong>Офлайн.</strong><span>Доступен только просмотр сохранённых данных.</span></div>`;
    }
    if (coreFlowState.trip && coreFlowState.trip.status === "completed") {
      return `<div class="coreflow-banner" data-od-id="monitoring-completed-banner"><strong>Завершённая поездка.</strong><span>Мониторинг и история доступны только для просмотра.</span></div>`;
    }
    if (coreFlowState.scenario === "stale") {
      return `<div class="coreflow-banner coreflow-banner--warning" data-od-id="monitoring-stale-banner"><strong>Данные устарели.</strong><span>Проверьте источник перед решением.</span></div>`;
    }
    if (coreFlowState.scenario === "sourceDown") {
      return `<div class="coreflow-banner coreflow-banner--warning" data-od-id="monitoring-source-down-banner"><strong>Источник недоступен.</strong><span>Показаны резервные демонстрационные данные.</span></div>`;
    }
    return "";
  }

  function monitoringCurrentStateCard(monitoringState, coreFlowState) {
    const monitoringCurrent = monitoringStatus(monitoringState, coreFlowState);
    const monitoringFactors = coreFlowState.violationConfirmed
      ? ["Закрытие аэропорта Москвы", "Затронуты рейс Москва → Анталья, трансфер и отель", "Источник: демонстрационный сценарий"]
      : monitoringVisibleSignals(monitoringState).length
        ? ["Входящий SOS участника", "Требуется проверка источника", "Plan B скрыт до подтверждения нарушения"]
        : ["Сегменты идут по плану", "Поставщик отвечает", "Критичных сигналов нет"];
    return `
      <section class="coreflow-card" data-od-id="monitoring-current-state">
        <div class="coreflow-card-head">
          <div>
            <h3>${coreFlowState.violationConfirmed ? "Подтверждённое нарушение" : "Текущее состояние"}</h3>
            <p>Оценка основана на статусах сегментов, источниках и подтверждённых сигналах.</p>
          </div>
          <span class="coreflow-badge ${monitoringBadge(monitoringCurrent)}">${monitoringCurrent}</span>
        </div>
        <div class="coreflow-card-body">
          <div class="monitoring-metrics">
            <div class="monitoring-metric"><span>Уровень риска</span><strong>${monitoringCurrent}</strong></div>
            <div class="monitoring-metric"><span>Затронуто</span><strong>${coreFlowState.violationConfirmed ? "3 сегмента" : monitoringVisibleSignals(monitoringState).length ? "1 сегмент" : "0 сегментов"}</strong></div>
            <div class="monitoring-metric"><span>Свежесть</span><strong>${coreFlowState.scenario === "stale" ? "Устарели" : "Свежие"}</strong></div>
            <div class="monitoring-metric"><span>Источник</span><strong>${coreFlowState.scenario === "sourceDown" ? "Резервные данные" : "Демо-источник"}</strong></div>
          </div>
          <ul class="monitoring-list" style="margin-top:12px">
            ${monitoringFactors.map(function monitoringFactor(factor) {
              return `<li class="monitoring-list-item">${monitoringEscape(monitoringState, factor)}</li>`;
            }).join("")}
          </ul>
        </div>
      </section>`;
  }

  function monitoringSelectedSignal(monitoringState, coreFlowState) {
    const visibleSignals = monitoringVisibleSignals(monitoringState);
    return visibleSignals.find(function monitoringFindSignal(signal) {
      return signal.id === coreFlowState.selectedSignalId;
    }) || visibleSignals[0];
  }

  function monitoringVerificationCard(monitoringState, coreFlowState) {
    const signal = monitoringSelectedSignal(monitoringState, coreFlowState);
    if (!signal) {
      return `
        <section class="coreflow-card" data-od-id="monitoring-manual-card">
          <div class="coreflow-card-head"><div><h3>Проверка события</h3><p>Входящих сигналов нет.</p></div></div>
          <div class="coreflow-card-body">
            <button class="coreflow-button coreflow-button--secondary" type="button" data-monitoring-action="manual-problem" ${monitoringState.adapter.canMutate("verify") ? "" : "disabled"}>Зафиксировать проблему вручную</button>
          </div>
        </section>`;
    }
    return `
      <section class="coreflow-card" data-od-id="monitoring-verification-card">
        <div class="coreflow-card-head">
          <div>
            <h3>Карточка проверки события</h3>
            <p>Plan B нельзя показать до подтверждения конкретного нарушения.</p>
          </div>
          <span class="coreflow-badge ${monitoringBadge(coreFlowState.violationConfirmed ? "Нарушение подтверждено" : signal.status)}">${coreFlowState.violationConfirmed ? "Нарушение подтверждено" : signal.status}</span>
        </div>
        <div class="coreflow-card-body">
          <div class="coreflow-fact-grid">
            <div class="coreflow-fact"><span class="coreflow-fact-label">Что произошло</span><strong class="coreflow-fact-value">${monitoringEscape(monitoringState, signal.type)}</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Источник</span><strong class="coreflow-fact-value">${monitoringEscape(monitoringState, signal.source)}</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Сегмент</span><strong class="coreflow-fact-value">${monitoringEscape(monitoringState, signal.segment)}</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Время</span><strong class="coreflow-fact-value">${monitoringEscape(monitoringState, signal.time)}</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Достоверность</span><strong class="coreflow-fact-value">${monitoringEscape(monitoringState, signal.confidence)}</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Последствия</span><strong class="coreflow-fact-value">Рейс, трансфер, отель</strong></div>
          </div>
          <p style="margin-top:12px">${monitoringEscape(monitoringState, signal.description)}</p>
          ${coreFlowState.role === "organizer" ? `
          <div class="monitoring-actions">
            <button class="coreflow-button coreflow-button--secondary" type="button" data-monitoring-action="verdict-reject">Нарушение не подтверждено</button>
            <button class="coreflow-button coreflow-button--secondary" type="button" data-monitoring-action="verdict-more">Нужна дополнительная проверка</button>
            <button class="coreflow-button coreflow-button--danger" type="button" data-monitoring-action="verdict-confirm">Подтвердить нарушение</button>
          </div>` : ""}
        </div>
      </section>`;
  }

  function monitoringParticipantStatus(monitoringState, coreFlowState) {
    if (coreFlowState.selectedPlanBId) return "";
    const ownSignal = monitoringVisibleSignals(monitoringState).find(function monitoringFindOwnSignal(signal) { return signal.authorId === coreFlowState.currentUser.id; });
    return `
      <section class="coreflow-card" data-od-id="monitoring-participant-status">
        <div class="coreflow-card-head"><div><h3>Публичный статус</h3><p>Внутренние проверки организатора скрыты.</p></div></div>
        <div class="coreflow-card-body">
          <p>${ownSignal ? "Сигнал ожидает решения организатора" : "Критичных изменений для Вас пока нет."}</p>
          ${ownSignal ? `<div class="coreflow-banner coreflow-banner--warning" style="margin-top:12px"><strong>${monitoringEscape(monitoringState, ownSignal.type)}</strong><span>${monitoringEscape(monitoringState, ownSignal.segment)}</span></div>` : ""}
        </div>
      </section>`;
  }

  function monitoringConsequences(monitoringState, coreFlowState) {
    if (!coreFlowState.violationConfirmed || coreFlowState.role !== "organizer") return "";
    return `
      <section class="coreflow-card" data-od-id="monitoring-consequences">
        <div class="coreflow-card-head">
          <div><h3>Последствия нарушения</h3><p>Связи между сегментами после закрытия аэропорта Москвы.</p></div>
          <span class="coreflow-badge coreflow-badge--danger">Высокий риск</span>
        </div>
        <div class="coreflow-card-body">
          <div class="coreflow-fact-grid">
            <div class="coreflow-fact"><span class="coreflow-fact-label">Что произошло</span><strong class="coreflow-fact-value">Аэропорт Москвы временно закрыт</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Затронутый сегмент</span><strong class="coreflow-fact-value">Москва → Анталья</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Участники</span><strong class="coreflow-fact-value">Вся группа</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Следующие сегменты</span><strong class="coreflow-fact-value">Прибытие, трансфер, заселение</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Отель</span><strong class="coreflow-fact-value">Нужно подтвердить поздний заезд</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Трансфер</span><strong class="coreflow-fact-value">Нужно перенести время подачи</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Активности</span><strong class="coreflow-fact-value">Первая активность может сдвинуться</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Документы</span><strong class="coreflow-fact-value">Билеты и ваучер на трансфер</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Время и расходы</span><strong class="coreflow-fact-value">+6–17 часов · 22 000–48 000 ₽</strong></div>
          </div>
        </div>
      </section>`;
  }

  function monitoringPlanB(monitoringState, coreFlowState) {
    if (!coreFlowState.violationConfirmed && !coreFlowState.planBVisible) return "";
    const plans = monitoringState.adapter.getPlanBOptions();
    const selectedPlan = plans.find(function monitoringFindPlan(plan) { return plan.id === coreFlowState.selectedPlanBId; });
    if (coreFlowState.role === "participant") {
      if (!selectedPlan) return "";
      return monitoringParticipantSelectedPlan(monitoringState, selectedPlan);
    }
    if (plans.length !== 3) {
      return `<section class="coreflow-card" data-od-id="monitoring-plan-b-invalid"><div class="coreflow-card-body"><p>Не удалось получить ровно три безопасных варианта Plan B. Обновите данные или повторите генерацию.</p></div></section>`;
    }
    return `
      <section class="coreflow-card" data-od-id="monitoring-plan-b">
        <div class="coreflow-card-head">
          <div><h3>Варианты Plan B</h3><p>Доступно 3 варианта. Данные сформированы после подтверждения нарушения.</p></div>
          <span class="coreflow-badge coreflow-badge--info">${plans.some(function (plan) { return plan.generationSource === "groq"; }) ? "AI provider" : "Резервный расчёт"}</span>
        </div>
        <div class="coreflow-card-body">
          <div class="monitoring-plan-grid">
            ${plans.map(function monitoringPlanCard(plan) {
              const selected = coreFlowState.selectedPlanBId === plan.id;
              return `
                <article class="monitoring-plan-card ${selected ? "is-selected" : ""}" data-od-id="monitoring-${plan.id}">
                  <span class="coreflow-badge ${selected ? "coreflow-badge--success" : "coreflow-badge--accent"}">${selected ? "Выбран" : plan.label}</span>
                  <h4>${monitoringEscape(monitoringState, plan.title)}</h4>
                  <p>${monitoringEscape(monitoringState, plan.description)}</p>
                  <div class="monitoring-plan-meta">
                    <span>Новое время: ${monitoringEscape(monitoringState, plan.newTime)}</span>
                    <span>Время: ${monitoringEscape(monitoringState, plan.timeImpact || plan.delay)}</span>
                    <span>Стоимость: ${monitoringEscape(monitoringState, plan.priceImpact || plan.cost)}</span>
                    <span>Риск: ${monitoringEscape(monitoringState, plan.risk)}</span>
                    <span>Сложность: ${monitoringEscape(monitoringState, plan.complexity)}</span>
                  </div>
                  <div class="monitoring-actions">
                    <button class="coreflow-button coreflow-button--secondary" type="button" data-monitoring-action="plan-details" data-plan-id="${plan.id}">Подробности</button>
                    <button class="coreflow-button coreflow-button--primary" type="button" data-monitoring-action="plan-select" data-plan-id="${plan.id}" ${monitoringState.adapter.canMutate("plan") ? "" : "disabled"}>Выбрать</button>
                  </div>
                </article>`;
            }).join("")}
          </div>
          ${monitoringComparison(monitoringState)}
        </div>
      </section>`;
  }

  function monitoringComparison(monitoringState) {
    const rows = [
      { key: "timeImpact", label: "Изменение времени" },
      { key: "priceImpact", label: "Дополнительные расходы" },
      { key: "risk", label: "Уровень риска" },
      { key: "hotel", label: "Влияние на отель" },
      { key: "transfer", label: "Влияние на трансфер" },
      { key: "activities", label: "Влияние на активности" }
    ];
    return `
      <div class="monitoring-compare" data-od-id="monitoring-plan-b-comparison">
        ${rows.map(function monitoringCompareRow(row) {
          return `
            <div class="monitoring-compare-row">
              <div class="monitoring-compare-label">${row.label}</div>
              ${monitoringState.adapter.getPlanBOptions().map(function monitoringCompareCell(plan) {
                return `<div class="monitoring-compare-cell" data-plan="${plan.label}">${monitoringEscape(monitoringState, plan[row.key])}</div>`;
              }).join("")}
            </div>`;
        }).join("")}
      </div>`;
  }

  function monitoringParticipantSelectedPlan(monitoringState, selectedPlan) {
    return `
      <section class="coreflow-card" data-od-id="monitoring-selected-plan-public">
        <div class="coreflow-card-head">
          <div><h3>Выбранный Plan B</h3><p>Опубликованное решение организатора.</p></div>
          <span class="coreflow-badge coreflow-badge--success">Выбран</span>
        </div>
        <div class="coreflow-card-body">
          <h4>${monitoringEscape(monitoringState, selectedPlan.title)}</h4>
          <p>${monitoringEscape(monitoringState, selectedPlan.description)}</p>
          <div class="coreflow-fact-grid" style="margin-top:12px">
            <div class="coreflow-fact"><span class="coreflow-fact-label">Новое время</span><strong class="coreflow-fact-value">${monitoringEscape(monitoringState, selectedPlan.newTime)}</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Новое место</span><strong class="coreflow-fact-value">Москва, зона вылета SVO</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Инструкции</span><strong class="coreflow-fact-value">Оставаться с группой и ждать сообщение организатора</strong></div>
          </div>
        </div>
      </section>`;
  }

  function monitoringIncomingSos(monitoringState, coreFlowState) {
    return `
      <section class="coreflow-card" data-od-id="monitoring-incoming-sos">
        <div class="coreflow-card-head"><div><h3>Входящие SOS</h3><p>Только для организатора.</p></div></div>
        <div class="coreflow-card-body">
          <ul class="monitoring-list">
            ${monitoringVisibleSignals(monitoringState).length ? monitoringVisibleSignals(monitoringState).map(function monitoringSignalItem(signal) {
              return `<li class="monitoring-signal"><strong>${monitoringEscape(monitoringState, signal.authorName)} · ${monitoringEscape(monitoringState, signal.type)}</strong><div class="monitoring-row-meta"><span>${monitoringEscape(monitoringState, signal.segment)}</span><span>${monitoringEscape(monitoringState, signal.time)}</span></div></li>`;
            }).join("") : "<li class=\"monitoring-list-item\">Входящих SOS нет.</li>"}
          </ul>
          <div class="monitoring-actions">
            <button class="coreflow-button coreflow-button--secondary" type="button" data-monitoring-action="manual-problem" ${monitoringState.adapter.canMutate("verify") ? "" : "disabled"}>Зафиксировать проблему вручную</button>
          </div>
        </div>
      </section>`;
  }

  function monitoringSources(monitoringState, coreFlowState) {
    const sources = [
      ["Поставщик", coreFlowState.scenario === "sourceDown" ? "Недоступен" : "Доступен"],
      ["Демонстрационный источник", "Активен"],
      ["Ручной сигнал", "Доступен организатору"],
      ["SOS участника", monitoringVisibleSignals(monitoringState).length ? "Есть события" : "Нет активных событий"],
      ["Резервные данные", coreFlowState.scenario === "sourceDown" ? "Используются" : "Готовы"],
      ["Данные могут быть устаревшими", coreFlowState.scenario === "stale" ? "Да" : "Нет"]
    ];
    return `
      <section class="coreflow-card" data-od-id="monitoring-sources">
        <div class="coreflow-card-head"><div><h3>Источники и достоверность</h3><p>Происхождение данных не скрывается.</p></div></div>
        <div class="coreflow-card-body">
          <ul class="monitoring-list">
            ${sources.map(function monitoringSourceItem(source) { return `<li class="monitoring-list-item monitoring-list-item--split"><strong>${source[0]}</strong><span class="coreflow-badge ${monitoringBadge(source[1])}">${source[1]}</span></li>`; }).join("")}
          </ul>
        </div>
      </section>`;
  }

  function monitoringHistory(monitoringState) {
    const items = monitoringState.adapter.visibleHistory();
    return `
      <section class="coreflow-card" data-od-id="monitoring-history">
        <div class="coreflow-card-head"><div><h3>История изменений</h3><p>С ролевой фильтрацией.</p></div></div>
        <div class="coreflow-card-body">
          <ul class="monitoring-list">
            ${items.length ? items.slice(-8).reverse().map(function monitoringHistoryItem(item) {
              return `<li class="monitoring-list-item monitoring-list-item--history"><time>${monitoringEscape(monitoringState, item.time)}</time><span>${monitoringEscape(monitoringState, item.text)}</span></li>`;
            }).join("") : "<li class=\"monitoring-list-item\">Публичной истории нет.</li>"}
          </ul>
        </div>
      </section>`;
  }

  function monitoringSegments(monitoringState, coreFlowState) {
    return `
      <details class="monitoring-segments" data-od-id="monitoring-segments">
        <summary aria-expanded="false">Сегменты маршрута — 5</summary>
        <div class="monitoring-segment-list">
          ${monitoringState.adapter.getSegments().map(function monitoringSegment(segment) {
            const status = coreFlowState.selectedPlanBId && ["mow-ayt", "transfer-hotel", "hotel-stay"].includes(segment.id)
              ? "План B выбран"
              : coreFlowState.violationConfirmed && segment.id === "mow-ayt" ? "Нарушение подтверждено" : "По плану";
            return `<div class="monitoring-list-item" data-od-id="monitoring-segment-${segment.id}"><div class="monitoring-row-head"><strong>${monitoringEscape(monitoringState, segment.title)}</strong><span class="coreflow-badge ${monitoringBadge(status)}">${status}</span></div><div class="monitoring-row-meta"><span>${monitoringEscape(monitoringState, segment.time)}</span><span>${monitoringEscape(monitoringState, segment.type)}</span><span>${monitoringEscape(monitoringState, segment.document)}</span></div><p>${monitoringEscape(monitoringState, segment.impact)}</p></div>`;
          }).join("")}
        </div>
      </details>`;
  }

  function monitoringHandleClick(monitoringState, event) {
    const action = event.target.closest("[data-monitoring-action]");
    if (!action || !monitoringState.root.contains(action)) return;
    const actionName = action.dataset.monitoringAction;
    if (action.disabled) return;
    if (actionName === "safe-return") {
      monitoringState.adapter.toast("Возврат выполняется общей навигацией приложения.");
    } else if (actionName === "manual-problem") {
      monitoringOpenSosModal(monitoringState, { manual: true });
    } else if (actionName === "verdict-reject") {
      monitoringState.adapter.setVerdict("reject");
      monitoringState.adapter.toast("Нарушение не подтверждено");
    } else if (actionName === "verdict-more") {
      monitoringState.adapter.setVerdict("more");
      monitoringState.adapter.toast("Запрошена дополнительная проверка");
    } else if (actionName === "verdict-confirm") {
      monitoringState.adapter.setVerdict("confirm");
      monitoringState.adapter.toast("Нарушение подтверждено. Доступны три Plan B.");
    } else if (actionName === "plan-details") {
      monitoringOpenPlanDetails(monitoringState, action.dataset.planId);
    } else if (actionName === "plan-select") {
      monitoringOpenPlanConfirm(monitoringState, action.dataset.planId);
    } else if (actionName === "refresh") {
      monitoringRefresh(monitoringState);
    }
  }

  function monitoringRefresh(monitoringState) {
    if (!monitoringState.adapter.canMutate("refresh")) {
      monitoringState.adapter.toast("Офлайн. Доступен только просмотр сохранённых данных.");
      return;
    }
    monitoringState.adapter.toast("Мониторинг обновлён");
  }

  function monitoringOpenSosModal(monitoringState, options) {
    if (!monitoringState.adapter.canMutate("sos")) {
      monitoringState.adapter.toast("Офлайн. Доступен только просмотр сохранённых данных.");
      return false;
    }
    const segments = monitoringState.adapter.getSegments();
    const title = options.manual ? "Зафиксировать проблему вручную" : "SOS";
    monitoringState.adapter.openModal({
      title,
      body: `
        <form id="coreflow-sos-form" class="coreflow-grid" novalidate>
          <div class="coreflow-field"><label for="coreflow-sos-type">Тип проблемы</label><select id="coreflow-sos-type"><option>Не могу попасть на рейс</option><option selected>Рейс отменён или задержан</option><option>Потерял документы</option><option>Не могу найти трансфер</option><option>Проблема с заселением</option><option>Медицинская проблема</option><option>Потерял связь с группой</option><option>Другая проблема</option></select></div>
          <div class="coreflow-field"><label for="coreflow-sos-segment">Связанный сегмент</label><select id="coreflow-sos-segment">${segments.map(function monitoringSegmentOption(segment) { return `<option value="${segment.id}">${monitoringEscape(monitoringState, segment.title)}</option>`; }).join("")}</select></div>
          <div class="coreflow-field"><label for="coreflow-sos-urgency">Срочность</label><select id="coreflow-sos-urgency"><option>Средняя</option><option selected>Высокая</option><option>Критическая</option></select></div>
          <div class="coreflow-field"><label for="coreflow-sos-description">Описание</label><textarea id="coreflow-sos-description">Нужна помощь по текущему этапу поездки.</textarea></div>
        </form>`,
      footer: `<button id="coreflow-sos-submit" class="coreflow-button coreflow-button--danger" type="button">Зафиксировать сигнал</button>`,
      onMount: function monitoringSosMount(modalRoot) {
        modalRoot.querySelector("#coreflow-sos-submit").addEventListener("click", function monitoringSubmitSos() {
          const segmentId = modalRoot.querySelector("#coreflow-sos-segment").value;
          const segment = segments.find(function monitoringFindSegment(item) { return item.id === segmentId; });
          monitoringState.adapter.addSignal({
            type: modalRoot.querySelector("#coreflow-sos-type").value,
            segmentId,
            segment: segment.title,
            urgency: modalRoot.querySelector("#coreflow-sos-urgency").value,
            description: modalRoot.querySelector("#coreflow-sos-description").value,
            source: options.manual ? "Ручной сигнал" : "SOS участника"
          });
          monitoringState.adapter.closeSharedUi();
          monitoringState.adapter.toast(options.manual ? "Проблема зафиксирована вручную" : "Сигнал отправлен организатору");
        });
      }
    });
    return true;
  }

  function monitoringOpenPlanDetails(monitoringState, planId) {
    const plan = monitoringState.adapter.getPlanBOptions().find(function monitoringFindPlan(item) { return item.id === planId; });
    const list = function (items) {
      return Array.isArray(items) && items.length
        ? `<ul>${items.map(function (item) { return `<li>${monitoringEscape(monitoringState, item)}</li>`; }).join("")}</ul>`
        : "<p>Не указано</p>";
    };
    const emailDraft = plan.emailDraft && typeof plan.emailDraft === "object" ? plan.emailDraft : null;
    monitoringState.adapter.openModal({
      title: plan.label,
      body: `
        <div class="coreflow-grid">
          <p>${monitoringEscape(monitoringState, plan.description)}</p>
          <div class="coreflow-fact-grid">
            <div class="coreflow-fact"><span class="coreflow-fact-label">Новое время</span><strong class="coreflow-fact-value">${monitoringEscape(monitoringState, plan.newTime)}</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Задержка</span><strong class="coreflow-fact-value">${monitoringEscape(monitoringState, plan.delay)}</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Доп. расходы</span><strong class="coreflow-fact-value">${monitoringEscape(monitoringState, plan.cost)}</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Отель</span><strong class="coreflow-fact-value">${monitoringEscape(monitoringState, plan.hotel)}</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Трансфер</span><strong class="coreflow-fact-value">${monitoringEscape(monitoringState, plan.transfer)}</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Активности</span><strong class="coreflow-fact-value">${monitoringEscape(monitoringState, plan.activities)}</strong></div>
          </div>
          <div><strong>Когда применять</strong><p>${monitoringEscape(monitoringState, plan.whenToUse || "Не указано")}</p></div>
          <div><strong>Шаги</strong>${list(plan.actions)}</div>
          <div><strong>Плюсы</strong>${list(plan.pros)}</div>
          <div><strong>Минусы</strong>${list(plan.cons)}</div>
          <div><strong>Затронутые элементы</strong>${list(plan.affectedElements)}</div>
          ${emailDraft ? `<div><strong>Черновик письма</strong><p>${monitoringEscape(monitoringState, emailDraft.subject || "")}</p><p>${monitoringEscape(monitoringState, emailDraft.body || "")}</p></div>` : ""}
          <p>Источник расчёта: ${monitoringEscape(monitoringState, plan.source)}.</p>
        </div>`,
      footer: `<button id="coreflow-plan-close" class="coreflow-button coreflow-button--secondary" type="button">Закрыть</button>`,
      onMount: function monitoringDetailsMount(modalRoot) {
        modalRoot.querySelector("#coreflow-plan-close").addEventListener("click", monitoringState.adapter.closeSharedUi);
      }
    });
  }

  function monitoringOpenPlanConfirm(monitoringState, planId) {
    const plan = monitoringState.adapter.getPlanBOptions().find(function monitoringFindPlan(item) { return item.id === planId; });
    monitoringState.adapter.openModal({
      title: "Подтверждение Plan B",
      body: `
        <div class="coreflow-grid">
          <span class="coreflow-badge coreflow-badge--accent">${monitoringEscape(monitoringState, plan.label)}</span>
          <h3>${monitoringEscape(monitoringState, plan.title)}</h3>
          <p>${monitoringEscape(monitoringState, plan.description)}</p>
          <div class="coreflow-fact-grid">
            <div class="coreflow-fact"><span class="coreflow-fact-label">Основные последствия</span><strong class="coreflow-fact-value">${monitoringEscape(monitoringState, plan.delay)} · ${monitoringEscape(monitoringState, plan.cost)}</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Что будет изменено</span><strong class="coreflow-fact-value">Таймлайн, трансфер, отель, сообщения</strong></div>
            <div class="coreflow-fact"><span class="coreflow-fact-label">Что система не делает</span><strong class="coreflow-fact-value">Не выполняет реальные операции</strong></div>
          </div>
          <p class="coreflow-badge coreflow-badge--warning">Приложение не покупает билеты, не отменяет бронирования и не выполняет переоформление автоматически.</p>
        </div>`,
      footer: `<button id="coreflow-plan-back" class="coreflow-button coreflow-button--secondary" type="button">Вернуться к сравнению</button><button id="coreflow-plan-confirm" class="coreflow-button coreflow-button--primary" type="button">Подтвердить Plan B</button>`,
      onMount: function monitoringConfirmMount(modalRoot) {
        modalRoot.querySelector("#coreflow-plan-back").addEventListener("click", monitoringState.adapter.closeSharedUi);
        modalRoot.querySelector("#coreflow-plan-confirm").addEventListener("click", function monitoringConfirmPlan() {
          monitoringState.adapter.choosePlan(planId);
          monitoringState.adapter.closeSharedUi();
          monitoringState.adapter.openMessageDraft({
            planId,
            messageId: "message-draft-" + planId,
          });
        });
      }
    });
  }

  window.monitoringInit = monitoringInit;
  window.monitoringDestroy = monitoringDestroy;
})();

(function coreFlowAdapterModule() {
  const coreFlowScenarioLabels = {
    normal: "Обычный",
    loading: "Загрузка",
    empty: "Пустое состояние",
    error: "Ошибка",
    offline: "Офлайн",
    stale: "Данные устарели",
    sourceDown: "Источник недоступен",
    sos: "Входящий SOS",
    review: "Нужна проверка",
    violation: "Нарушение подтверждено",
    planBReady: "Три Plan B готовы",
    planBSelected: "Plan B выбран",
    draftCreated: "Черновик создан",
    messageSent: "Сообщение отправлено",
    completed: "Завершённая поездка",
    noAccess: "Нет доступа"
  };

  const coreFlowParticipants = [
    { id: "artem", name: "Артём", role: "organizer", label: "Вы" },
    { id: "stanislav", name: "Станислав", role: "participant" },
    { id: "anna", name: "Анна", role: "participant" },
    { id: "mikhail", name: "Михаил", role: "participant" }
  ];

  const coreFlowSegments = [
    { id: "skt-mow", title: "Сыктывкар → Москва", time: "19 июля 2026 · 08:40–10:25", type: "Авиаперелёт", document: "Билет Сыктывкар → Москва", source: "Поставщик · SU 1395", impact: "Влияет на стыковку в Москве" },
    { id: "mow-ayt", title: "Москва → Анталья", time: "19 июля 2026 · 14:20–18:40", type: "Авиаперелёт", document: "Билет Москва → Анталья", source: "Демонстрационный источник · табло SVO", impact: "Влияет на прибытие, трансфер и заселение" },
    { id: "transfer-hotel", title: "Трансфер аэропорт → отель", time: "19 июля 2026 · 19:30–20:15", type: "Трансфер", document: "Ваучер на трансфер", source: "Резервные данные · водитель", impact: "Нужно переносить время подачи" },
    { id: "hotel-stay", title: "Проживание в отеле", time: "19–25 июля 2026", type: "Отель", document: "Бронь отеля", source: "Ручной сигнал", impact: "Нужно подтвердить поздний заезд" },
    { id: "return-route", title: "Обратный маршрут", time: "25 июля 2026", type: "Авиаперелёт", document: "Билеты обратно", source: "Демонстрационный источник", impact: "Не затронут текущим нарушением" }
  ];

  const coreFlowPlanBOptions = [
    { id: "plan-a", label: "Plan B — вариант A", title: "Поздний рейс через Стамбул", description: "Перебронировать демонстрационный маршрут Москва → Стамбул → Анталья и предупредить трансфер.", newTime: "20 июля, 01:10", delay: "+6 ч 30 мин", cost: "≈ 48 000 ₽", risk: "Средний", complexity: "Высокая", hotel: "Подтвердить поздний заезд", transfer: "Перенести трансфер на ночь", activities: "Утренняя активность под вопросом", actions: ["Проверить места", "Связаться с отелем", "Перенести трансфер"], pros: ["Самое раннее прибытие", "Группа остаётся вместе"], cons: ["Дороже остальных", "Ночная пересадка"], source: "Демонстрационный расчёт · резервные данные" },
    { id: "plan-b", label: "Plan B — вариант B", title: "Ожидание следующего прямого рейса", description: "Остаться в Москве до следующего доступного прямого рейса и сохранить текущий отель в Анталье.", newTime: "20 июля, 11:45", delay: "+17 ч", cost: "≈ 22 000 ₽", risk: "Низкий", complexity: "Средняя", hotel: "Нужна отметка о позднем заселении", transfer: "Перенести на дневное окно", activities: "Первая активность переносится", actions: ["Подтвердить рейс", "Зафиксировать ночёвку", "Уточнить трансфер"], pros: ["Меньше пересадок", "Ниже риск ошибки"], cons: ["Большая задержка", "Нужна ночь в Москве"], source: "Демонстрационный расчёт · поставщик недоступен" },
    { id: "plan-c", label: "Plan B — вариант C", title: "Разделение группы по двум рейсам", description: "Часть группы летит ближайшим маршрутом, остальные — следующим прямым рейсом.", newTime: "20 июля, 04:30 и 11:45", delay: "+10 ч в среднем", cost: "≈ 35 000 ₽", risk: "Высокий", complexity: "Высокая", hotel: "Отелю нужны два времени прибытия", transfer: "Нужны два трансфера", activities: "Программа первого дня дробится", actions: ["Согласовать группы", "Проверить документы", "Заказать второй трансфер"], pros: ["Часть участников прибудет раньше", "Гибкость по местам"], cons: ["Группа разделяется", "Сложнее коммуникация"], source: "Демонстрационный расчёт · ручная проверка" }
  ];

  function coreFlowClone(coreFlowValue) {
    return JSON.parse(JSON.stringify(coreFlowValue));
  }

  function coreFlowEscapeHtml(coreFlowValue) {
    return String(coreFlowValue || "").replace(/[&<>"']/g, function coreFlowEscapeChar(coreFlowChar) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[coreFlowChar];
    });
  }

  function coreFlowEscapeAttribute(coreFlowValue) {
    return coreFlowEscapeHtml(coreFlowValue).replace(/`/g, "&#096;");
  }

  function coreFlowDefaultRecipients() {
    return { type: "all-participants", participantIds: [], providerType: null };
  }

  function coreFlowDefaultState() {
    return {
      uiScenario: "normal",
      scenario: "normal",
      accessState: "granted",
      networkState: "online",
      environment: "development",
      role: "organizer",
      currentUser: { id: "artem", name: "Артём", role: "organizer", label: "Вы" },
      trip: { id: "trip-turkey-2026", title: "Отпуск в Турции", status: "active" },
      participants: coreFlowClone(coreFlowParticipants),
      telegramConnected: true,
      lastUpdated: "19 июля, 13:48",
      sourceStatus: "Демонстрационный источник",
      selectedSignalId: "signal-anna-1",
      violationConfirmed: false,
      planBVisible: false,
      selectedPlanBId: "",
      selectedMessageId: "",
      mobileMessageMode: "list",
      signals: [
        {
          id: "signal-anna-1",
          authorId: "anna",
          authorName: "Анна",
          type: "Рейс отменён или задержан",
          segmentId: "mow-ayt",
          segment: "Москва → Анталья",
          urgency: "Высокая",
          source: "SOS участника",
          confidence: "Средняя · требуется проверка",
          time: "19 июля, 13:42",
          description: "На табло у выхода появилась задержка, сотрудник просит ждать объявления.",
          status: "Сигнал требует проверки",
          audience: { type: "organizer-and-author", participantIds: ["anna"] }
        }
      ],
      messages: [
        { id: "message-system-1", topic: "Мониторинг включён", recipients: { type: "all-participants", participantIds: [], providerType: null }, channel: "Системное", author: "Система", time: "19 июля, 13:10", status: "Системное сообщение", segment: "Маршрут целиком", planB: "", text: "Мониторинг поездки запущен в демонстрационном режиме. Данные источников маркируются отдельно.", type: "system" },
        { id: "message-transfer-1", topic: "Проверка трансфера", recipients: { type: "provider", participantIds: [], providerType: "transfer" }, channel: "Email", author: "Артём (Вы)", time: "19 июля, 13:30", status: "Готово к отправке", segment: "Трансфер аэропорт → отель", planB: "", text: "Просим подтвердить, что водитель сможет ждать обновлённое время прибытия рейса.", type: "provider" }
      ],
      history: [
        { id: "history-1", time: "13:10", text: "Система включила мониторинг поездки", audience: { type: "all-participants", participantIds: [] } },
        { id: "history-2", time: "13:30", text: "Создано сообщение поставщику трансфера", audience: { type: "organizer", participantIds: [] } },
        { id: "history-3", time: "13:42", text: "Анна отправила SOS по сегменту Москва → Анталья", audience: { type: "organizer", participantIds: [] } }
      ]
    };
  }

  window.coreFlowDemoDefaults = function coreFlowDemoDefaultsExport() {
    const coreFlowDemo = coreFlowDefaultState();
    coreFlowDemo.segments = coreFlowClone(coreFlowSegments);
    coreFlowDemo.planBOptions = coreFlowClone(coreFlowPlanBOptions);
    return coreFlowDemo;
  };

  function coreFlowCreateStateAdapter(coreFlowOptions) {
    const coreFlowAdapterOptions = coreFlowOptions || {};
    const coreFlowTravelState = window.TravelAppState || null;
    const coreFlowSubscribers = new Set();
    const coreFlowTimers = new Set();
    let coreFlowState = coreFlowDefaultState();
    let coreFlowSosHandler = null;

    function coreFlowSelectedSignal() {
      return coreFlowState.signals.find(function coreFlowFindSelectedSignal(coreFlowCandidate) { return coreFlowCandidate.id === coreFlowState.selectedSignalId; }) || coreFlowState.signals[0] || null;
    }

    function coreFlowActivePlanOptions() {
      return Array.isArray(coreFlowState.planBOptions) && coreFlowState.planBOptions.length ? coreFlowState.planBOptions : coreFlowPlanBOptions;
    }

    function coreFlowActiveSegments() {
      return Array.isArray(coreFlowState.segments) && coreFlowState.segments.length ? coreFlowState.segments : coreFlowSegments;
    }

    function coreFlowAffectedSegmentIds() {
      const coreFlowSignal = coreFlowSelectedSignal();
      if (!coreFlowSignal || !coreFlowSignal.segmentId) return [];
      const coreFlowAll = coreFlowActiveSegments();
      const coreFlowIndex = coreFlowAll.findIndex(function coreFlowFindAffected(coreFlowItem) { return coreFlowItem.id === coreFlowSignal.segmentId; });
      if (coreFlowIndex === -1) return [coreFlowSignal.segmentId];
      return coreFlowAll.slice(coreFlowIndex).filter(function coreFlowAffectedFilter(coreFlowItem) { return String(coreFlowItem.impact || "").indexOf("Не затронут") !== 0; }).map(function coreFlowMapAffected(coreFlowItem) { return coreFlowItem.id; });
    }

    function coreFlowNowLabel() {
      const coreFlowNow = new Date();
      const coreFlowMonths = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
      return coreFlowNow.getDate() + " " + coreFlowMonths[coreFlowNow.getMonth()] + ", " + ("0" + coreFlowNow.getHours()).slice(-2) + ":" + ("0" + coreFlowNow.getMinutes()).slice(-2);
    }
    let coreFlowDraftHandler = null;
    let coreFlowLastFocus = null;
    let coreFlowModalRoot = coreFlowAdapterOptions.modalRoot || document.getElementById("coreflow-shared-modal-root");
    let coreFlowToastRoot = coreFlowAdapterOptions.toastRoot || document.getElementById("coreflow-shared-toast-root");
    let coreFlowModalAbort = null;
    let coreFlowTravelUnsubscribe = null;
    let coreFlowWritingTravel = false;

    if (coreFlowTravelState && typeof coreFlowTravelState.getState === "function") {
      const coreFlowExternal = coreFlowTravelState.getState() || {};
      coreFlowState = Object.assign(coreFlowDefaultState(), coreFlowExternal.coreFlow || {});
      coreFlowSyncExternalState(coreFlowExternal, true);
    } else {
      window.CoreFlowPreviewState = coreFlowState;
    }

    if (coreFlowTravelState && typeof coreFlowTravelState.subscribe === "function") {
      coreFlowTravelUnsubscribe = coreFlowTravelState.subscribe(function coreFlowTravelSubscriber(coreFlowExternalState) {
        if (coreFlowWritingTravel) return;
        coreFlowSyncExternalState(coreFlowExternalState || (coreFlowTravelState.getState && coreFlowTravelState.getState()) || {}, false);
      });
    }

    function coreFlowNormalizeRecipients(coreFlowRecipients) {
      if (coreFlowRecipients && typeof coreFlowRecipients === "object" && !Array.isArray(coreFlowRecipients)) {
        return {
          type: coreFlowRecipients.type || "all-participants",
          participantIds: Array.isArray(coreFlowRecipients.participantIds) ? coreFlowRecipients.participantIds.slice() : [],
          providerType: coreFlowRecipients.providerType || null
        };
      }
      if (Array.isArray(coreFlowRecipients)) {
        if (coreFlowRecipients.includes("Поставщик")) return { type: "provider", participantIds: [], providerType: "provider" };
        if (coreFlowRecipients.includes("Отель")) return { type: "provider", participantIds: [], providerType: "hotel" };
        if (coreFlowRecipients.includes("Трансфер")) return { type: "provider", participantIds: [], providerType: "transfer" };
        if (coreFlowRecipients.includes("Служба поддержки")) return { type: "provider", participantIds: [], providerType: "support" };
        if (coreFlowRecipients.includes("Выбранные участники")) return { type: "selected-participants", participantIds: [], providerType: null };
      }
      return coreFlowDefaultRecipients();
    }

    function coreFlowFormatRecipients(coreFlowRecipients) {
      const coreFlowNormalized = coreFlowNormalizeRecipients(coreFlowRecipients);
      if (coreFlowNormalized.type === "all-participants") return "Все участники";
      if (coreFlowNormalized.type === "organizer") return "Организатор";
      if (coreFlowNormalized.type === "provider") {
        return { provider: "Поставщик", hotel: "Отель", transfer: "Трансфер", support: "Служба поддержки" }[coreFlowNormalized.providerType] || "Поставщик";
      }
      const coreFlowNames = coreFlowState.participants
        .filter(function coreFlowFilterParticipant(coreFlowParticipant) { return coreFlowNormalized.participantIds.includes(coreFlowParticipant.id); })
        .map(function coreFlowMapParticipant(coreFlowParticipant) { return coreFlowParticipant.name; });
      return coreFlowNames.length ? coreFlowNames.join(", ") : "Выбранные участники";
    }

    function coreFlowSyncExternalState(coreFlowExternalState, coreFlowSilent) {
      const coreFlowTrip = coreFlowExternalState.trip || coreFlowExternalState.activeTrip || {};
      const coreFlowCurrentUser = coreFlowExternalState.currentUser || coreFlowExternalState.user || null;
      const coreFlowParticipantsExternal = coreFlowExternalState.participants || coreFlowTrip.participants;
      if (coreFlowExternalState.coreFlow && typeof coreFlowExternalState.coreFlow === "object") {
        coreFlowState = Object.assign({}, coreFlowState, coreFlowClone(coreFlowExternalState.coreFlow));
      }
      if (coreFlowTrip.id || coreFlowTrip.title || coreFlowTrip.status) {
        coreFlowState.trip = Object.assign({}, coreFlowState.trip, {
          id: coreFlowTrip.id || coreFlowState.trip.id,
          title: coreFlowTrip.title || coreFlowTrip.name || coreFlowState.trip.title,
          status: coreFlowTrip.status || coreFlowState.trip.status
        });
      }
      if (coreFlowCurrentUser && coreFlowCurrentUser.id) {
        coreFlowState.currentUser = Object.assign({}, coreFlowState.currentUser, coreFlowCurrentUser);
      }
      if (coreFlowExternalState.role || coreFlowTrip.currentUserRole || (coreFlowCurrentUser && coreFlowCurrentUser.role)) {
        coreFlowState.role = (coreFlowExternalState.role || coreFlowTrip.currentUserRole || coreFlowCurrentUser.role) === "participant" ? "participant" : "organizer";
      }
      if (Array.isArray(coreFlowParticipantsExternal) && coreFlowParticipantsExternal.length) {
        coreFlowState.participants = coreFlowClone(coreFlowParticipantsExternal);
      }
      if (coreFlowExternalState.accessState || coreFlowExternalState.hasAccess === false) {
        coreFlowState.accessState = coreFlowExternalState.hasAccess === false ? "revoked" : coreFlowExternalState.accessState;
      }
      if (coreFlowExternalState.networkState || Object.prototype.hasOwnProperty.call(coreFlowExternalState, "isOffline")) {
        coreFlowState.networkState = coreFlowExternalState.isOffline ? "offline" : (coreFlowExternalState.networkState || "online");
      }
      if (coreFlowExternalState.environment) coreFlowState.environment = coreFlowExternalState.environment;
      if (Object.prototype.hasOwnProperty.call(coreFlowExternalState, "telegramConnected")) coreFlowState.telegramConnected = !!coreFlowExternalState.telegramConnected;
      if (!coreFlowSilent) coreFlowNotifySubscribers("travel-state-sync");
    }

    function coreFlowEnsurePortals() {
      if (!coreFlowModalRoot) {
        coreFlowModalRoot = document.createElement("div");
        coreFlowModalRoot.id = "coreflow-shared-modal-root";
        document.body.appendChild(coreFlowModalRoot);
      }
      if (!coreFlowToastRoot) {
        coreFlowToastRoot = document.createElement("div");
        coreFlowToastRoot.id = "coreflow-shared-toast-root";
        document.body.appendChild(coreFlowToastRoot);
      }
      coreFlowModalRoot.classList.add("coreflow-modal-root", "coreflow-theme-scope");
      coreFlowToastRoot.classList.add("coreflow-toast-root", "coreflow-theme-scope");
    }

    function coreFlowPersistToTravelState() {
      if (!coreFlowTravelState || typeof coreFlowTravelState.setState !== "function") return;
      coreFlowWritingTravel = true;
      try {
        coreFlowTravelState.setState({ coreFlow: coreFlowClone(coreFlowState) });
      } finally {
        coreFlowWritingTravel = false;
      }
    }

    function coreFlowNotify(coreFlowEventName) {
      coreFlowPersistToTravelState();
      coreFlowNotifySubscribers(coreFlowEventName);
    }

    function coreFlowNotifySubscribers(coreFlowEventName) {
      const coreFlowSnapshot = coreFlowClone(coreFlowState);
      coreFlowSubscribers.forEach(function coreFlowEachSubscriber(coreFlowSubscriber) {
        coreFlowSubscriber(coreFlowSnapshot, coreFlowEventName);
      });
    }

    function coreFlowSubscribe(coreFlowSubscriber) {
      coreFlowSubscribers.add(coreFlowSubscriber);
      return function coreFlowUnsubscribe() {
        coreFlowSubscribers.delete(coreFlowSubscriber);
      };
    }

    function coreFlowSetRole(coreFlowRole, coreFlowMeta) {
      coreFlowState.role = coreFlowRole === "participant" ? "participant" : "organizer";
      if (coreFlowState.role === "organizer") {
        coreFlowState.currentUser = { id: "artem", name: "Артём", role: "organizer", label: "Вы" };
      } else {
        const coreFlowParticipantId = coreFlowMeta && coreFlowMeta.participantId ? coreFlowMeta.participantId : "anna";
        const coreFlowParticipant = coreFlowState.participants.find(function coreFlowFindParticipant(item) { return item.id === coreFlowParticipantId; }) || coreFlowState.participants.find(function coreFlowFindAnyParticipant(item) { return item.role !== "organizer"; });
        coreFlowState.currentUser = Object.assign({}, coreFlowParticipant, { role: "participant", label: "Вы" });
      }
      coreFlowCloseSharedUi();
      if (!coreFlowMeta || !coreFlowMeta.silent) coreFlowNotify("role-change");
    }

    function coreFlowSetScenario(coreFlowScenario, coreFlowMeta) {
      coreFlowState.uiScenario = coreFlowScenario;
      coreFlowState.scenario = coreFlowScenario;
      if (coreFlowScenario === "offline") coreFlowState.networkState = "offline";
      if (coreFlowScenario === "noAccess") coreFlowState.accessState = "revoked";
      if (coreFlowScenario === "completed") coreFlowState.trip.status = "completed";
      if (coreFlowScenario === "noAccess" || coreFlowScenario === "offline") coreFlowCloseSharedUi();
      if (["review", "sos"].includes(coreFlowScenario) && !coreFlowState.signals.length) {
        coreFlowState.signals = coreFlowDefaultState().signals;
        coreFlowState.selectedSignalId = "signal-anna-1";
      }
      if (["violation", "planBReady", "planBSelected", "draftCreated", "messageSent"].includes(coreFlowScenario)) {
        coreFlowState.violationConfirmed = true;
        coreFlowState.planBVisible = true;
        if (!coreFlowState.signals.length) coreFlowState.signals = coreFlowDefaultState().signals;
      }
      if (["planBSelected", "draftCreated", "messageSent"].includes(coreFlowScenario)) {
        coreFlowState.selectedPlanBId = coreFlowState.selectedPlanBId || "plan-b";
      }
      if (coreFlowScenario === "draftCreated") coreFlowEnsureDraft(coreFlowState.selectedPlanBId || "plan-b");
      if (coreFlowScenario === "messageSent") {
        coreFlowEnsureDraft(coreFlowState.selectedPlanBId || "plan-b");
        const coreFlowDraft = coreFlowState.messages.find(function coreFlowFindDraft(coreFlowMessage) { return coreFlowMessage.planB; });
        if (coreFlowDraft) coreFlowDraft.status = "Демонстрационно отправлено";
      }
      if (!coreFlowMeta || !coreFlowMeta.silent) coreFlowNotify("scenario-change");
    }

    function coreFlowResetDemoData() {
      coreFlowState = coreFlowDefaultState();
      coreFlowCloseSharedUi({ skipFocus: true });
      if (coreFlowToastRoot) coreFlowToastRoot.innerHTML = "";
      if (!coreFlowTravelState) window.CoreFlowPreviewState = coreFlowState;
      coreFlowNotify("demo-reset");
    }

    function coreFlowIsNoAccess() {
      return coreFlowState.accessState !== "granted";
    }

    function coreFlowIsOffline() {
      return coreFlowState.networkState === "offline";
    }

    function coreFlowIsCompleted() {
      return coreFlowState.trip && coreFlowState.trip.status === "completed";
    }

    function coreFlowCanMutate(coreFlowAction) {
      if (coreFlowIsNoAccess() || coreFlowIsOffline() || coreFlowIsCompleted()) return false;
      if (coreFlowState.role !== "organizer" && ["verify", "plan", "message"].includes(coreFlowAction)) return false;
      return true;
    }

    function coreFlowAudienceVisible(coreFlowAudience, coreFlowOwnerId) {
      if (coreFlowState.role === "organizer") return true;
      const coreFlowNormalized = coreFlowAudience || { type: "organizer-and-author", participantIds: coreFlowOwnerId ? [coreFlowOwnerId] : [] };
      if (coreFlowNormalized.type === "all-participants") return true;
      if (coreFlowNormalized.type === "selected-participants") return coreFlowNormalized.participantIds.includes(coreFlowState.currentUser.id);
      if (coreFlowNormalized.type === "organizer-and-author") return coreFlowOwnerId === coreFlowState.currentUser.id || coreFlowNormalized.participantIds.includes(coreFlowState.currentUser.id);
      return false;
    }

    function coreFlowAddHistory(coreFlowText, coreFlowAudience) {
      coreFlowState.history.push({
        id: "history-" + Date.now() + Math.random(),
        time: "14:10",
        text: coreFlowText,
        audience: coreFlowAudience || { type: "organizer", participantIds: [] }
      });
    }

    function coreFlowAddSignal(coreFlowSignal) {
      if (!coreFlowCanMutate("sos")) return false;
      const coreFlowAuthorName = coreFlowSignal.authorName || coreFlowState.currentUser.name + (coreFlowState.currentUser.label ? " (" + coreFlowState.currentUser.label + ")" : "");
      const coreFlowAudience = coreFlowState.role === "participant"
        ? { type: "organizer-and-author", participantIds: [coreFlowState.currentUser.id] }
        : { type: "organizer", participantIds: [] };
      const coreFlowSignalPayload = Object.assign({}, coreFlowSignal);
      delete coreFlowSignalPayload["public"];
      const coreFlowNewSignal = Object.assign({
        id: "signal-" + Date.now(),
        authorId: coreFlowState.currentUser.id,
        authorName: coreFlowAuthorName,
        source: coreFlowState.role === "organizer" ? "Ручной сигнал" : "SOS участника",
        confidence: coreFlowState.role === "organizer" ? "Ручная фиксация организатора" : "Средняя · требуется проверка",
        time: "19 июля, 14:10",
        status: "Сигнал требует проверки",
        audience: coreFlowAudience
      }, coreFlowSignalPayload);
      coreFlowState.signals.unshift(coreFlowNewSignal);
      coreFlowState.selectedSignalId = coreFlowNewSignal.id;
      coreFlowState.uiScenario = "sos";
      coreFlowState.scenario = "sos";
      coreFlowAddHistory(coreFlowAuthorName + " зафиксировал сигнал: " + coreFlowNewSignal.type, coreFlowState.role === "organizer" ? { type: "organizer", participantIds: [] } : coreFlowAudience);
      coreFlowNotify("signal-added");
      return true;
    }

    function coreFlowSetVerdict(coreFlowVerdict) {
      if (!coreFlowCanMutate("verify")) return false;
      if (coreFlowVerdict === "confirm") {
        coreFlowState.violationConfirmed = true;
        coreFlowState.planBVisible = true;
        coreFlowState.uiScenario = "planBReady";
        coreFlowState.scenario = "planBReady";
        coreFlowAddHistory((coreFlowState.currentUser.name || "Организатор") + " (Вы) подтвердил нарушение" + (coreFlowSelectedSignal() ? ": " + coreFlowSelectedSignal().type : ""), { type: "organizer", participantIds: [] });
      } else if (coreFlowVerdict === "more") {
        coreFlowState.uiScenario = "review";
        coreFlowState.scenario = "review";
        coreFlowAddHistory("Организатор запросил дополнительную проверку", { type: "organizer", participantIds: [] });
      } else {
        coreFlowState.uiScenario = "normal";
        coreFlowState.scenario = "normal";
        coreFlowAddHistory("Организатор отметил: нарушение не подтверждено", { type: "organizer", participantIds: [] });
      }
      coreFlowNotify("verdict");
      return true;
    }

    function coreFlowEnsureDraft(coreFlowPlanId) {
      const coreFlowOptions = coreFlowActivePlanOptions();
      const coreFlowPlan = coreFlowOptions.find(function coreFlowFindDraftPlan(coreFlowCandidate) {
        return coreFlowCandidate.id === (coreFlowPlanId || coreFlowState.selectedPlanBId || "plan-b");
      }) || coreFlowOptions[1] || coreFlowOptions[0];
      if (coreFlowState.messages.some(function coreFlowSomeMessage(coreFlowMessage) { return coreFlowMessage.planB === coreFlowPlan.label; })) return "message-draft-" + coreFlowPlan.id;
      const coreFlowDraftId = "message-draft-" + coreFlowPlan.id;
      coreFlowState.messages.unshift({
        id: coreFlowDraftId,
        topic: "Изменение маршрута: " + coreFlowPlan.label,
        recipients: { type: "all-participants", participantIds: [], providerType: null },
        channel: "Telegram",
        author: "Артём (Вы)",
        time: coreFlowNowLabel(),
        status: "Черновик",
        segment: (coreFlowSelectedSignal() && coreFlowSelectedSignal().segment) || "Маршрут целиком",
        planB: coreFlowPlan.label,
        text: "Подтверждено нарушение по сегменту " + ((coreFlowSelectedSignal() && coreFlowSelectedSignal().segment) || "маршрута") + ". Готовим переход на " + coreFlowPlan.label + ": " + coreFlowPlan.title + ". Новое время: " + coreFlowPlan.newTime + ". Данные демонстрационные, реальная отправка не выполняется.",
        type: "plan"
      });
      coreFlowAddHistory("Создан черновик сообщения по выбранному Plan B", { type: "organizer", participantIds: [] });
      return coreFlowDraftId;
    }

    function coreFlowPublishPlanSelectedEvent(coreFlowPlan, coreFlowDraftId) {
      const coreFlowPayload = {
        tripId: coreFlowState.trip.id,
        disruptionId: coreFlowState.selectedSignalId || (coreFlowState.signals[0] ? coreFlowState.signals[0].id : ""),
        planId: coreFlowPlan.id,
        selectedAt: new Date().toISOString(),
        selectedBy: coreFlowState.currentUser.id,
        affectedSegmentIds: coreFlowAffectedSegmentIds(),
        updatedTimes: { arrival: coreFlowPlan.newTime },
        hotelImpact: coreFlowPlan.hotel,
        transferImpact: coreFlowPlan.transfer,
        activityImpact: coreFlowPlan.activities,
        estimatedCost: coreFlowPlan.cost,
        messageDraftId: coreFlowDraftId
      };
      window.dispatchEvent(new CustomEvent("coreflow:plan-selected", { detail: coreFlowPayload }));
      return coreFlowPayload;
    }

    function coreFlowChoosePlan(coreFlowPlanId) {
      if (!coreFlowCanMutate("plan")) return false;
      const coreFlowPlan = coreFlowActivePlanOptions().find(function coreFlowFindPlan(coreFlowCandidate) { return coreFlowCandidate.id === coreFlowPlanId; });
      if (!coreFlowPlan) return false;
      coreFlowState.selectedPlanBId = coreFlowPlanId;
      coreFlowState.uiScenario = "draftCreated";
      coreFlowState.scenario = "draftCreated";
      const coreFlowDraftId = coreFlowEnsureDraft(coreFlowPlanId);
      coreFlowState.lastPlanSelectedEvent = coreFlowPublishPlanSelectedEvent(coreFlowPlan, coreFlowDraftId);
      coreFlowAddHistory((coreFlowState.currentUser.name || "Организатор") + " (Вы) выбрал " + coreFlowPlan.label, { type: "organizer", participantIds: [] });
      coreFlowNotify("plan-selected");
      return true;
    }

    function coreFlowSaveMessage(coreFlowMessage) {
      if (!coreFlowCanMutate("message")) return false;
      const coreFlowSafeMessage = Object.assign({}, coreFlowMessage, { recipients: coreFlowNormalizeRecipients(coreFlowMessage.recipients) });
      const coreFlowExisting = coreFlowState.messages.find(function coreFlowFindMessage(coreFlowCandidate) { return coreFlowCandidate.id === coreFlowSafeMessage.id; });
      if (coreFlowExisting) Object.assign(coreFlowExisting, coreFlowSafeMessage);
      else coreFlowState.messages.unshift(coreFlowSafeMessage);
      coreFlowState.selectedMessageId = coreFlowSafeMessage.id;
      coreFlowAddHistory("Сохранён черновик сообщения: " + coreFlowSafeMessage.topic, { type: "organizer", participantIds: [] });
      coreFlowNotify("message-saved");
      return true;
    }

    function coreFlowSelectMessage(coreFlowMessageId) {
      coreFlowState.selectedMessageId = coreFlowMessageId;
      coreFlowState.mobileMessageMode = "detail";
      coreFlowNotify("message-selected");
    }

    function coreFlowSetMobileMessageMode(coreFlowMode) {
      coreFlowState.mobileMessageMode = coreFlowMode === "detail" ? "detail" : "list";
      coreFlowNotify("message-mobile-mode");
    }

    function coreFlowSendMessage(coreFlowMessageId) {
      if (!coreFlowCanMutate("message")) return false;
      const coreFlowMessage = coreFlowState.messages.find(function coreFlowFindMessage(coreFlowCandidate) { return coreFlowCandidate.id === coreFlowMessageId; });
      if (!coreFlowMessage) return false;
      coreFlowMessage.status = "Демонстрационно отправлено";
      coreFlowMessage.time = coreFlowNowLabel();
      coreFlowState.uiScenario = "messageSent";
      coreFlowState.scenario = "messageSent";
      coreFlowAddHistory("Сообщение «" + coreFlowMessage.topic + "» отправлено в демонстрационном режиме", coreFlowNormalizeRecipients(coreFlowMessage.recipients));
      coreFlowNotify("message-sent");
      return true;
    }

    function coreFlowVisibleSignals() {
      if (coreFlowIsNoAccess()) return [];
      return coreFlowState.signals.filter(function coreFlowFilterSignal(coreFlowSignal) {
        return coreFlowAudienceVisible(coreFlowSignal.audience, coreFlowSignal.authorId);
      });
    }

    function coreFlowMessageVisibleToCurrentUser(coreFlowMessage) {
      if (coreFlowState.role === "organizer") return true;
      if (["Черновик", "Готово к отправке"].includes(coreFlowMessage.status)) return false;
      const coreFlowRecipients = coreFlowNormalizeRecipients(coreFlowMessage.recipients);
      if (coreFlowRecipients.type === "all-participants") return true;
      if (coreFlowRecipients.type === "selected-participants") return coreFlowRecipients.participantIds.includes(coreFlowState.currentUser.id);
      return false;
    }

    function coreFlowVisibleMessages() {
      if (coreFlowIsNoAccess()) return [];
      return coreFlowState.messages.filter(coreFlowMessageVisibleToCurrentUser);
    }

    function coreFlowVisibleHistory() {
      if (coreFlowIsNoAccess()) return [];
      return coreFlowState.history.filter(function coreFlowFilterHistory(coreFlowItem) {
        return coreFlowAudienceVisible(coreFlowItem.audience, null);
      });
    }

    function coreFlowToast(coreFlowText) {
      coreFlowEnsurePortals();
      const coreFlowToastNode = document.createElement("div");
      coreFlowToastNode.className = "coreflow-toast";
      coreFlowToastNode.textContent = coreFlowText;
      coreFlowToastRoot.appendChild(coreFlowToastNode);
      const coreFlowTimer = setTimeout(function coreFlowRemoveToast() {
        coreFlowToastNode.remove();
        coreFlowTimers.delete(coreFlowTimer);
      }, 2600);
      coreFlowTimers.add(coreFlowTimer);
    }

    function coreFlowCloseSharedUi(coreFlowMeta) {
      if (coreFlowModalAbort) {
        coreFlowModalAbort.abort();
        coreFlowModalAbort = null;
      }
      if (coreFlowModalRoot) {
        coreFlowModalRoot.classList.remove("is-open");
        coreFlowModalRoot.innerHTML = "";
      }
      if (!coreFlowMeta || !coreFlowMeta.skipFocus) {
        if (coreFlowLastFocus && typeof coreFlowLastFocus.focus === "function") coreFlowLastFocus.focus();
      }
      coreFlowLastFocus = null;
    }

    function coreFlowHandleModalKeydown(coreFlowEvent) {
      if (coreFlowEvent.key === "Escape") {
        coreFlowCloseSharedUi();
        return;
      }
      if (coreFlowEvent.key !== "Tab" || !coreFlowModalRoot) return;
      const coreFlowFocusable = coreFlowModalRoot.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
      if (!coreFlowFocusable.length) return;
      const coreFlowFirst = coreFlowFocusable[0];
      const coreFlowLast = coreFlowFocusable[coreFlowFocusable.length - 1];
      if (coreFlowEvent.shiftKey && document.activeElement === coreFlowFirst) {
        coreFlowEvent.preventDefault();
        coreFlowLast.focus();
      } else if (!coreFlowEvent.shiftKey && document.activeElement === coreFlowLast) {
        coreFlowEvent.preventDefault();
        coreFlowFirst.focus();
      }
    }

    function coreFlowOpenModal(coreFlowConfig) {
      coreFlowEnsurePortals();
      coreFlowCloseSharedUi({ skipFocus: true });
      coreFlowModalAbort = new AbortController();
      coreFlowLastFocus = document.activeElement;
      coreFlowModalRoot.classList.add("is-open");
      coreFlowModalRoot.innerHTML = `
        <section class="coreflow-modal" role="dialog" aria-modal="true" aria-labelledby="coreflow-modal-title" data-od-id="coreflow-modal">
          <header class="coreflow-modal-header">
            <h2 id="coreflow-modal-title">${coreFlowEscapeHtml(coreFlowConfig.title)}</h2>
            <button id="coreflow-modal-close" class="coreflow-button coreflow-button--quiet" type="button">Закрыть</button>
          </header>
          <div class="coreflow-modal-body">${coreFlowConfig.body}</div>
          <footer class="coreflow-modal-footer">${coreFlowConfig.footer || ""}</footer>
        </section>`;
      coreFlowModalRoot.querySelector("#coreflow-modal-close").addEventListener("click", coreFlowCloseSharedUi, { signal: coreFlowModalAbort.signal });
      coreFlowModalRoot.addEventListener("click", function coreFlowOverlayClick(coreFlowEvent) {
        if (coreFlowEvent.target === coreFlowModalRoot) coreFlowCloseSharedUi();
      }, { signal: coreFlowModalAbort.signal });
      document.addEventListener("keydown", coreFlowHandleModalKeydown, { signal: coreFlowModalAbort.signal });
      if (typeof coreFlowConfig.onMount === "function") coreFlowConfig.onMount(coreFlowModalRoot, coreFlowModalAbort.signal);
      const coreFlowFocusTarget = coreFlowModalRoot.querySelector("input, select, textarea, button");
      if (coreFlowFocusTarget) coreFlowFocusTarget.focus();
    }

    function coreFlowRegisterSosHandler(coreFlowHandler) {
      coreFlowSosHandler = coreFlowHandler;
      return function coreFlowUnregisterSosHandler() {
        if (coreFlowSosHandler === coreFlowHandler) coreFlowSosHandler = null;
      };
    }

    function coreFlowRegisterDraftHandler(coreFlowHandler) {
      coreFlowDraftHandler = coreFlowHandler;
      return function coreFlowUnregisterDraftHandler() {
        if (coreFlowDraftHandler === coreFlowHandler) coreFlowDraftHandler = null;
      };
    }

    function coreFlowOpenSos(coreFlowOptions) {
      if (coreFlowIsNoAccess() || !coreFlowCanMutate("sos")) {
        coreFlowToast(coreFlowIsOffline() ? "Офлайн. Доступен только просмотр сохранённых данных." : "Действие недоступно.");
        return false;
      }
      if (coreFlowSosHandler) return coreFlowSosHandler(coreFlowOptions || {});
      return false;
    }

    function coreFlowOpenMessageDraft(coreFlowOptions) {
      if (!coreFlowCanMutate("message")) {
        coreFlowToast("Создание сообщения сейчас недоступно.");
        return false;
      }
      if (coreFlowDraftHandler) return coreFlowDraftHandler(coreFlowOptions || {});
      return false;
    }

    coreFlowEnsurePortals();

    const coreFlowAdapter = {
      getState: function coreFlowGetState() { return coreFlowClone(coreFlowState); },
      notify: coreFlowNotify,
      subscribe: coreFlowSubscribe,
      setRole: coreFlowSetRole,
      setScenario: coreFlowSetScenario,
      resetDemoData: coreFlowResetDemoData,
      getScenarioLabel: function coreFlowGetScenarioLabel(coreFlowScenario) { return coreFlowScenarioLabels[coreFlowScenario] || coreFlowScenario; },
      canMutate: coreFlowCanMutate,
      isNoAccess: coreFlowIsNoAccess,
      isOffline: coreFlowIsOffline,
      isCompleted: coreFlowIsCompleted,
      getSegments: function coreFlowGetSegments() { return coreFlowClone(coreFlowActiveSegments()); },
      getPlanBOptions: function coreFlowGetPlanBOptions() { return coreFlowClone(coreFlowActivePlanOptions()); },
      getParticipants: function coreFlowGetParticipants() { return coreFlowClone(coreFlowState.participants); },
      normalizeRecipients: coreFlowNormalizeRecipients,
      formatRecipients: coreFlowFormatRecipients,
      visibleSignals: coreFlowVisibleSignals,
      addSignal: coreFlowAddSignal,
      setVerdict: coreFlowSetVerdict,
      choosePlan: coreFlowChoosePlan,
      saveMessage: coreFlowSaveMessage,
      selectMessage: coreFlowSelectMessage,
      setMobileMessageMode: coreFlowSetMobileMessageMode,
      sendMessage: coreFlowSendMessage,
      visibleMessages: coreFlowVisibleMessages,
      visibleHistory: coreFlowVisibleHistory,
      toast: coreFlowToast,
      openModal: coreFlowOpenModal,
      closeSharedUi: coreFlowCloseSharedUi,
      registerSosHandler: coreFlowRegisterSosHandler,
      registerDraftHandler: coreFlowRegisterDraftHandler,
      openSos: coreFlowOpenSos,
      openMessageDraft: coreFlowOpenMessageDraft,
      escape: coreFlowEscapeHtml,
      escapeAttribute: coreFlowEscapeAttribute,
      destroy: function coreFlowDestroy() {
        if (coreFlowTravelUnsubscribe) coreFlowTravelUnsubscribe();
        coreFlowTimers.forEach(function coreFlowClearTimer(coreFlowTimer) { clearTimeout(coreFlowTimer); });
        coreFlowTimers.clear();
        coreFlowSubscribers.clear();
        coreFlowSosHandler = null;
        coreFlowDraftHandler = null;
        coreFlowCloseSharedUi({ skipFocus: true });
        if (window.coreFlowActiveAdapter === coreFlowAdapter) window.coreFlowActiveAdapter = null;
        if (window.coreFlowPreviewAdapter === coreFlowAdapter) window.coreFlowPreviewAdapter = null;
      }
    };

    return coreFlowAdapter;
  }

  window.coreFlowCreateStateAdapter = coreFlowCreateStateAdapter;
  window.coreFlowOpenSos = function coreFlowOpenSosGlobal(coreFlowOptions) {
    const coreFlowAdapter = window.coreFlowActiveAdapter || window.coreFlowPreviewAdapter;
    return coreFlowAdapter ? coreFlowAdapter.openSos(coreFlowOptions) : false;
  };
  window.coreFlowOpenMessageDraft = function coreFlowOpenMessageDraftGlobal(coreFlowOptions) {
    const coreFlowAdapter = window.coreFlowActiveAdapter || window.coreFlowPreviewAdapter;
    return coreFlowAdapter ? coreFlowAdapter.openMessageDraft(coreFlowOptions) : false;
  };
})();

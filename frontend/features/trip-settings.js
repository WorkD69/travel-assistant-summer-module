(function settingsModule() {
  const settingsInstances = new WeakMap();

  const settingsInitialState = {
    demoRole: "organizer",
    demoView: "normal",
    tripStatus: "active",
    deletedTrip: false,
    title: "Отпуск в Турции",
    route: "Сыктывкар → Москва → Анталья",
    startDate: "2026-07-19",
    endDate: "2026-07-25",
    copyState: "saved",
    copyDate: "2026-07-17T14:30:00",
    copySize: 8.4,
    hasPlanB: false,
    includeRouteMap: true,
    includeObservations: true,
    includeDocuments: true,
    selectedDocuments: ["ticket-scw-svo", "ticket-svo-ayt", "hotel-booking", "transfer-voucher"]
  };

  const settingsRoleLabels = {
    organizer: "Организатор",
    participant: "Участник"
  };

  const settingsViewLabels = {
    normal: "Обычный",
    completed: "Завершённая поездка",
    offline: "Офлайн",
    stale: "Устаревшая копия",
    missing: "Копия отсутствует",
    copyDeleted: "Копия удалена",
    revoked: "Доступ отозван",
    error: "Ошибка",
    loading: "Загрузка"
  };

  const settingsCopyLabels = {
    missing: "Копия отсутствует",
    choosing: "Выбор содержимого",
    saving: "Сохраняется",
    saved: "Актуальна",
    updating: "Обновляется",
    stale: "Возможно устарела",
    offline: "Офлайн",
    revoked: "Доступ отозван",
    deleted: "Копия удалена",
    error: "Ошибка сохранения"
  };

  // Список документов берётся из центрального store (единый источник данных).
  const settingsFallbackDocuments = [
    { id: "ticket-scw-svo", title: "Билет Сыктывкар — Москва", size: 0.45, organizerOnly: false },
    { id: "ticket-svo-ayt", title: "Билет Москва — Анталья", size: 0.45, organizerOnly: false },
    { id: "hotel-booking", title: "Бронь отеля", size: 0.45, organizerOnly: false },
    { id: "transfer-voucher", title: "Трансфер аэропорт — отель", size: 0.45, organizerOnly: false },
    { id: "insurance", title: "Страховка", size: 0.55, organizerOnly: true }
  ];

  function settingsGetDocuments() {
    if (!window.TravelAppState) return settingsFallbackDocuments;
    return window.TravelAppState.getState().documents.map((settingsDocument) => ({
      id: settingsDocument.id,
      title: String(settingsDocument.name || settingsDocument.id).replace(/\.[A-Za-z0-9]+$/, ""),
      size: typeof settingsDocument.sizeMb === "number" ? settingsDocument.sizeMb : 0.45,
      organizerOnly: settingsDocument.visibility !== "shared"
    }));
  }

  const settingsRequiredData = [
    "Основная информация о поездке",
    "Подтверждённый таймлайн",
    "Текстовый маршрут"
  ];

  function settingsCloneState() {
    const settingsBase = JSON.parse(JSON.stringify(settingsInitialState));
    if (window.TravelAppState) {
      const settingsShared = window.TravelAppState.getState();
      settingsBase.title = settingsShared.trip.title;
      settingsBase.route = settingsShared.trip.route;
      settingsBase.startDate = settingsShared.trip.startDate;
      settingsBase.endDate = settingsShared.trip.endDate;
      settingsBase.tripStatus = settingsShared.trip.status === "completed" ? "completed" : "active";
      settingsBase.deletedTrip = settingsShared.trip.status === "deleted";
      settingsBase.demoRole = settingsShared.currentUser.currentTripRole;
      settingsBase.copyState = settingsShared.offlineCopy.status;
      settingsBase.copyDate = settingsShared.offlineCopy.savedAt;
      settingsBase.copySize = settingsShared.offlineCopy.size;
      settingsBase.includeRouteMap = settingsShared.offlineCopy.includeRouteMap;
      settingsBase.includeObservations = settingsShared.offlineCopy.includeObservations;
      settingsBase.includeDocuments = settingsShared.offlineCopy.includeDocuments;
      settingsBase.selectedDocuments = settingsShared.offlineCopy.selectedDocuments.slice();
    }
    return settingsBase;
  }

  function settingsInit(settingsRootElement) {
    const settingsSurface = settingsRootElement || document.querySelector('[data-feature="trip-settings"]');
    if (!settingsSurface) return null;
    if (settingsInstances.has(settingsSurface)) {
      return settingsInstances.get(settingsSurface);
    }

    const settingsContext = {
      settingsSurface,
      settingsState: settingsCloneState(),
      settingsHandlers: [],
      settingsActiveModal: null,
      settingsPreviousFocus: null,
      settingsProgressTimer: null,
      settingsProgressToken: 0,
      settingsPreviousCopyState: null,
      settingsToastTimers: []
    };

    settingsBindEvents(settingsContext);
    settingsRender(settingsContext);

    if (window.TravelAppState) {
      settingsContext.settingsSharedListener = function settingsSharedListener(settingsShared, settingsChangedKeys, settingsMeta) {
        const settingsKeys = settingsChangedKeys || [];
        const settingsInfo = settingsMeta || {};
        if (settingsContext.settingsSyncing || settingsInfo.source === "settings") return;
        if (settingsInfo.reset) {
          settingsCancelProgress(settingsContext);
          settingsCloseModal(settingsContext, false);
          settingsContext.settingsState = settingsCloneState();
          settingsRender(settingsContext);
          return;
        }
        const settingsRelevant = ["trip", "currentUser", "participants", "documents", "offlineCopy"];
        if (!settingsKeys.some((settingsKey) => settingsRelevant.indexOf(settingsKey) !== -1)) return;
        const settingsLocal = settingsContext.settingsState;
        if (settingsKeys.indexOf("trip") !== -1) {
          settingsLocal.title = settingsShared.trip.title;
          settingsLocal.route = settingsShared.trip.route;
          settingsLocal.startDate = settingsShared.trip.startDate;
          settingsLocal.endDate = settingsShared.trip.endDate;
          settingsLocal.tripStatus = settingsShared.trip.status === "completed" ? "completed" : "active";
          settingsLocal.deletedTrip = settingsShared.trip.status === "deleted";
        }
        if (settingsKeys.indexOf("currentUser") !== -1) {
          settingsLocal.demoRole = settingsShared.currentUser.currentTripRole;
        }
        settingsRender(settingsContext);
      };
      window.TravelAppState.subscribe(settingsContext.settingsSharedListener);
    }

    const settingsApi = {
      destroy: function settingsDestroyApi() {
        settingsDestroy(settingsSurface);
      },
      reset: function settingsResetApi() {
        settingsResetDemo(settingsContext);
      }
    };

    settingsInstances.set(settingsSurface, settingsApi);
    settingsSurface.settingsApi = settingsApi;
    return settingsApi;
  }

  function settingsDestroy(settingsRootElement) {
    const settingsSurface = settingsRootElement || document.querySelector('[data-feature="trip-settings"]');
    if (!settingsSurface) return;
    const settingsApi = settingsInstances.get(settingsSurface);
    const settingsContext = settingsSurface.settingsContext;
    if (!settingsContext) {
      settingsInstances.delete(settingsSurface);
      return;
    }

    settingsCancelProgress(settingsContext);
    settingsCloseModal(settingsContext, false);
    if (settingsContext.settingsSharedListener && window.TravelAppState) {
      window.TravelAppState.unsubscribe(settingsContext.settingsSharedListener);
      settingsContext.settingsSharedListener = null;
    }
    settingsContext.settingsHandlers.forEach((settingsItem) => {
      settingsItem.settingsTarget.removeEventListener(settingsItem.settingsType, settingsItem.settingsHandler);
    });
    settingsContext.settingsToastTimers.forEach((settingsTimer) => window.clearTimeout(settingsTimer));
    settingsContext.settingsHandlers = [];
    settingsContext.settingsToastTimers = [];
    delete settingsSurface.settingsContext;
    delete settingsSurface.settingsApi;
    if (settingsApi) settingsInstances.delete(settingsSurface);
  }

  function settingsById(settingsContext, settingsId) {
    return settingsContext.settingsSurface.querySelector(`#${settingsId}`);
  }

  function settingsAll(settingsContext, settingsSelector) {
    return Array.from(settingsContext.settingsSurface.querySelectorAll(settingsSelector));
  }

  function settingsOn(settingsContext, settingsTarget, settingsType, settingsHandler) {
    if (!settingsTarget) return;
    settingsTarget.addEventListener(settingsType, settingsHandler);
    settingsContext.settingsHandlers.push({ settingsTarget, settingsType, settingsHandler });
  }

  function settingsSetText(settingsContext, settingsId, settingsValue) {
    const settingsNode = settingsById(settingsContext, settingsId);
    if (settingsNode) settingsNode.textContent = settingsValue;
  }

  function settingsSetHidden(settingsNode, settingsHidden) {
    if (settingsNode) settingsNode.hidden = settingsHidden;
  }

  function settingsFormatDate(settingsValue) {
    const settingsDate = new Date(`${settingsValue}T00:00:00`);
    return settingsDate.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  }

  function settingsFormatDateTime(settingsValue) {
    const settingsDate = new Date(settingsValue);
    return settingsDate.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) + ", " + settingsDate.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  function settingsFormatSize(settingsValue) {
    return `${settingsValue.toFixed(1).replace(".", ",")} МБ`;
  }

  function settingsAvailableDocuments(settingsContext) {
    return settingsGetDocuments().filter((settingsDocument) => !settingsDocument.organizerOnly || settingsContext.settingsState.demoRole === "organizer");
  }

  function settingsSelectedDocumentObjects(settingsContext) {
    const settingsAllowed = settingsAvailableDocuments(settingsContext).map((settingsDocument) => settingsDocument.id);
    return settingsGetDocuments().filter((settingsDocument) => settingsAllowed.includes(settingsDocument.id) && settingsContext.settingsState.selectedDocuments.includes(settingsDocument.id));
  }

  function settingsEstimateSize(settingsContext, settingsDraft) {
    const settingsState = settingsDraft || settingsContext.settingsState;
    const settingsAllowedDocuments = settingsAvailableDocuments(settingsContext).map((settingsDocument) => settingsDocument.id);
    let settingsSize = 5.2;
    if (settingsState.includeRouteMap) settingsSize += 0.8;
    if (settingsState.includeObservations) settingsSize += 0.6;
    if (settingsState.includeDocuments) {
      settingsGetDocuments().forEach((settingsDocument) => {
        if (settingsAllowedDocuments.includes(settingsDocument.id) && settingsState.selectedDocuments.includes(settingsDocument.id)) settingsSize += settingsDocument.size;
      });
    }
    return Math.max(settingsSize, 5.2);
  }

  function settingsEffectiveCopyState(settingsContext) {
    const settingsView = settingsContext.settingsState.demoView;
    if (settingsView === "offline") return "offline";
    if (settingsView === "stale") return "stale";
    if (settingsView === "missing") return "missing";
    if (settingsView === "copyDeleted") return "deleted";
    if (settingsView === "revoked") return "revoked";
    if (settingsView === "error") return "error";
    return settingsContext.settingsState.copyState;
  }

  function settingsIsCompleted(settingsContext) {
    return settingsContext.settingsState.tripStatus === "completed" || settingsContext.settingsState.demoView === "completed";
  }

  function settingsIsOffline(settingsContext) {
    return settingsContext.settingsState.demoView === "offline";
  }

  function settingsIsReadOnly(settingsContext) {
    return settingsIsCompleted(settingsContext) || settingsIsOffline(settingsContext) || settingsContext.settingsState.deletedTrip;
  }

  function settingsCanMutate(settingsContext) {
    return !settingsIsReadOnly(settingsContext) && settingsContext.settingsState.demoView !== "loading" && settingsEffectiveCopyState(settingsContext) !== "revoked";
  }

  function settingsCanManageTrip(settingsContext) {
    return settingsContext.settingsState.demoRole === "organizer" && !settingsIsOffline(settingsContext) && !settingsContext.settingsState.deletedTrip;
  }

  function settingsCancelProgress(settingsContext) {
    const settingsWasRunning = settingsContext.settingsState.copyState === "saving" || settingsContext.settingsState.copyState === "updating";
    if (settingsContext.settingsProgressTimer) {
      window.clearInterval(settingsContext.settingsProgressTimer);
      settingsContext.settingsProgressTimer = null;
    }
    settingsContext.settingsProgressToken += 1;
    const settingsProgress = settingsById(settingsContext, "settings-copy-progress");
    const settingsBar = settingsById(settingsContext, "settings-copy-progress-bar");
    const settingsText = settingsById(settingsContext, "settings-copy-progress-text");
    if (settingsProgress) settingsProgress.hidden = true;
    if (settingsBar) settingsBar.style.width = "0%";
    if (settingsText) settingsText.textContent = "Подготовка данных";
    if (settingsWasRunning) {
      settingsContext.settingsState.copyState = settingsContext.settingsPreviousCopyState || "saved";
    }
    settingsContext.settingsPreviousCopyState = null;
  }

  function settingsCommitShared(settingsContext, settingsUpdate) {
    if (!window.TravelAppState) return;
    settingsContext.settingsSyncing = true;
    window.TravelAppState.setState(settingsUpdate, { source: "settings" });
    settingsContext.settingsSyncing = false;
  }

  function settingsCommitOfflineCopy(settingsContext) {
    const settingsState = settingsContext.settingsState;
    settingsCommitShared(settingsContext, {
      offlineCopy: {
        status: settingsState.copyState,
        savedAt: settingsState.copyDate,
        size: settingsState.copySize,
        includeRouteMap: settingsState.includeRouteMap,
        includeObservations: settingsState.includeObservations,
        includeDocuments: settingsState.includeDocuments,
        selectedDocuments: settingsState.selectedDocuments.slice()
      }
    });
  }

  function settingsRender(settingsContext) {
    if (!settingsContext.settingsSurface.isConnected) return;
    const settingsState = settingsContext.settingsState;
    const settingsCopyState = settingsEffectiveCopyState(settingsContext);
    const settingsCompleted = settingsIsCompleted(settingsContext);
    const settingsOffline = settingsIsOffline(settingsContext);
    const settingsLoading = settingsState.demoView === "loading";
    const settingsDeleted = settingsState.deletedTrip;

    settingsContext.settingsSurface.classList.toggle("settings-participant", settingsState.demoRole === "participant");
    settingsContext.settingsSurface.classList.toggle("settings-readonly", settingsCompleted);
    settingsContext.settingsSurface.classList.toggle("settings-offline", settingsOffline);
    settingsContext.settingsSurface.classList.toggle("settings-deleted", settingsDeleted);

    settingsSetHidden(settingsById(settingsContext, "settings-main"), settingsDeleted);
    settingsSetHidden(settingsById(settingsContext, "settings-deleted-screen"), !settingsDeleted);
    settingsSetHidden(settingsById(settingsContext, "settings-readonly-banner"), !settingsCompleted || settingsDeleted);
    settingsSetHidden(settingsById(settingsContext, "settings-offline-banner"), !settingsOffline || settingsDeleted);
    settingsSetHidden(settingsById(settingsContext, "settings-loading-state"), !settingsLoading || settingsDeleted);
    settingsSetHidden(settingsById(settingsContext, "settings-content"), settingsLoading || settingsDeleted);

    settingsSetText(settingsContext, "settings-demo-current", `Роль: ${settingsRoleLabels[settingsState.demoRole]} · Сценарий: ${settingsViewLabels[settingsState.demoView]}`);
    settingsAll(settingsContext, "[data-settings-role]").forEach((settingsButton) => {
      const settingsActive = settingsButton.dataset.settingsRole === settingsState.demoRole;
      settingsButton.classList.toggle("is-active", settingsActive);
      settingsButton.setAttribute("aria-pressed", settingsActive ? "true" : "false");
    });
    settingsAll(settingsContext, "[data-settings-view]").forEach((settingsButton) => {
      const settingsActive = settingsButton.dataset.settingsView === settingsState.demoView;
      settingsButton.classList.toggle("is-active", settingsActive);
      settingsButton.setAttribute("aria-pressed", settingsActive ? "true" : "false");
    });

    settingsRenderSummary(settingsContext, settingsCompleted);
    settingsRenderCopy(settingsContext, settingsCopyState);
    settingsRenderManagement(settingsContext, settingsCompleted);
  }

  function settingsRenderSummary(settingsContext, settingsCompleted) {
    const settingsState = settingsContext.settingsState;
    const settingsStatus = settingsCompleted ? "Завершена" : "Активная";
    settingsSetText(settingsContext, "settings-value-title", settingsState.title);
    settingsSetText(settingsContext, "settings-value-route", settingsState.route);
    settingsSetText(settingsContext, "settings-value-start", settingsFormatDate(settingsState.startDate));
    settingsSetText(settingsContext, "settings-value-end", settingsFormatDate(settingsState.endDate));
    settingsSetText(settingsContext, "settings-value-status", settingsStatus);
    if (window.TravelAppState) {
      const settingsShared = window.TravelAppState.getState();
      const settingsOrganizer = settingsShared.participants.find((settingsParticipant) => settingsParticipant.role === "organizer");
      settingsSetText(settingsContext, "settings-value-organizer", settingsOrganizer ? settingsOrganizer.name : "—");
      settingsSetText(settingsContext, "settings-value-participants", String(settingsShared.participants.length));
      const settingsVisibleDocuments = settingsShared.documents.filter((settingsDocument) => settingsContext.settingsState.demoRole === "organizer" || settingsDocument.visibility === "shared");
      settingsSetText(settingsContext, "settings-value-documents", String(settingsVisibleDocuments.length));
    }
    settingsSetText(settingsContext, "settings-trip-status-badge", settingsStatus);
    settingsSetText(settingsContext, "settings-role-badge", settingsRoleLabels[settingsState.demoRole]);
    settingsSetText(settingsContext, "settings-complete-trip-name", settingsState.title);
    settingsSetText(settingsContext, "settings-complete-trip-dates", `${settingsFormatDate(settingsState.startDate)} — ${settingsFormatDate(settingsState.endDate)}`);
    settingsSetHidden(settingsById(settingsContext, "settings-edit-trip-open"), settingsState.demoRole !== "organizer" || settingsIsReadOnly(settingsContext));
  }

  function settingsRenderCopy(settingsContext, settingsCopyState) {
    const settingsBadge = settingsById(settingsContext, "settings-copy-state-badge");
    const settingsDetails = settingsById(settingsContext, "settings-copy-details");
    const settingsStatus = settingsById(settingsContext, "settings-offline-status");
    const settingsEmpty = settingsById(settingsContext, "settings-copy-empty");
    const settingsActions = settingsById(settingsContext, "settings-offline-actions");
    const settingsRevoked = settingsCopyState === "revoked";
    const settingsMissingLike = settingsCopyState === "missing" || settingsCopyState === "deleted" || settingsCopyState === "error" || settingsRevoked;
    const settingsHideSensitive = settingsRevoked;

    settingsSetText(settingsContext, "settings-copy-state-badge", settingsCopyLabels[settingsCopyState] || settingsCopyLabels.saved);
    settingsBadge.classList.toggle("settings-badge--warning", settingsCopyState === "stale" || settingsCopyState === "offline" || settingsCopyState === "error");
    settingsBadge.classList.toggle("settings-badge--danger", settingsCopyState === "revoked");

    settingsSetHidden(settingsEmpty, !settingsMissingLike);
    settingsSetHidden(settingsDetails, settingsMissingLike);
    settingsSetHidden(settingsStatus, settingsMissingLike);
    settingsSetHidden(settingsById(settingsContext, "settings-offline-note"), settingsRevoked);
    settingsSetHidden(settingsById(settingsContext, "settings-documents-summary"), settingsHideSensitive);

    settingsRenderCopyEmpty(settingsContext, settingsCopyState);
    settingsRenderCopyMeta(settingsContext, settingsCopyState);
    settingsRenderSavedData(settingsContext, settingsHideSensitive);
    settingsRenderCopyActions(settingsContext, settingsCopyState, settingsActions);
  }

  function settingsRenderCopyEmpty(settingsContext, settingsCopyState) {
    const settingsMap = {
      missing: {
        title: "Офлайн-копия не сохранена",
        text: "Сохраните основные данные поездки, маршрут и выбранные документы для просмотра без интернета."
      },
      deleted: {
        title: "Офлайн-копия удалена",
        text: "Данные поездки на сервере не изменены."
      },
      revoked: {
        title: "Доступ к офлайн-копии отозван",
        text: "Вы больше не можете открыть сохранённые данные этой поездки."
      },
      error: {
        title: "Не удалось сохранить офлайн-копию",
        text: "Повторите попытку после восстановления подключения."
      }
    };
    const settingsConfig = settingsMap[settingsCopyState];
    if (!settingsConfig) return;
    settingsSetText(settingsContext, "settings-copy-empty-title", settingsConfig.title);
    settingsSetText(settingsContext, "settings-copy-empty-text", settingsConfig.text);
  }

  function settingsRenderCopyMeta(settingsContext, settingsCopyState) {
    const settingsState = settingsContext.settingsState;
    const settingsDays = Math.max(0, Math.floor((new Date("2026-07-17T14:30:00") - new Date(settingsState.copyDate)) / 86400000));
    settingsSetText(settingsContext, "settings-copy-date", settingsFormatDateTime(settingsState.copyDate));
    settingsSetText(settingsContext, "settings-copy-size", settingsFormatSize(settingsEstimateSize(settingsContext)));
    if (settingsCopyState === "stale") {
      settingsSetText(settingsContext, "settings-copy-validity", `${settingsDays || 7} дней без обновления`);
      settingsSetText(settingsContext, "settings-copy-subtitle", "Маршрут, документы или наблюдения могли измениться.");
    } else if (settingsCopyState === "offline") {
      settingsSetText(settingsContext, "settings-copy-validity", "Просмотр без сети");
      settingsSetText(settingsContext, "settings-copy-subtitle", "Сохранённые данные доступны только для просмотра.");
    } else {
      settingsSetText(settingsContext, "settings-copy-validity", "Актуальна");
      settingsSetText(settingsContext, "settings-copy-subtitle", "Сохранённый набор данных для просмотра без сети.");
    }
  }

  function settingsRenderSavedData(settingsContext, settingsHideSensitive) {
    const settingsState = settingsContext.settingsState;
    const settingsItems = [...settingsRequiredData];
    if (settingsState.includeRouteMap) settingsItems.push("Статичное PNG-превью маршрута");
    if (settingsState.includeObservations) settingsItems.push("Последние сохранённые наблюдения");
    if (settingsState.includeDocuments) settingsItems.push("Разрешённые пользователю документы");
    if (settingsState.hasPlanB) settingsItems.push("Подтверждённый Plan B");
    settingsRenderList(settingsContext, "settings-saved-data-list", settingsHideSensitive ? [] : settingsItems);
    settingsRenderList(settingsContext, "settings-selected-documents", settingsHideSensitive || !settingsState.includeDocuments ? [] : settingsSelectedDocumentObjects(settingsContext).map((settingsDocument) => settingsDocument.title));
    settingsSetHidden(settingsById(settingsContext, "settings-no-documents-note"), settingsHideSensitive || settingsState.includeDocuments);
  }

  function settingsRenderCopyActions(settingsContext, settingsCopyState, settingsActions) {
    if (!settingsActions) return;
    settingsActions.replaceChildren();
    settingsActions.classList.remove("settings-actions--triple");
    if (settingsContext.settingsState.deletedTrip || settingsContext.settingsState.demoView === "loading") return;

    if (settingsCopyState === "revoked") {
      settingsActions.appendChild(settingsCreateAction(settingsContext, "settings-copy-home", "Вернуться на Главную", "secondary", settingsGoHomeDemo));
      return;
    }

    if (settingsIsOffline(settingsContext) || settingsIsCompleted(settingsContext)) return;

    if (settingsCopyState === "missing") {
      settingsActions.appendChild(settingsCreateAction(settingsContext, "settings-save-copy", "Сохранить для работы без интернета", "primary", () => settingsStartCopyOperation(settingsContext, "save")));
      return;
    }

    if (settingsCopyState === "deleted") {
      settingsActions.appendChild(settingsCreateAction(settingsContext, "settings-save-new-copy", "Сохранить новую копию", "primary", () => settingsStartCopyOperation(settingsContext, "save")));
      return;
    }

    if (settingsCopyState === "error") {
      settingsActions.appendChild(settingsCreateAction(settingsContext, "settings-retry-copy", "Повторить", "primary", () => settingsStartCopyOperation(settingsContext, "save")));
      return;
    }

    if (settingsCopyState === "saving" || settingsCopyState === "updating") {
      const settingsButton = settingsCreateAction(settingsContext, "settings-copy-busy", settingsCopyState === "saving" ? "Сохраняется" : "Обновляется", "primary", null);
      settingsButton.disabled = true;
      settingsActions.appendChild(settingsButton);
      return;
    }

    settingsActions.classList.add("settings-actions--triple");
    settingsActions.appendChild(settingsCreateAction(settingsContext, "settings-update-copy", "Обновить копию", "primary", () => settingsStartCopyOperation(settingsContext, "update"), {
      ariaLabel: "Обновить офлайн-копию",
      title: "Обновить офлайн-копию"
    }));
    settingsActions.appendChild(settingsCreateAction(settingsContext, "settings-configure-copy", "Выбрать содержимое", "secondary", (settingsEvent) => settingsOpenConfigureModal(settingsContext, settingsEvent.currentTarget), {
      ariaLabel: "Выбрать содержимое офлайн-копии",
      title: "Выбрать содержимое офлайн-копии"
    }));
    settingsActions.appendChild(settingsCreateAction(settingsContext, "settings-delete-copy-open", "Удалить локальную копию", "danger", (settingsEvent) => settingsOpenModal(settingsContext, "settings-delete-copy-modal", settingsEvent.currentTarget), {
      ariaLabel: "Удалить локальную офлайн-копию",
      title: "Удалить локальную офлайн-копию"
    }));
  }

  function settingsCreateAction(settingsContext, settingsId, settingsLabel, settingsVariant, settingsHandler, settingsOptions) {
    const settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.id = settingsId;
    settingsButton.className = `settings-button settings-button--${settingsVariant}`;
    settingsButton.textContent = settingsLabel;
    if (settingsOptions && settingsOptions.ariaLabel) settingsButton.setAttribute("aria-label", settingsOptions.ariaLabel);
    if (settingsOptions && settingsOptions.title) settingsButton.title = settingsOptions.title;
    if (settingsHandler) settingsOn(settingsContext, settingsButton, "click", settingsHandler);
    return settingsButton;
  }

  function settingsRenderManagement(settingsContext, settingsCompleted) {
    const settingsCanManage = settingsCanManageTrip(settingsContext);
    const settingsManagement = settingsById(settingsContext, "settings-management-card");
    const settingsCompletePanel = settingsById(settingsContext, "settings-complete-panel");
    const settingsDangerZone = settingsById(settingsContext, "settings-danger-zone");
    settingsSetHidden(settingsManagement, !settingsCanManage);
    settingsSetHidden(settingsCompletePanel, !settingsCanManage || settingsCompleted);
    settingsSetHidden(settingsDangerZone, !settingsCanManage);
    if (settingsCompleted) {
      settingsSetText(settingsContext, "settings-management-intro", "Поездка завершена. Для организатора доступно только удаление поездки.");
    } else {
      settingsSetText(settingsContext, "settings-management-intro", "Действия организатора, которые меняют доступность поездки.");
    }
  }

  function settingsRenderList(settingsContext, settingsId, settingsItems) {
    const settingsList = settingsById(settingsContext, settingsId);
    if (!settingsList) return;
    settingsList.replaceChildren();
    settingsItems.forEach((settingsItem) => {
      const settingsLi = document.createElement("li");
      settingsLi.textContent = settingsItem;
      settingsList.appendChild(settingsLi);
    });
  }

  function settingsSetRole(settingsContext, settingsRole) {
    settingsContext.settingsState.demoRole = settingsRole;
    if (settingsRole === "participant") {
      settingsCloseModal(settingsContext, false);
    }
    settingsRender(settingsContext);
  }

  function settingsSetView(settingsContext, settingsView) {
    if (["offline", "error", "revoked", "copyDeleted", "completed"].includes(settingsView)) {
      settingsCancelProgress(settingsContext);
      settingsCloseModal(settingsContext, false);
    }
    settingsContext.settingsState.demoView = settingsView;
    settingsRender(settingsContext);
  }

  function settingsResetDemo(settingsContext) {
    settingsCancelProgress(settingsContext);
    settingsCloseModal(settingsContext, false);
    if (window.TravelAppState) {
      window.TravelAppState.resetDemoData();
      settingsToast(settingsContext, "Демо-данные сброшены");
      return;
    }
    settingsContext.settingsState = settingsCloneState();
    settingsRender(settingsContext);
    settingsToast(settingsContext, "Демо-данные сброшены");
  }

  function settingsToast(settingsContext, settingsMessage) {
    const settingsRegion = settingsById(settingsContext, "settings-toast-region");
    if (!settingsRegion) return;
    const settingsToastNode = document.createElement("div");
    settingsToastNode.className = "settings-toast";
    settingsToastNode.textContent = settingsMessage;
    settingsRegion.appendChild(settingsToastNode);
    const settingsTimer = window.setTimeout(() => {
      settingsToastNode.remove();
    }, 3200);
    settingsContext.settingsToastTimers.push(settingsTimer);
  }

  function settingsGetFocusable(settingsContainer) {
    return Array.from(settingsContainer.querySelectorAll('button:not(:disabled), input:not(:disabled), summary, [href], [tabindex]:not([tabindex="-1"])'))
      .filter((settingsNode) => !settingsNode.hidden && settingsNode.offsetParent !== null);
  }

  function settingsOpenModal(settingsContext, settingsId, settingsTrigger) {
    if (!settingsCanMutate(settingsContext) && settingsId !== "settings-delete-trip-modal") return;
    const settingsModal = settingsById(settingsContext, settingsId);
    if (!settingsModal) return;
    settingsContext.settingsPreviousFocus = settingsTrigger || document.activeElement;
    settingsContext.settingsActiveModal = settingsModal;
    settingsModal.hidden = false;
    const settingsFocusable = settingsGetFocusable(settingsModal);
    if (settingsFocusable.length) settingsFocusable[0].focus();
  }

  function settingsCloseModal(settingsContext, settingsReturnFocus) {
    if (!settingsContext.settingsActiveModal) return;
    settingsContext.settingsActiveModal.hidden = true;
    settingsContext.settingsActiveModal = null;
    if (settingsReturnFocus !== false && settingsContext.settingsPreviousFocus && typeof settingsContext.settingsPreviousFocus.focus === "function") {
      settingsContext.settingsPreviousFocus.focus();
    }
    settingsContext.settingsPreviousFocus = null;
  }

  function settingsHandleKeydown(settingsContext, settingsEvent) {
    if (!settingsContext.settingsActiveModal) return;
    if (settingsEvent.key === "Escape") {
      settingsCloseModal(settingsContext, true);
      return;
    }
    if (settingsEvent.key !== "Tab") return;
    const settingsFocusable = settingsGetFocusable(settingsContext.settingsActiveModal);
    if (!settingsFocusable.length) return;
    const settingsFirst = settingsFocusable[0];
    const settingsLast = settingsFocusable[settingsFocusable.length - 1];
    if (settingsEvent.shiftKey && document.activeElement === settingsFirst) {
      settingsEvent.preventDefault();
      settingsLast.focus();
    } else if (!settingsEvent.shiftKey && document.activeElement === settingsLast) {
      settingsEvent.preventDefault();
      settingsFirst.focus();
    }
  }

  function settingsOpenEditModal(settingsContext, settingsTrigger) {
    if (!settingsCanMutate(settingsContext) || settingsContext.settingsState.demoRole !== "organizer") return;
    settingsById(settingsContext, "settings-field-title").value = settingsContext.settingsState.title;
    settingsById(settingsContext, "settings-field-route").value = settingsContext.settingsState.route;
    settingsById(settingsContext, "settings-field-start").value = settingsContext.settingsState.startDate;
    settingsById(settingsContext, "settings-field-end").value = settingsContext.settingsState.endDate;
    settingsValidateEditForm(settingsContext);
    settingsOpenModal(settingsContext, "settings-edit-modal", settingsTrigger);
  }

  function settingsValidateEditForm(settingsContext) {
    const settingsTitle = settingsById(settingsContext, "settings-field-title");
    const settingsRoute = settingsById(settingsContext, "settings-field-route");
    const settingsStart = settingsById(settingsContext, "settings-field-start");
    const settingsEnd = settingsById(settingsContext, "settings-field-end");
    const settingsErrors = {
      title: "",
      route: "",
      start: "",
      end: ""
    };

    if (!settingsTitle.value.trim()) settingsErrors.title = "Введите название поездки.";
    if (settingsTitle.value.trim().length > 50) settingsErrors.title = "Название не должно быть длиннее 50 символов.";
    if (!settingsRoute.value.trim()) settingsErrors.route = "Введите направление.";
    if (!settingsStart.value) settingsErrors.start = "Укажите дату начала.";
    if (!settingsEnd.value) settingsErrors.end = "Укажите дату окончания.";
    if (settingsStart.value && settingsEnd.value && settingsEnd.value < settingsStart.value) {
      settingsErrors.end = "Дата окончания не может быть раньше даты начала.";
    }

    settingsApplyFieldError(settingsContext, "settings-field-title", "settings-error-title", settingsErrors.title);
    settingsApplyFieldError(settingsContext, "settings-field-route", "settings-error-route", settingsErrors.route);
    settingsApplyFieldError(settingsContext, "settings-field-start", "settings-error-start", settingsErrors.start);
    settingsApplyFieldError(settingsContext, "settings-field-end", "settings-error-end", settingsErrors.end);
    const settingsValid = !settingsErrors.title && !settingsErrors.route && !settingsErrors.start && !settingsErrors.end;
    settingsById(settingsContext, "settings-edit-submit").disabled = !settingsValid;
    return settingsValid;
  }

  function settingsApplyFieldError(settingsContext, settingsFieldId, settingsErrorId, settingsMessage) {
    const settingsField = settingsById(settingsContext, settingsFieldId);
    const settingsError = settingsById(settingsContext, settingsErrorId);
    if (settingsField) settingsField.setAttribute("aria-invalid", settingsMessage ? "true" : "false");
    if (settingsError) settingsError.textContent = settingsMessage;
  }

  async function settingsSaveTrip(settingsContext, settingsEvent) {
    settingsEvent.preventDefault();
    if (!settingsValidateEditForm(settingsContext)) return;
    const settingsSubmit = settingsById(settingsContext, "settings-edit-submit");
    const settingsShared = window.TravelAppState ? window.TravelAppState.getState() : {};
    const settingsTrip = settingsShared.trip || {};
    const settingsPatch = {
      title: settingsById(settingsContext, "settings-field-title").value.trim(),
      route: settingsById(settingsContext, "settings-field-route").value.trim(),
      startDate: settingsById(settingsContext, "settings-field-start").value,
      endDate: settingsById(settingsContext, "settings-field-end").value,
      type: settingsTrip.type || "group",
      status: settingsTrip.status || "active",
      segments: Array.isArray(settingsTrip.segments) ? settingsTrip.segments : []
    };
    if (!settingsTrip.id || !window.TravelTripSync || typeof window.TravelTripSync.updateCanonicalTrip !== "function") {
      settingsToast(settingsContext, "Ошибка сохранения: сервис синхронизации недоступен");
      return;
    }
    if (settingsSubmit) settingsSubmit.disabled = true;
    try {
      const settingsCanonical = await window.TravelTripSync.updateCanonicalTrip(settingsTrip.id, settingsPatch);
      settingsContext.settingsState.title = settingsCanonical.title;
      settingsContext.settingsState.route = settingsCanonical.route;
      settingsContext.settingsState.startDate = settingsCanonical.startDate;
      settingsContext.settingsState.endDate = settingsCanonical.endDate;
      settingsRender(settingsContext);
      settingsCloseModal(settingsContext, true);
      settingsToast(settingsContext, "Изменения сохранены");
    } catch (settingsError) {
      const settingsMessage = settingsError && settingsError.message ? settingsError.message : "Неизвестная ошибка";
      settingsToast(settingsContext, "Ошибка сохранения: " + settingsMessage);
    } finally {
      if (settingsSubmit) settingsSubmit.disabled = false;
    }
  }

  function settingsOpenConfigureModal(settingsContext, settingsTrigger) {
    if (!settingsCanMutate(settingsContext)) return;
    settingsById(settingsContext, "settings-include-route-map").checked = settingsContext.settingsState.includeRouteMap;
    settingsById(settingsContext, "settings-include-observations").checked = settingsContext.settingsState.includeObservations;
    settingsById(settingsContext, "settings-include-documents").checked = settingsContext.settingsState.includeDocuments;
    settingsRenderDocumentCheckboxes(settingsContext);
    settingsValidateConfigureForm(settingsContext);
    settingsOpenModal(settingsContext, "settings-configure-modal", settingsTrigger);
  }

  function settingsRenderDocumentCheckboxes(settingsContext) {
    const settingsBox = settingsById(settingsContext, "settings-document-checkboxes");
    if (!settingsBox) return;
    settingsBox.replaceChildren();
    settingsAvailableDocuments(settingsContext).forEach((settingsDocument) => {
      const settingsLabel = document.createElement("label");
      settingsLabel.className = "settings-check-row";
      const settingsInput = document.createElement("input");
      settingsInput.id = `settings-doc-${settingsDocument.id}`;
      settingsInput.type = "checkbox";
      settingsInput.value = settingsDocument.id;
      settingsInput.checked = settingsContext.settingsState.selectedDocuments.includes(settingsDocument.id);
      settingsInput.dataset.settingsDocument = settingsDocument.id;
      settingsLabel.appendChild(settingsInput);
      settingsLabel.append(` ${settingsDocument.title}`);
      settingsBox.appendChild(settingsLabel);
      settingsOn(settingsContext, settingsInput, "change", () => settingsValidateConfigureForm(settingsContext));
    });
  }

  function settingsValidateConfigureForm(settingsContext) {
    const settingsIncludeDocuments = settingsById(settingsContext, "settings-include-documents").checked;
    const settingsDocumentInputs = settingsAll(settingsContext, "[data-settings-document]");
    settingsDocumentInputs.forEach((settingsInput) => {
      settingsInput.disabled = !settingsIncludeDocuments;
    });
    settingsSetHidden(settingsById(settingsContext, "settings-documents-disabled-note"), settingsIncludeDocuments);
    const settingsSelectedCount = settingsDocumentInputs.filter((settingsInput) => settingsInput.checked).length;
    const settingsError = settingsIncludeDocuments && settingsSelectedCount === 0 ? "Выберите хотя бы один документ или отключите раздел “Документы”." : "";
    settingsSetText(settingsContext, "settings-error-documents", settingsError);
    settingsById(settingsContext, "settings-configure-submit").disabled = Boolean(settingsError);
    const settingsDraft = {
      ...settingsContext.settingsState,
      includeRouteMap: settingsById(settingsContext, "settings-include-route-map").checked,
      includeObservations: settingsById(settingsContext, "settings-include-observations").checked,
      includeDocuments: settingsIncludeDocuments,
      selectedDocuments: settingsDocumentInputs.filter((settingsInput) => settingsInput.checked).map((settingsInput) => settingsInput.value)
    };
    settingsSetText(settingsContext, "settings-size-preview", settingsFormatSize(settingsEstimateSize(settingsContext, settingsDraft)));
    return !settingsError;
  }

  function settingsSaveConfigure(settingsContext, settingsEvent) {
    settingsEvent.preventDefault();
    if (!settingsValidateConfigureForm(settingsContext)) return;
    const settingsVisibleDocumentIds = settingsAvailableDocuments(settingsContext).map((settingsDocument) => settingsDocument.id);
    const settingsHiddenSelectedDocuments = settingsContext.settingsState.selectedDocuments.filter((settingsId) => !settingsVisibleDocumentIds.includes(settingsId));
    const settingsVisibleSelectedDocuments = settingsAll(settingsContext, "[data-settings-document]").filter((settingsInput) => settingsInput.checked).map((settingsInput) => settingsInput.value);
    settingsContext.settingsState.includeRouteMap = settingsById(settingsContext, "settings-include-route-map").checked;
    settingsContext.settingsState.includeObservations = settingsById(settingsContext, "settings-include-observations").checked;
    settingsContext.settingsState.includeDocuments = settingsById(settingsContext, "settings-include-documents").checked;
    settingsContext.settingsState.selectedDocuments = [...settingsHiddenSelectedDocuments, ...settingsVisibleSelectedDocuments];
    settingsContext.settingsState.copySize = settingsEstimateSize(settingsContext);
    settingsContext.settingsState.copyState = "saved";
    settingsCommitOfflineCopy(settingsContext);
    settingsRender(settingsContext);
    settingsCloseModal(settingsContext, true);
    settingsToast(settingsContext, "Содержимое офлайн-копии сохранено");
  }

  function settingsStartCopyOperation(settingsContext, settingsKind) {
    if (!settingsCanMutate(settingsContext) || settingsIsOffline(settingsContext)) return;
    const settingsPreviousCopyState = settingsEffectiveCopyState(settingsContext);
    settingsCancelProgress(settingsContext);
    settingsContext.settingsPreviousCopyState = settingsPreviousCopyState;
    const settingsToken = settingsContext.settingsProgressToken;
    const settingsProgress = settingsById(settingsContext, "settings-copy-progress");
    const settingsBar = settingsById(settingsContext, "settings-copy-progress-bar");
    const settingsText = settingsById(settingsContext, "settings-copy-progress-text");
    let settingsValue = 0;
    const settingsStages = settingsKind === "save"
      ? ["Подготовка данных", "Сохранение маршрута", "Сохранение документов", "Проверка копии"]
      : ["Проверка изменений", "Обновление маршрута", "Обновление документов", "Проверка копии"];

    settingsContext.settingsState.copyState = settingsKind === "save" ? "saving" : "updating";
    if (settingsProgress) settingsProgress.hidden = false;
    settingsRender(settingsContext);

    settingsContext.settingsProgressTimer = window.setInterval(() => {
      if (settingsContext.settingsProgressToken !== settingsToken || !settingsCanMutate(settingsContext)) {
        settingsCancelProgress(settingsContext);
        settingsRender(settingsContext);
        return;
      }
      settingsValue += 20;
      const settingsStage = settingsStages[Math.min(settingsStages.length - 1, Math.floor(settingsValue / 30))];
      if (settingsBar) settingsBar.style.width = `${settingsValue}%`;
      if (settingsText) settingsText.textContent = `${settingsStage}: ${settingsValue}%`;
      if (settingsValue >= 100) {
        window.clearInterval(settingsContext.settingsProgressTimer);
        settingsContext.settingsProgressTimer = null;
        settingsContext.settingsState.copyState = "saved";
        settingsContext.settingsState.copyDate = new Date().toISOString();
        settingsContext.settingsState.copySize = settingsEstimateSize(settingsContext);
        settingsCommitOfflineCopy(settingsContext);
        settingsContext.settingsPreviousCopyState = null;
        if (settingsProgress) settingsProgress.hidden = true;
        if (settingsBar) settingsBar.style.width = "0%";
        settingsRender(settingsContext);
        settingsToast(settingsContext, settingsKind === "save" ? "Офлайн-копия сохранена" : "Офлайн-копия обновлена");
      }
    }, 260);
  }

  function settingsConfirmDeleteCopy(settingsContext) {
    if (!settingsCanMutate(settingsContext)) return;
    settingsContext.settingsState.copyState = "deleted";
    settingsContext.settingsState.copySize = 0;
    settingsCommitOfflineCopy(settingsContext);
    settingsCloseModal(settingsContext, true);
    settingsRender(settingsContext);
    settingsToast(settingsContext, "Офлайн-копия удалена с устройства");
  }

  function settingsOpenCompleteModal(settingsContext, settingsTrigger) {
    if (!settingsCanManageTrip(settingsContext) || settingsIsCompleted(settingsContext)) return;
    settingsById(settingsContext, "settings-complete-confirm-check").checked = false;
    settingsById(settingsContext, "settings-complete-confirm").disabled = true;
    settingsOpenModal(settingsContext, "settings-complete-modal", settingsTrigger);
  }

  function settingsCompleteTrip(settingsContext) {
    if (!settingsById(settingsContext, "settings-complete-confirm-check").checked) return;
    settingsCancelProgress(settingsContext);
    settingsContext.settingsState.tripStatus = "completed";
    settingsCommitShared(settingsContext, { trip: { status: "completed" } });
    settingsCloseModal(settingsContext, true);
    settingsRender(settingsContext);
    settingsToast(settingsContext, "Поездка завершена");
  }

  function settingsOpenDeleteTripModal(settingsContext, settingsTrigger) {
    if (!settingsCanManageTrip(settingsContext)) return;
    settingsById(settingsContext, "settings-delete-trip-input").value = "";
    settingsById(settingsContext, "settings-delete-trip-input").setAttribute("aria-invalid", "false");
    settingsSetText(settingsContext, "settings-delete-trip-help", "");
    settingsById(settingsContext, "settings-delete-trip-confirm").disabled = true;
    settingsOpenModal(settingsContext, "settings-delete-trip-modal", settingsTrigger);
  }

  function settingsValidateDeleteTrip(settingsContext) {
    const settingsInput = settingsById(settingsContext, "settings-delete-trip-input");
    const settingsValid = settingsInput.value === "УДАЛИТЬ";
    settingsInput.setAttribute("aria-invalid", settingsInput.value && !settingsValid ? "true" : "false");
    settingsSetText(settingsContext, "settings-delete-trip-help", settingsInput.value && !settingsValid ? "Введите слово УДАЛИТЬ точно как показано." : "");
    settingsById(settingsContext, "settings-delete-trip-confirm").disabled = !settingsValid;
  }

  function settingsDeleteTripDemo(settingsContext) {
    if (settingsById(settingsContext, "settings-delete-trip-confirm").disabled) return;
    settingsCancelProgress(settingsContext);
    settingsContext.settingsState.deletedTrip = true;
    settingsContext.settingsState.copyState = "deleted";
    settingsContext.settingsState.copySize = 0;
    settingsCommitShared(settingsContext, { trip: { status: "deleted" } });
    settingsCommitOfflineCopy(settingsContext);
    settingsCloseModal(settingsContext, false);
    settingsRender(settingsContext);
  }

  function settingsGoHomeDemo(settingsContext) {
    if (window.AppRoutes && typeof window.AppRoutes.goToHome === "function") {
      window.AppRoutes.goToHome();
      return;
    }
    settingsToast(settingsContext, "Переход на Главную показан в демонстрационном режиме");
  }

  function settingsBindEvents(settingsContext) {
    settingsContext.settingsSurface.settingsContext = settingsContext;

    settingsAll(settingsContext, "[data-settings-role]").forEach((settingsButton) => {
      settingsOn(settingsContext, settingsButton, "click", () => settingsSetRole(settingsContext, settingsButton.dataset.settingsRole));
    });
    settingsAll(settingsContext, "[data-settings-view]").forEach((settingsButton) => {
      settingsOn(settingsContext, settingsButton, "click", () => settingsSetView(settingsContext, settingsButton.dataset.settingsView));
    });

    settingsOn(settingsContext, settingsById(settingsContext, "settings-reset-demo"), "click", () => settingsResetDemo(settingsContext));
    settingsOn(settingsContext, settingsById(settingsContext, "settings-home-after-delete"), "click", () => settingsGoHomeDemo(settingsContext));
    settingsOn(settingsContext, settingsById(settingsContext, "settings-edit-trip-open"), "click", (settingsEvent) => settingsOpenEditModal(settingsContext, settingsEvent.currentTarget));
    settingsOn(settingsContext, settingsById(settingsContext, "settings-edit-form"), "submit", (settingsEvent) => settingsSaveTrip(settingsContext, settingsEvent));
    ["settings-field-title", "settings-field-route", "settings-field-start", "settings-field-end"].forEach((settingsId) => {
      settingsOn(settingsContext, settingsById(settingsContext, settingsId), "input", () => settingsValidateEditForm(settingsContext));
      settingsOn(settingsContext, settingsById(settingsContext, settingsId), "change", () => settingsValidateEditForm(settingsContext));
    });

    settingsOn(settingsContext, settingsById(settingsContext, "settings-include-documents"), "change", () => settingsValidateConfigureForm(settingsContext));
    settingsOn(settingsContext, settingsById(settingsContext, "settings-include-route-map"), "change", () => settingsValidateConfigureForm(settingsContext));
    settingsOn(settingsContext, settingsById(settingsContext, "settings-include-observations"), "change", () => settingsValidateConfigureForm(settingsContext));
    settingsOn(settingsContext, settingsById(settingsContext, "settings-configure-form"), "submit", (settingsEvent) => settingsSaveConfigure(settingsContext, settingsEvent));
    settingsOn(settingsContext, settingsById(settingsContext, "settings-delete-copy-confirm"), "click", () => settingsConfirmDeleteCopy(settingsContext));
    settingsOn(settingsContext, settingsById(settingsContext, "settings-complete-trip-open"), "click", (settingsEvent) => settingsOpenCompleteModal(settingsContext, settingsEvent.currentTarget));
    settingsOn(settingsContext, settingsById(settingsContext, "settings-complete-confirm-check"), "change", () => {
      settingsById(settingsContext, "settings-complete-confirm").disabled = !settingsById(settingsContext, "settings-complete-confirm-check").checked;
    });
    settingsOn(settingsContext, settingsById(settingsContext, "settings-complete-confirm"), "click", () => settingsCompleteTrip(settingsContext));
    settingsOn(settingsContext, settingsById(settingsContext, "settings-delete-trip-open"), "click", (settingsEvent) => settingsOpenDeleteTripModal(settingsContext, settingsEvent.currentTarget));
    settingsOn(settingsContext, settingsById(settingsContext, "settings-delete-trip-input"), "input", () => settingsValidateDeleteTrip(settingsContext));
    settingsOn(settingsContext, settingsById(settingsContext, "settings-delete-trip-confirm"), "click", () => settingsDeleteTripDemo(settingsContext));

    settingsAll(settingsContext, "[data-settings-close]").forEach((settingsButton) => {
      settingsOn(settingsContext, settingsButton, "click", () => settingsCloseModal(settingsContext, true));
    });

    settingsOn(settingsContext, document, "keydown", (settingsEvent) => settingsHandleKeydown(settingsContext, settingsEvent));
  }

  window.settingsInit = settingsInit;
  window.settingsDestroy = settingsDestroy;

  // Единая точка открытия формы редактирования поездки (используется глобальной кнопкой шапки).
  window.settingsOpenTripEditModal = function settingsOpenTripEditModalGlobal() {
    const settingsSurface = document.querySelector('[data-feature="trip-settings"]');
    if (!settingsSurface) return;
    if (!settingsSurface.settingsContext) settingsInit(settingsSurface);
    const settingsContext = settingsSurface.settingsContext;
    if (!settingsContext) return;
    settingsOpenEditModal(settingsContext, settingsById(settingsContext, "settings-edit-trip-open"));
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function settingsDomReady() {
      settingsInit();
    }, { once: true });
  } else {
    settingsInit();
  }
})();

(function messagesModule() {
  const messagesInstances = new WeakMap();

  function messagesInit(rootElement, adapter) {
    if (!rootElement || !adapter) return null;
    if (messagesInstances.has(rootElement)) return messagesInstances.get(rootElement);

    const messagesAbort = new AbortController();
    const messagesState = {
      root: rootElement,
      adapter,
      abort: messagesAbort,
      filter: "Все",
      search: "",
      unsubscribe: null,
      unregisterDraft: null
    };
    messagesInstances.set(rootElement, messagesState);
    window.coreFlowActiveAdapter = adapter;

    messagesState.unregisterDraft = adapter.registerDraftHandler(function messagesRegisteredDraft(options) {
      return messagesOpenEditor(messagesState, options || {});
    });
    messagesState.unsubscribe = adapter.subscribe(function messagesSubscriber() {
      messagesRender(messagesState);
    });

    rootElement.addEventListener("click", function messagesClick(event) {
      messagesHandleClick(messagesState, event);
    }, { signal: messagesAbort.signal });
    rootElement.addEventListener("input", function messagesInput(event) {
      if (event.target.matches("#messages-search")) {
        messagesState.search = event.target.value;
        messagesRender(messagesState);
      }
    }, { signal: messagesAbort.signal });
    rootElement.addEventListener("keydown", function messagesKeydown(event) {
      const row = event.target.closest("[data-messages-open]");
      if (!row || !messagesState.root.contains(row)) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        messagesState.adapter.selectMessage(row.dataset.messagesOpen);
      }
    }, { signal: messagesAbort.signal });

    messagesRender(messagesState);
    return messagesState;
  }

  function messagesDestroy(rootElement) {
    const messagesState = messagesInstances.get(rootElement);
    if (!messagesState) return;
    messagesState.abort.abort();
    if (messagesState.unsubscribe) messagesState.unsubscribe();
    if (messagesState.unregisterDraft) messagesState.unregisterDraft();
    messagesState.adapter.closeSharedUi();
    if (window.coreFlowActiveAdapter === messagesState.adapter) window.coreFlowActiveAdapter = null;
    messagesInstances.delete(rootElement);
  }

  function messagesEscape(messagesState, value) {
    return messagesState.adapter.escape(value);
  }

  function messagesAttr(messagesState, value) {
    return messagesState.adapter.escapeAttribute ? messagesState.adapter.escapeAttribute(value) : messagesEscape(messagesState, value);
  }

  function messagesBadge(status) {
    if (/Ошибка/.test(status)) return "coreflow-badge--danger";
    if (/Черновик|Готово|Скопировано/.test(status)) return "coreflow-badge--warning";
    if (/отправлено|Системное/.test(status)) return "coreflow-badge--success";
    return "coreflow-badge--info";
  }

  function messagesRender(messagesState) {
    if (!messagesState.root.isConnected) return;
    const coreFlowState = messagesState.adapter.getState();
    const root = messagesState.root;
    const content = root.querySelector("#messages-content");
    const createButton = root.querySelector("#messages-create");
    const messagesTop = root.querySelector(".messages-top");
    if (!content || !createButton || !messagesTop) return;
    messagesTop.hidden = coreFlowState.accessState !== "granted";

    createButton.hidden = coreFlowState.role !== "organizer";
    createButton.disabled = !messagesState.adapter.canMutate("message");
    createButton.title = createButton.disabled ? "Создание сообщений сейчас недоступно" : "";

    if (coreFlowState.accessState !== "granted") {
      root.dataset.mobileMode = "list";
      content.innerHTML = `
        <section class="messages-safe-screen" data-od-id="messages-no-access">
          <span class="coreflow-badge coreflow-badge--danger">Нет доступа</span>
          <h2>Нет доступа</h2>
          <p>У Вас нет доступа к этой поездке или доступ был отозван</p>
          <button class="coreflow-button coreflow-button--secondary" type="button" data-messages-action="safe-return">Вернуться</button>
        </section>`;
      return;
    }

    const visibleMessages = messagesFiltered(messagesState);
    const selected = visibleMessages.find(function messagesFindSelected(message) {
      return message.id === coreFlowState.selectedMessageId;
    }) || visibleMessages[0];
    root.dataset.mobileMode = coreFlowState.mobileMessageMode || "list";

    content.innerHTML = `
      ${messagesBanner(messagesState, coreFlowState)}
      ${messagesToolbar(messagesState)}
      ${messagesHistory(messagesState)}
      <div class="messages-grid">
        <section class="messages-list-pane" data-od-id="messages-list-pane">
          <div class="messages-list" data-od-id="messages-list">
            ${visibleMessages.length ? visibleMessages.map(function messagesRow(message) { return messagesRenderRow(messagesState, message, selected); }).join("") : messagesEmpty("Пустое состояние", "Сообщений по выбранному фильтру нет.")}
          </div>
        </section>
        <section class="messages-detail-pane" data-od-id="messages-detail-pane">
          ${selected ? messagesRenderDetails(messagesState, selected) : messagesEmpty("Пустое состояние", "Выберите сообщение.")}
        </section>
      </div>`;
  }

  function messagesBanner(messagesState, coreFlowState) {
    if (coreFlowState.networkState === "offline") return `<div class="coreflow-banner coreflow-banner--warning" data-od-id="messages-offline-banner"><strong>Офлайн.</strong><span>Доступен только просмотр сохранённых данных.</span></div>`;
    if (coreFlowState.trip && coreFlowState.trip.status === "completed") return `<div class="coreflow-banner" data-od-id="messages-completed-banner"><strong>Завершённая поездка.</strong><span>История доступна, создание и отправка сообщений заблокированы.</span></div>`;
    return "";
  }

  function messagesToolbar(messagesState) {
    const coreFlowState = messagesState.adapter.getState();
    const filters = coreFlowState.role === "organizer"
      ? ["Все", "Черновики", "Отправленные", "Системные", "Telegram", "Email", "Связанные с Plan B"]
      : ["Все", "Обновления", "Системные", "Plan B"];
    return `
      <section class="messages-toolbar" data-od-id="messages-toolbar">
        <input id="messages-search" class="messages-search" type="search" value="${messagesEscape(messagesState, messagesState.search)}" placeholder="Поиск по сообщениям" aria-label="Поиск по сообщениям" />
        <div class="messages-filters" aria-label="Фильтры сообщений">
          ${filters.map(function messagesFilter(filter) {
            return `<button class="messages-filter ${messagesState.filter === filter ? "is-active" : ""}" type="button" data-messages-filter="${filter}" aria-pressed="${messagesState.filter === filter}">${filter}</button>`;
          }).join("")}
        </div>
      </section>`;
  }

  function messagesFiltered(messagesState) {
    let items = messagesState.adapter.visibleMessages();
    const query = messagesState.search.trim().toLowerCase();
    if (messagesState.filter === "Черновики") items = items.filter(function messagesDraft(message) { return message.status === "Черновик"; });
    if (messagesState.filter === "Отправленные") items = items.filter(function messagesSent(message) { return /отправлено|Скопировано/.test(message.status); });
    if (messagesState.filter === "Системные") items = items.filter(function messagesSystem(message) { return message.type === "system" || message.status === "Системное сообщение"; });
    if (messagesState.filter === "Telegram" || messagesState.filter === "Email") items = items.filter(function messagesChannel(message) { return message.channel === messagesState.filter; });
    if (messagesState.filter === "Связанные с Plan B") items = items.filter(function messagesPlan(message) { return Boolean(message.planB); });
    if (messagesState.filter === "Plan B") items = items.filter(function messagesPlanPublic(message) { return Boolean(message.planB); });
    if (messagesState.filter === "Обновления") items = items.filter(function messagesUpdates(message) { return message.type !== "system"; });
    if (query) {
      items = items.filter(function messagesSearch(message) {
        return [message.topic, message.text, message.segment, message.planB, message.channel, message.status].join(" ").toLowerCase().includes(query);
      });
    }
    return items;
  }

  function messagesRenderRow(messagesState, message, selected) {
    const isActive = selected && selected.id === message.id;
    return `
      <article class="messages-row ${isActive ? "is-active" : ""}" tabindex="0" role="button" data-messages-open="${messagesEscape(messagesState, message.id)}" data-od-id="messages-row-${messagesEscape(messagesState, message.id)}" aria-current="${isActive ? "true" : "false"}">
        <div class="messages-row-head">
          <h3>${messagesEscape(messagesState, message.topic)}</h3>
          <span class="coreflow-badge ${messagesBadge(message.status)}">${messagesEscape(messagesState, message.status)}</span>
        </div>
        <div class="messages-row-meta">
          <span>Получатели: ${messagesEscape(messagesState, messagesState.adapter.formatRecipients(message.recipients))}</span>
          <span>Канал: ${messagesEscape(messagesState, message.channel)}</span>
          <span>Автор: ${messagesEscape(messagesState, message.author)}</span>
          <span>${messagesEscape(messagesState, message.time)}</span>
          <span>Сегмент: ${messagesEscape(messagesState, message.segment || "Не указан")}</span>
          <span>Plan B: ${messagesEscape(messagesState, message.planB || "Не связан")}</span>
        </div>
        <p class="messages-preview">${messagesEscape(messagesState, message.text).slice(0, 180)}${message.text.length > 180 ? "…" : ""}</p>
      </article>`;
  }

  function messagesRenderDetails(messagesState, message) {
    const coreFlowState = messagesState.adapter.getState();
    const canEdit = coreFlowState.role === "organizer" && messagesState.adapter.canMutate("message") && message.status === "Черновик";
    const canSend = coreFlowState.role === "organizer" && messagesState.adapter.canMutate("message") && message.author !== "Система";
    const actions = [];
    if (canEdit) actions.push(`<button class="coreflow-button coreflow-button--secondary" type="button" data-messages-action="edit" data-message-id="${messagesEscape(messagesState, message.id)}">Редактировать черновик</button>`);
    actions.push(`<button class="coreflow-button coreflow-button--secondary" type="button" data-messages-action="copy" data-message-id="${messagesEscape(messagesState, message.id)}">Копировать текст</button>`);
    if (canSend) {
      actions.push(`<button class="coreflow-button coreflow-button--secondary" type="button" data-messages-action="reuse" data-message-id="${messagesEscape(messagesState, message.id)}">Повторно использовать</button>`);
      actions.push(`<button class="coreflow-button coreflow-button--primary" type="button" data-messages-action="send" data-message-id="${messagesEscape(messagesState, message.id)}">Демонстрационная отправка</button>`);
    }
    if (message.type === "system") actions.push(`<button class="coreflow-button coreflow-button--quiet" type="button" data-messages-action="open-event">Открыть связанное событие</button>`);
    return `
      <article class="messages-detail" data-od-id="messages-details">
        <button class="coreflow-button coreflow-button--secondary messages-mobile-back" type="button" data-messages-action="back-list">Назад к сообщениям</button>
        <div class="messages-detail-head">
          <div><h3>${messagesEscape(messagesState, message.topic)}</h3><p>Подробности выбранного сообщения</p></div>
          <span class="coreflow-badge ${messagesBadge(message.status)}">${messagesEscape(messagesState, message.status)}</span>
        </div>
        <div class="messages-detail-body">
          <div class="messages-detail-meta-card" aria-label="Метаданные сообщения">
            <span><b>Получатели</b>${messagesEscape(messagesState, messagesState.adapter.formatRecipients(message.recipients))}</span>
            <span><b>Канал</b>${messagesEscape(messagesState, message.channel)}</span>
            <span><b>Автор</b>${messagesEscape(messagesState, message.author)}</span>
            <span><b>Время</b>${messagesEscape(messagesState, message.time)}</span>
            <span><b>Сегмент</b>${messagesEscape(messagesState, message.segment || "Не указан")}</span>
            <span><b>Plan B</b>${messagesEscape(messagesState, message.planB || "Не связан")}</span>
          </div>
          <div class="messages-detail-box messages-detail-text"><span class="messages-label">Текст</span><p>${messagesEscape(messagesState, message.text)}</p></div>
          <div class="messages-actions">${actions.join("")}</div>
        </div>
      </article>`;
  }

  function messagesDetailBox(messagesState, label, value) {
    return `<div class="messages-detail-box"><span class="messages-label">${messagesEscape(messagesState, label)}</span><strong>${messagesEscape(messagesState, value)}</strong></div>`;
  }

  function messagesHistory(messagesState) {
    const items = messagesState.adapter.visibleHistory();
    return `
      <section class="coreflow-card messages-history" data-od-id="messages-history">
        <div class="coreflow-card-head"><div><h3>История сообщений и действий</h3><p>Фильтруется по роли вместе со списком.</p></div></div>
        <div class="coreflow-card-body">
          <ul class="messages-history-list">
            ${items.length ? items.slice(-8).reverse().map(function messagesHistoryItem(item) {
              return `<li><time>${messagesEscape(messagesState, item.time)}</time><span>${messagesEscape(messagesState, item.text)}</span></li>`;
            }).join("") : "<li>Публичной истории нет.</li>"}
          </ul>
        </div>
      </section>`;
  }

  function messagesEmpty(title, text) {
    return `<section class="messages-safe-screen"><span class="coreflow-badge coreflow-badge--info">${title}</span><h3>${title}</h3><p>${text}</p></section>`;
  }

  function messagesHandleClick(messagesState, event) {
    const openRow = event.target.closest("[data-messages-open]");
    const action = event.target.closest("[data-messages-action]");
    const filter = event.target.closest("[data-messages-filter]");
    const create = event.target.closest("#messages-create");
    if (filter && messagesState.root.contains(filter)) {
      messagesState.filter = filter.dataset.messagesFilter;
      messagesRender(messagesState);
      return;
    }
    if (openRow && messagesState.root.contains(openRow)) {
      messagesState.adapter.selectMessage(openRow.dataset.messagesOpen);
      return;
    }
    if (create && messagesState.root.contains(create)) {
      messagesState.adapter.openMessageDraft({});
      return;
    }
    if (!action || !messagesState.root.contains(action)) return;
    if (action.dataset.messagesAction === "back-list") {
      messagesSetMobileMode(messagesState, "list");
    } else if (action.dataset.messagesAction === "safe-return") {
      messagesState.adapter.toast("Возврат выполняется общей навигацией приложения.");
    } else if (action.dataset.messagesAction === "copy") {
      messagesCopy(messagesState, action.dataset.messageId);
    } else if (action.dataset.messagesAction === "edit") {
      messagesOpenEditor(messagesState, { messageId: action.dataset.messageId });
    } else if (action.dataset.messagesAction === "reuse") {
      messagesOpenEditor(messagesState, { messageId: action.dataset.messageId, reuse: true });
    } else if (action.dataset.messagesAction === "send") {
      messagesConfirmSend(messagesState, action.dataset.messageId);
    } else if (action.dataset.messagesAction === "open-event") {
      messagesState.adapter.toast("Связанное событие открывается во вкладке «Мониторинг» при интеграции.");
    }
  }

  function messagesOpenSelected(messagesState, messageId) {
    messagesState.adapter.selectMessage(messageId);
  }

  function messagesSetMobileMode(messagesState, mode) {
    messagesState.adapter.setMobileMessageMode(mode);
  }

  async function messagesCopy(messagesState, messageId) {
    const message = messagesState.adapter.visibleMessages().find(function messagesFind(messageItem) { return messageItem.id === messageId; });
    if (!message) return;
    const copied = await messagesCopyText(message.text);
    messagesState.adapter.toast(copied ? "Текст скопирован" : "Не удалось скопировать. Выделите текст вручную.");
  }

  async function messagesCopyText(text) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      // Fallback below.
    }
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand && document.execCommand("copy");
      textarea.remove();
      return !!ok;
    } catch (error) {
      return false;
    }
  }

  function messagesOpenEditor(messagesState, options) {
    if (!messagesState.adapter.canMutate("message")) {
      messagesState.adapter.toast("Создание сообщения сейчас недоступно.");
      return false;
    }
    const plans = messagesState.adapter.getPlanBOptions();
    const selectedPlan = plans.find(function messagesFindPlan(plan) { return plan.id === options.planId; });
    const source = messagesState.adapter.visibleMessages().find(function messagesFind(message) { return message.id === options.messageId; })
      || (selectedPlan ? messagesState.adapter.visibleMessages().find(function messagesFindByPlan(message) { return message.planB === selectedPlan.label; }) : null);
    const message = options.reuse && source
      ? Object.assign({}, source, { id: "message-reuse-" + Date.now(), topic: "Копия: " + source.topic, status: "Черновик" })
      : source || {
        id: "message-manual-" + Date.now(),
        topic: selectedPlan ? "Изменение маршрута: " + selectedPlan.label : "Новое сообщение по поездке",
        recipients: { type: "all-participants", participantIds: [], providerType: null },
        channel: "Telegram",
        author: "Артём (Вы)",
        time: "19 июля, 14:10",
        status: "Черновик",
        segment: "Маршрут целиком",
        planB: selectedPlan ? selectedPlan.label : "",
        text: "Короткое обновление по поездке. Данные демонстрационные, реальная отправка не выполняется.",
        type: "manual"
      };
    const normalizedRecipients = messagesState.adapter.normalizeRecipients(message.recipients);
    const recipientValue = messagesRecipientValue(normalizedRecipients);
    messagesState.adapter.openModal({
      title: source ? "Редактировать сообщение" : "Создать сообщение",
      body: `
        <form id="coreflow-message-form" class="coreflow-grid" novalidate>
          ${messagesField("coreflow-message-topic", "Тема", "input", message.topic)}
          ${messagesSelect("coreflow-message-recipients", "Получатели", ["Все участники", "Выбранные участники", "Поставщик", "Отель", "Трансфер", "Служба поддержки"], recipientValue)}
          ${messagesParticipantPicker(messagesState, normalizedRecipients)}
          ${messagesSelect("coreflow-message-channel", "Канал", ["Telegram", "Email", "Копирование текста", "Демонстрационная отправка"], message.channel)}
          ${messagesField("coreflow-message-segment", "Связанный сегмент", "input", message.segment || "")}
          ${messagesField("coreflow-message-plan", "Связанный Plan B", "input", message.planB || "")}
          ${messagesField("coreflow-message-text", "Текст", "textarea", message.text)}
          <p class="coreflow-badge coreflow-badge--warning">Демонстрационный режим: реальная отправка не выполняется.</p>
        </form>`,
      footer: `<button id="coreflow-message-save" class="coreflow-button coreflow-button--secondary" type="button">Сохранить черновик</button><button id="coreflow-message-copy" class="coreflow-button coreflow-button--secondary" type="button">Копировать</button><button id="coreflow-message-send" class="coreflow-button coreflow-button--primary" type="button">Отправить в демонстрационном режиме</button>`,
      onMount: function messagesEditorMount(modalRoot) {
        modalRoot.querySelector("#coreflow-message-save").addEventListener("click", function messagesSaveClick() {
          if (messagesSubmitEditor(messagesState, modalRoot, message, "Черновик")) {
            messagesState.adapter.closeSharedUi();
          }
        });
        modalRoot.querySelector("#coreflow-message-copy").addEventListener("click", async function messagesCopyClick() {
          const values = messagesCollectEditorValues(modalRoot);
          const firstError = messagesValidate(modalRoot, values);
          if (firstError) {
            firstError.focus();
            return;
          }
          const copied = await messagesCopyText(values.text);
          if (copied) {
            messagesSaveEditorValues(messagesState, message, values, "Скопировано", true);
            messagesState.adapter.toast("Текст скопирован");
          } else {
            messagesState.adapter.toast("Не удалось скопировать. Выделите текст вручную.");
          }
        });
        modalRoot.querySelector("#coreflow-message-send").addEventListener("click", function messagesSendClick() {
          if (messagesSubmitEditor(messagesState, modalRoot, message, "Готово к отправке")) {
            messagesConfirmSend(messagesState, message.id);
          }
        });
      }
    });
    return true;
  }

  function messagesField(id, label, type, value) {
    if (type === "textarea") {
      return `<div class="coreflow-field"><label for="${id}">${label}</label><textarea id="${id}" aria-describedby="${id}-error">${messagesEscape({ adapter: { escape: window.coreFlowActiveAdapter && window.coreFlowActiveAdapter.escape ? window.coreFlowActiveAdapter.escape : function messagesFallbackEscape(item) { return String(item || ""); } } }, value)}</textarea><span id="${id}-error" class="coreflow-field-error"></span></div>`;
    }
    const adapter = window.coreFlowActiveAdapter || window.coreFlowPreviewAdapter;
    const safeValue = adapter && adapter.escapeAttribute ? adapter.escapeAttribute(value) : String(value || "").replace(/"/g, "&quot;");
    return `<div class="coreflow-field"><label for="${id}">${label}</label><input id="${id}" value="${safeValue}" aria-describedby="${id}-error" /><span id="${id}-error" class="coreflow-field-error"></span></div>`;
  }

  function messagesSelect(id, label, options, value) {
    const adapter = window.coreFlowActiveAdapter || window.coreFlowPreviewAdapter;
    const escape = adapter && adapter.escape ? adapter.escape : function messagesFallbackEscape(item) { return String(item || ""); };
    const escapeAttr = adapter && adapter.escapeAttribute ? adapter.escapeAttribute : escape;
    return `<div class="coreflow-field"><label for="${id}">${label}</label><select id="${id}" aria-describedby="${id}-error">${options.map(function messagesOption(option) { return `<option value="${escapeAttr(option)}" ${option === value ? "selected" : ""}>${escape(option)}</option>`; }).join("")}</select><span id="${id}-error" class="coreflow-field-error"></span></div>`;
  }

  function messagesRecipientValue(recipients) {
    if (recipients.type === "selected-participants") return "Выбранные участники";
    if (recipients.type === "provider") {
      return { provider: "Поставщик", hotel: "Отель", transfer: "Трансфер", support: "Служба поддержки" }[recipients.providerType] || "Поставщик";
    }
    if (recipients.type === "organizer") return "Организатор";
    return "Все участники";
  }

  function messagesParticipantPicker(messagesState, recipients) {
    const selected = recipients.type === "selected-participants" ? recipients.participantIds : [];
    const participants = messagesState.adapter.getParticipants().filter(function messagesParticipantOnly(participant) { return participant.role !== "organizer"; });
    return `
      <fieldset id="coreflow-message-selected-participants" class="coreflow-field coreflow-choice-list" aria-describedby="coreflow-message-selected-participants-error">
        <legend>Кому из участников</legend>
        ${participants.map(function messagesParticipantOption(participant) {
          return `<label><input type="checkbox" value="${messagesAttr(messagesState, participant.id)}" ${selected.includes(participant.id) ? "checked" : ""} /> <span>${messagesEscape(messagesState, participant.name)}</span></label>`;
        }).join("")}
        <span id="coreflow-message-selected-participants-error" class="coreflow-field-error"></span>
      </fieldset>`;
  }

  function messagesSubmitEditor(messagesState, modalRoot, message, status) {
    const values = messagesCollectEditorValues(modalRoot);
    const firstError = messagesValidate(modalRoot, values);
    if (firstError) {
      firstError.focus();
      return false;
    }
    messagesSaveEditorValues(messagesState, message, values, status, false);
    return true;
  }

  function messagesCollectEditorValues(modalRoot) {
    return {
      topic: modalRoot.querySelector("#coreflow-message-topic").value.trim(),
      recipientValue: modalRoot.querySelector("#coreflow-message-recipients").value,
      selectedParticipantIds: Array.from(modalRoot.querySelectorAll("#coreflow-message-selected-participants input:checked")).map(function messagesChecked(input) { return input.value; }),
      channel: modalRoot.querySelector("#coreflow-message-channel").value,
      segment: modalRoot.querySelector("#coreflow-message-segment").value.trim(),
      planB: modalRoot.querySelector("#coreflow-message-plan").value.trim(),
      text: modalRoot.querySelector("#coreflow-message-text").value.trim()
    };
  }

  function messagesSaveEditorValues(messagesState, message, values, status, suppressToast) {
    const saved = Object.assign({}, message, {
      topic: values.topic,
      recipients: messagesBuildRecipients(values),
      channel: values.channel,
      segment: values.segment,
      planB: values.planB,
      text: values.text,
      status
    });
    messagesState.adapter.saveMessage(saved);
    if (!suppressToast && status === "Черновик") messagesState.adapter.toast("Черновик сохранён");
  }

  function messagesBuildRecipients(values) {
    if (values.recipientValue === "Выбранные участники") return { type: "selected-participants", participantIds: values.selectedParticipantIds, providerType: null };
    if (values.recipientValue === "Поставщик") return { type: "provider", participantIds: [], providerType: "provider" };
    if (values.recipientValue === "Отель") return { type: "provider", participantIds: [], providerType: "hotel" };
    if (values.recipientValue === "Трансфер") return { type: "provider", participantIds: [], providerType: "transfer" };
    if (values.recipientValue === "Служба поддержки") return { type: "provider", participantIds: [], providerType: "support" };
    return { type: "all-participants", participantIds: [], providerType: null };
  }

  function messagesValidate(modalRoot, values) {
    const fields = [
      ["coreflow-message-topic", !values.topic ? "Заполните тему" : ""],
      ["coreflow-message-text", !values.text ? "Заполните текст" : ""],
      ["coreflow-message-recipients", !values.recipientValue ? "Выберите получателя" : ""],
      ["coreflow-message-channel", !values.channel ? "Выберите канал" : ""]
    ];
    if (values.recipientValue === "Выбранные участники" && !values.selectedParticipantIds.length) {
      fields.push(["coreflow-message-selected-participants", "Выберите хотя бы одного участника"]);
    }
    if (["Поставщик", "Отель", "Трансфер", "Служба поддержки"].includes(values.recipientValue) && values.channel === "Telegram") {
      fields.push(["coreflow-message-channel", "Для внешних получателей используйте Email, копирование или демонстрационную отправку"]);
    }
    let first = null;
    fields.forEach(function messagesErrorField(pair) {
      const input = pair[0] === "coreflow-message-selected-participants"
        ? modalRoot.querySelector("#coreflow-message-selected-participants input")
        : modalRoot.querySelector("#" + pair[0]);
      const error = modalRoot.querySelector("#" + pair[0] + "-error");
      if (error) error.textContent = pair[1];
      if (input) input.setAttribute("aria-invalid", pair[1] ? "true" : "false");
      if (!first && pair[1]) first = input;
    });
    return first;
  }

  function messagesConfirmSend(messagesState, messageId) {
    messagesState.adapter.openModal({
      title: "Подтвердить демонстрационную отправку",
      body: "<p>Сообщение будет записано в историю как «Демонстрационно отправлено». Реальная отправка не выполняется.</p>",
      footer: `<button id="coreflow-message-back" class="coreflow-button coreflow-button--secondary" type="button">Вернуться</button><button id="coreflow-message-confirm-send" class="coreflow-button coreflow-button--primary" type="button">Отправить в демонстрационном режиме</button>`,
      onMount: function messagesSendMount(modalRoot) {
        modalRoot.querySelector("#coreflow-message-back").addEventListener("click", messagesState.adapter.closeSharedUi);
        modalRoot.querySelector("#coreflow-message-confirm-send").addEventListener("click", function messagesConfirmClick() {
          messagesState.adapter.sendMessage(messageId);
          messagesState.adapter.closeSharedUi();
          messagesState.adapter.toast("Демонстрационная отправка записана");
        });
      }
    });
  }

  window.messagesInit = messagesInit;
  window.messagesDestroy = messagesDestroy;
})();

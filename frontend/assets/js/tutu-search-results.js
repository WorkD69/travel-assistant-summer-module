(function () {
  "use strict";

  const CARRIER_FALLBACK = Object.freeze({
    flight: "Авиаперевозчик",
    train: "Поезд",
    etrain: "Электричка",
    bus: "Автобус",
    mixed: "Перевозчик"
  });

  function formatDuration(minutes) {
    const safeMinutes = Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes) : 0;
    const hours = Math.floor(safeMinutes / 60);
    const rest = safeMinutes % 60;
    return [hours ? hours + " ч" : "", rest ? rest + " мин" : ""].filter(Boolean).join(" ") || "0 мин";
  }

  function transferWord(count) {
    const mod100 = Math.abs(count) % 100;
    const mod10 = mod100 % 10;
    if (mod100 >= 11 && mod100 <= 14) return "пересадок";
    if (mod10 === 1) return "пересадка";
    if (mod10 >= 2 && mod10 <= 4) return "пересадки";
    return "пересадок";
  }

  function formatTransfers(count) {
    if (count === 0) return "Прямой";
    return count + " " + transferWord(count);
  }

  function segmentsOf(option) {
    return option && Array.isArray(option.segments) ? option.segments : [];
  }

  function carrierLabel(option) {
    const segment = segmentsOf(option).find(function (item) { return item && item.carrierName; });
    return segment ? segment.carrierName : (CARRIER_FALLBACK[option && option.transportType] || "Перевозчик");
  }

  function serviceNumberLabel(option) {
    const segment = segmentsOf(option).find(function (item) { return item && item.serviceNumber; });
    return segment ? segment.serviceNumber : "";
  }

  function currencyLabel(currency) {
    return currency === "RUB" ? "₽" : String(currency || "");
  }

  function formatPrice(price) {
    if (!price) return "Цена уточняется";
    const amount = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(price.amount);
    return (price.kind === "from" ? "от " : "") + amount + " " + currencyLabel(price.currency);
  }

  function formatIsoTime(timestamp) {
    const match = String(timestamp || "").match(/T(\d{2}:\d{2})/);
    return match ? match[1] : "—";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function availabilityLabel(availability) {
    if (!availability) return "";
    if (availability.status === "sold_out") return "Мест нет";
    if (availability.seats !== null && availability.seats !== undefined) {
      const count = availability.seats;
      const mod100 = Math.abs(count) % 100;
      const mod10 = mod100 % 10;
      const word = mod100 >= 11 && mod100 <= 14 ? "мест" : (mod10 === 1 ? "место" : (mod10 >= 2 && mod10 <= 4 ? "места" : "мест"));
      return "Осталось " + count + " " + word;
    }
    return availability.status === "limited" ? "Мало мест" : "Доступно";
  }

  function intermediatePlaces(option) {
    const segments = segmentsOf(option);
    if (segments.length < 2) return [];
    return segments.slice(0, -1).map(function (segment) { return segment.arrivalPlace; }).filter(Boolean);
  }

  function renderCard(entry, pendingSelectionId) {
    const option = entry.option;
    const segments = segmentsOf(option);
    const first = segments[0];
    const last = segments[segments.length - 1];
    const service = serviceNumberLabel(option);
    const availability = availabilityLabel(option.availability);
    const places = intermediatePlaces(option);
    const pending = pendingSelectionId === option.id;
    return `
      <article class="tutu-result-card" data-result-option="${escapeHtml(option.id)}">
        <div class="tutu-card-route">
          <header class="tutu-card-carrier">
            <strong>${escapeHtml(carrierLabel(option))}</strong>
            ${service ? `<span class="tutu-card-service">${escapeHtml(service)}</span>` : ""}
          </header>
          <div class="tutu-card-times">
            <div class="tutu-time-point tutu-time-departure">
              <time datetime="${escapeHtml(first.departureAt)}">${escapeHtml(formatIsoTime(first.departureAt))}</time>
              <span>${escapeHtml(first.departurePlace)}</span>
            </div>
            <div class="tutu-route-summary">
              <span>${escapeHtml(formatDuration(option.durationMinutes))}</span>
              <i aria-hidden="true"><b></b></i>
              <strong>${escapeHtml(formatTransfers(option.transferCount))}</strong>
            </div>
            <div class="tutu-time-point tutu-time-arrival">
              <time datetime="${escapeHtml(last.arrivalAt)}">${escapeHtml(formatIsoTime(last.arrivalAt))}</time>
              <span>${escapeHtml(last.arrivalPlace)}</span>
            </div>
          </div>
          ${places.length ? `<p class="tutu-transfer-places">Пересадка: ${places.map(escapeHtml).join(", ")}</p>` : ""}
        </div>
        <div class="tutu-card-action">
          ${availability ? `<span class="tutu-availability${option.availability.status === "sold_out" ? " is-sold" : ""}">${escapeHtml(availability)}</span>` : ""}
          <strong class="tutu-card-price">${escapeHtml(formatPrice(option.price))}</strong>
          <button class="tutu-select-ticket" type="button" data-results-select="${escapeHtml(option.id)}"
            ${pending || (option.availability && option.availability.status === "sold_out") ? "disabled" : ""}>
            ${pending ? "Переходим…" : "Выбрать билет"}
          </button>
        </div>
      </article>`;
  }

  function statePanel(title, message, action) {
    return `<section class="tutu-results-state"><span class="tutu-state-mark" aria-hidden="true">↗</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>${action || ""}</section>`;
  }

  function renderDemoPurchase(state) {
    if (!state.selectionIntent) return "";
    const pending = !!state.demoPurchasePending;
    return `<section class="tutu-demo-purchase" aria-label="Демонстрационное подтверждение">
      <p><strong>Демонстрационное подтверждение для Travel Assistant.</strong> Это не покупка у Туту или перевозчика.</p>
      <button type="button" data-results-demo-purchase${pending ? " disabled" : ""}>${pending ? "Подтверждаем…" : "Подтвердить демонстрационную покупку"}</button>
    </section>`;
  }

  function renderContent(state, entries) {
    if (state.status === "loading") {
      return `<div class="tutu-results-list" aria-busy="true" aria-label="Ищем варианты">
        ${[0, 1, 2].map(function () { return `<div class="tutu-result-skeleton" aria-hidden="true"><i></i><b></b><span></span><em></em></div>`; }).join("")}
      </div>`;
    }
    if (state.status === "empty") {
      return statePanel("По вашему запросу вариантов не найдено", "Измените параметры поиска и попробуйте снова.", `<button type="button" data-results-edit>Изменить поиск</button>`);
    }
    if (state.status === "error") {
      return statePanel("Поиск не выполнен", state.errorMessage || "Не удалось выполнить поиск.", `<button type="button" data-results-retry>Повторить поиск</button>`);
    }
    if (state.status === "results" && !entries.length) {
      return statePanel("Нет вариантов с выбранными фильтрами", "Сбросьте фильтры, чтобы увидеть остальные варианты.", `<button type="button" data-results-reset>Сбросить фильтры</button>`);
    }
    const notice = state.errorMessage ? `<p class="tutu-checkout-error" role="alert">${escapeHtml(state.errorMessage)}</p>` : "";
    return notice + `<div class="tutu-results-list">${entries.map(function (entry) { return renderCard(entry, state.pendingSelectionId); }).join("")}</div>` + renderDemoPurchase(state);
  }

  function formatSearchDate(dateOnly) {
    const match = String(dateOnly || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return String(dateOnly || "");
    const months = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
    return Number(match[3]) + " " + months[Number(match[2]) - 1];
  }

  function modeLabel(mode) {
    return { flight: "Авиабилеты", train: "Ж/д билеты", bus: "Автобусы", etrain: "Электрички", mixed: "Все варианты" }[mode] || "Билеты";
  }

  function renderToolbar(state) {
    const carriers = carrierOptions(state.entries);
    return `<div class="tutu-results-toolbar-inner">
      <label class="tutu-toolbar-select"><span>Сортировка</span><select data-results-sort>
        <option value="default"${state.sort === "default" ? " selected" : ""}>По умолчанию</option>
        <option value="cheap"${state.sort === "cheap" ? " selected" : ""}>Сначала дешёвые</option>
        <option value="fast"${state.sort === "fast" ? " selected" : ""}>Сначала быстрые</option>
        <option value="early"${state.sort === "early" ? " selected" : ""}>Сначала ранние</option>
      </select></label>
      <label class="tutu-direct-chip"><input type="checkbox" data-results-direct${state.directOnly ? " checked" : ""} /><span>Прямые</span></label>
      ${carriers.length ? `<label class="tutu-toolbar-select tutu-carrier-select"><span>Перевозчик</span><select data-results-carrier><option value="">Все перевозчики</option>${carriers.map(function (carrier) { return `<option value="${escapeHtml(carrier)}"${state.carrier === carrier ? " selected" : ""}>${escapeHtml(carrier)}</option>`; }).join("")}</select></label>` : ""}
    </div>`;
  }

  function renderPage(state, entries) {
    const request = state.request;
    if (!request) return renderContent(state, entries);
    return `<section class="tutu-results-query" aria-label="Параметры поиска">
      <div class="tutu-results-container">
        <button class="tutu-query-summary" type="button" data-results-edit>
          <span class="tutu-query-icon" aria-hidden="true">⌕</span>
          <span><strong>${escapeHtml(request.origin)} <i aria-hidden="true">→</i> ${escapeHtml(request.destination)}</strong><small>${escapeHtml(formatSearchDate(request.departureDate))} · 1 пассажир · в одну сторону${request.mode === "flight" ? " · эконом" : ""}</small></span>
          <b>Изменить</b>
        </button>
        <div class="tutu-results-context"><span class="is-active">${escapeHtml(modeLabel(request.mode))}</span><span>${escapeHtml(formatSearchDate(request.departureDate))}</span></div>
      </div>
    </section>
    <div class="tutu-results-toolbar">${renderToolbar(state)}</div>
    <main class="tutu-results-main"><div class="tutu-results-container">${renderContent(state, entries)}</div></main>`;
  }

  function providerOrder(left, right) {
    return left.providerIndex - right.providerIndex;
  }

  function sortEntries(entries, sort) {
    const copy = Array.isArray(entries) ? entries.slice() : [];
    if (sort === "cheap") {
      const currencies = new Set(copy.filter(function (entry) {
        return entry.option.price;
      }).map(function (entry) {
        return entry.option.price.currency;
      }));
      if (currencies.size > 1) return copy.sort(providerOrder);
      return copy.sort(function (left, right) {
        const leftAmount = left.option.price ? left.option.price.amount : Number.POSITIVE_INFINITY;
        const rightAmount = right.option.price ? right.option.price.amount : Number.POSITIVE_INFINITY;
        return leftAmount - rightAmount || providerOrder(left, right);
      });
    }
    if (sort === "fast") {
      return copy.sort(function (left, right) {
        return left.option.durationMinutes - right.option.durationMinutes || providerOrder(left, right);
      });
    }
    if (sort === "early") {
      return copy.sort(function (left, right) {
        const leftTime = Date.parse(segmentsOf(left.option)[0].departureAt);
        const rightTime = Date.parse(segmentsOf(right.option)[0].departureAt);
        return leftTime - rightTime || providerOrder(left, right);
      });
    }
    return copy.sort(providerOrder);
  }

  function optionHasCarrier(option, carrier) {
    return segmentsOf(option).some(function (segment) { return segment.carrierName === carrier; });
  }

  function filterEntries(entries, directOnly, carrier) {
    return (Array.isArray(entries) ? entries : []).filter(function (entry) {
      if (directOnly && entry.option.transferCount !== 0) return false;
      return !carrier || optionHasCarrier(entry.option, carrier);
    });
  }

  function carrierOptions(entries) {
    const names = new Set();
    (Array.isArray(entries) ? entries : []).forEach(function (entry) {
      segmentsOf(entry.option).forEach(function (segment) {
        if (segment.carrierName) names.add(segment.carrierName);
      });
    });
    return Array.from(names);
  }

  function normalizeSearchEnvelope(payload) {
    if (!payload || !Array.isArray(payload.options)) throw new Error("Search response envelope is invalid");
    const optionIds = new Set();
    return payload.options.map(function (entry, index) {
      if (!entry || !entry.option || typeof entry.option !== "object" ||
          !Array.isArray(entry.option.segments) || !entry.option.segments.length ||
          typeof entry.option.id !== "string" || !entry.option.id || optionIds.has(entry.option.id) ||
          typeof entry.selectionToken !== "string" || !entry.selectionToken) {
        throw new Error("Search response option is invalid");
      }
      optionIds.add(entry.option.id);
      return { option: entry.option, selectionToken: entry.selectionToken, providerIndex: index };
    });
  }

  function backendCode(error) {
    return error && error.data && error.data.error && error.data.error.code;
  }

  function isSafeCheckoutUrl(value) {
    try {
      return new URL(value).protocol === "https:";
    } catch (error) {
      return false;
    }
  }

  function messageForBackendError(error) {
    const code = backendCode(error);
    if (code === "TUTU_ROUND_TRIP_UNSUPPORTED") {
      return "Поиск туда и обратно пока недоступен. Выберите поездку в одну сторону.";
    }
    if (code === "TUTU_MULTI_PASSENGER_UNSUPPORTED" || code === "TUTU_PASSENGER_COMBINATION_UNSUPPORTED") {
      return "Сейчас поиск доступен только для одного взрослого пассажира.";
    }
    if (code === "TUTU_TIMEOUT" || code === "TUTU_UNAVAILABLE") {
      return "Tutu временно недоступен. Попробуйте ещё раз позже.";
    }
    if (code === "TUTU_CHECKOUT_UNAVAILABLE") {
      return "Переход к оформлению для этого варианта недоступен.";
    }
    return "Не удалось выполнить поиск. Попробуйте ещё раз.";
  }

  function messageForCheckoutError(error) {
    const code = backendCode(error);
    if (["TUTU_SELECTION_INVALID", "TUTU_SELECTION_EXPIRED", "TUTU_SELECTION_USER_MISMATCH"].includes(code)) {
      return "Этот вариант больше недоступен. Обновите результаты поиска и выберите билет снова.";
    }
    if (code === "TUTU_CHECKOUT_UNAVAILABLE") {
      return "Переход к оформлению для этого варианта недоступен.";
    }
    if (code === "TUTU_TIMEOUT" || code === "TUTU_UNAVAILABLE") {
      return "Tutu временно недоступен. Попробуйте перейти к оформлению позже.";
    }
    return "Не удалось перейти к оформлению билета.";
  }

  function messageForDemoPurchaseError(error) {
    const code = backendCode(error);
    if (["TUTU_SELECTION_INVALID", "TUTU_SELECTION_EXPIRED", "TUTU_SELECTION_USER_MISMATCH"].includes(code)) {
      return "Этот вариант больше недоступен. Выполните новый поиск и выберите билет снова.";
    }
    if (code === "IDEMPOTENCY_KEY_REUSE") {
      return "Не удалось подтвердить этот демонстрационный выбор. Не меняйте вариант и повторите попытку позже.";
    }
    if (code === "TUTU_TIMEOUT" || code === "TUTU_UNAVAILABLE") {
      return "Подтверждение временно недоступно. Повторите попытку позже.";
    }
    if (error && error.status === 401) {
      return "Сессия истекла. Войдите снова и выполните новый поиск.";
    }
    return "Не удалось подтвердить демонстрационную покупку. Повторите попытку.";
  }

  function createController(options) {
    const settings = options || {};
    const api = settings.api;
    const render = typeof settings.render === "function" ? settings.render : function () {};
    const openPlaceholder = typeof settings.openPlaceholder === "function"
      ? settings.openPlaceholder
      : function () { return window.open("", "_blank"); };
    const goToTrip = typeof settings.goToTrip === "function"
      ? settings.goToTrip
      : function (tripId) { window.AppRoutes.goToTrip(tripId); };
    const randomBytes = typeof settings.randomBytes === "function"
      ? settings.randomBytes
      : function () {
        const bytes = new Uint8Array(24);
        window.crypto.getRandomValues(bytes);
        return bytes;
      };
    let searchPending = false;
    let state = {
      request: null,
      entries: [],
      status: "idle",
      sort: "default",
      directOnly: false,
      carrier: "",
      pendingSelectionId: null,
      selectionIntent: null,
      demoPurchasePending: false,
      errorMessage: ""
    };

    function publish() {
      render(state);
    }

    function getState() {
      return state;
    }

    function visibleEntries() {
      return sortEntries(filterEntries(state.entries, state.directOnly, state.carrier), state.sort);
    }

    function createIdempotencyKey() {
      const bytes = randomBytes();
      if (!bytes || bytes.length < 16) throw new Error("Secure idempotency key generation is unavailable");
      return Array.prototype.map.call(bytes, function (value) {
        return Number(value).toString(16).padStart(2, "0");
      }).join("");
    }

    function createSelectionIntent(entry) {
      return Object.freeze({
        optionId: entry.option.id,
        selectionToken: entry.selectionToken,
        idempotencyKey: createIdempotencyKey()
      });
    }

    function closePlaceholder(placeholder) {
      try { placeholder.close(); } catch (error) { /* best effort */ }
    }

    async function search(request) {
      if (searchPending) return false;
      searchPending = true;
      state = Object.assign({}, state, {
        request: request,
        entries: [],
        status: "loading",
        sort: "default",
        directOnly: false,
        carrier: "",
        pendingSelectionId: null,
        selectionIntent: null,
        demoPurchasePending: false,
        errorMessage: ""
      });
      publish();
      try {
        const entries = normalizeSearchEnvelope(await api.tutuSearch(request));
        state = Object.assign({}, state, { entries: entries, status: entries.length ? "results" : "empty" });
      } catch (error) {
        state = Object.assign({}, state, { status: "error", errorMessage: messageForBackendError(error) });
      } finally {
        searchPending = false;
        publish();
      }
      return true;
    }

    async function select(optionId) {
      if (state.pendingSelectionId || state.demoPurchasePending) return false;
      const entry = state.entries.find(function (item) { return item.option.id === optionId; });
      if (!entry) return false;

      let placeholder;
      try {
        placeholder = openPlaceholder();
      } catch (error) {
        placeholder = null;
      }
      if (!placeholder) {
        state = Object.assign({}, state, {
          errorMessage: "Браузер заблокировал новое окно оформления. Разрешите всплывающие окна и повторите попытку."
        });
        publish();
        return false;
      }
      try {
        placeholder.opener = null;
        if (placeholder.opener !== null) throw new Error("Checkout opener isolation failed");
      } catch (error) {
        closePlaceholder(placeholder);
        state = Object.assign({}, state, {
          errorMessage: "Не удалось безопасно открыть окно оформления. Повторите попытку."
        });
        publish();
        return false;
      }

      state = Object.assign({}, state, {
        pendingSelectionId: optionId,
        selectionIntent: null,
        errorMessage: ""
      });
      publish();
      try {
        const response = await api.tutuCheckoutLink(entry.selectionToken);
        const checkoutUrl = response && response.checkout && response.checkout.checkoutUrl;
        if (typeof checkoutUrl !== "string" || !isSafeCheckoutUrl(checkoutUrl)) {
          throw new Error("Checkout response URL is unavailable");
        }
        const intent = createSelectionIntent(entry);
        placeholder.location.replace(checkoutUrl);
        state = Object.assign({}, state, { selectionIntent: intent });
      } catch (error) {
        closePlaceholder(placeholder);
        state = Object.assign({}, state, {
          errorMessage: messageForCheckoutError(error)
        });
      } finally {
        state = Object.assign({}, state, { pendingSelectionId: null });
        publish();
      }
      return true;
    }

    async function confirmDemoPurchase() {
      const intent = state.selectionIntent;
      if (!intent || state.demoPurchasePending) return false;
      state = Object.assign({}, state, { demoPurchasePending: true, errorMessage: "" });
      publish();
      let canonicalTripId = "";
      try {
        const result = await api.tutuDemoPurchaseSuccess(intent.selectionToken, intent.idempotencyKey);
        if (!result || typeof result.tripId !== "string" || !result.tripId ||
            (result.created !== true && result.created !== false)) {
          throw new Error("Demo purchase response is invalid");
        }
        canonicalTripId = result.tripId;
        await api.getTrip(result.tripId);
        goToTrip(result.tripId);
      } catch (error) {
        const message = error && error.status === 401
          ? messageForDemoPurchaseError(error)
          : (canonicalTripId
            ? "Демонстрационное подтверждение получено, но не удалось открыть созданную поездку. Повторите попытку."
            : messageForDemoPurchaseError(error));
        state = Object.assign({}, state, { errorMessage: message });
      } finally {
        state = Object.assign({}, state, { demoPurchasePending: false });
        publish();
      }
      return true;
    }

    function setSort(sort) {
      state = Object.assign({}, state, { sort: ["default", "cheap", "fast", "early"].includes(sort) ? sort : "default" });
      publish();
    }

    function setDirectOnly(value) {
      state = Object.assign({}, state, { directOnly: !!value });
      publish();
    }

    function setCarrier(value) {
      const allowed = carrierOptions(state.entries);
      state = Object.assign({}, state, { carrier: allowed.includes(value) ? value : "" });
      publish();
    }

    return Object.freeze({
      search: search,
      select: select,
      confirmDemoPurchase: confirmDemoPurchase,
      setSort: setSort,
      setDirectOnly: setDirectOnly,
      setCarrier: setCarrier,
      getState: getState,
      visibleEntries: visibleEntries
    });
  }

  function init(root) {
    if (!root) return false;
    let request;
    try {
      request = window.TutuSearchAdapter.requestFromQuery(window.location.search);
    } catch (error) {
      root.innerHTML = statePanel("Проверьте параметры поиска", window.TutuSearchAdapter.messageForLocalError(error), `<button type="button" data-results-edit>Вернуться к поиску</button>`);
      root.addEventListener("click", function (event) {
        if (event.target.closest("[data-results-edit]")) window.AppRoutes.goToHome();
      });
      return false;
    }

    const controller = createController({
      api: window.TravelApi,
      goToTrip: function (tripId) { window.AppRoutes.goToTrip(tripId); },
      render: function (state) { root.innerHTML = renderPage(state, controller.visibleEntries()); }
    });

    root.addEventListener("change", function (event) {
      if (event.target.matches("[data-results-sort]")) controller.setSort(event.target.value);
      if (event.target.matches("[data-results-direct]")) controller.setDirectOnly(event.target.checked);
      if (event.target.matches("[data-results-carrier]")) controller.setCarrier(event.target.value);
    });
    root.addEventListener("click", function (event) {
      const select = event.target.closest("[data-results-select]");
      if (select) { controller.select(select.dataset.resultsSelect); return; }
      if (event.target.closest("[data-results-demo-purchase]")) { controller.confirmDemoPurchase(); return; }
      if (event.target.closest("[data-results-edit]")) { window.AppRoutes.goToHome(); return; }
      if (event.target.closest("[data-results-retry]")) { controller.search(request); return; }
      if (event.target.closest("[data-results-reset]")) {
        controller.setDirectOnly(false);
        controller.setCarrier("");
      }
    });
    controller.search(request);
    return true;
  }

  window.TutuSearchResults = Object.freeze({
    formatDuration: formatDuration,
    formatTransfers: formatTransfers,
    carrierLabel: carrierLabel,
    serviceNumberLabel: serviceNumberLabel,
    formatPrice: formatPrice,
    formatIsoTime: formatIsoTime,
    sortEntries: sortEntries,
    filterEntries: filterEntries,
    carrierOptions: carrierOptions,
    normalizeSearchEnvelope: normalizeSearchEnvelope,
    messageForBackendError: messageForBackendError,
    createController: createController,
    renderCard: renderCard,
    renderContent: renderContent,
    renderPage: renderPage
  });
  window.tutuSearchResultsInit = init;
})();

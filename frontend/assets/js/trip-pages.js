(function () {
  "use strict";

  let adapter = window.TripPagesAdapter;
  let routes = window.TripPagesRoutes || {
    workspaceHref: "./trip-overview.html",
    goToHome: () => { location.href = "home.html"; },
    goToHistory: () => { location.href = "history.html"; },
    goToProfile: (section) => { location.href = section ? `profile.html?section=${encodeURIComponent(section)}` : "profile.html"; },
    goToWizard: (options = {}) => { location.href = options.mode === "edit" ? `trip-wizard.html?mode=edit&tripId=${encodeURIComponent(options.tripId || "")}` : "trip-wizard.html"; },
    goToTrip: (tripId, options = {}) => { location.href = `./trip-overview.html?tripId=${encodeURIComponent(tripId)}${options.tab ? `&tab=${encodeURIComponent(options.tab)}` : ""}`; },
    goToInvitation: (id) => { location.href = `invitation.html?id=${encodeURIComponent(id)}`; },
    logout: () => {}
  };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const cleanText = (value, fallback) => {
    const text = String(value ?? "").trim();
    return !text || /фывцф|undefined|null|lorem ipsum/i.test(text) ? fallback : text;
  };
  const uid = () => "id-" + Math.random().toString(36).slice(2, 9);

  const pageState = {
    homeTab: location.hash === "#drafts" ? "drafts" : "active",
    historyView: "list",
    readonlyTab: 0,
    uiScenario: "normal",
    networkState: "online",
    accessState: "allowed",
    modal: null,
    lastFocus: null,
    wizard: null,
    mountedRoots: new WeakMap(),
    consoleErrors: 0
  };

  function configureRuntime(nextAdapter, nextRoutes) {
    if (nextAdapter) adapter = nextAdapter;
    if (nextRoutes) routes = { ...routes, ...nextRoutes };
  }

  window.addEventListener("error", () => { pageState.consoleErrors += 1; });
  window.addEventListener("unhandledrejection", () => { pageState.consoleErrors += 1; });

  const icons = {
    logo: '<path d="M12 3 4.5 7.2 12 11.4l7.5-4.2L12 3Z"/><path d="M4.5 7.2v8.4L12 20V11.4"/><path d="M19.5 7.2v8.4L12 20"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    check: '<path d="m20 6-11 11-5-5"/>',
    warn: '<path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'
  };

  function icon(name) {
    return `<svg class="tp-icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.logo}</svg>`;
  }

  function appHeader(title, active) {
    const cta = active === "home"
      ? `<a class="tp-button tp-button-primary tp-create-main" href="trip-wizard.html?mode=create" data-od-id="home-create-trip">${icon("plus")}Создать поездку</a>`
      : "";
    return `<div class="tp-page-head" data-od-id="${active}-header"><h1 class="tp-page-title" data-od-id="${active}-title">${esc(title)}</h1>${cta}</div>`;
  }

  function shell(root, title, active, content) {
    root.innerHTML = `${appHeader(title, active)}<div class="tp-shell">${content}</div><div class="toast-region" aria-live="polite" aria-atomic="true"></div>`;
  }

  function devPanel(page, states) {
    return `
      <details class="dev-panel" data-development-only="true" data-od-id="${page}-dev-panel">
        <summary>Панель проверки <span class="tp-muted">закрыта по умолчанию</span></summary>
        <div class="dev-controls" role="group" aria-label="Системные состояния">
          ${states.map((state) => `<button class="tp-button tp-button-secondary" type="button" data-demo-state="${state.value}">${state.label}</button>`).join("")}
          <button class="tp-button tp-button-danger" type="button" data-action="demo-reset">Сбросить демо-данные</button>
        </div>
      </details>
    `;
  }

  const stateLabels = [
    ["normal", "Обычный экран"],
    ["loading", "Загрузка"],
    ["empty", "Пустое состояние"],
    ["error", "Ошибка"],
    ["offline", "Офлайн"],
    ["no-access", "Нет доступа"],
    ["active", "Активные поездки"],
    ["drafts", "Черновики"],
    ["invitations", "Приглашения"],
    ["completed", "Завершённая поездка"],
    ["create", "Режим создания"],
    ["edit", "Режим редактирования"]
  ].map(([value, label]) => ({ value, label }));

  function mountRoot(root, render) {
    if (pageState.mountedRoots.has(root)) return;
    const controller = new AbortController();
    root.addEventListener("click", handleAction, { signal: controller.signal });
    root.addEventListener("input", handleInput, { signal: controller.signal });
    root.addEventListener("change", handleInput, { signal: controller.signal });
    const unsubscribe = adapter.subscribe?.(() => render(root));
    pageState.mountedRoots.set(root, { controller, render, unsubscribe });
  }

  function remount(root, render) {
    const mounted = pageState.mountedRoots.get(root);
    if (mounted) mounted.render = render;
  }

  function rerender(root) {
    pageState.mountedRoots.get(root)?.render(root);
  }

  function destroyRoot(root) {
    const mounted = pageState.mountedRoots.get(root);
    mounted?.controller.abort();
    mounted?.unsubscribe?.();
    pageState.mountedRoots.delete(root);
    closeProfileMenus();
    closeModal();
    $$(".toast").forEach((toastNode) => toastNode.remove());
  }

  function renderStateCard(page, state) {
    const copy = {
      loading: ["Загрузка", "Получаем поездки, приглашения и черновики."],
      empty: ["Пустое состояние", "Список пуст. Можно создать поездку и вернуться сюда."],
      error: ["Ошибка", "Действие не выполнено. Данные не изменены."],
      offline: ["Офлайн", "Доступен просмотр локально сохранённого состояния."],
      "no-access": ["Нет доступа", "Текущая роль не может открыть эти данные."],
      active: ["Активные поездки", "Показаны текущие и предстоящие поездки."],
      drafts: ["Черновики", "Показаны незавершённые мастера создания."],
      invitations: ["Приглашения", "Активные, принятые, отклонённые, просроченные и отозванные состояния."],
      completed: ["Завершённая поездка", "Данные доступны только для просмотра."],
      create: ["Режим создания", "Мастер открыт как новая поездка."],
      edit: ["Режим редактирования", "Мастер открыт с существующими данными."]
    }[state] || ["Пустое состояние", "Нет данных."];
    return `<section class="tp-card tp-state-screen" data-od-id="${page}-state-${state}"><div><h2>${copy[0]}</h2><p>${copy[1]}</p><a class="tp-button tp-button-primary" href="trip-wizard.html">Создать поездку</a></div></section>`;
  }

  function renderHome(root) {
    mountRoot(root, renderHome);
    remount(root, renderHome);
    const state = adapter.getState();
    if (pageState.uiScenario !== "normal") {
      shell(root, "Текущие поездки", "home", devPanel("home", stateLabels) + renderStateCard("home", pageState.uiScenario));
      return;
    }
    const activeInvites = state.invitations.filter((invite) => invite.status === "active");
    const activeTrips = state.trips.filter((trip) => trip.status !== "completed");
    shell(root, "Текущие поездки", "home", `
      ${devPanel("home", stateLabels)}
      ${activeInvites.length ? invitationsBlock(activeInvites) : ""}
      <section class="home-switcher" data-od-id="home-active-drafts">
        <div class="tp-segmented" role="tablist" aria-label="Раздел поездок">
          <button type="button" role="tab" class="tp-segment-button" data-action="home-tab" data-tab="active" aria-selected="${pageState.homeTab === "active"}">Активные</button>
          <button type="button" role="tab" class="tp-segment-button" data-action="home-tab" data-tab="drafts" aria-selected="${pageState.homeTab === "drafts"}">Черновики</button>
        </div>
        <p class="tp-muted">${pageState.homeTab === "active" ? "Текущие и предстоящие поездки без завершённых архивов." : "Незавершённые поездки, которые можно продолжить позже."}</p>
      </section>
      ${pageState.homeTab === "active" ? tripsList(activeTrips, state.workspaceHref) : draftsList(state.drafts)}
    `);
  }

  function invitationsBlock(invites) {
    return `
      <section class="tp-card home-invitations" data-od-id="home-invitations">
        <div class="tp-card-head compact"><div><h2>Приглашения в поездки</h2><p>${invites.length} активных</p></div></div>
        <div class="invite-list">${invites.map((invite) => `
          <article class="invite-row" data-od-id="home-invite-${invite.id}">
            <div><strong>${esc(invite.title)}</strong><div class="tp-note">${esc(invite.route)} · ${esc(invite.dates)} · организатор ${esc(invite.inviterName || invite.inviter)} · ${esc(invite.accessMode === "readonly" ? "только просмотр" : invite.role || "участник")} · ${esc(invite.expires)}</div></div>
            <div class="tp-row-actions"><button class="tp-button tp-button-primary" type="button" data-action="accept-invite" data-id="${invite.id}">Принять</button><button class="tp-button tp-button-quiet" type="button" data-action="reject-invite" data-id="${invite.id}">Отклонить</button></div>
          </article>`).join("")}
        </div>
      </section>
    `;
  }

  function tripsList(trips, workspaceHref) {
    if (!trips.length) return `<section class="tp-card tp-empty" data-od-id="home-empty-active"><div><h2>Активных поездок нет</h2><p>Создайте поездку или примите приглашение.</p><a class="tp-button tp-button-primary" href="trip-wizard.html">Создать поездку</a></div></section>`;
    return `<section class="trip-list" data-od-id="home-trip-list">${trips.map((trip, index) => tripRow(trip, workspaceHref, index === 0)).join("")}</section>`;
  }

  function tripRow(trip, workspaceHref, featured) {
    const title = cleanText(trip.title, "Новая поездка");
    const participants = Number(trip.participants?.length || trip.participants || 0);
    const documents = Number(trip.documents || 0);
    const monitoring = cleanText(trip.monitoring, "Мониторинг не настроен");
    const monitoringLabel = /^актив/i.test(monitoring) ? "Мониторинг активен" : monitoring;
    const risk = cleanText(String(trip.risk || "низкий").toLowerCase(), "низкий");
    const role = cleanText(trip.role || "участник", "участник");
    return `
      <article class="trip-row ${featured ? "is-featured" : ""}" data-od-id="home-trip-${trip.id}">
        <div class="trip-row-main">
          <h2>${esc(title)}</h2>
          <div class="tp-route">${esc(trip.route)}</div>
          <div class="trip-row-meta">${esc(trip.dates)} · ${esc(trip.kind)}</div>
        </div>
        <div class="trip-row-stats" aria-label="Сводка поездки"><span>Ваша роль: ${esc(role)}</span><span>Риск: ${esc(risk)}</span><span>${participants} ${participants === 1 ? "участник" : "участника"}</span><span>${documents} ${documents === 1 ? "документ" : documents > 1 && documents < 5 ? "документа" : "документов"}</span><span>${esc(monitoringLabel)}</span></div>
        <div class="trip-row-actions"><a class="tp-button tp-button-primary" href="${esc(workspaceHref)}?tripId=${esc(trip.id)}">Открыть поездку</a>${trip.role === "Организатор" ? `<a class="tp-button tp-button-quiet" href="trip-wizard.html?mode=edit&tripId=${esc(trip.id)}">Редактировать</a>` : ""}</div>
      </article>
    `;
  }

  function draftsList(drafts) {
    if (!drafts.length) return `<section class="tp-card tp-empty" data-od-id="home-empty-drafts"><div><h2>Черновиков нет</h2><p>Незавершённые мастера появятся здесь после сохранения.</p><a class="tp-button tp-button-primary" href="trip-wizard.html">Создать поездку</a></div></section>`;
    return `<section class="trip-list" data-od-id="home-draft-list">${drafts.map((draft) => `
      <article class="trip-row draft-row" data-od-id="home-draft-${draft.id}">
        <div class="trip-row-main"><h2>${esc(cleanText(draft.data.title, "Новая поездка"))}</h2><div class="tp-route">Шаг ${draft.step + 1} из 8 · ${esc(draft.data.stageLabel || (draft.step === 3 ? "Логистика" : wizardSteps[draft.step].title))}</div><div class="trip-row-meta">Изменён ${formatDateTime(draft.updatedAt)}</div></div>
        <div class="draft-progress"><span style="width:${draft.progress}%"></span></div>
        <div class="trip-row-stats"><span>${draft.progress}% заполнено</span><span>${draft.segments.length} сегмент</span></div>
        <div class="trip-row-actions"><a class="tp-button tp-button-primary" href="trip-wizard.html?draft=${esc(draft.id)}">Продолжить</a><button class="tp-button tp-button-quiet is-destructive-link" type="button" data-action="delete-draft-home" data-id="${draft.id}">Удалить черновик</button></div>
      </article>`).join("")}</section>`;
  }

  function renderHistory(root) {
    mountRoot(root, renderHistory);
    remount(root, renderHistory);
    const state = adapter.getState();
    if (pageState.uiScenario !== "normal") {
      shell(root, "История поездок", "history", devPanel("history", stateLabels) + renderStateCard("history", pageState.uiScenario));
      return;
    }
    shell(root, "История поездок", "history", `
      ${devPanel("history", stateLabels)}
      <section class="history-head" data-od-id="history-head"><div><h2>Завершённые поездки</h2><p>Только архивный доступ для просмотра.</p></div>${badge("Без действий изменения", "is-success")}</section>
      <section class="tp-filter-bar compact" data-od-id="history-filters">
        ${fieldShell("Поиск", `<input id="history-search" class="tp-input" type="search" placeholder="Название или маршрут" />`)}
        <details class="history-filter-details"><summary class="tp-button tp-button-secondary">Фильтры</summary>
          <div class="history-filter-panel">
            ${fieldShell("Год", select("history-year", ["", "2026", "2025"], ["Все годы", "2026", "2025"]))}
            ${fieldShell("Роль", select("history-role", ["", "Организатор", "Участник"], ["Все роли", "Организатор", "Участник"]))}
            ${fieldShell("Тип", select("history-kind", ["", "Соло", "Групповая"], ["Соло и группа", "Соло", "Групповая"]))}
            ${fieldShell("Сортировка", select("history-sort", ["new", "old", "incidents"], ["Сначала новые", "Сначала старые", "По нарушениям"]))}
          </div>
        </details>
      </section>
      <div class="history-toolbar"><p id="history-count" class="tp-muted" aria-live="polite"></p><div class="tp-row-actions"><button class="tp-button tp-button-secondary" type="button" data-action="history-view" data-view="list" aria-pressed="${pageState.historyView === "list"}">Список</button><button class="tp-button tp-button-secondary" type="button" data-action="history-view" data-view="grid" aria-pressed="${pageState.historyView === "grid"}">Сетка</button></div></div>
      <section id="history-list" class="history-list" data-od-id="history-list"></section>
    `);
    const filterDetails = $(".history-filter-details", root);
    if (filterDetails) filterDetails.open = window.innerWidth > 820;
    applyHistoryFilters(root, state.completedTrips);
  }

  function applyHistoryFilters(root, source = adapter.getState().completedTrips || []) {
    const search = $("#history-search", root)?.value?.toLowerCase() || "";
    const year = $("#history-year", root)?.value || "";
    const role = $("#history-role", root)?.value || "";
    const kind = $("#history-kind", root)?.value || "";
    const sort = $("#history-sort", root)?.value || "new";
    let trips = source.filter((trip) => (!search || `${trip.title} ${trip.route}`.toLowerCase().includes(search)) && (!year || trip.year === year) && (!role || trip.role === role) && (!kind || trip.kind === kind));
    trips.sort((a, b) => sort === "old" ? a.sortDate.localeCompare(b.sortDate) : sort === "incidents" ? b.incidents - a.incidents : b.sortDate.localeCompare(a.sortDate));
    const list = $("#history-list", root);
    if (!list) return;
    list.classList.toggle("is-grid", pageState.historyView === "grid");
    list.innerHTML = trips.length ? trips.map(historyCard).join("") : `<section class="tp-card tp-empty"><div><h2>Истории нет</h2><p>Завершённые поездки появятся после окончания маршрутов.</p></div></section>`;
    $("#history-count", root).textContent = `${trips.length} ${pluralTrips(trips.length)}`;
  }

  function historyCard(trip) {
    return `<article class="history-card" data-od-id="history-trip-${trip.id}"><div class="tp-trip-main"><div><h2>${esc(trip.title)}</h2><div class="tp-route">${esc(trip.route)}</div><div class="trip-row-meta">${esc(trip.dates)}</div></div>${badge("Завершена", "is-success")}</div><div class="trip-row-badges">${badge(trip.role)}${badge(trip.kind)}${badge(`${trip.incidents} наруш.`, trip.incidents ? "is-warning" : "")}</div><div class="compact-facts"><span>${trip.participants} участ.</span><span>${trip.documents} док.</span><span>Plan B: ${esc(trip.planB)}</span></div><div class="tp-row-actions"><a class="tp-button tp-button-primary" href="trip-overview.html?tripId=${esc(trip.id)}">Открыть</a></div></article>`;
  }

  const wizardSteps = [
    { id: "type", title: "Тип поездки" },
    { id: "basic", title: "Основные данные" },
    { id: "route", title: "Маршрут и даты" },
    { id: "segments", title: "Сегменты" },
    { id: "logistics", title: "Логистика и проживание" },
    { id: "people", title: "Участники" },
    { id: "documents", title: "Документы и мониторинг" },
    { id: "review", title: "Проверка" }
  ];

  function wizardInitial() {
    const params = new URLSearchParams(location.search);
    const app = adapter.getState();
    const draftId = params.get("draft");
    const draft = app.drafts.find((item) => item.id === draftId);
    if (draft) return { mode: "create", draftId, step: draft.step, maxStep: draft.step, data: clone(draft.data), segments: clone(draft.segments), editingSegment: null, dirty: false, successTrip: null };
    const mode = params.get("mode") === "edit" ? "edit" : "create";
    const trip = mode === "edit" ? app.trips.find((item) => item.id === ((params.get("tripId") || params.get("trip")) || "trip-turkey-2026")) : null;
    const data = trip ? tripToWizardData(trip) : adapter.seedWizardData("");
    const segments = trip?.segments?.length ? clone(trip.segments) : [];
    const blockedReason = mode === "edit" && (!trip || trip.role !== "Организатор" || trip.status === "completed")
      ? (!trip ? "Поездка не найдена." : trip.status === "completed" ? "Завершённую поездку нельзя редактировать." : "Участник не может редактировать чужую поездку.")
      : "";
    return { mode, tripId: trip?.id || "trip-turkey-2026", draftId: null, step: 0, maxStep: 0, data, segments, editingSegment: null, dirty: false, successTrip: null, blockedReason };
  }

  function renderWizard(root) {
    mountRoot(root, renderWizard);
    remount(root, renderWizard);
    if (!pageState.wizard) pageState.wizard = wizardInitial();
    const wz = pageState.wizard;
    if (pageState.uiScenario !== "normal") {
      shell(root, wz.mode === "edit" ? "Редактирование поездки" : "Создание поездки", "wizard", devPanel("wizard", stateLabels) + renderStateCard("wizard", pageState.uiScenario));
      return;
    }
    if (wz.successTrip) {
      shell(root, "Поездка создана", "wizard", successScreen(wz.successTrip));
      return;
    }
    if (wz.blockedReason) {
      shell(root, "Нет доступа", "wizard", devPanel("wizard", stateLabels) + `<section class="tp-card state-card" data-od-id="wizard-no-access"><div class="state-icon">${icon("lock")}</div><h2>Нет доступа</h2><p>${esc(wz.blockedReason)}</p><a class="tp-button tp-button-secondary" href="home.html">Вернуться на Главную</a></section>`);
      return;
    }
    shell(root, wz.mode === "edit" ? "Редактирование поездки" : "Создание поездки", "wizard", `
      ${devPanel("wizard", stateLabels)}
      <nav class="breadcrumb" aria-label="Навигация"><a href="home.html">Главная</a><span>→</span><span>${wz.mode === "edit" ? "Редактирование поездки" : "Создание поездки"}</span></nav>
      <section class="wizard-layout-v2" data-od-id="wizard-layout">
        <aside class="wizard-sidebar" data-od-id="wizard-stepper"><ol class="wizard-steps">${wizardSteps.map((step, index) => stepButton(step, index, wz)).join("")}</ol></aside>
        <section class="wizard-main-v2"><div class="wizard-mobile-step">Шаг ${wz.step + 1} из 8 · ${wizardSteps[wz.step].title}</div><div class="wizard-progress"><span style="width:${((wz.step + 1) / 8) * 100}%"></span></div><div class="wizard-content" data-od-id="wizard-step-${wizardSteps[wz.step].id}">${wizardContent(wz)}</div><footer class="wizard-footer"><div class="tp-row-actions"><button class="tp-button tp-button-quiet" type="button" data-action="save-draft">Сохранить черновик</button></div><div class="tp-row-actions"><button class="tp-button tp-button-secondary" type="button" data-action="prev-step" ${wz.step === 0 ? "disabled" : ""}>Назад</button><button class="tp-button tp-button-primary" type="button" data-action="${wz.step === 7 ? (wz.mode === "edit" ? "save-edit" : "create-trip") : "next-step"}">${wz.step === 7 ? (wz.mode === "edit" ? "Сохранить изменения" : "Создать поездку") : "Далее"}</button></div></footer></section>
      </section>
    `);
  }

  function stepButton(step, index, wz) {
    const allowed = index <= wz.maxStep || index === wz.step + 1;
    return `<li><button class="wizard-step-button" type="button" data-action="go-step" data-step="${index}" aria-current="${index === wz.step ? "step" : "false"}" ${allowed ? "" : "disabled aria-disabled='true'"}><span class="wizard-step-index">${index + 1}</span><span>${step.title}</span></button></li>`;
  }

  function wizardContent(wz) {
    return [
      wizardType,
      wizardBasic,
      wizardRouteDates,
      wizardSegments,
      wizardLogistics,
      wizardPeople,
      wizardDocumentsAndMonitoring,
      wizardReview
    ][wz.step](wz);
  }

  function wizardType(wz) {
    return `<h2>Тип поездки</h2><p>Выберите режим: соло без участников или групповая поездка с ролями и приглашениями.</p><div class="wizard-card-options">${option("type", "solo", "Соло", "Личный маршрут без приглашений.", wz.data.type)}${option("type", "group", "Групповая", "Организатор управляет участниками, документами и доступами.", wz.data.type)}</div><div class="wizard-errors">${stepErrors(wz, 0).join("")}</div>`;
  }

  function wizardBasic(wz) {
    return `<h2>Основные данные</h2><p>Критические поля блокируют переход дальше.</p><div class="wizard-form-grid">${input("title", "Название", "text", wz.data.title, true)}${input("description", "Описание", "textarea", wz.data.description)}${input("start", "Дата начала", "date", wz.data.start, true)}${input("end", "Дата окончания", "date", wz.data.end, true)}${input("timezone", "Часовой пояс", "text", wz.data.timezone, true)}${input("cover", "Обложка или символ", "text", wz.data.cover)}</div><div class="wizard-errors">${stepErrors(wz, 1).join("")}</div>`;
  }

  function wizardRouteDates(wz) {
    return `<h2>Маршрут и даты</h2><p>Укажите основные точки маршрута. Сегменты с рейсами, поездами и трансферами добавляются на следующем шаге.</p><div class="wizard-form-grid">${input("from", "Откуда", "text", wz.data.from || "")}${input("to", "Куда", "text", wz.data.to || "")}${input("start", "Дата начала", "date", wz.data.start, true)}${input("end", "Дата окончания", "date", wz.data.end, true)}<div class="tp-data-cell wizard-wide"><strong>${esc(routeTitle(wz) || [wz.data.from, wz.data.to].filter(Boolean).join(" → ") || "Маршрут не задан")}</strong><span>Итоговая схема будет построена по сегментам, если они добавлены.</span></div></div><div class="wizard-errors">${stepErrors(wz, 2).join("")}</div>`;
  }

  function wizardSegments(wz) {
    const edit = wz.editingSegment ? wz.segments.find((item) => item.id === wz.editingSegment) : null;
    const draft = edit || {};
    return `<h2>Сегменты</h2><p>Добавьте рейсы, поезда, трансферы, отель, пересадки и другие части маршрута.</p><div class="wizard-route-grid">${selectField("seg-type", "Тип", ["Самолёт","Поезд","Автобус","Автомобиль","Трансфер","Проживание","Активность","Другое"], draft.type)}${inputRaw("seg-from", "Откуда", "text", draft.from || "")}${inputRaw("seg-to", "Куда", "text", draft.to || "")}${inputRaw("seg-start", "Начало", "datetime-local", draft.start || "")}${inputRaw("seg-end", "Окончание", "datetime-local", draft.end || "")}${inputRaw("seg-ref", "Рейс или бронь", "text", draft.ref || "")}${inputRaw("seg-provider", "Перевозчик или поставщик", "text", draft.provider || "")}${selectField("seg-status", "Статус", ["Черновик","Подтверждён","Требует проверки"], draft.status || "Черновик")}${inputRaw("seg-note", "Заметка", "text", draft.note || "", "wizard-wide")}</div><div class="tp-row-actions route-actions"><button class="tp-button tp-button-secondary" type="button" data-action="save-segment">${edit ? "Сохранить сегмент" : "Добавить сегмент"}</button>${edit ? `<button class="tp-button tp-button-quiet" type="button" data-action="cancel-segment-edit">Отмена</button>` : ""}</div><div class="wizard-segment-list">${wz.segments.sort((a,b)=>a.order-b.order).map(segmentRow).join("")}</div><div class="wizard-errors">${routeIssues(wz).map(issueLine).join("")}</div>`;
  }

  function wizardLogistics(wz) {
    return `<h2>Проживание и логистика</h2><p>Заселение не может быть позже выселения.</p><div class="wizard-form-grid">${input("hotel", "Отель", "text", wz.data.hotel)}${input("address", "Адрес", "text", wz.data.address)}${input("checkin", "Заселение", "datetime-local", wz.data.checkin)}${input("checkout", "Выселение", "datetime-local", wz.data.checkout)}${input("transfer", "Трансфер", "text", wz.data.transfer)}${input("contacts", "Важные контакты", "text", wz.data.contacts)}${input("notes", "Заметки", "textarea", wz.data.notes)}</div><div class="wizard-errors">${stepErrors(wz, 3).join("")}</div>`;
  }

  function wizardPeople(wz) {
    const solo = wz.data.type === "solo";
    const drafts = wz.data.invitationDrafts || [];
    return `<h2>Участники</h2><p>${solo ? "В соло-поездке остаётся только текущий пользователь." : "Подготовленные приглашения не являются участниками до принятия."}</p><div class="wizard-form-grid"><div class="tp-data-cell"><strong>Артём</strong><span>Организатор</span></div>${solo ? `<div class="tp-alert tp-alert-success wizard-wide"><strong>Соло-режим</strong> Приглашения скрыты.</div>` : `${input("inviteEmail", "Email", "email", wz.data.inviteEmail)}${selectData("inviteExpires", "Срок действия", ["24 часа","3 дня","7 дней","14 дней"], wz.data.inviteExpires)}${selectData("inviteAccessMode", "Режим доступа", ["member","readonly"], wz.data.inviteAccessMode || "member", ["Участник","Только просмотр"])}<div class="tp-row-actions wizard-wide"><button class="tp-button tp-button-secondary" type="button" data-action="add-invite-draft">Добавить участника</button></div><div class="wizard-wide invite-draft-list">${drafts.map((item) => `<div class="tp-list-row"><span>${esc(item.email)} · ${item.accessMode === "readonly" ? "только просмотр" : "участник"} · ${esc(item.expires)}</span><button class="tp-button tp-button-quiet" type="button" data-action="delete-invite-draft" data-id="${item.id}">Удалить</button></div>`).join("") || `<div class="tp-note">Подготовленных приглашений пока нет.</div>`}</div>`}</div><div class="wizard-errors">${stepErrors(wz, 4).join("")}</div>`;
  }

  function wizardDocumentsAndMonitoring(wz) {
    const docs = wz.data.documentSetup || [];
    return `<h2>Документы и мониторинг</h2><p>Список документов и сигналы маршрута настраиваются до проверки поездки.</p><div class="wizard-card-options">${option("documentsMode","later","Загрузить позже","Создать поездку без файлов.",wz.data.documentsMode)}${option("documentsMode","demo","Подготовить документы","Добавить список ожидаемых документов.",wz.data.documentsMode)}</div><div class="wizard-form-grid">${input("documentTitle", "Название документа", "text", wz.data.documentTitle || "")}${selectData("documentType","Тип",["Авиабилет","Билет на поезд или автобус","Бронь отеля","Трансфер","Страховка","Визовые материалы","Другое"],wz.data.documentType || "Авиабилет")}${selectData("documentVisibility","Видимость",["Участникам","Только организатору"],wz.data.documentVisibility || "Участникам")}<div class="tp-row-actions wizard-wide"><button class="tp-button tp-button-secondary" type="button" data-action="add-document-draft">Добавить документ</button></div><div class="wizard-wide invite-draft-list">${docs.map((doc) => `<div class="tp-list-row"><span>${esc(doc.title)} · ${esc(doc.type)} · ${esc(doc.visibility)}</span><button class="tp-button tp-button-quiet" type="button" data-action="delete-document-draft" data-id="${doc.id}">Удалить</button></div>`).join("") || `<div class="tp-note">Подготовленных документов пока нет.</div>`}</div><div class="wizard-wide wizard-monitoring-grid">${check("notifyFlights","Рейсы",wz.data.notifyFlights)}${check("notifyTransfer","Трансфер",wz.data.notifyTransfer)}${check("notifyHotel","Проживание",wz.data.notifyHotel)}${check("notifyTelegram","Telegram",wz.data.notifyTelegram)}${check("notifyEmail","Email",wz.data.notifyEmail)}${check("notifyDaily","Ежедневная сводка",wz.data.notifyDaily)}${check("sos","SOS",wz.data.sos)}</div></div><div class="wizard-errors">${stepErrors(wz, 6).join("")}</div>`;
  }

  function wizardReview(wz) {
    const all = allWizardIssues(wz);
    return `<h2>Проверка и ${wz.mode === "edit" ? "сохранение" : "создание"}</h2><p>Ошибки блокируют подтверждение, предупреждения можно оставить осознанно.</p><section class="tp-card"><div class="tp-card-head"><div><h3>Сводка</h3><p>${esc(wz.data.title || "Название не заполнено")} · ${esc(routeTitle(wz))}</p></div>${badge(`${all.errors.length} ошибок`, all.errors.length ? "is-danger" : "is-success")}</div><div class="tp-card-body">${wizardSummary(wz)}</div></section><section class="tp-card"><div class="tp-card-head"><div><h3>Проблемы</h3><p>Можно перейти к конкретному шагу.</p></div></div><div class="tp-card-body wizard-errors">${all.errors.concat(all.warnings).map((issue) => `<button class="tp-alert ${issue.blocking ? "tp-alert-danger" : "tp-alert-warning"}" type="button" data-action="go-step" data-step="${issue.step}"><strong>${esc(issue.message)}</strong><span>${issue.blocking ? "Исправить обязательно" : "Предупреждение"}</span></button>`).join("") || `<div class="tp-alert tp-alert-success"><strong>Ошибок нет</strong>Можно подтвердить.</div>`}</div></section><section class="tp-card"><div class="tp-card-head"><div><h3>${wz.mode === "edit" ? "Что изменится" : "Что будет создано"}</h3><p>Поля, сегменты, участники и уведомления.</p></div></div><div class="tp-card-body compact-facts"><span>Поля: название, даты, часовой пояс</span><span>Сегменты: ${wz.segments.length}</span><span>Участники: ${wz.data.type === "solo" ? 1 : 2}</span><span>Уведомления: ${notifyList(wz.data).join(", ") || "нет"}</span></div></section>`;
  }

  function renderReadonly(root) {
    mountRoot(root, renderReadonly);
    remount(root, renderReadonly);
    if (pageState.uiScenario !== "normal") {
      shell(root, "Завершённая поездка", "readonly", devPanel("readonly", stateLabels) + renderStateCard("readonly", pageState.uiScenario));
      return;
    }
    const completedTrips = adapter.getState().completedTrips || [];
    const requestedId = new URLSearchParams(location.search).get("trip");
    const completed = completedTrips.find((trip) => trip.id === requestedId) || (!requestedId ? completedTrips[0] : null);
    if (!completed) {
      shell(root, "Поездка не найдена", "readonly", `<section class="tp-card state-card" data-od-id="readonly-not-found"><div class="state-icon">${icon("lock")}</div><h2>Завершённая поездка не найдена</h2><p>Данные другой поездки не подставляются.</p><a class="tp-button tp-button-secondary" href="history.html">Вернуться в Историю</a></section>`);
      return;
    }
    shell(root, "Поездка", "readonly", `
      ${devPanel("readonly", stateLabels)}
      <section class="readonly-banner" data-od-id="readonly-banner"><span>${icon("lock")}</span><div><strong>Поездка завершена. Данные доступны только для просмотра.</strong>Редактирование, приглашение, загрузка, SOS, подтверждение нарушений, новый Plan B, отправка сообщений и повторная активация отсутствуют.</div></section>
      <section class="trip-header-like" data-od-id="readonly-trip-header"><div class="trip-nav-like"><a href="history.html">← История</a></div><div class="trip-title-row"><div><h1>${esc(completed.title)}</h1><p>${esc(completed.route)} · ${esc(completed.dates)}</p><div class="tp-chip-row">${badge("Завершена", "is-success")}${badge(completed.role, "is-accent")}</div></div></div></section>
      <label class="readonly-mobile-select tp-field"><span>Раздел</span><select class="tp-select" data-readonly-section>${["Обзор","Маршрут","Документы","Участники","Мониторинг","Сообщения","Настройки"].map((label, index) => `<option value="${index}" ${Number(pageState.readonlyTab || 0) === index ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <nav class="tabs workspace-tabs" data-od-id="readonly-workspace-tabs">${["Обзор","Маршрут","Документы","Участники","Мониторинг","Сообщения","Настройки"].map((label, index) => `<button class="tab" type="button" data-action="readonly-tab" data-tab="${index}" aria-selected="${Number(pageState.readonlyTab || 0) === index}">${label}</button>`).join("")}</nav>
      <section class="readonly-workspace" data-od-id="readonly-workspace">${readonlyWorkspaceContent(completed)}</section>
    `);
  }

  function readonlyWorkspaceContent(trip) {
    const index = Number.isInteger(pageState.readonlyTab) ? pageState.readonlyTab : 0;
    const blocks = [
      `<div class="overview-grid-like"><section class="tp-card"><div class="tp-card-head"><div><h2>Итоги поездки</h2><p>Архив рабочей области.</p></div></div><div class="tp-card-body readonly-summary-grid"><div class="tp-data-cell"><strong>${trip.participants}</strong><span>участников</span></div><div class="tp-data-cell"><strong>${trip.documents}</strong><span>документов</span></div><div class="tp-data-cell"><strong>${trip.incidents}</strong><span>нарушения</span></div><div class="tp-data-cell"><strong>${esc(trip.planB)}</strong><span>выбранный Plan B</span></div></div></section><section class="tp-card"><div class="tp-card-head"><div><h2>Последние события</h2><p>Без подтверждения новых нарушений.</p></div></div><div class="tp-card-body timeline">${readonlyTimeline(trip).map((item) => `<div class="timeline-item"><span class="timeline-time">${esc(item.time)}</span><span>${esc(item.text)}</span></div>`).join("")}</div></section></div>`,
      `<section class="tp-card"><div class="tp-card-head"><div><h2>Маршрут</h2><p>Статичная схема без сохранения интерактивных map tiles.</p></div></div><div class="tp-card-body"><div class="route-map">${routeSvg(trip)}</div></div></section>`,
      `<section class="tp-card"><div class="tp-card-head"><div><h2>Документы</h2><p>OCR только для просмотра, загрузка скрыта.</p></div></div><div class="tp-card-body tp-list">${readonlyDocs(trip).map((doc) => `<div class="tp-list-row">${esc(doc)} ${badge("Только просмотр")}</div>`).join("")}</div></section>`,
      `<section class="tp-card"><div class="tp-card-head"><div><h2>Участники</h2><p>Приглашение скрыто, роли доступны только для просмотра.</p></div></div><div class="tp-card-body tp-list">${readonlyPeople(trip).map((name, index) => `<div class="tp-list-row"><span>${esc(name)}</span>${badge(index === 0 ? "Организатор" : "Участник")}</div>`).join("")}</div></section>`,
      `<section class="tp-card"><div class="tp-card-head"><div><h2>Мониторинг</h2><p>История событий без новых подтверждений.</p></div></div><div class="tp-card-body tp-list"><div class="tp-alert"><strong>Задержка рейса: 18 минут</strong> Запись сохранена.</div><div class="tp-alert"><strong>Погодное предупреждение</strong> Новый Plan B недоступен.</div></div></section>`,
      `<section class="tp-card"><div class="tp-card-head"><div><h2>Сообщения</h2><p>Отправка новых сообщений отключена.</p></div></div><div class="tp-card-body tp-list">${readonlyMessages(trip).map((msg) => `<div class="tp-list-row">${esc(msg)}</div>`).join("")}</div></section>`,
      `<section class="tp-card"><div class="tp-card-head"><div><h2>Настройки</h2><p>Завершённая поездка: действия управления скрыты.</p></div></div><div class="tp-card-body"><div class="tp-alert tp-alert-success"><strong>Только просмотр</strong> Завершённую поездку нельзя редактировать или активировать повторно.</div></div></section>`
    ];
    return blocks[index] || blocks[0];
  }

  function handleAction(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const root = event.currentTarget;
    const action = target.dataset.action;
    if (target.dataset.demoState) { pageState.uiScenario = target.dataset.demoState; return rerender(root); }
    if (action === "notify") return toast("Новых уведомлений: 2");
    if (action === "toggle-profile") return toggleProfile(target);
    if (action === "profile-route") return routes.goToProfile(target.dataset.section || "");
    if (action === "history-route") return routes.goToHistory();
    if (action === "logout-route") return routes.logout();
    if (action === "home-tab") { pageState.homeTab = target.dataset.tab; location.hash = pageState.homeTab === "drafts" ? "drafts" : ""; return rerender(root); }
    if (action === "accept-invite") { if (!canMutate("Принятие приглашений недоступно офлайн")) return; const trip = adapter.acceptInvitation(target.dataset.id); if (trip) toast("Приглашение принято, поездка добавлена в активные"); return rerender(root); }
    if (action === "reject-invite") { if (!canMutate("Отклонение приглашений недоступно офлайн")) return; return confirmModal("Отклонить приглашение?", "Приглашение исчезнет из активных.", [["Отклонить", "danger", () => { adapter.rejectInvitation(target.dataset.id); closeModal(); toast("Приглашение отклонено"); rerender(root); }], ["Отмена", "secondary", closeModal]]); }
    if (action === "delete-draft-home") { if (!canMutate("Удаление черновика недоступно офлайн")) return; return confirmDeleteDraft(target.dataset.id, root); }
    if (action === "history-view") { pageState.historyView = target.dataset.view; return applyHistoryFilters(root, adapter.getState().completedTrips); }
    if (action === "go-step") return goWizardStep(root, Number(target.dataset.step));
    if (action === "next-step") return wizardNext(root);
    if (action === "prev-step") return wizardPrev(root);
    if (action === "save-segment") { if (!canMutate("Изменение маршрута недоступно офлайн")) return; return wizardSaveSegment(root); }
    if (action === "edit-segment") { pageState.wizard.editingSegment = target.dataset.id; return renderWizard(root); }
    if (action === "cancel-segment-edit") { pageState.wizard.editingSegment = null; return renderWizard(root); }
    if (action === "delete-segment") { if (!canMutate("Изменение маршрута недоступно офлайн")) return; return wizardDeleteSegment(root, target.dataset.id); }
    if (action === "move-segment") { if (!canMutate("Изменение маршрута недоступно офлайн")) return; return wizardMoveSegment(root, target.dataset.id, Number(target.dataset.dir)); }
    if (action === "add-invite-draft") { if (!canMutate("Приглашения недоступны офлайн")) return; return wizardAddInviteDraft(root); }
    if (action === "delete-invite-draft") { if (!canMutate("Приглашения недоступны офлайн")) return; return wizardDeleteInviteDraft(root, target.dataset.id); }
    if (action === "add-document-draft") { if (!canMutate("Документы недоступны офлайн")) return; return wizardAddDocumentDraft(root); }
    if (action === "delete-document-draft") { if (!canMutate("Документы недоступны офлайн")) return; return wizardDeleteDocumentDraft(root, target.dataset.id); }
    if (action === "save-draft") { if (!canMutate("Сохранение черновика недоступно офлайн")) return; return saveDraftAndGoHome(); }
    if (action === "create-trip") { if (!canMutate("Создание поездки недоступно офлайн")) return; return wizardCreate(root); }
    if (action === "save-edit") { if (!canMutate("Редактирование поездки недоступно офлайн")) return; return wizardSaveEdit(root); }
    if (action === "readonly-tab") { pageState.readonlyTab = Number(target.dataset.tab); return renderReadonly(root); }
    if (action === "demo-reset") { adapter.resetPreview(); pageState.uiScenario = "normal"; return rerender(root); }
  }

  function handleInput(event) {
    const root = event.currentTarget;
    if (root.dataset.tripPage === "history") applyHistoryFilters(root);
    if (root.dataset.tripPage === "readonly" && event.target.matches("[data-readonly-section]")) {
      pageState.readonlyTab = Number(event.target.value);
      return renderReadonly(root);
    }
    const field = event.target.closest("[data-field]");
    if (!field || !pageState.wizard) return;
    const wz = pageState.wizard;
    const key = field.dataset.field;
    wz.data[key] = field.type === "checkbox" ? field.checked : field.value;
    wz.dirty = true;
  }

  function canMutate(message) {
    const state = adapter.getState ? adapter.getState() : {};
    if (state.networkState === "offline") {
      toast(message || "Действие недоступно офлайн");
      return false;
    }
    return true;
  }

  function goWizardStep(root, step) {
    const wz = pageState.wizard;
    if (step > wz.step && step <= wz.maxStep + 1) {
      const issues = stepIssues(wz, wz.step).filter((issue) => issue.blocking);
      if (issues.length) return toast("Заполните обязательные поля текущего шага");
    }
    if (step > wz.maxStep + 1) return toast("Сначала заполните предыдущие шаги");
    wz.step = Math.max(0, Math.min(7, step));
    renderWizard(root);
  }

  function wizardNext(root) {
    const wz = pageState.wizard;
    const issues = stepIssues(wz, wz.step).filter((issue) => issue.blocking);
    if (issues.length) { setInlineErrors(root, issues); return toast(issues[0].message); }
    wz.maxStep = Math.max(wz.maxStep, wz.step + 1);
    wz.step = Math.min(7, wz.step + 1);
    renderWizard(root);
  }

  function wizardPrev(root) {
    pageState.wizard.step = Math.max(0, pageState.wizard.step - 1);
    renderWizard(root);
  }

  function wizardSaveSegment(root) {
    const wz = pageState.wizard;
    const segment = {
      id: wz.editingSegment || uid(),
      type: $("#seg-type", root).value,
      from: $("#seg-from", root).value.trim(),
      to: $("#seg-to", root).value.trim(),
      start: $("#seg-start", root).value,
      end: $("#seg-end", root).value,
      ref: $("#seg-ref", root).value.trim(),
      provider: $("#seg-provider", root).value.trim(),
      note: $("#seg-note", root).value.trim(),
      status: $("#seg-status", root).value,
      order: wz.editingSegment ? wz.segments.find((item) => item.id === wz.editingSegment).order : wz.segments.length + 1
    };
    if (!segment.from || !segment.to || !segment.start || !segment.end) return setInlineErrors(root, [
      !segment.from && { field: "seg-from", message: "Укажите точку отправления" },
      !segment.to && { field: "seg-to", message: "Укажите точку прибытия" },
      !segment.start && { field: "seg-start", message: "Укажите начало" },
      !segment.end && { field: "seg-end", message: "Укажите окончание" }
    ].filter(Boolean));
    if (window.CityValidator) {
      if (window.CityValidator.isConfirmedInvalid(segment.from)) return setInlineErrors(root, [{ field: "seg-from", message: "Город не найден — выберите из подсказок" }]);
      if (window.CityValidator.isConfirmedInvalid(segment.to)) return setInlineErrors(root, [{ field: "seg-to", message: "Город не найден — выберите из подсказок" }]);
      segment.from = window.CityValidator.canonical(segment.from);
      segment.to = window.CityValidator.canonical(segment.to);
    }
    if (segment.from === segment.to) return setInlineErrors(root, [{ field: "seg-to", message: "Точки не должны совпадать" }]);
    if (segment.end < segment.start) return setInlineErrors(root, [{ field: "seg-end", message: "Окончание сегмента раньше начала" }]);
    const index = wz.segments.findIndex((item) => item.id === segment.id);
    if (index === -1) wz.segments.push(segment);
    else wz.segments[index] = segment;
    wz.editingSegment = null;
    wz.dirty = true;
    normalizeSegmentOrder(wz);
    renderWizard(root);
  }

  function wizardDeleteSegment(root, id) {
    pageState.wizard.segments = pageState.wizard.segments.filter((segment) => segment.id !== id);
    pageState.wizard.dirty = true;
    normalizeSegmentOrder(pageState.wizard);
    renderWizard(root);
  }

  function wizardMoveSegment(root, id, dir) {
    const wz = pageState.wizard;
    const sorted = wz.segments.sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((item) => item.id === id);
    const next = index + dir;
    if (next < 0 || next >= sorted.length) return;
    [sorted[index].order, sorted[next].order] = [sorted[next].order, sorted[index].order];
    wz.dirty = true;
    normalizeSegmentOrder(wz);
    renderWizard(root);
  }

  function wizardAddInviteDraft(root) {
    const wz = pageState.wizard;
    const email = (wz.data.inviteEmail || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setInlineErrors(root, [{ field: "inviteEmail", message: "Введите корректный email", blocking: true }]);
    wz.data.invitationDrafts = wz.data.invitationDrafts || [];
    wz.data.invitationDrafts.push({ id: uid(), email, expires: wz.data.inviteExpires || "7 дней", accessMode: wz.data.inviteAccessMode || "member" });
    wz.data.inviteEmail = "";
    wz.dirty = true;
    renderWizard(root);
  }

  function wizardDeleteInviteDraft(root, id) {
    const wz = pageState.wizard;
    wz.data.invitationDrafts = (wz.data.invitationDrafts || []).filter((item) => item.id !== id);
    wz.dirty = true;
    renderWizard(root);
  }

  function wizardAddDocumentDraft(root) {
    const wz = pageState.wizard;
    const title = (wz.data.documentTitle || "").trim();
    if (!title) return setInlineErrors(root, [{ field: "documentTitle", message: "Укажите название документа", blocking: true }]);
    wz.data.documentSetup = wz.data.documentSetup || [];
    wz.data.documentSetup.push({ id: uid(), title, type: wz.data.documentType || "Авиабилет", visibility: wz.data.documentVisibility || "Участникам" });
    wz.data.documentTitle = "";
    wz.dirty = true;
    renderWizard(root);
  }

  function wizardDeleteDocumentDraft(root, id) {
    const wz = pageState.wizard;
    wz.data.documentSetup = (wz.data.documentSetup || []).filter((item) => item.id !== id);
    wz.dirty = true;
    renderWizard(root);
  }

  function saveDraftAndGoHome() {
    const wz = pageState.wizard;
    const draft = adapter.saveDraft(wz.draftId, wz.data, wz.segments, wz.step);
    wz.draftId = draft?.id || wz.draftId;
    wz.dirty = false;
    closeModal();
    location.href = "home.html#drafts";
  }

  function wizardCreate(root) {
    const wz = pageState.wizard;
    const issues = allWizardIssues(wz).errors;
    if (issues.length) return toast(issues[0].message);
    const created = adapter.createTrip({ data: wz.data, segments: wz.segments, draftId: wz.draftId, errors: [], warnings: allWizardIssues(wz).warnings });
    if (!created) return toast("Поездка не создана: действие недоступно офлайн");
    const finish = (trip) => {
      if (!trip || !trip.id) return toast("Поездка не создана: попробуйте ещё раз");
      wz.dirty = false;
      try { sessionStorage.setItem("travelAssistant.shellToast", "Поездка создана"); } catch (error) { /* best effort */ }
      location.href = `${esc(adapter.workspaceHref)}?tripId=${encodeURIComponent(trip.id)}`;
    };
    if (created && typeof created.then === "function") {
      toast("Создаём поездку…");
      created.then(finish).catch(() => toast("Не удалось создать поездку. Проверьте, запущен ли сервер."));
    } else {
      finish(created);
    }
  }

  function wizardSaveEdit(root) {
    const wz = pageState.wizard;
    const issues = allWizardIssues(wz).errors;
    if (issues.length) return toast(issues[0].message);
    confirmModal("Сохранить изменения?", "Будут обновлены основные данные, будущие сегменты, участники и уведомления. Прошедшие события не переписываются.", [
      ["Сохранить", "primary", () => { adapter.updateTrip(wz.tripId, { data: wz.data, segments: wz.segments }); wz.dirty = false; closeModal(); toast("Изменения сохранены"); }],
      ["Отмена", "secondary", closeModal]
    ]);
  }

  function successScreen(trip) {
    return `<section class="tp-card tp-state-screen tp-success-card" data-od-id="wizard-success"><div><h2>Поездка создана</h2><p>${esc(cleanText(trip.title, "Новая поездка"))} · ${esc(trip.route || "маршрут уточняется")}</p><div class="tp-row-actions"><a class="tp-button tp-button-primary" href="${esc(adapter.workspaceHref)}?tripId=${esc(trip.id)}">Открыть поездку</a><a class="tp-button tp-button-secondary" href="home.html">Вернуться на Главную</a></div></div></section>`;
  }

  function stepIssues(wz, step) {
    const d = wz.data;
    const issues = [];
    if (step === 0 && !d.type) issues.push(block(step, "Выберите тип поездки", "type"));
    if (step === 1) {
      if (!d.title) issues.push(block(step, "Название обязательно", "title"));
      if (d.title && d.title.length > 80) issues.push(block(step, "Название слишком длинное", "title"));
      if (!d.start) issues.push(block(step, "Дата начала обязательна", "start"));
      if (!d.end) issues.push(block(step, "Дата окончания обязательна", "end"));
      if (!d.timezone) issues.push(block(step, "Часовой пояс обязателен", "timezone"));
      if (d.start && d.end && d.end < d.start) issues.push(block(step, "Дата окончания раньше даты начала", "end"));
    }
    if (step === 2) {
      if (!d.from && !wz.segments.length) issues.push(block(step, "Укажите начальную точку", "from"));
      if (!d.to && !wz.segments.length) issues.push(block(step, "Укажите конечную точку", "to"));
    }
    if (step === 3) issues.push(...routeIssues(wz));
    if (step === 4 && d.checkin && d.checkout && d.checkout < d.checkin) issues.push(block(step, "Выселение раньше заселения", "checkout"));
    if (step === 5 && d.type === "group" && d.inviteEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.inviteEmail)) issues.push(block(step, "Email приглашения некорректен", "inviteEmail"));
    (d.invitationDrafts || []).forEach((invite) => { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(invite.email)) issues.push(block(step, `Email ${invite.email} некорректен`, "inviteEmail")); });
    if (step === 6 && !d.documentVisibility) issues.push(block(step, "Укажите видимость документов", "documentVisibility"));
    if (step === 6 && d.documentsMode === "demo" && !(d.documentSetup || []).length) issues.push(block(step, "Добавьте хотя бы один подготовленный документ", "documentTitle"));
    if (step === 6 && (d.notifyTelegram || d.sos) && !d.notifyFlights && !d.notifyTransfer && !d.notifyHotel) issues.push(block(step, "Выберите, какие сегменты отслеживать", "notifyFlights"));
    return issues;
  }

  function routeIssues(wz) {
    const issues = [];
    if (!wz.segments.length) issues.push(block(3, "Добавьте минимум один сегмент маршрута"));
    wz.segments.forEach((segment) => {
      if (!segment.from || !segment.to) issues.push(block(3, "У сегмента нет точки отправления или прибытия", "seg-from"));
      if (segment.from && segment.to && segment.from === segment.to) issues.push(block(3, "Точки отправления и прибытия совпадают", "seg-to"));
      if (segment.end && segment.start && segment.end < segment.start) issues.push(block(3, "Окончание сегмента раньше начала", "seg-end"));
      if (wz.data.start && segment.start && segment.start.slice(0, 10) < wz.data.start) issues.push(warn(3, "Сегмент начинается раньше даты поездки", "seg-start"));
      if (wz.data.end && segment.end && segment.end.slice(0, 10) > wz.data.end) issues.push(warn(3, "Сегмент заканчивается позже даты поездки", "seg-end"));
    });
    const sorted = wz.segments.slice().sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].start < sorted[i - 1].end) issues.push(warn(3, "Есть пересечение времени сегментов"));
      if (sorted[i].from !== sorted[i - 1].to) issues.push(warn(3, "Последовательность маршрута требует проверки"));
      const minutes = (new Date(sorted[i].start) - new Date(sorted[i - 1].end)) / 60000;
      if (minutes >= 0 && minutes < 90 && (sorted[i].type === "Самолёт" || sorted[i - 1].type === "Самолёт")) issues.push(warn(3, "Пересадка менее 90 минут — требуется проверка"));
    }
    return issues;
  }

  function allWizardIssues(wz) {
    const all = wizardSteps.flatMap((_, index) => stepIssues(wz, index));
    return { errors: all.filter((issue) => issue.blocking), warnings: all.filter((issue) => !issue.blocking) };
  }

  function block(step, message, field = "") { return { step, message, field, blocking: true }; }
  function warn(step, message, field = "") { return { step, message, field, blocking: false }; }
  function issueLine(issue) { return `<div class="tp-alert ${issue.blocking ? "tp-alert-danger" : "tp-alert-warning"}"><strong>${esc(issue.message)}</strong></div>`; }
  function stepErrors(wz, step) { return stepIssues(wz, step).map(issueLine); }
  function normalizeSegmentOrder(wz) { wz.segments.sort((a, b) => a.order - b.order).forEach((item, index) => { item.order = index + 1; }); }

  function setInlineErrors(root, issues) {
    $$("[aria-invalid='true']", root).forEach((field) => {
      field.removeAttribute("aria-invalid");
      field.removeAttribute("aria-describedby");
    });
    $$(".tp-field-error", root).forEach((node) => { node.textContent = ""; });
    issues.filter((issue) => issue.field).forEach((issue, index) => {
      const field = $(`[data-field="${issue.field}"], #${issue.field}`, root);
      const error = $(`[data-error-for="${issue.field}"]`, root);
      const errorId = `error-${issue.field}`;
      if (error) {
        error.id = errorId;
        error.textContent = issue.message;
      }
      if (field) {
        field.setAttribute("aria-invalid", "true");
        field.setAttribute("aria-describedby", errorId);
        if (index === 0) field.focus();
      }
    });
  }

  function tripToWizardData(trip) {
    const logistics = trip.logistics || {};
    const monitoring = trip.monitoringSettings || {};
    return {
      id: trip.id,
      type: trip.kind === "Соло" ? "solo" : "group",
      title: trip.title || "",
      description: trip.description || "",
      start: trip.start || "",
      end: trip.end || "",
      timezone: trip.timezone || "",
      cover: trip.cover || "",
      from: trip.from || "",
      to: trip.to || "",
      hotel: trip.hotel || logistics.hotel || "",
      address: logistics.address || "",
      checkin: logistics.checkin || "",
      checkout: logistics.checkout || "",
      transfer: trip.transfer || logistics.transfer || "",
      contacts: logistics.contacts || "",
      notes: logistics.notes || "",
      organizer: "Артём",
      invitationDrafts: clone(trip.invitationDrafts || []),
      documentsMode: trip.documentSetup?.length ? "demo" : "later",
      documentVisibility: "mixed",
      documentSetup: clone(trip.documentSetup || []),
      notifyFlights: Boolean(monitoring.flights || trip.notify?.includes("Рейсы")),
      notifyTransfer: Boolean(monitoring.transfer),
      notifyHotel: Boolean(monitoring.hotel),
      notifyTelegram: Boolean(monitoring.telegram || trip.notify?.includes("Telegram")),
      notifyEmail: Boolean(monitoring.email || trip.notify?.includes("Email")),
      notifyDaily: Boolean(monitoring.daily || trip.notify?.includes("Ежедневная сводка")),
      sos: Boolean(monitoring.sos)
    };
  }

  function wizardSummary(wz) {
    return `<div class="summary-stack"><div><span>Тип</span><strong>${wz.data.type === "solo" ? "Соло" : "Групповая"}</strong></div><div><span>Название</span><strong>${esc(wz.data.title || "Не заполнено")}</strong></div><div><span>Даты</span><strong>${esc(wz.data.start || "—")} — ${esc(wz.data.end || "—")}</strong></div><div><span>Маршрут</span><strong>${esc(routeTitle(wz) || "Не задан")}</strong></div><div><span>Приглашения</span><strong>${wz.data.type === "solo" ? 0 : (wz.data.invitationDrafts || []).length}</strong></div><div><span>Документы</span><strong>${(wz.data.documentSetup || []).length}</strong></div><div><span>Уведомления</span><strong>${notifyList(wz.data).join(", ") || "Нет"}</strong></div><div><span>Прогресс</span><strong>${Math.round(((wz.maxStep + 1) / 8) * 100)}%</strong></div></div>`;
  }

  function routeTitle(wz) { return wz.segments.length ? [wz.segments[0].from, ...wz.segments.map((s) => s.to)].filter(Boolean).join(" → ") : ""; }
  function notifyList(data) { return [data.notifyTelegram && "Telegram", data.notifyEmail && "Email", data.notifyDaily && "Ежедневная сводка", data.sos && "SOS"].filter(Boolean); }

  function option(name, value, title, text, selected) { return `<label class="wizard-option ${selected === value ? "is-selected" : ""}"><input type="radio" name="${name}" data-field="${name}" value="${value}" ${selected === value ? "checked" : ""}/><strong>${title}</strong><span>${text}</span></label>`; }
  function check(name, label, checked) { return `<label class="tp-field check-field"><span><input type="checkbox" data-field="${name}" ${checked ? "checked" : ""}/> ${label}</span></label>`; }
  function input(name, label, type, value, required) { return inputRaw(name, label, type, value, "", required, true); }
  function inputRaw(id, label, type, value, extraClass = "", required = false, dataField = false) {
    const attr = dataField ? `data-field="${id}"` : `id="${id}"`;
    if (type === "textarea") return `<label class="tp-field ${extraClass}"><span>${label}${required ? " *" : ""}</span><textarea class="tp-textarea" ${attr} ${required ? "required" : ""}>${esc(value || "")}</textarea><span class="tp-field-error" data-error-for="${id}"></span></label>`;
    return `<label class="tp-field ${extraClass}"><span>${label}${required ? " *" : ""}</span><input class="tp-input" type="${type}" ${attr} value="${esc(value || "")}" ${required ? "required" : ""}/><span class="tp-field-error" data-error-for="${id}"></span></label>`;
  }
  function selectData(name, label, values, selected, labels = values) { return `<label class="tp-field"><span>${label}</span><select class="tp-select" data-field="${name}">${values.map((value, index) => `<option value="${esc(value)}" ${selected === value ? "selected" : ""}>${esc(labels[index])}</option>`).join("")}</select></label>`; }
  function selectField(id, label, values, selected) { return `<label class="tp-field"><span>${label}</span><select id="${id}" class="tp-select">${values.map((value) => `<option ${selected === value ? "selected" : ""}>${esc(value)}</option>`).join("")}</select></label>`; }
  function fieldShell(label, control) { return `<label class="tp-field"><span>${label}</span>${control}</label>`; }
  function select(id, values, labels) { return `<select id="${id}" class="tp-select">${values.map((value, index) => `<option value="${esc(value)}">${esc(labels[index])}</option>`).join("")}</select>`; }
  function segmentRow(segment) { return `<article class="wizard-segment" data-od-id="wizard-segment-${segment.id}"><div class="wizard-segment-time">${esc(segment.start?.slice(11,16) || "—")}</div><div><strong>${esc(segment.from)} → ${esc(segment.to)}</strong><div class="tp-note">${esc(segment.type)} · ${esc(segment.ref || "без номера")} · ${esc(segment.provider || "поставщик не указан")}</div><div class="tp-note">${esc(segment.start)} — ${esc(segment.end)}</div></div><div class="tp-row-actions"><button class="tp-button tp-button-secondary" type="button" data-action="edit-segment" data-id="${segment.id}">Редактировать</button><button class="tp-button tp-button-secondary" type="button" data-action="move-segment" data-id="${segment.id}" data-dir="-1">Вверх</button><button class="tp-button tp-button-secondary" type="button" data-action="move-segment" data-id="${segment.id}" data-dir="1">Вниз</button><button class="tp-button tp-button-danger" type="button" data-action="delete-segment" data-id="${segment.id}">Удалить</button></div></article>`; }
  function badge(text, tone = "") { return `<span class="tp-badge ${tone}">${esc(text)}</span>`; }
  function avatars(names) { return `<span class="tp-inline">${names.slice(0, 4).map((name, index) => `<span class="tp-avatar-sm tone-${["a","b","c","d"][index]}">${esc(name[0])}</span>`).join("")}</span>`; }
  function pluralTrips(n) { const mod10 = n % 10, mod100 = n % 100; if (mod10 === 1 && mod100 !== 11) return "завершённая поездка"; if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "завершённые поездки"; return "завершённых поездок"; }
  function formatDateTime(value) { return new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function toggleProfile(button) {
    const menu = button.closest(".tp-profile-menu").querySelector(".tp-menu");
    const open = menu.hidden;
    closeProfileMenus();
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) $("[role='menuitem']", menu)?.focus();
  }

  function closeProfileMenus() {
    $$(".tp-menu").forEach((menu) => { menu.hidden = true; });
    $$("[data-action='toggle-profile']").forEach((button) => button.setAttribute("aria-expanded", "false"));
  }

  function confirmDeleteDraft(id, root) {
    confirmModal("Удалить черновик?", "Данные черновика будут очищены и не появятся после обновления.", [["Удалить", "danger", () => { adapter.deleteDraft(id); closeModal(); toast("Черновик удалён"); rerender(root); }], ["Отмена", "secondary", closeModal]]);
  }

  function confirmModal(title, body, actions) {
    closeModal();
    pageState.lastFocus = document.activeElement;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `<div class="tp-modal" tabindex="-1"><div class="tp-modal-head"><div><h2>${esc(title)}</h2><p>${esc(body)}</p></div><button class="tp-icon-button" type="button" data-modal-close aria-label="Закрыть">×</button></div><div class="tp-modal-actions">${actions.map((action, index) => `<button class="tp-button tp-button-${action[1] === "danger" ? "danger" : action[1] === "primary" ? "primary" : "secondary"}" type="button" data-modal-action="${index}">${esc(action[0])}</button>`).join("")}</div></div>`;
    document.body.appendChild(overlay);
    pageState.modal = { overlay, actions };
    overlay.addEventListener("click", modalClick);
    $(".tp-modal", overlay).focus();
  }

  function modalClick(event) {
    if (event.target === pageState.modal.overlay || event.target.closest("[data-modal-close]")) return closeModal();
    const button = event.target.closest("[data-modal-action]");
    if (button) pageState.modal.actions[Number(button.dataset.modalAction)][2]();
  }

  function closeModal() {
    if (!pageState.modal) return;
    pageState.modal.overlay.removeEventListener("click", modalClick);
    pageState.modal.overlay.remove();
    pageState.modal = null;
    pageState.lastFocus?.focus?.();
  }

  function toast(message) {
    const region = $(".toast-region") || document.body.appendChild(Object.assign(document.createElement("div"), { className: "toast-region" }));
    if ($(".toast", region)?.textContent === message) return;
    const item = document.createElement("div");
    item.className = "toast";
    item.textContent = message;
    region.appendChild(item);
    setTimeout(() => item.remove(), 2400);
  }

  document.addEventListener("click", (event) => { if (!event.target.closest(".tp-profile-menu")) closeProfileMenus(); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { closeModal(); closeProfileMenus(); }
    if (event.key === "Tab" && pageState.modal) {
      const focusable = $$("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])", pageState.modal.overlay);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  function handleWizardBeforeUnload(event) {
    if (!pageState.wizard?.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  }

  function bindWizardBeforeUnload() {
    window.removeEventListener("beforeunload", handleWizardBeforeUnload);
    window.addEventListener("beforeunload", handleWizardBeforeUnload);
  }

  function unbindWizardBeforeUnload() {
    window.removeEventListener("beforeunload", handleWizardBeforeUnload);
  }

  function routeSvg(trip) {
    const points = (trip.route || "").split("→").map((item) => item.trim()).filter(Boolean);
    const labels = [points[0] || "Старт", points[1] || "", points[2] || points[points.length - 1] || "Финиш"];
    return `<svg viewBox="0 0 760 300" role="img" aria-label="Маршрут ${esc(trip.route)}"><path d="M110 190 C260 60 405 90 520 150 S640 180 665 105"/><circle cx="110" cy="190" r="10"/><text x="82" y="225">${esc(labels[0])}</text><circle cx="520" cy="150" r="10"/><text x="492" y="185">${esc(labels[1])}</text><circle cx="665" cy="105" r="10"/><text x="616" y="85">${esc(labels[2])}</text></svg>`;
  }

  function readonlyTimeline(trip) {
    return trip.timeline || [
      { time: "09:00", text: `${trip.route.split("→")[0].trim()} · старт маршрута` },
      { time: "18:00", text: `${trip.route.split("→").slice(-1)[0].trim()} · прибытие` }
    ];
  }

  function readonlyDocs(trip) {
    return trip.documentNames || [`Документы поездки: ${trip.documents}`, "Бронь и билеты", "Страховые материалы"];
  }

  function readonlyPeople(trip) {
    return Array.isArray(trip.people) ? trip.people : Array.from({ length: Number(trip.participants) || 1 }, (_, index) => index === 0 ? "Артём · Вы" : `Участник ${index + 1}`);
  }

  function readonlyMessages(trip) {
    return trip.messages || [`Архив сообщений поездки «${trip.title}»`, "Новые сообщения отключены"];
  }

  window.tripPagesHomeInit = (root, nextAdapter, nextRoutes) => { configureRuntime(nextAdapter, nextRoutes); renderHome(root); };
  window.tripPagesHomeDestroy = destroyRoot;
  window.tripPagesHistoryInit = (root, nextAdapter, nextRoutes) => { configureRuntime(nextAdapter, nextRoutes); renderHistory(root); };
  window.tripPagesHistoryDestroy = destroyRoot;
  window.tripWizardInit = (root, nextAdapter, nextRoutes) => { configureRuntime(nextAdapter, nextRoutes); pageState.wizard = wizardInitial(); bindWizardBeforeUnload(); renderWizard(root); };
  window.tripWizardDestroy = (root) => { destroyRoot(root); unbindWizardBeforeUnload(); pageState.wizard = null; };
  window.tripReadonlyInit = (root, nextAdapter, nextRoutes) => { configureRuntime(nextAdapter, nextRoutes); renderReadonly(root); };
  window.tripReadonlyDestroy = destroyRoot;
  window.homeRender = renderHome;
  window.historyRender = renderHistory;
  window.tripReadonlyRender = renderReadonly;

  const root = document.querySelector("[data-trip-page]");
  if (!root) return;
  const page = root.dataset.tripPage;
  if (page === "home") renderHome(root);
  if (page === "history") renderHistory(root);
  if (page === "wizard") { bindWizardBeforeUnload(); renderWizard(root); }
  if (page === "readonly") renderReadonly(root);
})();

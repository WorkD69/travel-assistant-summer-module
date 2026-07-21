(function () {
  "use strict";

  const contexts = new WeakMap();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const focusableSelector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");

  const navSections = [
    ["account", "Аккаунт"],
    ["telegram", "Telegram"],
    ["mail", "Почта"],
    ["notifications", "Уведомления"],
    ["appearance", "Оформление"]
  ];

  const notificationEvents = [
    ["nextSegment", "Ближайший сегмент"],
    ["timeChange", "Изменение времени"],
    ["gateChange", "Изменение выхода"],
    ["delay", "Задержка"],
    ["cancel", "Отмена"],
    ["transferChange", "Изменение трансфера"],
    ["hotelChange", "Изменение отеля"],
    ["newDocument", "Новый документ"],
    ["invitation", "Приглашение"],
    ["sos", "SOS"],
    ["violation", "Нарушение"],
    ["planB", "Plan B"],
    ["organizerMessage", "Сообщение организатора"],
    ["dailySummary", "Ежедневная сводка"]
  ];

  const channelLabels = { app: "В приложении", telegram: "Telegram", email: "Email" };
  const telegramLabels = {
    notConnected: "Не подключён",
    connecting: "Подключение",
    connected: "Подключён",
    error: "Ошибка",
    lost: "Связь потеряна"
  };
  const mailLabels = {
    notConnected: "Не подключена",
    connecting: "Подключение",
    connected: "Подключена",
    error: "Ошибка",
    reauth: "Требуется повторная авторизация"
  };

  function getAdapter() {
    return window.AccountStateAdapter;
  }

  function getRoutes() {
    return window.AccountRoutes;
  }

  function qs(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function qsa(root, selector) {
    return root ? Array.from(root.querySelectorAll(selector)) : [];
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(value) {
    if (!value) return "не указана";
    try {
      return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
    } catch (error) {
      return String(value);
    }
  }

  function passwordChecks(password) {
    const value = String(password || "");
    const hasLetters = /[A-Za-zА-Яа-яЁё]/.test(value);
    const hasNumber = /\d/.test(value);
    return {
      length: value.length >= 8,
      letters: hasLetters,
      number: hasNumber,
      complex: value.length >= 8 && hasLetters && hasNumber,
      valid: value.length >= 8 && hasLetters && hasNumber
    };
  }

  function passwordRulesHtml(value) {
    const checks = passwordChecks(value);
    return `
      <ul class="account-list" data-password-rules>
        <li data-ok="${checks.length}">Не менее 8 символов</li>
        <li data-ok="${checks.letters}">Есть буквы</li>
        <li data-ok="${checks.number}">Есть цифра</li>
        <li data-ok="${checks.complex}">Пароль не выглядит слишком простым</li>
      </ul>
    `;
  }

  function logo() {
    return `
      <span class="account-logo" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M12 3 4.5 7.2 12 11.4l7.5-4.2L12 3Z"/><path d="M4.5 7.2v8.4L12 20V11.4"/><path d="M19.5 7.2v8.4L12 20"/></svg>
      </span>
    `;
  }

  function avatarHtml(adapter, user, extraClass) {
    if (user && user.avatarDataUrl) {
      return `<span class="account-avatar ${extraClass || ""}"><img src="${esc(user.avatarDataUrl)}" alt="" /></span>`;
    }
    return `<span class="account-avatar ${extraClass || ""}" aria-hidden="true">${esc(adapter.getInitials(user))}</span>`;
  }

  function createContext(root, pageType, customAdapter, customRoutes) {
    accountPageDestroy(root);
    const params = new URLSearchParams(window.location.search);
    const ctx = {
      root,
      pageType,
      adapter: customAdapter || getAdapter(),
      routes: customRoutes || getRoutes(),
      cleanup: [],
      timers: [],
      unsubscribe: null,
      modalReturnFocus: null,
      modalId: "",
      modalTrap: null,
      avatarObjectUrl: "",
      avatarDataUrl: "",
      avatarFileName: "",
      avatarError: "",
      menuOpen: false,
      deleted: false,
      activeSection: params.get("section") || "account",
      loginScenario: "auto",
      registerScenario: "auto",
      recoveryScenario: "auto",
      recoveryStep: params.get("step") === "reset" ? 3 : 1,
      recoveryEmail: "",
      recoveryToken: params.get("token") || "",
      recoveryMaskedEmail: "",
      invitationScenario: "",
      invitationActorUserId: params.get("userId") || "",
      destroyed: false
    };
    if (pageType === "recovery" && ctx.recoveryToken) {
      const validation = ctx.adapter.validateRecoveryToken(ctx.recoveryToken);
      if (validation.ok) {
        ctx.recoveryEmail = validation.email;
        ctx.recoveryMaskedEmail = validation.maskedEmail;
      }
    }
    contexts.set(root, ctx);
    return ctx;
  }

  function on(ctx, node, eventName, handler) {
    if (!node) return;
    node.addEventListener(eventName, handler);
    ctx.cleanup.push(() => node.removeEventListener(eventName, handler));
  }

  function setTimer(ctx, handler, ms) {
    const id = window.setTimeout(handler, ms);
    ctx.timers.push(id);
    return id;
  }

  function render(ctx, template) {
    if (ctx.destroyed || !ctx.root || !ctx.root.isConnected) return;
    ctx.root.innerHTML = template(ctx);
    applyAppearance(ctx);
    if (ctx.modalId) openModal(ctx, ctx.modalId, true);
    if (ctx.menuOpen) setMenuState(ctx, true, true);
  }

  function toast(ctx, message, type) {
    const stack = qs(ctx.root, "[data-toast-stack]");
    if (!stack) return;
    stack.replaceChildren();
    const node = document.createElement("div");
    node.className = `account-toast account-toast-${type || "info"}`;
    node.setAttribute("role", "status");
    node.textContent = message;
    stack.appendChild(node);
    setTimer(ctx, () => node.remove(), 3200);
  }

  function isOffline() {
    const app = window.TravelAppState;
    const state = app && typeof app.getState === "function" ? app.getState() : {};
    return state.networkState === "offline";
  }

  function guardOnline(ctx, message) {
    if (!isOffline()) return true;
    toast(ctx, message || "Действие недоступно офлайн", "error");
    return false;
  }

  function clearErrors(root) {
    qsa(root, "[data-error-for]").forEach((node) => {
      node.textContent = "";
    });
    qsa(root, "[aria-invalid='true']").forEach((node) => {
      node.setAttribute("aria-invalid", "false");
      node.removeAttribute("aria-describedby");
    });
  }

  function setFieldError(root, inputId, message) {
    const input = qs(root, `#${inputId}`);
    const error = qs(root, `[data-error-for="${inputId}"]`);
    if (input) {
      input.setAttribute("aria-invalid", message ? "true" : "false");
      if (message) input.setAttribute("aria-describedby", `${inputId}-error`);
      else input.removeAttribute("aria-describedby");
    }
    if (error) {
      error.id = `${inputId}-error`;
      error.textContent = message || "";
    }
    return message && input ? input : null;
  }

  function focusFirst(inputs) {
    const target = inputs.find(Boolean);
    if (target) target.focus();
  }

  function authLayout(title, body) {
    return `
      <div class="account-auth-layout account-auth-layout-simple">
        <section class="account-form-panel" data-od-id="${title === "Вход" ? "login-form-panel" : "auth-form-panel"}">
          <div class="account-form-brand-mobile account-form-brand-auth">
            ${logo()}
            <span class="account-brand-name">Тревел-помощник</span>
          </div>
          ${body}
        </section>
      </div>
      <div class="account-toast-stack" data-toast-stack aria-live="polite"></div>
    `;
  }

  function loginTemplate(ctx) {
    const email = ctx.lastEmail || "";
    const body = `
      <div class="account-form-head">
        <h1 data-od-id="login-heading">Вход</h1>
        <p>Войдите в аккаунт, чтобы открыть Главную со списком доступных поездок.</p>
      </div>
      <form class="account-form" id="login-form" novalidate data-od-id="login-form">
        <div class="account-field">
          <label for="login-email">Email</label>
          <input class="account-input" id="login-email" name="email" type="email" autocomplete="email" value="${esc(email)}" placeholder="name@example.com" aria-invalid="false" />
          <span class="account-error" id="login-email-error" data-error-for="login-email" aria-live="polite"></span>
        </div>
        ${passwordField("login-password", "Пароль", "current-password")}
        <div class="account-row account-auth-links-row">
          <label class="account-check"><input id="login-remember" name="remember" type="checkbox" /> Запомнить меня</label>
          <button class="account-link account-link-button" type="button" data-route="recovery">Забыли пароль?</button>
        </div>
        <button class="account-button account-button-primary account-button-block" type="submit" data-loading-label="Загрузка">Войти</button>
        <p class="account-help">Нет аккаунта? <button class="account-link account-link-button" type="button" data-route="register">Зарегистрироваться</button></p>
        <p class="account-meta">Продолжая, Вы принимаете пользовательское соглашение и политику конфиденциальности.</p>
      </form>
      ${devPanel("login", [
        ["invalid", "Неверный пароль"],
        ["notfound", "Аккаунт не найден"],
        ["rate", "Слишком много попыток"],
        ["expired", "Сессия истекла"],
        ["offline", "Офлайн"],
        ["error", "Ошибка"]
      ])}
    `;
    return authLayout("Вход", body);
  }

  function registerTemplate(ctx) {
    const values = ctx.registerValues || {};
    const body = `
      <div class="account-form-head">
        <h1 data-od-id="register-heading">Регистрация</h1>
        <p>Создайте аккаунт. После регистрации откроется Главная со списком поездок.</p>
      </div>
      <form class="account-form" id="register-form" novalidate data-od-id="register-form">
        <div class="account-grid-2">
          ${field("register-first-name", "Имя", "text", "given-name", values.firstName || "")}
          ${field("register-last-name", "Фамилия", "text", "family-name", values.lastName || "")}
        </div>
        ${field("register-email", "Email", "email", "email", values.email || "", "name@example.com")}
        <div class="account-grid-2">
          ${passwordField("register-password", "Пароль", "new-password")}
          ${passwordField("register-password-confirm", "Подтверждение пароля", "new-password")}
        </div>
        ${passwordRulesHtml(ctx.registerPassword || "")}
        <div class="account-consents" data-od-id="register-consents">
          <div class="account-consent-item">
            <label class="account-check"><input id="register-terms" type="checkbox" /> <span>Принимаю условия сервиса</span></label>
            <span class="account-error" id="register-terms-error" data-error-for="register-terms" aria-live="polite"></span>
          </div>
          <div class="account-consent-item">
            <label class="account-check"><input id="register-data" type="checkbox" /> <span>Согласен на обработку данных аккаунта</span></label>
            <span class="account-error" id="register-data-error" data-error-for="register-data" aria-live="polite"></span>
          </div>
        </div>
        <button class="account-button account-button-primary account-button-block" type="submit" data-loading-label="Загрузка">Создать аккаунт</button>
        <p class="account-help">Уже есть аккаунт? <button class="account-link account-link-button" type="button" data-route="login">Войти</button></p>
      </form>
      ${ctx.registerSuccess ? `<div class="account-banner account-banner-success" role="status">Аккаунт создан. Telegram можно подключить позже в профиле.</div>` : ""}
      ${devPanel("register", [
        ["emailTaken", "Email занят"],
        ["weak", "Слабый пароль"],
        ["offline", "Офлайн"],
        ["error", "Ошибка"]
      ])}
    `;
    return authLayout("Регистрация", body);
  }

  function field(id, label, type, autocomplete, value, placeholder) {
    return `
      <div class="account-field">
        <label for="${id}">${label}</label>
        <input class="account-input" id="${id}" type="${type}" autocomplete="${autocomplete || "off"}" value="${esc(value || "")}" placeholder="${esc(placeholder || "")}" aria-invalid="false" />
        <span class="account-error" id="${id}-error" data-error-for="${id}" aria-live="polite"></span>
      </div>
    `;
  }

  function passwordField(id, label, autocomplete) {
    return `
      <div class="account-field">
        <label for="${id}">${label}</label>
        <div class="account-password-shell">
          <input class="account-input" id="${id}" type="password" autocomplete="${autocomplete}" aria-invalid="false" />
          <button class="account-button account-button-ghost account-password-toggle" type="button" data-toggle-password="${id}" aria-label="Показать пароль">Показать</button>
        </div>
        <span class="account-error" id="${id}-error" data-error-for="${id}" aria-live="polite"></span>
      </div>
    `;
  }

  function recoveryTemplate(ctx) {
    const params = new URLSearchParams(window.location.search);
    const token = ctx.recoveryToken || params.get("token") || "";
    const invalidDirectReset = ctx.recoveryStep === 3 && token && !ctx.adapter.validateRecoveryToken(token).ok;
    const unsafeDirectReset = ctx.recoveryStep === 3 && !token && !ctx.recoveryEmail;
    if (invalidDirectReset || unsafeDirectReset) {
      return authLayout("Восстановление доступа", `
        <div class="account-state" data-od-id="recovery-invalid">
          <span class="account-status account-status-danger">Ошибка</span>
          <h1>Ссылка недействительна или срок её действия истёк</h1>
          <p>Запросите новую ссылку для восстановления доступа.</p>
          <div class="account-actions">
            <button class="account-button account-button-primary" type="button" data-recovery-restart>Отправить новую ссылку</button>
            <button class="account-button account-button-secondary" type="button" data-route="login">Вернуться ко входу</button>
          </div>
        </div>
        ${devPanel("recovery", [["expired", "Ссылка истекла"], ["invalid", "Недействительная ссылка"], ["used", "Уже использована"], ["offline", "Офлайн"], ["error", "Ошибка"]])}
      `);
    }
    const step = ctx.recoveryStep;
    const body = `
      <div class="account-form-head">
        <h1 data-od-id="recovery-heading">Восстановление доступа</h1>
        <p>Сценарий не зависит от текущей сессии и меняет пароль только для указанного email.</p>
      </div>
      <div class="account-recovery-steps" aria-hidden="true">
        ${[1, 2, 3, 4].map((item) => `<span class="account-step-dot ${item <= step ? "is-active" : ""}"></span>`).join("")}
      </div>
      ${step === 1 ? recoveryStepEmail(ctx) : ""}
      ${step === 2 ? recoveryStepSent(ctx) : ""}
      ${step === 3 ? recoveryStepReset(ctx) : ""}
      ${step === 4 ? recoveryStepSuccess() : ""}
      ${devPanel("recovery", [["notfound", "Аккаунт не найден"], ["expired", "Ссылка истекла"], ["invalid", "Недействительная ссылка"], ["used", "Уже использована"], ["rate", "Слишком много попыток"], ["offline", "Офлайн"], ["error", "Ошибка"]])}
    `;
    return authLayout("Восстановление доступа", body);
  }

  function recoveryStepEmail(ctx) {
    return `
      <form class="account-form" id="recovery-form" novalidate data-od-id="recovery-email-form">
        ${field("recovery-email", "Email аккаунта", "email", "email", ctx.recoveryEmail || "", "name@example.com")}
        <button class="account-button account-button-primary account-button-block" type="submit">Отправить инструкцию</button>
        <button class="account-link account-link-button" type="button" data-route="login">Вернуться ко входу</button>
      </form>
    `;
  }

  function recoveryStepSent(ctx) {
    return `
      <div class="account-state" data-od-id="recovery-sent">
        <span class="account-status account-status-success">Инструкция отправлена</span>
        <h1>Проверьте почту</h1>
        <p>Мы подготовили инструкцию для ${esc(ctx.recoveryMaskedEmail || "указанного адреса")}. В этой версии письмо не отправляется автоматически.</p>
        ${ctx.recoveryToken ? `<p class="account-meta" data-development-only="true">Код для проверки: <span class="account-code">${esc(ctx.recoveryToken)}</span></p>` : ""}
        <div class="account-actions">
          <button class="account-button account-button-primary" type="button" data-recovery-enter-token>Ввести новый пароль</button>
          <button class="account-button account-button-secondary" type="button" data-recovery-resend>Отправить повторно</button>
          <button class="account-button account-button-ghost" type="button" data-recovery-change-email>Изменить email</button>
        </div>
      </div>
    `;
  }

  function recoveryStepReset() {
    return `
      <form class="account-form" id="recovery-reset-form" novalidate data-od-id="recovery-reset-form">
        ${passwordField("recovery-new-password", "Новый пароль", "new-password")}
        ${passwordField("recovery-new-password-confirm", "Подтверждение нового пароля", "new-password")}
        ${passwordRulesHtml("")}
        <button class="account-button account-button-primary account-button-block" type="submit">Изменить пароль</button>
      </form>
    `;
  }

  function recoveryStepSuccess() {
    return `
      <div class="account-state" data-od-id="recovery-success">
        <span class="account-status account-status-success">Пароль изменён</span>
        <h1>Доступ восстановлен</h1>
        <p>Теперь можно войти с новым паролем.</p>
        <button class="account-button account-button-primary" type="button" data-route="login">Вернуться ко входу</button>
      </div>
    `;
  }

  function invitationTemplate(ctx) {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("invitationId") || "invite-001";
    const state = ctx.adapter.getState();
    let invitation = ctx.adapter.getInvitation(id);
    if (ctx.invitationScenario) {
      invitation = Object.assign({}, invitation || { id, tripId: "", invitedByUserId: "", invitedUserId: "", status: "invalid" }, { status: ctx.invitationScenario });
    }
    const status = invitation ? invitation.status : "invalid";
    const safeHiddenStatuses = ["invalid", "noAccess", "revoked"];
    const authParam = params.get("auth");
    // Интеграция: реальная сессия TravelAppState важнее URL-параметра auth=1 (он остаётся для dev-сценариев).
    const sessionAuth = Boolean(state.session && state.session.isAuthenticated && state.session.userId);
    const isAuthenticated = sessionAuth || authParam === "1";
    const actorUserId = (sessionAuth && state.session.userId) || params.get("userId") || ctx.invitationActorUserId || (invitation && invitation.invitedUserId) || (state.session && state.session.userId);
    const actor = state.users[actorUserId] || null;
    const trip = invitation && invitation.tripId ? state.trips[invitation.tripId] : null;
    const inviter = invitation && invitation.invitedByUserId ? state.users[invitation.invitedByUserId] : null;
    const alreadyParticipant = Boolean(trip && actor && Array.isArray(trip.participantIds) && trip.participantIds.includes(actor.id));
    const ownInvitation = Boolean(invitation && actor && actor.id === invitation.invitedByUserId);
    const canShowDetails = invitation && trip && !safeHiddenStatuses.includes(status);

    let content = "";
    if (!canShowDetails) {
      content = safeInvitationScreen("Приглашение недоступно", "Ссылка не найдена, отозвана или у Вас нет доступа к её деталям.", "Нет доступа");
    } else if (status === "loading") {
      content = safeInvitationScreen("Загрузка", "Проверяем доступность приглашения.", "Загрузка");
    } else if (status === "offline") {
      content = safeInvitationScreen("Офлайн", "Проверьте подключение к интернету и повторите попытку.", "Офлайн");
    } else if (status === "error") {
      content = safeInvitationScreen("Ошибка", "Не удалось открыть приглашение. Попробуйте позже.", "Ошибка");
    } else if (status === "accepted" || alreadyParticipant) {
      content = invitationDetails(invitation, trip, inviter, status === "accepted" ? "Приглашение принято" : "Вы уже участвуете в этой поездке") + `
        <div class="account-actions"><button class="account-button account-button-primary" type="button" data-open-trip="${esc(trip.id)}">Открыть поездку</button></div>
      `;
    } else if (status === "declined") {
      content = safeInvitationScreen("Приглашение отклонено", "Поездка не добавлена в Ваш аккаунт.", "Отклонено");
    } else if (status === "expired") {
      content = invitationDetails(invitation, trip, inviter, "Срок приглашения истёк") + `<div class="account-actions"><button class="account-button account-button-secondary" type="button" data-route="home">На Главную</button></div>`;
    } else if (status === "used") {
      content = invitationDetails(invitation, trip, inviter, "Ссылка уже использована") + `<div class="account-actions"><button class="account-button account-button-secondary" type="button" data-route="home">На Главную</button></div>`;
    } else if (!isAuthenticated) {
      content = invitationDetails(invitation, trip, inviter, "Вас пригласили в поездку") + `
        <div class="account-actions invitation-actions">
          <button class="account-button account-button-primary" type="button" data-invitation-login="${esc(id)}">Войти и принять</button>
          <button class="account-button account-button-secondary" type="button" data-invitation-register="${esc(id)}">Зарегистрироваться и принять</button>
        </div>
      `;
    } else if (ownInvitation) {
      content = invitationDetails(invitation, trip, inviter, "Нельзя принять собственное приглашение") + `
        <div class="account-banner account-banner-warning">Приглашение создано Вашим аккаунтом. Вы уже управляете доступом к этой поездке.</div>
        <div class="account-actions"><button class="account-button account-button-secondary" type="button" data-route="home">На Главную</button></div>
      `;
    } else {
      content = invitationDetails(invitation, trip, inviter, "Вас пригласили в поездку") + `
        <div class="account-actions invitation-actions">
          <button class="account-button account-button-primary" type="button" data-accept-invitation="${esc(id)}" data-actor="${esc(actorUserId)}">Принять приглашение</button>
          <button class="account-button account-button-secondary" type="button" data-decline-invitation="${esc(id)}" data-actor="${esc(actorUserId)}">Отклонить</button>
          <button class="account-button account-button-ghost" type="button" data-route="login">Войти в другой аккаунт</button>
        </div>
      `;
    }

    return `
      <section class="account-root invitation-card" data-od-id="invitation-page">
        <button class="account-brand account-brand-button" type="button" data-route="home">
          ${logo()}
          <span><span class="account-brand-name">Тревел-помощник</span><span class="account-brand-note">Приглашение в поездку</span></span>
        </button>
        <div class="account-form-panel account-invitation-panel">${content}</div>
        ${devPanel("invitation", [
          ["active", "Активное"],
          ["accepted", "Принято"],
          ["declined", "Отклонено"],
          ["revoked", "Отозвано"],
          ["expired", "Срок истёк"],
          ["used", "Уже использовано"],
          ["invalid", "Недействительная ссылка"],
          ["noAccess", "Нет доступа"],
          ["loading", "Загрузка"],
          ["error", "Ошибка"],
          ["offline", "Офлайн"]
        ])}
      </section>
      <div class="account-toast-stack" data-toast-stack aria-live="polite"></div>
    `;
  }

  function safeInvitationScreen(title, description, badge) {
    return `
      <div class="account-state" data-od-id="invitation-safe-state">
        <span class="account-status account-status-warning">${esc(badge)}</span>
        <h1>${esc(title)}</h1>
        <p>${esc(description)}</p>
        <div class="account-actions"><button class="account-button account-button-secondary" type="button" data-route="home">На Главную</button></div>
      </div>
    `;
  }

  function invitationDetails(invitation, trip, inviter, heading) {
    const participantCount = Array.isArray(trip.participantIds) ? trip.participantIds.length : 0;
    return `
      <div class="account-form-head">
        <span class="account-status account-status-success">${esc(invitation.status === "active" ? "Активно" : heading)}</span>
        <h1>${esc(heading)}</h1>
        <p>Роль после принятия: Участник. Доступ к данным поездки: только просмотр и личные действия участника.</p>
      </div>
      <div class="account-data-grid account-invitation-summary">
        <div class="account-data-item account-data-wide"><dt>Поездка и маршрут</dt><dd>${esc(trip.title)}<span>${esc(trip.route)}</span></dd></div>
        <div class="account-data-item"><dt>Даты</dt><dd>${esc(trip.dates || `${formatDate(trip.startsAt)} — ${formatDate(trip.endsAt)}`)}</dd></div>
        <div class="account-data-item"><dt>Срок ссылки</dt><dd>до ${esc(formatDate(invitation.expiresAt))}</dd></div>
        <div class="account-data-item"><dt>Организатор</dt><dd>${esc(inviter ? `${inviter.firstName} ${inviter.lastName || ""}`.trim() : "Организатор")}</dd></div>
        <div class="account-data-item"><dt>Участников</dt><dd>${participantCount}</dd></div>
      </div>
      <details class="account-banner account-invitation-more">
        <summary>Подробнее о правах</summary>
        <p>Вы сможете видеть маршрут, документы и сообщения организатора. Управление участниками и настройками поездки остаётся у организатора.</p>
      </details>
    `;
  }

  function profileTemplate(ctx) {
    const state = ctx.adapter.getState();
    const user = ctx.adapter.getCurrentUser(state);
    if (ctx.deleted) return deletedScreen();
    if (!state.session || !state.session.isAuthenticated || !user || user.accountStatus === "deleted") {
      return `
        <section class="account-deleted-screen" data-od-id="profile-session-expired">
          <div class="account-panel">
            <span class="account-status account-status-warning">Сессия истекла</span>
            <h1>Требуется вход</h1>
            <p>Чтобы открыть профиль, войдите в аккаунт повторно.</p>
            <button class="account-button account-button-primary" type="button" data-route="login">Войти</button>
          </div>
        </section>
      `;
    }
    const section = navSections.some(([id]) => id === ctx.activeSection) ? ctx.activeSection : "account";
    const title = navSections.find(([id]) => id === section)[1];
    return `
      <div class="profile-app-shell" data-profile-shell data-od-id="profile-page">
        <div data-modal-background>
          ${profileHeader(ctx, user)}
          <div class="profile-mobile-select">
            <label class="account-label" for="profile-section-select">Раздел профиля</label>
            <select class="account-select" id="profile-section-select" data-profile-section-select>
              ${navSections.map(([id, label]) => `<option value="${id}" ${id === section ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </div>
          <div class="profile-layout">
            <nav class="profile-nav" aria-label="Разделы профиля">
              ${navSections.map(([id, label]) => `<button class="profile-tab" type="button" data-section="${id}" aria-current="${id === section ? "page" : "false"}">${label}</button>`).join("")}
            </nav>
            <main class="profile-content">
              <section class="profile-section is-active" data-od-id="profile-${esc(section)}-section">
                <div class="account-panel-title">
                  <div><h2>${esc(title)}</h2><p>${sectionSubtitle(section)}</p></div>
                </div>
                ${renderProfileSection(ctx, state, user, section)}
              </section>
            </main>
          </div>
        </div>
        ${profileModals(ctx, user)}
        <div class="account-toast-stack" data-toast-stack aria-live="polite"></div>
      </div>
    `;
  }

  function profileHeader(ctx, user) {
    const fullName = ctx.adapter.getFullName(user);
    return `
      <header class="profile-global-header" data-od-id="profile-global-header">
        <button class="account-brand account-brand-button" type="button" data-route="home">
          ${logo()}
          <span><span class="account-brand-name">Тревел-помощник</span><span class="account-brand-note">Главная → Профиль</span></span>
        </button>
        <div class="profile-header-actions">
          <button class="account-button account-button-secondary account-icon-button" type="button" data-profile-notifications aria-label="Уведомления" aria-current="${ctx.activeSection === "notifications" ? "page" : "false"}">Уведомления</button>
          <span class="profile-header-name" data-profile-header-name>${esc(fullName)}</span>
          <div class="profile-menu-wrap">
            <button class="account-button account-avatar-button" type="button" data-profile-menu-button aria-haspopup="menu" aria-expanded="${ctx.menuOpen ? "true" : "false"}" aria-label="Меню пользователя">
              ${avatarHtml(ctx.adapter, user)}
            </button>
            <div class="profile-menu" role="menu" data-profile-menu ${ctx.menuOpen ? "" : "hidden"}>
              <div class="profile-menu-user"><strong>${esc(fullName)}</strong><span>${esc(user.email)}</span></div>
              <button type="button" role="menuitem" data-profile-menu-route="home">Главная</button>
              <button type="button" role="menuitem" data-profile-menu-route="history">История поездок</button>
              <button type="button" role="menuitem" data-profile-menu-route="profile">Профиль</button>
              <button type="button" role="menuitem" data-profile-menu-route="logout" class="danger">Выйти</button>
            </div>
          </div>
        </div>
      </header>
    `;
  }

  function sectionSubtitle(section) {
    return {
      account: "Персональные данные, пароль, аватар и безопасные действия.",
      telegram: "Подключение бота, поездка для уведомлений и команды.",
      mail: "Демонстрационное подключение почты и правила использования.",
      notifications: "Каналы, события, тихие часы и выбранные поездки.",
      appearance: "Удобный вид интерфейса, сохранённый для Вашего аккаунта."
    }[section] || "";
  }

  function renderProfileSection(ctx, state, user, section) {
    if (section === "telegram") return renderTelegramSection(ctx, state, user);
    if (section === "mail") return renderMailSection(ctx, user);
    if (section === "notifications") return renderNotificationsSection(ctx, state, user);
    if (section === "appearance") return renderAppearanceSection(user);
    return renderAccountSection(ctx, state, user);
  }

  function renderAccountSection(ctx, state, user) {
    const deletion = ctx.adapter.canDeleteAccount(user.id);
    return `
      <div class="account-panel">
        <div class="account-row account-profile-summary">
          <div class="account-row">
            ${avatarHtml(ctx.adapter, user, "account-avatar-large")}
            <div><h3>${esc(ctx.adapter.getFullName(user))}</h3><p class="account-meta">${esc(user.email)}</p></div>
          </div>
          <span class="account-status account-status-success">Аккаунт активен</span>
        </div>
        <div class="account-data-grid">
          <div class="account-data-item"><dt>Имя</dt><dd>${esc(user.firstName)}</dd></div>
          <div class="account-data-item"><dt>Фамилия</dt><dd>${esc(user.lastName)}</dd></div>
          <div class="account-data-item"><dt>Email</dt><dd>${esc(user.email)}</dd></div>
          <div class="account-data-item"><dt>Дата регистрации</dt><dd>${formatDate(user.createdAt)}</dd></div>
        </div>
        <div class="account-actions">
          <button class="account-button account-button-primary" type="button" data-open-modal="edit">Изменить данные</button>
          <button class="account-button account-button-secondary" type="button" data-open-modal="password">Сменить пароль</button>
          <button class="account-button account-button-secondary" type="button" data-open-modal="avatar">Аватар</button>
          <button class="account-button account-button-ghost" type="button" data-profile-logout>Выйти из аккаунта</button>
        </div>
      </div>
      <div class="account-panel">
        <div class="account-panel-title">
          <div><h3>Удаление аккаунта</h3><p>Опасное действие требует отдельного подтверждения.</p></div>
          <span class="account-status ${deletion.ok ? "account-status-warning" : "account-status-danger"}">${deletion.ok ? "Доступно" : "Заблокировано"}</span>
        </div>
        ${deletion.ok ? `
          <p class="account-help">Перед удалением будут очищены данные аккаунта с этого устройства. Серверное удаление здесь не выполняется.</p>
          <button class="account-button account-button-danger" type="button" data-open-modal="delete">Удалить аккаунт</button>
        ` : `
          <div class="account-banner account-banner-danger">Сначала передайте роль организатора в активных групповых поездках.</div>
          <div class="account-card-grid">${deletion.blockingTrips.map((trip) => `
            <div class="account-card"><h4>${esc(trip.title)}</h4><p>${esc(trip.route || "")}</p><button class="account-button account-button-secondary" type="button" data-open-trip-members="${esc(trip.id)}">Открыть участников поездки</button></div>
          `).join("")}</div>
        `}
        ${devPanel("delete", [["clearOrganizer", "Убрать блокирующую роль"], ["reset", "Сбросить данные проверки"]])}
      </div>
    `;
  }

  function renderTelegramSection(ctx, state, user) {
    const telegram = user.telegram || {};
    const trips = ctx.adapter.getAccessibleTrips(user.id, state).filter((trip) => trip.status !== "completed" && trip.status !== "deleted");
    const selectedTrip = trips.find((trip) => trip.id === telegram.selectedTripId);
    const settings = Object.assign({}, telegram.settings || {});
    let body = "";
    if (telegram.state === "connecting") {
      body = `<div class="account-card"><span class="account-status account-status-warning">Подключение</span><h3>Демонстрационный код подключения</h3><p class="account-code">TG-482-916</p><p>Откройте бота и введите этот код. Он не подключает настоящий Telegram API.</p><button class="account-button account-button-secondary" type="button" data-telegram-state="notConnected">Отменить</button></div>`;
    } else if (telegram.state === "connected") {
      body = `
        <div class="account-card"><span class="account-status account-status-success">Подключён</span><h3>${esc(telegram.username || "@travel_user")}</h3><p>Дата подключения: ${formatDate(telegram.connectedAt)}</p></div>
        <div class="account-field">
          <label for="profile-telegram-trip">Выбранная поездка</label>
          <select class="account-select" id="profile-telegram-trip" data-telegram-trip>
            ${trips.map((trip) => `<option value="${esc(trip.id)}" ${trip.id === telegram.selectedTripId ? "selected" : ""}>${esc(trip.title)}</option>`).join("")}
          </select>
          ${selectedTrip ? `<span class="account-meta">${esc(selectedTrip.route || "")}</span>` : `<span class="account-error">Выберите доступную активную поездку.</span>`}
        </div>
        <div class="account-card-grid">${Object.entries({
          routeChanges: "Изменения маршрута",
          delays: "Задержки",
          violations: "Нарушения",
          planB: "Выбранный Plan B",
          organizerMessages: "Сообщения организатора",
          documents: "Документы",
          dailySummary: "Ежедневная сводка",
          sos: "SOS"
        }).map(([key, label]) => toggleRow(label, `telegram-setting-${key}`, settings[key], `data-telegram-setting="${key}"`)).join("")}</div>
        <div class="account-actions"><button class="account-button account-button-secondary" type="button" data-telegram-check>Проверить связь</button><button class="account-button account-button-danger" type="button" data-telegram-state="notConnected">Отключить</button></div>
      `;
    } else if (telegram.state === "error") {
      body = `<div class="account-banner account-banner-danger">Не удалось завершить подключение. Проверьте код и повторите.</div><div class="account-actions"><button class="account-button account-button-primary" type="button" data-telegram-state="connecting">Повторить</button><button class="account-button account-button-secondary" type="button" data-telegram-state="notConnected">Отключить</button></div>`;
    } else if (telegram.state === "lost") {
      body = `<div class="account-banner account-banner-warning">Связь с ботом потеряна. Настройки сохранены, но уведомления в Telegram временно недоступны.</div><button class="account-button account-button-primary" type="button" data-telegram-state="connecting">Переподключить</button>`;
    } else {
      body = `<div class="account-card"><span class="account-status">Не подключён</span><h3>Telegram-уведомления</h3><p>Получайте важные изменения маршрута, SOS и сообщения организатора в боте.</p><button class="account-button account-button-primary" type="button" data-telegram-state="connecting">Подключить Telegram</button></div>`;
    }
    return `
      <div class="account-panel">${body}</div>
      <details class="account-panel"><summary class="account-panel-title"><h3>Команды бота</h3></summary><div class="account-command-grid">${["/trips", "/history", "/today", "/next", "/documents", "/sos", "/settings", "/help"].map((cmd) => `<span class="account-code">${cmd}</span>`).join("")}</div></details>
      ${devPanel("telegram", [["notConnected", "Не подключён"], ["connecting", "Подключение"], ["connected", "Подключён"], ["error", "Ошибка"], ["lost", "Связь потеряна"]])}
    `;
  }

  function renderMailSection(ctx, user) {
    const mail = user.mail || {};
    const settings = Object.assign({ searchBookings: true, notifyChanges: true, noRawMail: true }, mail.settings || {});
    let body = "";
    if (mail.state === "connecting") {
      body = `<div class="account-card"><span class="account-status account-status-warning">Подключение</span><h3>Демонстрационное подключение Gmail</h3><p>Ожидаем подтверждение доступа. Настоящий OAuth здесь не выполняется.</p><button class="account-button account-button-secondary" type="button" data-mail-state="notConnected">Отменить</button></div>`;
    } else if (mail.state === "connected") {
      body = `
        <div class="account-data-grid">
          <div class="account-data-item"><dt>Email</dt><dd>${esc(mail.email || user.email)}</dd></div>
          <div class="account-data-item"><dt>Провайдер</dt><dd>${esc(mail.provider || "Gmail")}</dd></div>
          <div class="account-data-item"><dt>Дата подключения</dt><dd>${formatDate(mail.connectedAt)}</dd></div>
          <div class="account-data-item"><dt>Статус</dt><dd>Подключена</dd></div>
        </div>
        <div class="account-card-grid">
          ${toggleRow("Использовать для поиска бронирований", "mail-searchBookings", settings.searchBookings, "data-mail-setting=\"searchBookings\"")}
          ${toggleRow("Уведомлять о найденных изменениях", "mail-notifyChanges", settings.notifyChanges, "data-mail-setting=\"notifyChanges\"")}
          ${toggleRow("Не сохранять исходные письма", "mail-noRawMail", settings.noRawMail, "data-mail-setting=\"noRawMail\"")}
        </div>
        <div class="account-banner">Исходные письма не сохраняются. Настоящий доступ к почте будет подключаться серверной частью, а пользователь сможет отключить его в любой момент.</div>
        <button class="account-button account-button-danger" type="button" data-mail-state="notConnected">Отключить</button>
      `;
    } else if (mail.state === "error") {
      body = `<div class="account-banner account-banner-danger">Подключение не завершено. Повторите попытку или отключите почтовый канал.</div><div class="account-actions"><button class="account-button account-button-primary" type="button" data-mail-state="connecting">Повторить</button><button class="account-button account-button-secondary" type="button" data-mail-state="notConnected">Отключить</button></div>`;
    } else if (mail.state === "reauth") {
      body = `<div class="account-banner account-banner-warning">Нужно повторно подтвердить доступ. Настройки использования сохраняются.</div><button class="account-button account-button-primary" type="button" data-mail-state="connecting">Повторить авторизацию</button>`;
    } else {
      body = `<div class="account-card"><span class="account-status">Не подключена</span><h3>Почта для бронирований</h3><p>В будущем почтовое подключение поможет находить изменения в бронированиях. В этой версии используется демонстрационное подключение без чтения писем.</p><ul class="account-list"><li>Поиск бронирований</li><li>Уведомления об изменениях</li><li>Отключение в любой момент</li></ul><button class="account-button account-button-primary" type="button" data-mail-state="connecting">Подключить почту</button></div>`;
    }
    return `<div class="account-panel">${body}</div>${devPanel("mail", [["notConnected", "Не подключена"], ["connecting", "Подключение"], ["connected", "Подключена"], ["error", "Ошибка"], ["reauth", "Повторная авторизация"]])}`;
  }

  function renderNotificationsSection(ctx, state, user) {
    const notifications = user.notifications || {};
    const matrix = notifications.matrix || {};
    const telegramAvailable = user.telegram && user.telegram.state === "connected";
    const emailAvailable = user.mail && user.mail.state === "connected";
    const trips = ctx.adapter.getAccessibleTrips(user.id, state).filter((trip) => trip.status !== "deleted");
    const selected = notifications.selectedTripId || "all";
    const options = [`<option value="all" ${selected === "all" ? "selected" : ""}>Все поездки</option>`].concat(
      trips.map((trip) => `<option value="${esc(trip.id)}" ${selected === trip.id ? "selected" : ""}>${esc(trip.title)}</option>`)
    ).join("");
    return `
      <div class="account-panel">
        <div class="account-grid-2">
          <div class="account-field"><label for="profile-notification-trip">Поездка</label><select class="account-select" id="profile-notification-trip" data-notification-trip>${options}</select></div>
          <div class="account-field"><label for="profile-timezone">Часовой пояс</label><select class="account-select" id="profile-timezone" data-notification-timezone><option ${notifications.timezone === "Europe/Moscow" ? "selected" : ""}>Europe/Moscow</option><option ${notifications.timezone === "Europe/Istanbul" ? "selected" : ""}>Europe/Istanbul</option></select></div>
        </div>
        <div class="account-grid-2">
          ${toggleRow("Тихие часы", "notification-quiet", notifications.quietHours && notifications.quietHours.enabled, "data-notification-quiet")}
          ${toggleRow("Критические уведомления", "notification-critical", notifications.criticalAlerts, "data-notification-critical")}
        </div>
        <div class="account-actions"><button class="account-button account-button-secondary" type="button" data-test-notification>Тестовое уведомление</button></div>
      </div>
      <div class="account-panel">
        <table class="account-notification-table">
          <thead><tr><th>Событие</th><th>В приложении</th><th>Telegram</th><th>Email</th></tr></thead>
          <tbody>${notificationEvents.map(([key, label]) => notificationRow(key, label, matrix[key] || {}, telegramAvailable, emailAvailable)).join("")}</tbody>
        </table>
        <div class="account-notification-mobile">${notificationEvents.map(([key, label]) => notificationMobileCard(key, label, matrix[key] || {}, telegramAvailable, emailAvailable)).join("")}</div>
      </div>
    `;
  }

  function notificationRow(key, label, values, telegramAvailable, emailAvailable) {
    return `<tr><td>${label}</td>${["app", "telegram", "email"].map((channel) => `<td>${channelToggle(key, channel, values[channel], channel === "telegram" ? telegramAvailable : channel === "email" ? emailAvailable : true)}</td>`).join("")}</tr>`;
  }

  function notificationMobileCard(key, label, values, telegramAvailable, emailAvailable) {
    return `<div class="account-card"><h4>${label}</h4>${["app", "telegram", "email"].map((channel) => `<div class="account-row"><span>${channelLabels[channel]}</span>${channelToggle(key, channel, values[channel], channel === "telegram" ? telegramAvailable : channel === "email" ? emailAvailable : true)}</div>`).join("")}</div>`;
  }

  function channelToggle(eventKey, channel, checked, enabled) {
    const label = `${channelLabels[channel]}: ${notificationEvents.find(([key]) => key === eventKey)[1]}`;
    return `
      <label class="account-toggle">
        <input type="checkbox" data-notification-toggle data-event="${eventKey}" data-channel="${channel}" aria-label="${esc(label)}" ${checked ? "checked" : ""} ${enabled ? "" : "disabled"} />
        <span aria-hidden="true"></span>
        ${enabled ? "" : `<em class="account-toggle-note">${channel === "telegram" ? "Telegram не подключён" : "Email не подключён"}</em>`}
      </label>
    `;
  }

  function renderAppearanceSection(user) {
    const appearance = Object.assign({ theme: "dark", contrast: "normal", motion: "normal", density: "comfortable", fontScale: "normal" }, user.appearance || {});
    return `
      <div class="account-panel">
        <p class="account-help">Настройте удобный вид интерфейса. Изменения сохраняются для Вашего аккаунта.</p>
        <fieldset class="account-card"><legend class="account-label">Тема</legend>
          <label class="account-check"><input type="radio" name="appearance-theme" value="dark" data-appearance="theme" ${appearance.theme === "dark" ? "checked" : ""} /> Тёмная</label>
          <label class="account-check"><input type="radio" name="appearance-theme" value="system" data-appearance="theme" ${appearance.theme === "system" ? "checked" : ""} /> Системная</label>
          <p class="account-meta">Если светлая тема не утверждена, интерфейс остаётся в тёмном безопасном варианте.</p>
        </fieldset>
        <div class="account-card-grid">
          ${toggleRow("Высокая контрастность", "appearance-contrast", appearance.contrast === "high", "data-appearance-toggle=\"contrast\"")}
          ${toggleRow("Уменьшение анимации", "appearance-motion", appearance.motion === "reduced", "data-appearance-toggle=\"motion\"")}
          <div class="account-field"><label for="appearance-density">Плотность</label><select class="account-select" id="appearance-density" data-appearance="density"><option value="comfortable" ${appearance.density === "comfortable" ? "selected" : ""}>Комфортная</option><option value="compact" ${appearance.density === "compact" ? "selected" : ""}>Компактная</option></select></div>
          <div class="account-field"><label for="appearance-font">Размер текста</label><select class="account-select" id="appearance-font" data-appearance="fontScale"><option value="normal" ${appearance.fontScale === "normal" ? "selected" : ""}>Обычный</option><option value="large" ${appearance.fontScale === "large" ? "selected" : ""}>Крупный</option></select></div>
        </div>
      </div>
      <div class="account-panel appearance-preview" data-appearance-preview>
        <span class="account-status account-status-success">Активно</span>
        <h3>Предварительный просмотр</h3>
        <p>Основной текст сохраняет читаемость на тёмной поверхности.</p>
        <p class="account-meta">Второстепенный текст остаётся заметным, но не спорит с главным.</p>
        <input class="account-input" value="Поле ввода" aria-label="Поле предварительного просмотра" />
        <button class="account-button account-button-primary" type="button">Кнопка</button>
      </div>
    `;
  }

  function toggleRow(label, id, checked, attrs) {
    return `<label class="account-toggle account-card" for="${id}"><input id="${id}" type="checkbox" ${attrs || ""} ${checked ? "checked" : ""} /><span aria-hidden="true"></span>${esc(label)}</label>`;
  }

  function profileModals(ctx, user) {
    return `
      <div class="account-modal-layer" data-modal="edit" role="presentation">
        <section class="account-modal" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title">
          <div class="account-row"><h2 id="profile-edit-title">Персональные данные</h2><button class="account-button account-button-ghost account-modal-close" type="button" data-close-modal aria-label="Закрыть">Закрыть</button></div>
          <form class="account-form" id="profile-edit-form" novalidate>
            ${field("profile-edit-first-name", "Имя", "text", "given-name", user.firstName)}
            ${field("profile-edit-last-name", "Фамилия", "text", "family-name", user.lastName)}
            ${field("profile-edit-email", "Email", "email", "email", user.email)}
            <button class="account-button account-button-primary" type="submit">Сохранить</button>
          </form>
        </section>
      </div>
      <div class="account-modal-layer" data-modal="password" role="presentation">
        <section class="account-modal" role="dialog" aria-modal="true" aria-labelledby="profile-password-title">
          <div class="account-row"><h2 id="profile-password-title">Смена пароля</h2><button class="account-button account-button-ghost account-modal-close" type="button" data-close-modal aria-label="Закрыть">Закрыть</button></div>
          <form class="account-form" id="profile-password-form" novalidate>
            ${passwordField("profile-current-password", "Текущий пароль", "current-password")}
            ${passwordField("profile-new-password", "Новый пароль", "new-password")}
            ${passwordField("profile-new-password-confirm", "Подтверждение нового пароля", "new-password")}
            ${passwordRulesHtml("")}
            <button class="account-button account-button-primary" type="submit">Изменить пароль</button>
          </form>
        </section>
      </div>
      <div class="account-modal-layer" data-modal="avatar" role="presentation">
        <section class="account-modal" role="dialog" aria-modal="true" aria-labelledby="profile-avatar-title">
          <div class="account-row"><h2 id="profile-avatar-title">Аватар</h2><button class="account-button account-button-ghost account-modal-close" type="button" data-close-modal aria-label="Закрыть">Закрыть</button></div>
          <form class="account-form" id="profile-avatar-form" novalidate>
            <div class="account-field"><label for="profile-avatar-file">Файл JPG, PNG или WebP до 900 КБ</label><input class="account-input" id="profile-avatar-file" type="file" accept="image/jpeg,image/png,image/webp" aria-invalid="false" /><span class="account-error" id="profile-avatar-file-error" data-error-for="profile-avatar-file" aria-live="polite">${esc(ctx.avatarError || "")}</span></div>
            <div class="account-card" data-avatar-preview>${ctx.avatarDataUrl ? `<img class="account-avatar-preview" src="${esc(ctx.avatarDataUrl)}" alt="Предпросмотр аватара" />` : `<p class="account-meta">Выберите изображение для локального предпросмотра.</p>`}</div>
            <div class="account-actions"><button class="account-button account-button-primary" type="submit">Сохранить аватар</button><button class="account-button account-button-secondary" type="button" data-remove-avatar>Удалить аватар</button></div>
          </form>
        </section>
      </div>
      <div class="account-modal-layer" data-modal="delete" role="presentation">
        <section class="account-modal" role="dialog" aria-modal="true" aria-labelledby="profile-delete-title" data-danger-modal>
          <div class="account-row"><h2 id="profile-delete-title">Удаление аккаунта</h2><button class="account-button account-button-ghost account-modal-close" type="button" data-close-modal aria-label="Закрыть">Закрыть</button></div>
          <form class="account-form" id="profile-delete-form" novalidate>
            <div class="account-banner account-banner-danger">Данные аккаунта будут удалены с этого устройства. Серверное удаление здесь не выполняется.</div>
            <div class="account-field"><label for="profile-delete-confirm">Введите УДАЛИТЬ</label><input class="account-input" id="profile-delete-confirm" autocomplete="off" aria-invalid="false" /><span class="account-error" id="profile-delete-confirm-error" data-error-for="profile-delete-confirm" aria-live="polite"></span></div>
            <button class="account-button account-button-danger" type="submit">Окончательно удалить</button>
          </form>
        </section>
      </div>
    `;
  }

  function deletedScreen() {
    return `
      <section class="account-deleted-screen" data-od-id="account-deleted-screen">
        <div class="account-panel">
          <span class="account-status account-status-success">Аккаунт удалён</span>
          <h1>Данные аккаунта удалены с этого устройства</h1>
          <p>Для продолжения войдите или создайте новый аккаунт.</p>
          <button class="account-button account-button-primary" type="button" data-route="login">Вернуться ко входу</button>
        </div>
      </section>
    `;
  }

  function devPanel(id, buttons) {
    return `
      <details class="account-dev-panel" data-development-only="true" data-dev-panel="${id}">
        <summary>Сценарии проверки</summary>
        <div class="account-dev-panel-body">${buttons.map(([value, label]) => `<button class="account-chip-button" type="button" data-dev="${id}" data-value="${esc(value)}">${esc(label)}</button>`).join("")}</div>
      </details>
    `;
  }

  function setupShared(ctx, template) {
    const rerender = () => render(ctx, template);
    ctx.unsubscribe = ctx.adapter.subscribe(() => rerender());
    on(ctx, ctx.root, "click", (event) => handleClick(event, ctx, rerender));
    on(ctx, ctx.root, "submit", (event) => handleSubmit(event, ctx));
    on(ctx, ctx.root, "input", (event) => handleInput(event, ctx));
    on(ctx, ctx.root, "change", (event) => handleChange(event, ctx));
    on(ctx, document, "keydown", (event) => handleDocumentKeydown(event, ctx));
    on(ctx, document, "click", (event) => {
      if (!ctx.menuOpen) return;
      if (!event.target.closest("[data-profile-menu]") && !event.target.closest("[data-profile-menu-button]")) {
        setMenuState(ctx, false);
      }
    });
  }

  function openModal(ctx, id, preserveFocus) {
    closeModal(ctx, null, true);
    const layer = qs(ctx.root, `[data-modal="${id}"]`);
    if (!layer) return;
    ctx.modalId = id;
    ctx.modalReturnFocus = preserveFocus ? ctx.modalReturnFocus : document.activeElement;
    layer.classList.add("is-open");
    layer.removeAttribute("hidden");
    const background = qs(ctx.root, "[data-modal-background]");
    if (background) {
      background.setAttribute("inert", "");
      background.setAttribute("aria-hidden", "true");
    }
    const focusables = qsa(layer, focusableSelector).filter((node) => !node.closest("[hidden]"));
    ctx.modalTrap = { layer, focusables };
    const first = focusables[0] || layer;
    setTimeout(() => first.focus(), 0);
  }

  function closeModal(ctx, modal, keepId) {
    const layers = modal ? [modal] : qsa(ctx.root, ".account-modal-layer.is-open");
    layers.forEach((layer) => {
      layer.classList.remove("is-open");
      layer.setAttribute("hidden", "");
    });
    const background = qs(ctx.root, "[data-modal-background]");
    if (background) {
      background.removeAttribute("inert");
      background.removeAttribute("aria-hidden");
    }
    ctx.modalTrap = null;
    if (!keepId) ctx.modalId = "";
    if (!keepId && ctx.modalReturnFocus && typeof ctx.modalReturnFocus.focus === "function") {
      ctx.modalReturnFocus.focus();
    }
    if (!keepId) ctx.modalReturnFocus = null;
  }

  function handleDocumentKeydown(event, ctx) {
    if (event.key === "Escape") {
      if (ctx.modalId) closeModal(ctx);
      if (ctx.menuOpen) setMenuState(ctx, false);
      return;
    }
    if (event.key !== "Tab" || !ctx.modalTrap || !ctx.modalTrap.layer.classList.contains("is-open")) return;
    const focusables = qsa(ctx.modalTrap.layer, focusableSelector).filter((node) => node.offsetParent !== null || node === document.activeElement);
    if (!focusables.length) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function setMenuState(ctx, open, keepFocus) {
    ctx.menuOpen = open;
    const button = qs(ctx.root, "[data-profile-menu-button]");
    const menu = qs(ctx.root, "[data-profile-menu]");
    if (button) button.setAttribute("aria-expanded", open ? "true" : "false");
    if (menu) menu.hidden = !open;
    if (!open && !keepFocus && button) button.focus();
  }

  function handleClick(event, ctx, renderFn) {
    const toggle = event.target.closest("[data-toggle-password]");
    if (toggle) {
      const input = qs(ctx.root, `#${toggle.dataset.togglePassword}`);
      if (input) {
        input.type = input.type === "password" ? "text" : "password";
        toggle.textContent = input.type === "password" ? "Показать" : "Скрыть";
      }
      return;
    }
    const route = event.target.closest("[data-route]");
    if (route) {
      event.preventDefault();
      goRoute(ctx, route.dataset.route);
      return;
    }
    const modalButton = event.target.closest("[data-open-modal]");
    if (modalButton) {
      openModal(ctx, modalButton.dataset.openModal);
      return;
    }
    if (event.target.closest("[data-close-modal]")) {
      closeModal(ctx);
      return;
    }
    if (event.target.classList && event.target.classList.contains("account-modal-layer") && !event.target.querySelector("[data-danger-modal]")) {
      closeModal(ctx, event.target);
      return;
    }
    const dev = event.target.closest("[data-dev]");
    if (dev) {
      handleDev(dev.dataset.dev, dev.dataset.value, ctx, renderFn);
      return;
    }
    handlePageClick(event, ctx, renderFn);
  }

  function handlePageClick(event, ctx, renderFn) {
    if (event.target.closest("[data-recovery-restart]")) {
      ctx.recoveryStep = 1;
      ctx.recoveryToken = "";
      renderFn();
      return;
    }
    if (event.target.closest("[data-recovery-enter-token]")) {
      ctx.recoveryStep = 3;
      renderFn();
      return;
    }
    if (event.target.closest("[data-recovery-change-email]")) {
      ctx.recoveryStep = 1;
      renderFn();
      return;
    }
    if (event.target.closest("[data-recovery-resend]")) {
      if (!guardOnline(ctx, "Восстановление пароля недоступно офлайн")) return;
      const result = ctx.adapter.beginPasswordRecovery(ctx.recoveryEmail);
      if (result.ok) {
        ctx.recoveryToken = result.previewToken;
        ctx.recoveryMaskedEmail = result.maskedEmail;
        toast(ctx, "Инструкция подготовлена повторно", "success");
      }
      return;
    }
    const loginInvite = event.target.closest("[data-invitation-login]");
    if (loginInvite) {
      ctx.routes.goToLogin({ return: "invitation", invitationId: loginInvite.dataset.invitationLogin });
      return;
    }
    const registerInvite = event.target.closest("[data-invitation-register]");
    if (registerInvite) {
      ctx.routes.goToRegister({ return: "invitation", invitationId: registerInvite.dataset.invitationRegister });
      return;
    }
    const accept = event.target.closest("[data-accept-invitation]");
    if (accept) {
      if (!guardOnline(ctx, "Принятие приглашения недоступно офлайн")) return;
      const result = ctx.adapter.acceptInvitation(accept.dataset.acceptInvitation, accept.dataset.actor);
      if (!result.ok) toast(ctx, invitationErrorText(result.code), "error");
      else toast(ctx, "Приглашение принято", "success");
      return;
    }
    const decline = event.target.closest("[data-decline-invitation]");
    if (decline) {
      if (!guardOnline(ctx, "Отклонение приглашения недоступно офлайн")) return;
      if (window.confirm("Отклонить приглашение? Поездка не будет добавлена в аккаунт.")) {
        const result = ctx.adapter.declineInvitation(decline.dataset.declineInvitation, decline.dataset.actor);
        if (!result.ok) toast(ctx, invitationErrorText(result.code), "error");
      }
      return;
    }
    const openTrip = event.target.closest("[data-open-trip]");
    if (openTrip) {
      ctx.routes.goToTrip(openTrip.dataset.openTrip);
      return;
    }
    const profileNotifications = event.target.closest("[data-profile-notifications]");
    if (profileNotifications) {
      ctx.activeSection = "notifications";
      updateUrlSection("notifications");
      renderFn();
      return;
    }
    const menuButton = event.target.closest("[data-profile-menu-button]");
    if (menuButton) {
      event.stopPropagation();
      setMenuState(ctx, !ctx.menuOpen);
      return;
    }
    const menuRoute = event.target.closest("[data-profile-menu-route]");
    if (menuRoute) {
      const action = menuRoute.dataset.profileMenuRoute;
      if (action === "logout") ctx.routes.logout(ctx.adapter);
      else if (action === "history") ctx.routes.goToHistory();
      else if (action === "profile") {
        ctx.activeSection = "account";
        setMenuState(ctx, false);
        renderFn();
      } else ctx.routes.goToHome();
      return;
    }
    const section = event.target.closest("[data-section]");
    if (section) {
      ctx.activeSection = section.dataset.section;
      updateUrlSection(ctx.activeSection);
      renderFn();
      return;
    }
    const openMembers = event.target.closest("[data-open-trip-members]");
    if (openMembers) {
      ctx.routes.goToTrip(openMembers.dataset.openTripMembers, { section: "members" });
      return;
    }
    if (event.target.closest("[data-profile-logout]")) {
      ctx.routes.logout(ctx.adapter);
      return;
    }
    if (event.target.closest("[data-telegram-check]")) {
      toast(ctx, "Связь с Telegram доступна", "success");
      return;
    }
    const telegramState = event.target.closest("[data-telegram-state]");
    if (telegramState) {
      if (!guardOnline(ctx, "Telegram недоступен офлайн")) return;
      const user = ctx.adapter.getCurrentUser();
      if (user) setTelegramState(ctx, user, telegramState.dataset.telegramState);
      return;
    }
    const mailState = event.target.closest("[data-mail-state]");
    if (mailState) {
      if (!guardOnline(ctx, "Почта недоступна офлайн")) return;
      const user = ctx.adapter.getCurrentUser();
      if (user) setMailState(ctx, user, mailState.dataset.mailState);
      return;
    }
    const removeAvatar = event.target.closest("[data-remove-avatar]");
    if (removeAvatar) {
      if (!guardOnline(ctx, "Изменение профиля недоступно офлайн")) return;
      const user = ctx.adapter.getCurrentUser();
      ctx.adapter.updateUser({ userId: user.id, patch: { avatarDataUrl: "" } });
      toast(ctx, "Аватар удалён", "success");
      return;
    }
    if (event.target.closest("[data-test-notification]")) {
      const user = ctx.adapter.getCurrentUser();
      const channels = ["в приложении"];
      if (user.telegram && user.telegram.state === "connected") channels.push("Telegram");
      if (user.mail && user.mail.state === "connected") channels.push("Email");
      toast(ctx, `Тестовое уведомление показано: ${channels.join(", ")}`, "success");
    }
  }

  function invitationErrorText(code) {
    return {
      already_participant: "Вы уже участвуете в этой поездке",
      own_invitation: "Нельзя принять собственное приглашение",
      expired: "Срок приглашения истёк",
      offline: "Действие недоступно офлайн",
      noAccess: "Нет доступа",
      invalid: "Приглашение недоступно"
    }[code] || "Действие недоступно";
  }

  function handleSubmit(event, ctx) {
    const form = event.target;
    if (form.id === "login-form") handleLoginSubmit(event, ctx);
    if (form.id === "register-form") handleRegisterSubmit(event, ctx);
    if (form.id === "recovery-form") handleRecoverySubmit(event, ctx);
    if (form.id === "recovery-reset-form") handleRecoveryResetSubmit(event, ctx);
    if (form.id === "profile-edit-form") handleEditSubmit(event, ctx);
    if (form.id === "profile-password-form") handlePasswordSubmit(event, ctx);
    if (form.id === "profile-avatar-form") handleAvatarSubmit(event, ctx);
    if (form.id === "profile-delete-form") handleDeleteSubmit(event, ctx);
  }

  function handleLoginSubmit(event, ctx) {
    event.preventDefault();
    clearErrors(ctx.root);
    const emailInput = qs(ctx.root, "#login-email");
    const passwordInput = qs(ctx.root, "#login-password");
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    ctx.lastEmail = email;
    const errors = [];
    if (!email) errors.push(setFieldError(ctx.root, "login-email", "Введите email."));
    else if (!emailPattern.test(email)) errors.push(setFieldError(ctx.root, "login-email", "Введите корректный email."));
    if (!password) errors.push(setFieldError(ctx.root, "login-password", "Введите пароль."));
    if (errors.filter(Boolean).length) {
      focusFirst(errors);
      return;
    }
    if (ctx.loginScenario === "offline") {
      focusFirst([setFieldError(ctx.root, "login-email", "Офлайн. Проверьте подключение и повторите вход.")]);
      return;
    }
    if (ctx.loginScenario === "rate") {
      focusFirst([setFieldError(ctx.root, "login-password", "Слишком много попыток. Попробуйте позже.")]);
      return;
    }
    if (ctx.loginScenario === "expired") {
      focusFirst([setFieldError(ctx.root, "login-password", "Сессия истекла. Войдите повторно.")]);
      return;
    }
    if (ctx.loginScenario === "error") {
      focusFirst([setFieldError(ctx.root, "login-password", "Ошибка системы. Попробуйте позже.")]);
      return;
    }
    const result = ctx.adapter.authenticate({ email, password, remember: qs(ctx.root, "#login-remember").checked });
    if (!result.ok) {
      const message = result.code === "not_found" || ctx.loginScenario === "notfound" ? "Аккаунт не найден." : "Неверный email или пароль.";
      focusFirst([setFieldError(ctx.root, result.code === "not_found" ? "login-email" : "login-password", message)]);
      return;
    }
    ctx.routes.routeAfterAuth(ctx.adapter);
  }

  function handleRegisterSubmit(event, ctx) {
    event.preventDefault();
    clearErrors(ctx.root);
    if (!guardOnline(ctx, "Регистрация недоступна офлайн")) return;
    const firstName = qs(ctx.root, "#register-first-name").value.trim();
    const lastName = qs(ctx.root, "#register-last-name").value.trim();
    const email = qs(ctx.root, "#register-email").value.trim();
    const password = qs(ctx.root, "#register-password").value;
    const confirm = qs(ctx.root, "#register-password-confirm").value;
    ctx.registerValues = { firstName, lastName, email };
    ctx.registerPassword = password;
    const errors = [];
    if (!firstName) errors.push(setFieldError(ctx.root, "register-first-name", "Введите имя."));
    if (!lastName) errors.push(setFieldError(ctx.root, "register-last-name", "Введите фамилию."));
    if (!emailPattern.test(email)) errors.push(setFieldError(ctx.root, "register-email", "Введите корректный email."));
    if (!passwordChecks(password).valid) errors.push(setFieldError(ctx.root, "register-password", "Пароль не соответствует требованиям."));
    if (password !== confirm) errors.push(setFieldError(ctx.root, "register-password-confirm", "Пароли не совпадают."));
    if (!qs(ctx.root, "#register-terms").checked) errors.push(setFieldError(ctx.root, "register-terms", "Нужно принять условия."));
    if (!qs(ctx.root, "#register-data").checked) errors.push(setFieldError(ctx.root, "register-data", "Нужно подтвердить обработку данных."));
    if (errors.filter(Boolean).length) {
      focusFirst(errors);
      return;
    }
    if (ctx.registerScenario === "offline") {
      focusFirst([setFieldError(ctx.root, "register-email", "Офлайн. Регистрация временно недоступна.")]);
      return;
    }
    const result = ctx.registerScenario === "emailTaken"
      ? { ok: false, code: "email_taken" }
      : ctx.adapter.register({ firstName, lastName, email, password });
    if (!result.ok) {
      focusFirst([setFieldError(ctx.root, result.code === "email_taken" ? "register-email" : "register-password", result.code === "email_taken" ? "Email уже занят." : "Не удалось создать аккаунт.")]);
      return;
    }
    ctx.registerSuccess = true;
    toast(ctx, "Аккаунт создан", "success");
    setTimer(ctx, () => ctx.routes.routeAfterAuth(ctx.adapter), 500);
  }

  function handleRecoverySubmit(event, ctx) {
    event.preventDefault();
    clearErrors(ctx.root);
    if (!guardOnline(ctx, "Восстановление пароля недоступно офлайн")) return;
    const email = qs(ctx.root, "#recovery-email").value.trim();
    ctx.recoveryEmail = email;
    if (!emailPattern.test(email)) {
      focusFirst([setFieldError(ctx.root, "recovery-email", "Введите корректный email.")]);
      return;
    }
    if (ctx.recoveryScenario === "offline") {
      focusFirst([setFieldError(ctx.root, "recovery-email", "Офлайн. Повторите позже.")]);
      return;
    }
    const result = ctx.recoveryScenario === "notfound" ? { ok: false, code: "not_found" } : ctx.adapter.beginPasswordRecovery(email);
    if (!result.ok) {
      focusFirst([setFieldError(ctx.root, "recovery-email", "Аккаунт не найден.")]);
      return;
    }
    ctx.recoveryStep = 2;
    ctx.recoveryToken = result.previewToken;
    ctx.recoveryMaskedEmail = result.maskedEmail;
    render(ctx, recoveryTemplate);
  }

  function handleRecoveryResetSubmit(event, ctx) {
    event.preventDefault();
    clearErrors(ctx.root);
    if (!guardOnline(ctx, "Смена пароля недоступна офлайн")) return;
    const password = qs(ctx.root, "#recovery-new-password").value;
    const confirm = qs(ctx.root, "#recovery-new-password-confirm").value;
    const errors = [];
    if (!passwordChecks(password).valid) errors.push(setFieldError(ctx.root, "recovery-new-password", "Пароль не соответствует требованиям."));
    if (password !== confirm) errors.push(setFieldError(ctx.root, "recovery-new-password-confirm", "Пароли не совпадают."));
    if (errors.filter(Boolean).length) {
      focusFirst(errors);
      return;
    }
    const result = ctx.adapter.resetPassword({ email: ctx.recoveryEmail, token: ctx.recoveryToken, newPassword: password });
    if (!result.ok) {
      const message = result.code === "used_token" ? "Ссылка уже использована." : result.code === "expired_token" ? "Срок ссылки истёк." : "Ссылка недействительна.";
      focusFirst([setFieldError(ctx.root, "recovery-new-password", message)]);
      return;
    }
    ctx.recoveryStep = 4;
    render(ctx, recoveryTemplate);
  }

  function handleEditSubmit(event, ctx) {
    event.preventDefault();
    clearErrors(ctx.root);
    if (!guardOnline(ctx, "Изменение профиля недоступно офлайн")) return;
    const user = ctx.adapter.getCurrentUser();
    const firstName = qs(ctx.root, "#profile-edit-first-name").value.trim();
    const lastName = qs(ctx.root, "#profile-edit-last-name").value.trim();
    const email = qs(ctx.root, "#profile-edit-email").value.trim();
    const errors = [];
    if (!firstName) errors.push(setFieldError(ctx.root, "profile-edit-first-name", "Введите имя."));
    if (!lastName) errors.push(setFieldError(ctx.root, "profile-edit-last-name", "Введите фамилию."));
    if (!emailPattern.test(email)) errors.push(setFieldError(ctx.root, "profile-edit-email", "Введите корректный email."));
    if (errors.filter(Boolean).length) {
      focusFirst(errors);
      return;
    }
    const result = ctx.adapter.updateAccountProfile({ userId: user.id, firstName, lastName, email });
    if (!result.ok) {
      focusFirst([setFieldError(ctx.root, "profile-edit-email", result.code === "email_taken" ? "Email уже занят." : "Не удалось сохранить email.")]);
      return;
    }
    closeModal(ctx);
    toast(ctx, "Данные аккаунта обновлены", "success");
  }

  function handlePasswordSubmit(event, ctx) {
    event.preventDefault();
    clearErrors(ctx.root);
    if (!guardOnline(ctx, "Смена пароля недоступна офлайн")) return;
    const state = ctx.adapter.getState();
    const user = ctx.adapter.getCurrentUser(state);
    const current = qs(ctx.root, "#profile-current-password").value;
    const next = qs(ctx.root, "#profile-new-password").value;
    const confirm = qs(ctx.root, "#profile-new-password-confirm").value;
    const errors = [];
    if (!current) errors.push(setFieldError(ctx.root, "profile-current-password", "Введите текущий пароль."));
    if (state.credentials && state.credentials[user.email] && state.credentials[user.email] !== current) errors.push(setFieldError(ctx.root, "profile-current-password", "Текущий пароль указан неверно."));
    if (!passwordChecks(next).valid) errors.push(setFieldError(ctx.root, "profile-new-password", "Новый пароль не соответствует требованиям."));
    if (next && current && next === current) errors.push(setFieldError(ctx.root, "profile-new-password", "Новый пароль должен отличаться от текущего."));
    if (next !== confirm) errors.push(setFieldError(ctx.root, "profile-new-password-confirm", "Пароли не совпадают."));
    if (errors.filter(Boolean).length) {
      focusFirst(errors);
      return;
    }
    ctx.adapter.updatePasswordForUser(user.id, next);
    closeModal(ctx);
    toast(ctx, "Пароль изменён", "success");
  }

  function handleAvatarSubmit(event, ctx) {
    event.preventDefault();
    clearErrors(ctx.root);
    if (!guardOnline(ctx, "Изменение профиля недоступно офлайн")) return;
    const user = ctx.adapter.getCurrentUser();
    if (!ctx.avatarDataUrl) {
      focusFirst([setFieldError(ctx.root, "profile-avatar-file", "Выберите изображение.")]);
      return;
    }
    try {
      const result = ctx.adapter.updateUser({ userId: user.id, patch: { avatarDataUrl: ctx.avatarDataUrl } });
      if (result && result.ok === false) throw new Error(result.code || "save_failed");
      revokeAvatarUrl(ctx);
      closeModal(ctx);
      toast(ctx, "Аватар обновлён", "success");
    } catch (error) {
      setFieldError(ctx.root, "profile-avatar-file", "Не удалось сохранить изображение локально. Выберите файл меньшего размера.");
    }
  }

  function handleDeleteSubmit(event, ctx) {
    event.preventDefault();
    clearErrors(ctx.root);
    if (!guardOnline(ctx, "Удаление аккаунта недоступно офлайн")) return;
    const user = ctx.adapter.getCurrentUser();
    const check = ctx.adapter.canDeleteAccount(user.id);
    if (!check.ok) {
      closeModal(ctx);
      toast(ctx, "Сначала передайте роль организатора", "error");
      return;
    }
    const word = qs(ctx.root, "#profile-delete-confirm").value.trim();
    if (word !== "УДАЛИТЬ") {
      focusFirst([setFieldError(ctx.root, "profile-delete-confirm", "Введите контрольное слово УДАЛИТЬ.")]);
      return;
    }
    if (!window.confirm("Окончательно удалить данные аккаунта с этого устройства?")) return;
    const result = ctx.adapter.deleteAccount(user.id);
    if (result.ok) {
      ctx.deleted = true;
      closeModal(ctx, null, true);
      render(ctx, profileTemplate);
    }
  }

  function handleInput(event, ctx) {
    if (event.target.id === "register-password") {
      ctx.registerPassword = event.target.value;
      const rules = qs(ctx.root, "[data-password-rules]");
      if (rules) rules.outerHTML = passwordRulesHtml(event.target.value);
    }
    if (event.target.id === "recovery-new-password" || event.target.id === "profile-new-password") {
      const rules = qs(ctx.root, "[data-password-rules]");
      if (rules) rules.outerHTML = passwordRulesHtml(event.target.value);
    }
    if (event.target.id === "profile-avatar-file") {
      handleAvatarFile(event, ctx);
    }
  }

  function handleChange(event, ctx) {
    const user = ctx.adapter.getCurrentUser();
    if (!user) return;
    if (event.target.matches("[data-profile-section-select]")) {
      ctx.activeSection = event.target.value;
      updateUrlSection(ctx.activeSection);
      render(ctx, profileTemplate);
      return;
    }
    if (event.target.matches("[data-telegram-trip]")) {
      if (!guardOnline(ctx, "Telegram недоступен офлайн")) return;
      ctx.adapter.updateConnection(user.id, "telegram", { selectedTripId: event.target.value });
      toast(ctx, "Поездка для Telegram обновлена", "success");
      return;
    }
    if (event.target.matches("[data-telegram-setting]")) {
      if (!guardOnline(ctx, "Telegram недоступен офлайн")) return;
      const key = event.target.dataset.telegramSetting;
      const settings = Object.assign({}, user.telegram.settings || {}, { [key]: event.target.checked });
      ctx.adapter.updateConnection(user.id, "telegram", { settings });
      return;
    }
    if (event.target.matches("[data-mail-setting]")) {
      if (!guardOnline(ctx, "Почта недоступна офлайн")) return;
      ctx.adapter.updateMailSettings(user.id, { [event.target.dataset.mailSetting]: event.target.checked });
      return;
    }
    if (event.target.matches("[data-notification-toggle]")) {
      if (!guardOnline(ctx, "Уведомления недоступны офлайн")) return;
      const notifications = cloneNotifications(user.notifications);
      const eventKey = event.target.dataset.event;
      const channel = event.target.dataset.channel;
      notifications.matrix[eventKey] = Object.assign({}, notifications.matrix[eventKey] || {}, { [channel]: event.target.checked });
      ctx.adapter.saveNotifications(user.id, notifications);
      return;
    }
    if (event.target.matches("[data-notification-trip]")) {
      if (!guardOnline(ctx, "Уведомления недоступны офлайн")) return;
      const notifications = cloneNotifications(user.notifications);
      notifications.selectedTripId = event.target.value;
      ctx.adapter.saveNotifications(user.id, notifications);
      return;
    }
    if (event.target.matches("[data-notification-timezone]")) {
      if (!guardOnline(ctx, "Уведомления недоступны офлайн")) return;
      const notifications = cloneNotifications(user.notifications);
      notifications.timezone = event.target.value;
      ctx.adapter.saveNotifications(user.id, notifications);
      return;
    }
    if (event.target.matches("[data-notification-quiet]")) {
      if (!guardOnline(ctx, "Уведомления недоступны офлайн")) return;
      const notifications = cloneNotifications(user.notifications);
      notifications.quietHours = Object.assign({}, notifications.quietHours || {}, { enabled: event.target.checked });
      ctx.adapter.saveNotifications(user.id, notifications);
      return;
    }
    if (event.target.matches("[data-notification-critical]")) {
      if (!guardOnline(ctx, "Уведомления недоступны офлайн")) return;
      const notifications = cloneNotifications(user.notifications);
      notifications.criticalAlerts = event.target.checked;
      ctx.adapter.saveNotifications(user.id, notifications);
      return;
    }
    if (event.target.matches("[data-appearance]")) {
      if (!guardOnline(ctx, "Изменение профиля недоступно офлайн")) return;
      const appearance = Object.assign({}, user.appearance || {}, { [event.target.dataset.appearance]: event.target.value });
      ctx.adapter.saveAppearance(user.id, appearance);
      return;
    }
    if (event.target.matches("[data-appearance-toggle]")) {
      if (!guardOnline(ctx, "Изменение профиля недоступно офлайн")) return;
      const key = event.target.dataset.appearanceToggle;
      const value = key === "contrast" ? (event.target.checked ? "high" : "normal") : (event.target.checked ? "reduced" : "normal");
      const appearance = Object.assign({}, user.appearance || {}, { [key]: value });
      ctx.adapter.saveAppearance(user.id, appearance);
      return;
    }
  }

  function handleAvatarFile(event, ctx) {
    const file = event.target.files && event.target.files[0];
    revokeAvatarUrl(ctx);
    ctx.avatarDataUrl = "";
    ctx.avatarError = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      ctx.avatarError = "Поддерживаются JPG, PNG или WebP.";
      setFieldError(ctx.root, "profile-avatar-file", ctx.avatarError);
      return;
    }
    if (file.size > 900 * 1024) {
      ctx.avatarError = "Файл слишком большой. Выберите изображение до 900 КБ.";
      setFieldError(ctx.root, "profile-avatar-file", ctx.avatarError);
      return;
    }
    ctx.avatarObjectUrl = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = () => {
      ctx.avatarDataUrl = String(reader.result || "");
      const preview = qs(ctx.root, "[data-avatar-preview]");
      if (preview) preview.innerHTML = `<img class="account-avatar-preview" src="${esc(ctx.avatarObjectUrl)}" alt="Предпросмотр аватара" />`;
    };
    reader.onerror = () => setFieldError(ctx.root, "profile-avatar-file", "Не удалось прочитать файл.");
    reader.readAsDataURL(file);
  }

  function revokeAvatarUrl(ctx) {
    if (ctx.avatarObjectUrl) URL.revokeObjectURL(ctx.avatarObjectUrl);
    ctx.avatarObjectUrl = "";
  }

  function cloneNotifications(source) {
    const fallback = {
      selectedTripId: "all",
      quietHours: { enabled: true, from: "22:00", to: "07:00" },
      timezone: "Europe/Moscow",
      criticalAlerts: true,
      onlySelectedTrip: false,
      matrix: {}
    };
    notificationEvents.forEach(([key]) => {
      fallback.matrix[key] = { app: true, telegram: false, email: false };
    });
    const next = Object.assign(fallback, JSON.parse(JSON.stringify(source || {})));
    next.matrix = Object.assign(fallback.matrix, next.matrix || {});
    return next;
  }

  function setTelegramState(ctx, user, state) {
    const patch = { state };
    if (state === "connected") {
      const trips = ctx.adapter.getAccessibleTrips(user.id);
      patch.username = user.telegram.username || "@travel_user";
      patch.connectedAt = user.telegram.connectedAt || new Date().toISOString();
      patch.selectedTripId = user.telegram.selectedTripId || (trips[0] && trips[0].id) || "";
    }
    ctx.adapter.updateConnection(user.id, "telegram", patch);
  }

  function setMailState(ctx, user, state) {
    const patch = { state };
    if (state === "connected") {
      patch.email = user.mail.email || user.email;
      patch.provider = user.mail.provider || "Gmail";
      patch.connectedAt = user.mail.connectedAt || new Date().toISOString();
    }
    ctx.adapter.updateConnection(user.id, "mail", patch);
  }

  function handleDev(type, value, ctx, renderFn) {
    if (type === "login") {
      ctx.loginScenario = value;
      toast(ctx, `Состояние проверки: ${value}`, "info");
    }
    if (type === "register") {
      ctx.registerScenario = value;
      toast(ctx, `Состояние проверки: ${value}`, "info");
    }
    if (type === "recovery") {
      ctx.recoveryScenario = value;
      if (value === "invalid") {
        ctx.recoveryStep = 3;
        ctx.recoveryToken = "invalid";
        ctx.recoveryEmail = "artem@example.test";
      }
      renderFn();
    }
    if (type === "invitation") {
      ctx.invitationScenario = value;
      renderFn();
    }
    const user = ctx.adapter.getCurrentUser();
    if (type === "telegram" && user) setTelegramState(ctx, user, value);
    if (type === "mail" && user) setMailState(ctx, user, value);
    if (type === "delete" && user) {
      if (value === "clearOrganizer") ctx.adapter.removeOrganizerBlocksForPreview(user.id);
      if (value === "reset") ctx.adapter.resetPreview();
    }
  }

  function goRoute(ctx, route) {
    if (route === "login") ctx.routes.goToLogin();
    else if (route === "register") ctx.routes.goToRegister();
    else if (route === "recovery") ctx.routes.goToRecovery();
    else if (route === "history") ctx.routes.goToHistory();
    else if (route === "profile") ctx.routes.goToProfile();
    else ctx.routes.goToHome();
  }

  function updateUrlSection(section) {
    if (!window.history || !window.history.replaceState) return;
    const url = new URL(window.location.href);
    url.searchParams.set("section", section);
    window.history.replaceState(null, "", url.toString());
  }

  function applyAppearance(ctx) {
    const user = ctx.adapter.getCurrentUser();
    const appearance = user && user.appearance ? user.appearance : {};
    const target = document.body;
    target.dataset.contrast = appearance.contrast || "normal";
    target.dataset.motion = appearance.motion || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "normal");
    target.dataset.density = appearance.density || "comfortable";
    target.dataset.fontScale = appearance.fontScale || "normal";
    target.dataset.theme = appearance.theme || "dark";
  }

  function accountPreviewTemplate(ctx) {
    const config = ctx.routes.getConfig ? ctx.routes.getConfig() : {};
    return `
      <section class="account-panel" data-od-id="account-preview-launcher">
        <button class="account-brand account-brand-button" type="button" data-route="home">${logo()}<span><span class="account-brand-name">Тревел-помощник</span><span class="account-brand-note">Launcher для проверки account-страниц</span></span></button>
        <div class="account-preview-grid">
          ${[
            ["login.html", "Вход", "Проверка авторизации"],
            ["register.html", "Регистрация", "Создание аккаунта"],
            ["password-recovery.html", "Восстановление", "Сброс пароля"],
            ["invitation.html?invitationId=invite-001", "Приглашение", "Неавторизованный сценарий"],
            ["invitation.html?invitationId=invite-001&auth=1&userId=invitee-001", "Приглашение с входом", "Принятие другим пользователем"],
            ["profile.html", "Профиль", "Глобальные настройки"]
          ].map(([href, title, text]) => `<a class="account-preview-card" href="${href}"><h3>${title}</h3><p>${text}</p></a>`).join("")}
        </div>
        <details class="account-dev-panel" open><summary>Параметры проверки</summary><div class="account-dev-panel-body"><span class="account-code">home: ${esc(config.home || "")}</span><span class="account-code">trip: ${esc(config.trip || "")}</span></div></details>
      </section>
    `;
  }

  function accountPageInit(rootElement, pageType, customAdapter, customRoutes) {
    if (!rootElement) return null;
    const ctx = createContext(rootElement, pageType, customAdapter, customRoutes);
    const template = {
      login: loginTemplate,
      register: registerTemplate,
      recovery: recoveryTemplate,
      invitation: invitationTemplate,
      profile: profileTemplate,
      preview: accountPreviewTemplate
    }[pageType] || accountPreviewTemplate;
    setupShared(ctx, template);
    render(ctx, template);
    return ctx;
  }

  function accountPageDestroy(rootElement) {
    const ctx = contexts.get(rootElement);
    if (!ctx) return;
    ctx.destroyed = true;
    closeModal(ctx, null, true);
    revokeAvatarUrl(ctx);
    if (typeof ctx.unsubscribe === "function") ctx.unsubscribe();
    ctx.cleanup.forEach((dispose) => dispose());
    ctx.timers.forEach((timer) => window.clearTimeout(timer));
    contexts.delete(rootElement);
  }

  window.accountPageInit = accountPageInit;
  window.accountPageDestroy = accountPageDestroy;
  window.loginInit = (root, adapter, routes) => accountPageInit(root, "login", adapter, routes);
  window.registerInit = (root, adapter, routes) => accountPageInit(root, "register", adapter, routes);
  window.recoveryInit = (root, adapter, routes) => accountPageInit(root, "recovery", adapter, routes);
  window.invitationInit = (root, adapter, routes) => accountPageInit(root, "invitation", adapter, routes);
  window.profileInit = (root, adapter, routes) => accountPageInit(root, "profile", adapter, routes);
  window.accountPreviewInit = (root, adapter, routes) => accountPageInit(root, "preview", adapter, routes);
}());

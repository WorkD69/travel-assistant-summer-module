/* app-shell.js — единая глобальная шапка и общий page-shell финальной сборки.
   Основан на шапке основы (trip-overview.html): логотип, уведомления, аватар,
   меню пользователя (Главная / История поездок / Профиль / Выйти). */
(function () {
  "use strict";

  let shellController = null;

  function getApp() { return window.TravelAppState || null; }
  function getState() { const app = getApp(); return (app && app.getState()) || {}; }

  function getSession(state) {
    return (state.accountPages && state.accountPages.session) || { isAuthenticated: false, userId: "" };
  }

  function getShellUser(state) {
    const session = getSession(state);
    const accountUsers = (state.accountPages && state.accountPages.users) || {};
    const users = state.users || {};
    return (session.userId && (accountUsers[session.userId] || users[session.userId])) || state.currentUser || {};
  }

  function displayName(user) {
    return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || "Пользователь";
  }

  function initialsOf(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "П";
    return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "П";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function applyDevOverride() {
    try {
      if (new URLSearchParams(window.location.search).get("env") === "development") {
        document.body.setAttribute("data-app-environment", "development");
      }
    } catch (error) { /* ignore */ }
  }

  function applyAppearance() {
    const state = getState();
    const user = getShellUser(state);
    const appearance = user.appearance || {};
    const rootEl = document.documentElement;
    rootEl.setAttribute("data-theme", appearance.theme || "dark");
    rootEl.setAttribute("data-contrast", appearance.contrast || "normal");
    rootEl.setAttribute("data-motion", appearance.motion || "full");
    rootEl.setAttribute("data-density", appearance.density || "normal");
    rootEl.setAttribute("data-font-scale", appearance.fontScale || "normal");
  }

  function tutuHeaderHtml(options, state) {
    const user = getShellUser(state);
    const name = displayName(user);
    return (
      '<header class="app-header tutu-app-header">' +
        '<a class="brand tutu-brand" href="home.html" data-shell-action="home" aria-label="Тревел-помощник — на Главную">' +
          '<img class="tutu-brand-logo" src="assets/icons/tutu-native/logo.svg" alt="tutu" />' +
        '</a>' +
        '<nav class="tutu-header-nav" aria-label="Основная навигация">' +
          '<a href="home.html">Это выгодно!</a>' +
          '<a href="home.html">Автопутешествия</a>' +
          '<a href="history.html" data-shell-action="go-history">Маршруты</a>' +
          '<a href="profile.html" data-shell-action="go-profile">Справочная</a>' +
          '<a href="home.html">Путеводитель</a>' +
        '</nav>' +
        '<div class="header-actions">' +
          '<button type="button" class="btn-icon tutu-favorite" data-shell-action="notifications" aria-label="Избранное">' +
            '<svg class="tutu-header-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.2-8 11-8 11Z"/></svg><span>Избранное</span>' +
          '</button>' +
          '<div class="dropdown">' +
            '<button type="button" class="btn-icon tutu-login" data-shell-action="user-menu" aria-haspopup="true" aria-expanded="false" aria-label="Меню пользователя: ' + escapeHtml(name) + '">' +
              '<svg class="tutu-header-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3M13 3h7v18h-7"/></svg><span>Войти</span>' +
            '</button>' +
            '<button type="button" class="btn-icon tutu-menu-toggle" data-shell-action="user-menu" aria-haspopup="true" aria-expanded="false" aria-label="Открыть меню пользователя">' +
              '<svg class="tutu-header-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>' +
            '</button>' +
            '<div class="dropdown-menu" data-shell-menu role="menu" aria-label="Меню пользователя">' +
              '<button type="button" class="dropdown-item" role="menuitem" data-shell-action="go-home">Главная</button>' +
              '<button type="button" class="dropdown-item" role="menuitem" data-shell-action="go-history">История поездок</button>' +
              '<button type="button" class="dropdown-item" role="menuitem" data-shell-action="go-profile">Профиль</button>' +
              '<hr class="dropdown-divider" />' +
              '<button type="button" class="dropdown-item danger" role="menuitem" data-shell-action="logout">Выйти</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</header>'
    );
  }

  function headerHtml(options, state) {
    if (options.variant === "tutu") return tutuHeaderHtml(options, state);
    const user = getShellUser(state);
    const name = displayName(user);
    const avatar = user.avatarDataUrl
      ? '<img src="' + escapeHtml(user.avatarDataUrl) + '" alt="" />'
      : escapeHtml(initialsOf(name));
    const section = options.section ? '<span class="shell-section-title">' + escapeHtml(options.section) + "</span>" : "";
    return (
      '<header class="app-header">' +
        '<a class="brand" href="home.html" data-shell-action="home" aria-label="Тревел-помощник — на Главную">' +
          '<span class="brand-mark" aria-hidden="true"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M12 3 4.5 7.2 12 11.4l7.5-4.2L12 3Z"/><path d="M4.5 7.2v8.4L12 20V11.4"/><path d="M19.5 7.2v8.4L12 20"/></svg></span>' +
          '<span class="brand-text">Тревел-помощник</span>' +
        "</a>" +
        section +
        '<div class="header-actions">' +
          '<button type="button" class="btn-icon notif-btn" data-shell-action="notifications" aria-label="Уведомления">' +
            '<svg class="icon" viewBox="0 0 24 24"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>' +
            '<span class="notif-dot" aria-hidden="true"></span>' +
          "</button>" +
          '<div class="dropdown">' +
            '<button type="button" class="btn-icon" data-shell-action="user-menu" aria-haspopup="true" aria-expanded="false" aria-label="Меню пользователя: ' + escapeHtml(name) + '">' +
              '<span class="avatar" data-shell-avatar>' + avatar + "</span>" +
            "</button>" +
            '<div class="dropdown-menu" data-shell-menu role="menu" aria-label="Меню пользователя">' +
              '<button type="button" class="dropdown-item" role="menuitem" data-shell-action="go-home">Главная</button>' +
              '<button type="button" class="dropdown-item" role="menuitem" data-shell-action="go-history">История поездок</button>' +
              '<button type="button" class="dropdown-item" role="menuitem" data-shell-action="go-profile">Профиль</button>' +
              '<hr class="dropdown-divider" />' +
              '<button type="button" class="dropdown-item danger" role="menuitem" data-shell-action="logout">Выйти</button>' +
            "</div>" +
          "</div>" +
        "</div>" +
      "</header>"
    );
  }

  function closeMenu(mount, restoreFocus) {
    const menu = mount.querySelector("[data-shell-menu]");
    const triggers = Array.from(mount.querySelectorAll('[data-shell-action="user-menu"]'));
    if (menu && menu.classList.contains("open")) {
      menu.classList.remove("open");
      triggers.forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
      if (restoreFocus && triggers[0]) triggers[0].focus();
    }
  }

  window.appShellToast = function (message) {
    let region = document.getElementById("app-shell-toast-region");
    if (!region) {
      region = document.createElement("div");
      region.id = "app-shell-toast-region";
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");
      document.body.appendChild(region);
    }
    const toast = document.createElement("div");
    toast.className = "shell-toast";
    toast.textContent = message;
    region.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3500);
  };

  window.appShellInit = function (options) {
    const opts = options || {};
    applyDevOverride();

    if (opts.requireAuth !== false) {
      const session = getSession(getState());
      if (!session.isAuthenticated) {
        const here = window.location.pathname.split("/").pop() + window.location.search;
        window.location.replace("login.html?returnUrl=" + encodeURIComponent(here));
        return false;
      }
    }

    let mount = document.getElementById("app-shell-header");
    if (!mount) {
      mount = document.createElement("div");
      mount.id = "app-shell-header";
      document.body.insertBefore(mount, document.body.firstChild);
    }

    if (shellController) shellController.abort();
    shellController = new AbortController();
    const signal = shellController.signal;

    mount.innerHTML = headerHtml(opts, getState());
    applyAppearance();

    try {
      const queuedToast = sessionStorage.getItem("travelAssistant.shellToast");
      if (queuedToast) {
        sessionStorage.removeItem("travelAssistant.shellToast");
        setTimeout(() => window.appShellToast(queuedToast), 40);
      }
    } catch (error) { /* best effort */ }

    mount.addEventListener("click", (event) => {
      const target = event.target.closest("[data-shell-action]");
      if (!target) return;
      const action = target.dataset.shellAction;
      if (action === "home" || action === "go-home") {
        event.preventDefault();
        window.AppRoutes.goToHome();
      } else if (action === "go-history") {
        event.preventDefault();
        window.AppRoutes.goToHistory();
      } else if (action === "go-profile") {
        event.preventDefault();
        window.AppRoutes.goToProfile();
      } else if (action === "logout") {
        window.AppRoutes.logout();
      } else if (action === "notifications") {
        window.appShellToast("Новых уведомлений нет");
      } else if (action === "user-menu") {
        const menu = mount.querySelector("[data-shell-menu]");
        const isOpen = menu.classList.toggle("open");
        mount.querySelectorAll('[data-shell-action="user-menu"]').forEach((trigger) => {
          trigger.setAttribute("aria-expanded", String(isOpen));
        });
        if (isOpen) {
          const first = menu.querySelector(".dropdown-item");
          if (first) first.focus();
        }
      }
    }, { signal });

    document.addEventListener("click", (event) => {
      if (!event.target.closest("#app-shell-header .dropdown")) closeMenu(mount, false);
    }, { signal });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu(mount, true);
    }, { signal });

    const app = getApp();
    if (app && typeof app.subscribe === "function") {
      const dispose = app.subscribe(() => {
        const state = getState();
        const user = getShellUser(state);
        const name = displayName(user);
        const avatarEl = mount.querySelector("[data-shell-avatar]");
        if (avatarEl) {
          avatarEl.innerHTML = user.avatarDataUrl
            ? '<img src="' + escapeHtml(user.avatarDataUrl) + '" alt="" />'
            : escapeHtml(initialsOf(name));
        }
        const trigger = mount.querySelector('[data-shell-action="user-menu"]');
        if (trigger) trigger.setAttribute("aria-label", "Меню пользователя: " + name);
        applyAppearance();
      });
      if (typeof dispose === "function") {
        signal.addEventListener("abort", () => dispose());
      }
    }

    return true;
  };

  window.appShellDestroy = function () {
    if (shellController) {
      shellController.abort();
      shellController = null;
    }
  };
})();

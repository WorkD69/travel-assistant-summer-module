/*
 * Real Telegram linking widget for the profile page.
 *
 * The SPA ships a demo Telegram card (fake code TG-482-916). This script adds a
 * REAL card at the top of the "Telegram" profile section that talks to our
 * backend: it shows the live link status and mints a one-time deep link
 * (https://t.me/<bot>?start=link_<token>) so the co-teammate's bot can bind the
 * Telegram account to this site account. Once linked, the bot can DM the user
 * their trip documents, SOS updates and organizer messages.
 */
(function () {
  "use strict";
  if (!window.TravelApi) return;

  var CARD_ID = "real-telegram-connect";

  function h(html) {
    var d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstChild;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function render(card, status) {
    var botUser = status && status.bot_username ? ("@" + status.bot_username) : "\u0431\u043e\u0442";
    if (status && status.linked) {
      card.innerHTML =
        '<span class="account-status account-status-success">\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0451\u043d (\u0440\u0435\u0430\u043b\u044c\u043d\u043e)</span>' +
        '<h3>Telegram \u043f\u0440\u0438\u0432\u044f\u0437\u0430\u043d</h3>' +
        '<p>\u0412\u0430\u0448 \u0430\u043a\u043a\u0430\u0443\u043d\u0442 \u0441\u0432\u044f\u0437\u0430\u043d \u0441 ' + esc(botUser) + '. \u0411\u043e\u0442 \u043c\u043e\u0436\u0435\u0442 \u043f\u0440\u0438\u0441\u044b\u043b\u0430\u0442\u044c \u0432\u0430\u043c \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b, SOS \u0438 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f \u043e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0442\u043e\u0440\u0430 \u0432 \u043b\u0438\u0447\u043d\u044b\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f.</p>' +
        '<div class="account-actions"><button class="account-button account-button-danger" type="button" data-tg-unlink>\u041e\u0442\u0432\u044f\u0437\u0430\u0442\u044c</button></div>';
      return;
    }
    card.innerHTML =
      '<span class="account-status">\u041d\u0435 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0451\u043d</span>' +
      '<h3>\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u044c Telegram</h3>' +
      '<p>\u041d\u0430\u0436\u043c\u0438\u0442\u0435 \u043a\u043d\u043e\u043f\u043a\u0443 \u043d\u0438\u0436\u0435 \u2014 \u043e\u0442\u043a\u0440\u043e\u0435\u0442\u0441\u044f ' + esc(botUser) + ' \u0441 \u043e\u0434\u043d\u043e\u0440\u0430\u0437\u043e\u0432\u043e\u0439 \u0441\u0441\u044b\u043b\u043a\u043e\u0439 \u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0438. \u041f\u043e\u0441\u043b\u0435 \u043a\u043e\u043c\u0430\u043d\u0434\u044b /start \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u044b \u0441\u0432\u044f\u0436\u0443\u0442\u0441\u044f.</p>' +
      '<div class="account-actions"><button class="account-button account-button-primary" type="button" data-tg-link>\u041f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u0441\u0441\u044b\u043b\u043a\u0443 \u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0438</button></div>' +
      '<div data-tg-link-out></div>';
  }

  function renderLink(out, data) {
    if (!data || !data.deep_link) {
      out.innerHTML = '<p class="account-error">\u0411\u043e\u0442 \u043d\u0435 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043d: \u0443\u043a\u0430\u0436\u0438\u0442\u0435 TELEGRAM_BOT_USERNAME \u0432 backend/.env.</p>';
      return;
    }
    out.innerHTML =
      '<p style="margin-top:12px"><a class="account-button account-button-primary" href="' + esc(data.deep_link) + '" target="_blank" rel="noopener">\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0431\u043e\u0442\u0430 \u0438 \u043f\u0440\u0438\u0432\u044f\u0437\u0430\u0442\u044c</a></p>' +
      '<p class="account-meta">\u0418\u043b\u0438 \u0441\u043a\u043e\u043f\u0438\u0440\u0443\u0439\u0442\u0435 \u0441\u0441\u044b\u043b\u043a\u0443 (\u0434\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 ' + esc(data.ttl_minutes || 10) + ' \u043c\u0438\u043d):</p>' +
      '<p class="account-code" style="word-break:break-all">' + esc(data.deep_link) + '</p>';
  }

  function mount(section) {
    if (section.querySelector("#" + CARD_ID)) return;
    var card = h('<div class="account-card" id="' + CARD_ID + '"></div>');
    // Insert the real card at the very top of the telegram section body.
    var panel = section.querySelector(".account-panel") || section;
    panel.insertBefore(card, panel.firstChild);
    card.innerHTML = '<p class="account-meta">\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0441\u0442\u0430\u0442\u0443\u0441\u0430 Telegram\u2026</p>';

    TravelApi.telegramStatus().then(function (s) { render(card, s); }).catch(function () {
      render(card, { linked: false });
    });

    card.addEventListener("click", function (e) {
      var linkBtn = e.target.closest("[data-tg-link]");
      if (linkBtn) {
        linkBtn.disabled = true;
        linkBtn.textContent = "\u0421\u043e\u0437\u0434\u0430\u0451\u043c \u0441\u0441\u044b\u043b\u043a\u0443\u2026";
        TravelApi.telegramLinkToken().then(function (data) {
          renderLink(card.querySelector("[data-tg-link-out]"), data);
          linkBtn.disabled = false;
          linkBtn.textContent = "\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0441\u0441\u044b\u043b\u043a\u0443";
        }).catch(function () {
          linkBtn.disabled = false;
          linkBtn.textContent = "\u041f\u043e\u043f\u0440\u043e\u0431\u043e\u0432\u0430\u0442\u044c \u0441\u043d\u043e\u0432\u0430";
        });
        return;
      }
      var unlinkBtn = e.target.closest("[data-tg-unlink]");
      if (unlinkBtn) {
        unlinkBtn.disabled = true;
        TravelApi.telegramUnlink().then(function () {
          render(card, { linked: false });
        }).catch(function () { unlinkBtn.disabled = false; });
      }
    });
  }

  function scan() {
    var section = document.querySelector('[data-od-id="profile-telegram-section"]');
    if (section) mount(section);
  }

  function start() {
    scan();
    var root = document.getElementById("profile-root") || document.body;
    var obs = new MutationObserver(function () { scan(); });
    obs.observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

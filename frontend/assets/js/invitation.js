(function invitationPage() {
  "use strict";
  var title = document.getElementById("invitation-title");
  var content = document.getElementById("invitation-content");
  var actions = document.getElementById("invitation-actions");
  var token = new URLSearchParams(window.location.search).get("token");
  var resolved = null;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function showError(message) {
    title.textContent = "Приглашение недоступно";
    content.innerHTML = '<p class="invitation-error">' + escapeHtml(message) + '</p>';
    actions.innerHTML = '<a class="invitation-button" href="index.html">На главную</a>';
  }

  function loginReturnUrl() {
    return window.location.pathname + window.location.search + window.location.hash;
  }

  async function accept() {
    var button = document.getElementById("invitation-accept");
    if (button) button.disabled = true;
    try {
      await window.TravelApi.ensureAuth();
    } catch (error) {
      window.location.replace("login.html?returnUrl=" + encodeURIComponent(loginReturnUrl()));
      return;
    }
    try {
      var result = await window.TravelApi.acceptInvitation(token);
      var trip = result.trip || (resolved && resolved.trip);
      title.textContent = "Приглашение принято";
      content.textContent = "Поездка добавлена в Ваш аккаунт.";
      actions.innerHTML = '<a class="invitation-button invitation-primary" href="trip-overview.html?tripId=' +
        encodeURIComponent(trip.id) + '">Открыть поездку</a>';
    } catch (error) {
      showError(error && error.message ? error.message : "Не удалось принять приглашение");
    }
  }

  async function boot() {
    if (!token) return showError("В ссылке отсутствует token.");
    try {
      var response = await window.TravelApi.resolveInvitation(token);
      resolved = response.invitation;
      title.textContent = "Вас пригласили в поездку";
      content.innerHTML = '<p><strong>' + escapeHtml(resolved.trip.title) + '</strong></p>' +
        '<p>' + escapeHtml(resolved.trip.route || "Маршрут уточняется") + '</p>' +
        '<p>Действует до: ' + escapeHtml(new Date(resolved.expiresAt).toLocaleString("ru-RU")) + '</p>' +
        '<p>Принять приглашение может пользователь ' + escapeHtml(resolved.email) + '.</p>';
      actions.innerHTML = '<button id="invitation-accept" class="invitation-button invitation-primary" type="button">Принять приглашение</button>';
      document.getElementById("invitation-accept").addEventListener("click", accept);
    } catch (error) {
      showError(error && error.message ? error.message : "Не удалось проверить приглашение");
    }
  }

  boot();
})();


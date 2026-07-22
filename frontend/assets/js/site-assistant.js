(function () {
  "use strict";

  const api = window.TravelAPI;
  const app = window.TravelAppState;
  if (!api || !api.trips || !app) return;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function context() {
    const state = app.getState() || {};
    const flow = state.coreFlow || {};
    const trip = state.trip || flow.trip || {};
    return { state, flow, tripId: trip.id, role: flow.role || trip.role || "participant" };
  }

  function panelHtml(role) {
    return `
      <section class="site-assistant" id="site-assistant" aria-labelledby="site-assistant-title">
        <header class="site-assistant__header">
          <div>
            <h3 id="site-assistant-title">AI-ассистент поездки</h3>
            <p>Ответы учитывают только доступные вам данные поездки.</p>
          </div>
          <span class="site-assistant__status" id="site-assistant-status" role="status">Загрузка…</span>
        </header>
        <div class="site-assistant__log" id="site-assistant-log" aria-live="polite"></div>
        <form class="site-assistant__composer" id="site-assistant-form">
          <label for="site-assistant-question">Ваш вопрос</label>
          <textarea id="site-assistant-question" maxlength="2000" rows="3" placeholder="Например: что изменилось в поездке после выбора Plan B?" required></textarea>
          <div class="site-assistant__actions">
            ${role === "organizer" ? '<button class="coreflow-button coreflow-button--secondary" id="site-assistant-plans" type="button">Сформировать 3 Plan B</button>' : ""}
            <button class="coreflow-button coreflow-button--primary" id="site-assistant-send" type="submit">Спросить</button>
          </div>
        </form>
      </section>`;
  }

  function addMessage(log, role, content, source) {
    const item = document.createElement("div");
    item.className = "site-assistant__message site-assistant__message--" + (role === "user" ? "user" : "assistant");
    item.innerHTML = `<p>${escapeHtml(content)}</p>${source ? `<small>${escapeHtml(source)}</small>` : ""}`;
    log.appendChild(item);
    log.scrollTop = log.scrollHeight;
  }

  function addNotice(log, content, tone) {
    const item = document.createElement("p");
    item.className = "site-assistant__notice" + (tone === "error" ? " is-error" : "");
    item.textContent = content;
    log.appendChild(item);
    log.scrollTop = log.scrollHeight;
  }

  async function init() {
    if (window.TravelSite && window.TravelSite.ready) await window.TravelSite.ready;
    const surface = document.getElementById("monitoring-surface");
    const current = context();
    if (!surface || !current.tripId || document.getElementById("site-assistant")) return;

    const host = document.createElement("div");
    host.className = "site-assistant-host";
    host.innerHTML = panelHtml(current.role);
    surface.insertAdjacentElement("afterend", host);

    const log = host.querySelector("#site-assistant-log");
    const form = host.querySelector("#site-assistant-form");
    const input = host.querySelector("#site-assistant-question");
    const send = host.querySelector("#site-assistant-send");
    const plans = host.querySelector("#site-assistant-plans");
    const status = host.querySelector("#site-assistant-status");

    try {
      const history = await api.trips.assistantHistory(current.tripId);
      (history.items || []).forEach(function (message) {
        addMessage(log, message.role, message.content);
      });
      status.textContent = "Готов";
      status.dataset.tone = "ok";
    } catch (error) {
      status.textContent = "Недоступен";
      status.dataset.tone = "error";
      addNotice(log, error && error.message ? error.message : "Не удалось загрузить историю.", "error");
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      const question = input.value.trim();
      if (!question) return input.focus();
      input.value = "";
      input.disabled = true;
      send.disabled = true;
      addMessage(log, "user", question);
      status.textContent = "Отвечает…";
      try {
        const response = await api.trips.askAssistant(current.tripId, question);
        addMessage(log, "assistant", response.answer, response.source === "groq" ? "AI provider" : "Безопасный резервный ответ");
        status.textContent = "Готов";
        status.dataset.tone = "ok";
      } catch (error) {
        addNotice(log, error && error.message ? error.message : "Не удалось получить ответ.", "error");
        status.textContent = "Ошибка";
        status.dataset.tone = "error";
      } finally {
        input.disabled = false;
        send.disabled = false;
        input.focus();
      }
    });

    if (plans && current.role === "organizer") {
      plans.addEventListener("click", async function () {
        const fresh = context();
        const signal = (fresh.flow.signals || []).find(function (item) {
          return item.serverBacked && item.status === "confirmed";
        });
        if (!signal) {
          addNotice(log, "Сначала подтвердите конкретное нарушение в мониторинге.", "error");
          return;
        }
        plans.disabled = true;
        status.textContent = "Формирует варианты…";
        try {
          const response = await api.trips.generatePlans(fresh.tripId, signal.id);
          const items = response.items || [];
          if (items.length !== 3 || new Set(items.map(function (item) { return item.strategy; })).size !== 3) {
            throw new Error("Сервер не вернул ровно три разные стратегии.");
          }
          addNotice(log, "Три варианта Plan B готовы. Сравните и выберите один в блоке мониторинга.");
          if (window.TravelSite && typeof window.TravelSite.hydrate === "function") await window.TravelSite.hydrate();
          status.textContent = "Готов";
          status.dataset.tone = "ok";
        } catch (error) {
          addNotice(log, error && error.message ? error.message : "Не удалось сформировать Plan B.", "error");
          status.textContent = "Ошибка";
          status.dataset.tone = "error";
        } finally {
          plans.disabled = false;
        }
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

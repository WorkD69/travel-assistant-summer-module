(function () {
  "use strict";

  const modes = [
    { id: "hotels", label: "Отели", icon: "hotels" },
    { id: "flights", label: "Авиабилеты", icon: "flights", active: true },
    { id: "rail", label: "Ж/д билеты", icon: "rail" },
    { id: "buses", label: "Автобусы", icon: "buses" },
    { id: "electric", label: "Электрички", icon: "electric" },
    { id: "tours", label: "Туры", icon: "tours", badge: "Кешбэк до 7%" },
    { id: "car", label: "Аренда авто", icon: "car" },
    { id: "jarvel", label: "Джарвел", icon: "jarvel", badge: "ИИ-помощник" }
  ];

  let activeController = null;

  function modeHtml(mode) {
    return `
      <button class="tutu-mode${mode.active ? " is-active" : ""}" type="button" role="radio"
        aria-checked="${mode.active ? "true" : "false"}" data-tutu-mode="${mode.id}">
        ${mode.badge ? `<span class="tutu-mode-badge">${mode.badge}</span>` : ""}
        <span class="tutu-mode-icon" aria-hidden="true"><img src="assets/icons/tutu-native/${mode.icon}.svg" alt="" /></span>
        <span class="tutu-mode-label">${mode.label}</span>
      </button>`;
  }

  function shellHtml() {
    return `
      <section class="tutu-native-hero" aria-labelledby="tutu-native-heading">
        <div class="tutu-native-container">
          <div class="tutu-promo" aria-label="Специальное предложение">
            <span class="tutu-promo-plane" aria-hidden="true"><svg viewBox="0 0 48 28"><path d="M4 18 21 14 14 5l5-2 11 8 9-2c3-1 5 0 6 2s-1 4-4 5l-9 2-5 12-5 1 2-11-17 4-3-6Z"/></svg></span>
            <strong>Выгодные авиабилеты</strong>
            <span class="tutu-promo-ticket" aria-hidden="true">%</span>
          </div>

          <h1 id="tutu-native-heading">Путешествуйте выгодно</h1>

          <div class="tutu-stats" aria-label="О сервисе">
            <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 8 3v6c0 5-3.4 9-8 11-4.6-2-8-6-8-11V5l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>22 года работаем для вас</span>
            <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21v-5l-3-3 2-5 3 3 1-5-2-2 2-2 3 4-1 5 4-1 3 3-1 2-5-2-1 3v5"/></svg>42 млн путешествуют с нами</span>
            <span class="tutu-rating"><b aria-hidden="true">★★★★★</b>4,84 — рейтинг приложения</span>
          </div>

          <div class="tutu-modes" role="radiogroup" aria-label="Вид путешествия">
            ${modes.map(modeHtml).join("")}
          </div>

          <form class="tutu-search-form" aria-label="Поиск поездок" novalidate>
            <div class="tutu-route-group">
              <label class="tutu-search-field tutu-field-origin" for="tutu-origin">
                <span>Откуда</span>
                <input id="tutu-origin" name="origin" autocomplete="off" placeholder=" " />
              </label>
              <button class="tutu-swap" type="button" aria-label="Поменять местами отправление и прибытие" data-tutu-action="swap">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 3-3m-3 3 3 3M7 7h10M17 17l-3 3m3-3-3-3m3 3H7"/></svg>
              </button>
              <label class="tutu-search-field tutu-field-destination" for="tutu-destination">
                <span>Куда</span>
                <input id="tutu-destination" name="destination" autocomplete="off" placeholder=" " />
              </label>
            </div>

            <div class="tutu-date-group">
              <label class="tutu-search-field tutu-field-date" for="tutu-outbound">
                <span>Когда</span>
                <input id="tutu-outbound" name="outbound" autocomplete="off" inputmode="none" placeholder=" " />
              </label>
              <label class="tutu-search-field tutu-field-date" for="tutu-return">
                <span>Обратно</span>
                <input id="tutu-return" name="return" autocomplete="off" inputmode="none" placeholder=" " />
              </label>
            </div>

            <label class="tutu-search-field tutu-field-passengers" for="tutu-passengers">
              <span>Кто летит</span>
              <input id="tutu-passengers" name="passengers" value="1 пассажир, эконом" readonly />
            </label>

            <button class="tutu-search-submit" type="submit">Найти авиабилеты</button>
            <p class="tutu-search-status" aria-live="polite"></p>
          </form>

          <div class="tutu-search-hints" aria-label="Популярные направления">
            <span class="tutu-origin-hints"><button type="button" data-tutu-fill="origin" data-value="Москва">Москва</button><button type="button" data-tutu-fill="origin" data-value="Санкт-Петербург">Санкт-Петербург</button></span>
            <span class="tutu-destination-hints"><button type="button" data-tutu-fill="destination" data-value="Санкт-Петербург">Санкт-Петербург</button><button type="button" data-tutu-fill="destination" data-value="Москва">Москва</button></span>
            <span class="tutu-date-hints"><button type="button" data-tutu-fill="outbound" data-value="Сегодня">Сегодня</button><button type="button" data-tutu-fill="outbound" data-value="Завтра">Завтра</button></span>
            <span class="tutu-return-hints"><button type="button" data-tutu-fill="return" data-value="Завтра">Завтра</button><button type="button" data-tutu-fill="return" data-value="Послезавтра">Послезавтра</button></span>
            <label class="tutu-hotel-toggle"><span>Искать отели в новой вкладке</span><input type="checkbox" /><i aria-hidden="true"></i></label>
          </div>
        </div>
      </section>
      <section class="tutu-native-deal" aria-label="Предложение дня">
        <div class="tutu-native-deal-inner">
          <div><h2>Уронили цены на авиабилеты</h2><p>Ищите выгодные перелёты в Анталью, Батуми, Сухум и другие города</p><button type="button">Найти билеты</button></div>
          <div class="tutu-native-deal-art" aria-hidden="true"><span>МОЩНАЯ</span><b>РАСПРОДАЖА<br />БИЛЕТОВ НА МОРЕ</b></div>
        </div>
        <div class="tutu-native-deal-proof"><h2>Это выгодно!</h2><p>Цены ниже средних за последние 10 дней.</p></div>
      </section>`;
  }

  function value(root, name) {
    return root.querySelector(`[name="${name}"]`)?.value.trim() || "";
  }

  function clearErrors(root) {
    root.querySelectorAll('[aria-invalid="true"]').forEach((field) => field.removeAttribute("aria-invalid"));
  }

  window.tutuSearchShellInit = function (root) {
    if (!root) return false;
    if (activeController) activeController.abort();
    activeController = new AbortController();
    const signal = activeController.signal;
    root.innerHTML = shellHtml();

    root.addEventListener("click", (event) => {
      const mode = event.target.closest("[data-tutu-mode]");
      if (mode) {
        root.querySelectorAll("[data-tutu-mode]").forEach((item) => {
          const selected = item === mode;
          item.classList.toggle("is-active", selected);
          item.setAttribute("aria-checked", String(selected));
        });
        return;
      }

      const swap = event.target.closest('[data-tutu-action="swap"]');
      if (swap) {
        const origin = root.querySelector('[name="origin"]');
        const destination = root.querySelector('[name="destination"]');
        [origin.value, destination.value] = [destination.value, origin.value];
        origin.focus();
        return;
      }

      const fill = event.target.closest("[data-tutu-fill]");
      if (fill) {
        const input = root.querySelector(`[name="${fill.dataset.tutuFill}"]`);
        if (input) {
          input.value = fill.dataset.value || "";
          input.focus();
        }
      }
    }, { signal });

    const form = root.querySelector(".tutu-search-form");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      clearErrors(root);
      const missing = ["origin", "destination"].find((name) => !value(root, name));
      const status = root.querySelector(".tutu-search-status");
      if (missing) {
        const input = root.querySelector(`[name="${missing}"]`);
        input.setAttribute("aria-invalid", "true");
        status.textContent = missing === "origin" ? "Укажите город отправления" : "Укажите город назначения";
        input.focus();
        return;
      }

      const selectedMode = root.querySelector('[data-tutu-mode][aria-checked="true"]')?.dataset.tutuMode || "flights";
      const detail = {
        mode: selectedMode,
        origin: value(root, "origin"),
        destination: value(root, "destination"),
        outbound: value(root, "outbound"),
        returnDate: value(root, "return"),
        passengers: value(root, "passengers")
      };
      root.dispatchEvent(new CustomEvent("tutu-native:search", { bubbles: true, detail }));
      status.textContent = "Параметры поиска готовы. Результаты появятся после подключения TransportOption.";
    }, { signal });

    return true;
  };

  window.tutuSearchShellDestroy = function () {
    if (activeController) activeController.abort();
    activeController = null;
  };
})();

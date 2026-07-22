(function () {
  "use strict";

  const api = window.TravelAPI;
  const states = new WeakMap();
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);

  function announce(state, message, code) {
    state.status.textContent = message;
    state.status.dataset.state = code || "";
  }

  function close(state) {
    state.list.hidden = true;
    state.activeIndex = -1;
    state.input.removeAttribute("aria-activedescendant");
  }

  function emitSelection(state, selection) {
    state.input.dispatchEvent(new CustomEvent("travel:city-selected", {
      bubbles: true,
      detail: { field: state.input.dataset.cityField || state.input.dataset.field || state.input.id, selection }
    }));
  }

  function selectItem(state, index) {
    const item = state.items[index];
    if (!item) return;
    const selection = {
      name: item.name,
      canonicalName: item.name,
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      source: "nominatim"
    };
    state.input.value = item.name;
    state.input.dataset.citySelection = JSON.stringify(selection);
    close(state);
    announce(state, "Город подтверждён", "confirmed");
    emitSelection(state, selection);
  }

  function setActive(state, index) {
    if (!state.items.length) return;
    state.activeIndex = (index + state.items.length) % state.items.length;
    state.list.querySelectorAll('[role="option"]').forEach((option, optionIndex) => {
      option.setAttribute("aria-selected", String(optionIndex === state.activeIndex));
    });
    const active = state.list.querySelector(`[data-city-index="${state.activeIndex}"]`);
    if (active) {
      state.input.setAttribute("aria-activedescendant", active.id);
      active.scrollIntoView({ block: "nearest" });
    }
  }

  function render(state, items) {
    state.items = items;
    state.activeIndex = -1;
    if (!items.length) {
      close(state);
      announce(state, "Город не найден", "city_not_found");
      return;
    }
    state.list.innerHTML = items.map((item, index) => (
      `<button type="button" role="option" id="${state.list.id}-option-${index}" ` +
      `data-city-index="${index}" aria-selected="false">${esc(item.name)}</button>`
    )).join("");
    state.list.hidden = false;
    announce(state, `Найдено вариантов: ${items.length}`, "ready");
  }

  async function search(state, query) {
    state.controller?.abort();
    state.controller = new AbortController();
    announce(state, "Ищем город…", "loading");
    try {
      const result = await api.geo.search(query, state.controller.signal);
      if (state.input.value.trim() !== query) return;
      render(state, Array.isArray(result.items) ? result.items : []);
    } catch (error) {
      if (error?.name === "AbortError") return;
      close(state);
      announce(state, "Сервис городов временно недоступен", "provider_unavailable");
    }
  }

  function onInput(state) {
    const query = state.input.value.trim();
    delete state.input.dataset.citySelection;
    emitSelection(state, null);
    clearTimeout(state.timer);
    state.controller?.abort();
    if (query.length < 2) {
      close(state);
      announce(state, "Введите минимум 2 символа", "idle");
      return;
    }
    state.timer = setTimeout(() => search(state, query), 300);
  }

  function onKeydown(state, event) {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive(state, state.activeIndex + 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(state, state.activeIndex - 1); }
    else if (event.key === "Enter" && state.activeIndex >= 0) { event.preventDefault(); selectItem(state, state.activeIndex); }
    else if (event.key === "Escape") close(state);
  }

  function bind(input) {
    if (!api?.geo || states.has(input)) return;
    const list = document.createElement("div");
    const status = document.createElement("span");
    list.id = `city-options-${Math.random().toString(36).slice(2, 9)}`;
    list.className = "city-autocomplete-list";
    list.setAttribute("role", "listbox");
    list.hidden = true;
    status.className = "city-autocomplete-status";
    status.setAttribute("role", "status");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", list.id);
    input.insertAdjacentElement("afterend", list);
    list.insertAdjacentElement("afterend", status);
    const state = { input, list, status, items: [], activeIndex: -1, timer: null, controller: null };
    states.set(input, state);
    input.addEventListener("input", () => onInput(state));
    input.addEventListener("keydown", (event) => onKeydown(state, event));
    list.addEventListener("click", (event) => {
      const option = event.target.closest("[data-city-index]");
      if (option) selectItem(state, Number(option.dataset.cityIndex));
    });
    announce(state, input.dataset.citySelection ? "Город подтверждён" : "Начните вводить город", input.dataset.citySelection ? "confirmed" : "idle");
  }

  function scan(root) {
    if (root.matches?.("[data-city-autocomplete]")) bind(root);
    root.querySelectorAll?.("[data-city-autocomplete]").forEach(bind);
  }

  scan(document);
  new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
    if (node.nodeType === 1) scan(node);
  }))).observe(document.documentElement, { childList: true, subtree: true });
})();

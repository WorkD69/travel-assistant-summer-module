(function () {
  "use strict";

  const app = window.TravelAppState;
  const api = window.TravelAPI;
  const runtime = { maps: [], signature: "", points: [], weatherLoading: false };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);

  function stateLabel(code) {
    return {
      loading: "Загрузка актуального маршрута…",
      ready: "Интерактивная карта",
      partial_geocoding: "Часть городов не удалось найти",
      city_not_found: "Города маршрута не найдены",
      provider_unavailable: "Картографический сервис недоступен",
      offline_fallback: "Офлайн-схема маршрута"
    }[code] || code;
  }

  function setMapState(container, code) {
    container.dataset.mapState = code;
    const status = container.querySelector(".route-map-state");
    if (status) status.textContent = stateLabel(code);
    const fallback = container.querySelector(".route-map-fallback");
    if (fallback) fallback.hidden = code === "ready" || code === "partial_geocoding";
  }

  function removeMaps() {
    runtime.maps.forEach((map) => map.remove());
    runtime.maps = [];
  }

  function cleanLegacyMapContainer(id) {
    const current = document.getElementById(id);
    if (!current) return null;
    const clean = current.cloneNode(true);
    current.replaceWith(clean);
    return clean;
  }

  function mapShell(container) {
    container.innerHTML = [
      '<img class="route-map-fallback" src="assets/route-preview.png" alt="Офлайн-схема маршрута" />',
      '<div class="route-live-map" aria-hidden="true"></div>',
      '<span class="route-map-state" role="status">Загрузка актуального маршрута…</span>'
    ].join("");
    setMapState(container, "loading");
    return container.querySelector(".route-live-map");
  }

  function addTiles(map, container) {
    let switched = false;
    const carto = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(map);
    carto.once("tileload", () => setMapState(container, container.dataset.partial === "true" ? "partial_geocoding" : "ready"));
    carto.on("tileerror", () => {
      if (switched) return;
      switched = true;
      map.removeLayer(carto);
      const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
      osm.once("tileload", () => setMapState(container, container.dataset.partial === "true" ? "partial_geocoding" : "ready"));
      osm.on("tileerror", () => setMapState(container, navigator.onLine ? "provider_unavailable" : "offline_fallback"));
    });
  }

  function createMap(container, points, compact, partial) {
    const node = mapShell(container);
    container.dataset.partial = String(partial);
    if (!window.L || points.length < 2) {
      setMapState(container, points.length ? "partial_geocoding" : "city_not_found");
      return null;
    }
    const map = L.map(node, { zoomControl: !compact, dragging: true, scrollWheelZoom: !compact });
    addTiles(map, container);
    const coordinates = points.map((point) => [Number(point.latitude), Number(point.longitude)]);
    points.forEach((point, index) => {
      const icon = L.divIcon({ className: "", html: `<span class="route-point-marker">${index + 1}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      L.marker(coordinates[index], { icon, keyboard: true }).addTo(map).bindPopup(`<strong>${esc(point.name)}</strong><br>${index + 1}-я точка маршрута`);
      if (index > 0) {
        const previous = coordinates[index - 1];
        const current = coordinates[index];
        L.marker([(previous[0] + current[0]) / 2, (previous[1] + current[1]) / 2], {
          interactive: false,
          icon: L.divIcon({ className: "", html: '<span class="route-direction-marker">→</span>', iconSize: [20, 20] })
        }).addTo(map);
      }
    });
    L.polyline(coordinates, { color: "#315efb", weight: compact ? 3 : 4, opacity: 0.86 }).addTo(map);
    map.fitBounds(L.latLngBounds(coordinates), { padding: compact ? [18, 18] : [42, 42], maxZoom: compact ? 5 : 8 });
    runtime.maps.push(map);
    return map;
  }

  function splitLegacyRoute(route) {
    return String(route || "").split(/\s*(?:→|->|—)\s*/).map((name) => name.trim()).filter(Boolean).slice(0, 12);
  }

  async function routePointsFor(trip) {
    const persisted = Array.isArray(trip?.routePoints) ? trip.routePoints.filter((point) => (
      Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))
    )).sort((left, right) => Number(left.sortOrder) - Number(right.sortOrder)) : [];
    if (persisted.length >= 2) return { points: persisted, partial: false };
    const names = splitLegacyRoute(trip?.route);
    if (names.length < 2) return { points: [], partial: false };
    const settled = await Promise.allSettled(names.map(async (name, sortOrder) => {
      const result = await api.geo.search(name);
      const found = result.items?.[0];
      return found ? { ...found, canonicalName: found.name, sortOrder, source: "nominatim" } : null;
    }));
    const points = settled.map((result) => result.status === "fulfilled" ? result.value : null).filter(Boolean);
    return { points, partial: points.length !== names.length };
  }

  function eventOrder(left, right) {
    const leftOrder = Number.isInteger(left.sortOrder) ? left.sortOrder : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isInteger(right.sortOrder) ? right.sortOrder : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || new Date(left.startsAt) - new Date(right.startsAt);
  }

  function eventTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  function eventMeta(event) {
    return [event.departure, event.arrival].filter(Boolean).join(" → ") || event.detail || event.type || "Событие поездки";
  }

  function renderTimelines(events) {
    const sorted = (events || []).slice().sort(eventOrder);
    const compact = document.getElementById("overview-route-timeline");
    const full = document.getElementById("route-full-timeline-items");
    if (compact) compact.innerHTML = (sorted.slice(0, 5).map((event, index) => `
      <li class="timeline-item"><span class="timeline-time mono">${esc(eventTime(event.startsAt))}</span>
      <div class="timeline-rail"><span class="timeline-dot ${index === 0 ? "next" : ""}"></span><span class="timeline-line"></span></div>
      <div class="timeline-content"><p class="timeline-event-title">${esc(event.title)}</p><p class="timeline-event-sub">${esc(eventMeta(event))}</p></div></li>
    `).join("") || '<li class="timeline-item"><div class="timeline-content"><p class="timeline-event-title">События маршрута пока не добавлены</p></div></li>');
    if (full) full.innerHTML = (sorted.map((event) => `
      <article class="route-event-card"><time class="route-event-time">${esc(eventTime(event.startsAt))}</time><div>
      <h3 class="route-event-title">${esc(event.title)}</h3><div class="route-event-meta">
      <span>Откуда<strong>${esc(event.departure || "—")}</strong></span><span>Куда<strong>${esc(event.arrival || "—")}</strong></span>
      <span>Тип<strong>${esc(event.type || "other")}</strong></span><span>Статус<strong>${esc(event.status || "scheduled")}</strong></span></div>
      <div class="route-event-bottom">${event.reference ? `<span class="badge badge-info">${esc(event.reference)}</span>` : ""}
      <span class="route-source">Источник: ${esc(event.source || "маршрут поездки")}</span></div></div></article>
    `).join("") || '<div class="card"><div class="card-body">События маршрута пока не добавлены.</div></div>');
  }

  function weatherCard(point, weather) {
    const forecast = (weather.forecast || []).map((day) => `<span>${esc(day.date.slice(5))}: ${Math.round(day.minC)}…${Math.round(day.maxC)}°</span>`).join("");
    const temperature = Number(weather.current.temperatureC);
    return `<article class="weather-card"><p class="weather-city">${esc(point.name)}</p>
      <p class="weather-temp mono">${temperature > 0 ? "+" : ""}${Math.round(temperature)}°</p>
      <p class="weather-desc">${esc(weather.current.description)}, ветер ${esc(weather.current.windKph)} км/ч · влажность ${esc(weather.current.humidityPercent)}%</p>
      <div class="weather-forecast">${forecast}</div></article>`;
  }

  async function renderWeather(points, refresh) {
    if (runtime.weatherLoading) return;
    runtime.weatherLoading = true;
    const grid = document.getElementById("route-weather");
    const updated = document.getElementById("route-weather-updated");
    if (grid) grid.innerHTML = '<div class="weather-card"><p class="weather-city">Загрузка погоды…</p></div>';
    try {
      const settled = await Promise.allSettled(points.map((point) => api.geo.weather(point.latitude, point.longitude, refresh)));
      const rows = settled.map((result, index) => result.status === "fulfilled" ? { point: points[index], weather: result.value } : null).filter(Boolean);
      if (grid) grid.innerHTML = rows.map((row) => weatherCard(row.point, row.weather)).join("") || '<div class="weather-card"><p class="weather-city">Погода временно недоступна</p></div>';
      const latest = rows.map((row) => row.weather.fetchedAt).sort().at(-1);
      if (updated) updated.textContent = latest
        ? `Open-Meteo · обновлено ${new Date(latest).toLocaleString("ru-RU")}${rows.length < points.length ? " · часть городов недоступна" : ""}`
        : "Open-Meteo временно недоступен";
    } finally {
      runtime.weatherLoading = false;
    }
  }

  async function render(state, force) {
    const trip = state?.trip;
    if (!trip?.id || state.accessState === "denied") return;
    const events = Array.isArray(trip.segments) ? trip.segments : [];
    const signature = JSON.stringify([trip.id, trip.route, trip.routePoints, events.map((event) => [event.id, event.sortOrder, event.startsAt])]);
    if (!force && signature === runtime.signature) return;
    runtime.signature = signature;
    renderTimelines(events);
    const resolved = await routePointsFor(trip);
    runtime.points = resolved.points;
    removeMaps();
    const full = cleanLegacyMapContainer("route-map-viewport");
    const compact = document.getElementById("overview-route-map");
    if (full) createMap(full, resolved.points, false, resolved.partial);
    if (compact) createMap(compact, resolved.points, true, resolved.partial);
    if (resolved.points.length) await renderWeather(resolved.points, false);
  }

  async function start() {
    if (!app || !api?.geo) return;
    const siteReady = window.TravelSite && window.TravelSite.ready;
    await (siteReady || Promise.resolve());
    await render(app.getState(), true);
    app.subscribe((state, changedKeys) => {
      if (changedKeys.includes("trip") || changedKeys.includes("networkState")) render(state, false);
    });
    document.getElementById("tab-route")?.addEventListener("click", () => requestAnimationFrame(() => runtime.maps.forEach((map) => map.invalidateSize())));
    document.getElementById("route-weather-refresh")?.addEventListener("click", () => renderWeather(runtime.points, true));
    window.addEventListener("online", () => render(app.getState(), true));
    window.addEventListener("offline", () => document.querySelectorAll("[data-map-state]").forEach((node) => setMapState(node, "offline_fallback")));
  }

  start().catch(() => {
    document.querySelectorAll("#route-map-viewport, #overview-route-map").forEach((node) => setMapState(node, navigator.onLine ? "provider_unavailable" : "offline_fallback"));
  });
})();

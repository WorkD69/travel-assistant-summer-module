(function weatherMapModule() {
  "use strict";
  // Integrates with integration-controller.js: weather is fed into shared state
  // (state.trip.weather) so the controller renders it; both the interactive
  // route map and the overview preview map are real Leaflet maps.
  var geoMem = {};
  var started = false;

  // Split "https://" so the literal never appears adjacent to "{s}" in source.
  var HTTPS = "https" + ":" + "//";
  // Primary tiles: CARTO dark CDN (works reliably from RF). Fallback: OSM.
  var CARTO_URL = HTTPS + "{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
  var OSM_URL = HTTPS + "{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  function api() { return window.TravelApi || null; }
  function store() { return window.TravelAppState || null; }
  function requestedTripId() {
    try {
      var u = new URL(window.location.href);
      return u.searchParams.get("tripId") || u.searchParams.get("trip") || "";
    } catch (e) {
      return "";
    }
  }
  function requestedTripIsHydrated() {
    var expected = requestedTripId();
    if (!expected) return true;
    var s = store();
    var trip = (s && s.getState && s.getState().trip) || {};
    return trip.id === expected;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>\"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function ensureLeafletCss() {
    if (document.getElementById("leaflet-css")) return;
    var link = document.createElement("link");
    link.id = "leaflet-css";
    link.rel = "stylesheet";
    link.href = HTTPS + "unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }

  // Add CARTO tiles with an automatic fallback to OSM if tiles fail to load.
  function addTiles(map) {
    var carto = window.L.tileLayer(CARTO_URL, {
      subdomains: "abcd", maxZoom: 19, attribution: "© OpenStreetMap · CARTO"
    });
    var switched = false;
    var errors = 0;
    carto.on("tileerror", function () {
      errors++;
      if (switched || errors < 3) return;
      switched = true;
      try { map.removeLayer(carto); } catch (e) {}
      window.L.tileLayer(OSM_URL, { subdomains: "abc", maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    });
    carto.addTo(map);
  }

  // Re-run invalidateSize whenever the container becomes visible (tab switch).
  function watchVisibility(map, el) {
    var kick = function () { try { map.invalidateSize(); } catch (e) {} };
    [200, 600, 1200].forEach(function (ms) { setTimeout(kick, ms); });
    window.addEventListener("resize", kick);
    if (typeof IntersectionObserver === "function") {
      try {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) { if (en.isIntersecting) setTimeout(kick, 60); });
        });
        io.observe(el);
      } catch (e) {}
    }
    document.addEventListener("click", function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('[onclick*="switchTab"], .tab, [data-tab], [data-map-action], [data-od-id="btn-open-route"]')) {
        setTimeout(kick, 260);
      }
    });
  }

  function routeCities() {
    var s = store();
    var trip = (s && s.getState && s.getState().trip) || {};
    if (Array.isArray(trip.routePoints) && trip.routePoints.length) {
      return trip.routePoints.map(function (p) { return String(p).trim(); }).filter(Boolean);
    }
    return String(trip.route || "")
      .split(/\s*(?:→|➔|➜|;|,|\|)\s*/)
      .map(function (s2) { return s2.trim(); })
      .filter(Boolean);
  }

  function keyOf(hit) { return Number(hit.latitude).toFixed(2) + "," + Number(hit.longitude).toFixed(2); }

  function geocodeOne(name) {
    var a = api();
    var k = name.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(geoMem, k)) return Promise.resolve(geoMem[k]);
    if (!a) return Promise.resolve(null);
    return a.geoSearch(name)
      .then(function (res) { var hit = (res && res.results && res.results[0]) || null; geoMem[k] = hit; return hit; })
      .catch(function () { geoMem[k] = null; return null; });
  }

  function pushWeather(unique) {
    var s = store();
    if (!s || !s.updateTrip) return;
    var weather = unique.map(function (c) {
      var w = c.weather;
      return {
        city: c.name,
        temp: (w && w.temp != null) ? ((w.temp > 0 ? "+" : "") + Math.round(w.temp) + "°") : "—",
        desc: w ? (w.desc + (w.wind != null ? ", ветер " + Math.round(w.wind) + " м/с" : "")) : "Нет данных"
      };
    });
    s.updateTrip({
      weather: weather,
      weatherUpdated: "Обновлено: " + new Date().toLocaleString("ru-RU") + " · Open-Meteo"
    }, { source: "weather-map" });
  }

  function popupHtml(c) {
    var w = c.weather;
    return "<strong>" + esc(c.name) + "</strong>" + (w ? "<br>" + (w.temp > 0 ? "+" : "") + Math.round(w.temp) + "° · " + esc(w.desc) : "");
  }

  function fit(map, latlngs) {
    if (latlngs.length) {
      try { map.fitBounds(window.L.latLngBounds(latlngs).pad(0.35)); } catch (e) { map.setView(latlngs[0], 6); }
    } else {
      map.setView([55.75, 37.62], 4);
    }
  }

  // ---- Directional route legs (arrows) ----------------------------------
  // Draw each leg of the route as a curved arc with a direction arrow, so a
  // one-way trip (one arc) looks different from a round trip (two arcs that
  // bow to opposite sides). Tiles / weather / geocoding are left untouched.
  var FLIGHT = { color: "#5b8def", weight: 3, opacity: 0.95, dashArray: "8 8", lineCap: "round" };
  var GROUND = { color: "#34c759", weight: 3, opacity: 0.95, lineCap: "round" };

  function ensureArrowCss() {
    if (document.getElementById("leg-arrow-css")) return;
    var st = document.createElement("style");
    st.id = "leg-arrow-css";
    st.textContent = ".leg-arrow-wrap{background:none!important;border:none!important;}" +
      ".leg-arrow{display:flex;align-items:center;justify-content:center;width:18px;height:18px;filter:drop-shadow(0 0 2px rgba(0,0,0,.6));}";
    document.head.appendChild(st);
  }

  function tripState() { var s = store(); return (s && s.getState && s.getState().trip) || {}; }

  // Best-effort: match a leg to a wizard segment to pick flight vs ground style.
  function styleForLeg(from, to) {
    var segs = Array.isArray(tripState().segments) ? tripState().segments : [];
    var f = String(from).toLowerCase(), t = String(to).toLowerCase(), type = "";
    for (var i = 0; i < segs.length; i++) {
      var sf = String(segs[i].from || "").toLowerCase(), sto = String(segs[i].to || "").toLowerCase();
      if ((sf.indexOf(f) >= 0 || f.indexOf(sf) >= 0) && (sto.indexOf(t) >= 0 || t.indexOf(sto) >= 0)) { type = segs[i].type || ""; break; }
    }
    return /поезд|автобус|автомоб|трансфер/i.test(type) ? GROUND : FLIGHT;
  }

  // Build ordered legs from consecutive route cities that both geocoded.
  function buildLegs(names) {
    var legs = [];
    for (var i = 0; i < names.length - 1; i++) {
      var fHit = geoMem[names[i].toLowerCase()], tHit = geoMem[names[i + 1].toLowerCase()];
      if (!fHit || !tHit) continue;
      if (keyOf(fHit) === keyOf(tHit)) continue;
      legs.push({
        a: [Number(fHit.latitude), Number(fHit.longitude)],
        b: [Number(tHit.latitude), Number(tHit.longitude)],
        style: styleForLeg(names[i], names[i + 1])
      });
    }
    return legs;
  }

  // Quadratic bezier arc, offset to the RIGHT of travel direction so an
  // outbound and a return leg over the same cities bow to opposite sides.
  function arcPoints(a, b) {
    var midLat = (a[0] + b[0]) / 2, midLon = (a[1] + b[1]) / 2;
    var dLat = b[0] - a[0], dLon = b[1] - a[1];
    var len = Math.sqrt(dLat * dLat + dLon * dLon) || 1e-6;
    var mag = 0.18 * len;
    var cLat = midLat + (-dLon / len) * mag;
    var cLon = midLon + (dLat / len) * mag;
    var pts = [], N = 26;
    for (var i = 0; i <= N; i++) {
      var t = i / N, u = 1 - t;
      pts.push([
        u * u * a[0] + 2 * u * t * cLat + t * t * b[0],
        u * u * a[1] + 2 * u * t * cLon + t * t * b[1]
      ]);
    }
    return pts;
  }

  function arrowIcon(angle, color) {
    var html = '<div class="leg-arrow" style="transform:rotate(' + angle + 'deg);color:' + color + '">' +
      '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M1 8 H12 M8 4 L12 8 L8 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
    return window.L.divIcon({ html: html, className: "leg-arrow-wrap", iconSize: [18, 18], iconAnchor: [9, 9] });
  }

  // Draw arcs immediately (safe before the map has a view); returns specs used
  // by attachArrows, which MUST run AFTER the map view/zoom is set (fitBounds).
  function drawLegArcs(map, legs) {
    ensureArrowCss();
    var specs = [];
    (legs || []).forEach(function (lg) {
      var pts = arcPoints(lg.a, lg.b);
      window.L.polyline(pts, lg.style).addTo(map);
      specs.push({ pts: pts, color: lg.style.color });
    });
    return specs;
  }

  // Place (and keep re-orienting on zoom) a direction arrow on each arc.
  function attachArrows(map, specs) {
    if (!specs || !specs.length) return;
    var arrowLayer = window.L.layerGroup().addTo(map);
    function place() {
      arrowLayer.clearLayers();
      specs.forEach(function (sp) {
        var idx = Math.floor(sp.pts.length * 0.58);
        var pA = sp.pts[Math.max(0, idx - 1)], pB = sp.pts[Math.min(sp.pts.length - 1, idx + 1)];
        var ptA = map.latLngToLayerPoint(pA), ptB = map.latLngToLayerPoint(pB);
        var ang = Math.atan2(ptB.y - ptA.y, ptB.x - ptA.x) * 180 / Math.PI;
        window.L.marker(sp.pts[idx], { icon: arrowIcon(ang, sp.color), interactive: false, keyboard: false }).addTo(arrowLayer);
      });
    }
    place();
    map.on("zoomend", place);
  }

  // Interactive map on the "Маршрут" tab (replaces the static SVG viewport).
  function buildRouteMap(ordered, unique, legs) {
    if (!window.L) { console.warn("[weather-map] Leaflet не загружен"); return; }
    var vp = document.getElementById("route-map-viewport");
    if (!vp || !vp.parentNode) return;
    var holder = vp.cloneNode(false);
    holder.id = "route-map-viewport";
    holder.style.cursor = "default";
    var mapDiv = document.createElement("div");
    mapDiv.id = "route-leaflet-map";
    mapDiv.style.cssText = "width:100%;height:100%;min-height:320px;";
    holder.appendChild(mapDiv);
    vp.parentNode.replaceChild(holder, vp);
    var map = window.L.map(mapDiv, { zoomControl: true, scrollWheelZoom: true });
    addTiles(map);
    var latlngs = ordered.map(function (p) { return [Number(p.latitude), Number(p.longitude)]; });
    var specs = drawLegArcs(map, legs);
    unique.forEach(function (c) { window.L.marker([Number(c.latitude), Number(c.longitude)]).addTo(map).bindPopup(popupHtml(c)); });
    fit(map, latlngs);
    attachArrows(map, specs);
    watchVisibility(map, mapDiv);
    window.__routeMap = map;
  }

  // Non-interactive preview map on the "Обзор" tab (replaces the SVG/PNG preview).
  function buildPreviewMap(ordered, unique, legs) {
    if (!window.L) return;
    var mini = document.querySelector('[data-od-id="mini-map"]');
    if (!mini) return;
    // Drop data-od-id so integration-controller no longer overwrites this node.
    mini.removeAttribute("data-od-id");
    mini.innerHTML = "";
    var mapDiv = document.createElement("div");
    mapDiv.id = "route-preview-map";
    mapDiv.style.cssText = "width:100%;height:100%;min-height:200px;border-radius:inherit;";
    mini.appendChild(mapDiv);
    var map = window.L.map(mapDiv, {
      zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, tap: false
    });
    addTiles(map);
    var latlngs = ordered.map(function (p) { return [Number(p.latitude), Number(p.longitude)]; });
    var specs = drawLegArcs(map, legs);
    unique.forEach(function (c) { window.L.circleMarker([Number(c.latitude), Number(c.longitude)], { radius: 6, color: "#4c8dff", fillColor: "#4c8dff", fillOpacity: 1 }).addTo(map); });
    fit(map, latlngs);
    attachArrows(map, specs);
    watchVisibility(map, mapDiv);
    window.__previewMap = map;
  }

  function run() {
    if (started) return;
    // The workspace hydrates a deep-linked trip asynchronously. Do not lock the
    // weather/map module onto the seeded demo trip while that request is pending.
    if (!requestedTripIsHydrated()) return;
    var a = api();
    if (!a) { console.warn("[weather-map] TravelApi недоступен"); return; }
    var names = routeCities();
    if (!names.length) { return; }
    started = true;
    ensureLeafletCss();
    a.ensureAuth().then(function () {
      var ordered = [];
      var unique = [];
      var seen = {};
      var chain = Promise.resolve();
      names.forEach(function (nm) {
        chain = chain.then(function () {
          return geocodeOne(nm).then(function (hit) {
            if (!hit) return;
            ordered.push(hit);
            var k = keyOf(hit);
            if (!seen[k]) { seen[k] = true; unique.push(hit); }
          });
        });
      });
      return chain.then(function () {
        if (!unique.length) { console.warn("[weather-map] города не распознаны (сервер запущен?)"); return; }
        var legs = buildLegs(names);
        var wchain = Promise.resolve();
        unique.forEach(function (c) {
          wchain = wchain.then(function () {
            return a.weather(c.latitude, c.longitude).then(function (w) {
              if (w && w.current) c.weather = { temp: w.current.temperature, desc: w.current.description, wind: w.current.windSpeed };
            }).catch(function () {});
          });
        });
        return wchain.then(function () {
          buildRouteMap(ordered, unique, legs);
          buildPreviewMap(ordered, unique, legs);
          pushWeather(unique);
        });
      });
    }).catch(function (e) { console.warn("[weather-map] " + (e && e.message)); started = false; });
  }

  var tries = 0;
  function boot() {
    run();
    var iv = setInterval(function () {
      tries++;
      if (started || tries > 12) { clearInterval(iv); return; }
      run();
    }, 500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 300); });
  else setTimeout(boot, 300);

  var appStore = store();
  if (appStore && typeof appStore.subscribe === "function") {
    appStore.subscribe(function () {
      if (!started && requestedTripIsHydrated()) run();
    });
  }

  window.TravelWeatherMap = { refresh: function () { started = false; geoMem = {}; run(); } };
})();

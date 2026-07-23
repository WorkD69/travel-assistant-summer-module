/*
 * route-timeline.js — делает список сегментов и таймлайн data-driven.
 *
 * Раньше блоки «Полный таймлайн» (вкладка Маршрут) и компактный таймлайн
 * (вкладка Обзор) были зашиты статически (демо Сыктывкар→Москва→Анталья)
 * и не зависели от реальных сегментов поездки. Теперь они строятся из
 * state.trip.segments (бэкенд = источник правды) и обновляются при каждом изменении.
 *
 * Модуль НЕ трогает карту/погоду (этим занимается weather-map.js).
 */
(function routeTimelineModule(){
  "use strict";

  function store(){ return window.TravelAppState || null; }
  function activeTrip(){
    var s = store();
    var st = (s && s.getState) ? s.getState() : null;
    return (st && st.trip) || null;
  }

  function esc(v){
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  var MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];

  function timeOf(iso){
    if (!iso) return "";
    var m = String(iso).match(/T(\d{2}:\d{2})/);
    if (m) return m[1];
    var d = new Date(iso);
    if (!isNaN(d.getTime())) return ("0"+d.getHours()).slice(-2) + ":" + ("0"+d.getMinutes()).slice(-2);
    return "";
  }
  function dateLabel(iso){
    if (!iso) return "";
    var d = new Date(String(iso).length === 10 ? iso + "T00:00:00" : iso);
    if (isNaN(d.getTime())) return "";
    return d.getDate() + " " + MONTHS[d.getMonth()];
  }

  function isFlight(type){ return /самол|перел|flight|авиа/i.test(String(type||"")); }
  function isStay(type){ return /прожив|отел|hotel|stay/i.test(String(type||"")); }

  function segTitle(seg){
    var t = String(seg.type || "").toLowerCase();
    if (isStay(t)) return "Заселение: " + (seg.to || seg.from || "отель");
    var verb = isFlight(t) ? "Перелёт" : (seg.type || "Переезд");
    return verb + ": " + (seg.from || "?") + " → " + (seg.to || "?");
  }

  function sortSegs(segs){
    return segs.slice().sort(function(a,b){
      var sa = String(a.start || ""), sb = String(b.start || "");
      if (sa && sb && sa !== sb) return sa < sb ? -1 : 1;
      return (a.order || 0) - (b.order || 0);
    });
  }

  /* ---- Полный таймлайн (вкладка Маршрут) ---- */
  function renderRouteTimeline(segs){
    var host = document.querySelector(".route-timeline");
    if (!host) return;
    if (!segs.length){
      host.innerHTML = '<div class="route-source" style="padding:16px;border:1px dashed var(--border);border-radius:var(--radius-md);">' +
        'Сегменты пока не добавлены. Откройте редактирование поездки и добавьте рейсы, трансферы или проживание — они появятся здесь.' +
        '</div>';
      return;
    }
    host.innerHTML = sortSegs(segs).map(function(seg){
      var ref = seg.ref || seg.provider || "";
      var badge = ref
        ? '<span class="badge ' + (isFlight(seg.type) ? "badge-accent" : "badge-info") + '">' + esc(ref) + '</span>'
        : "";
      var note = seg.note ? "; " + esc(seg.note) : "";
      return '<article class="route-event-card">' +
        '<time class="route-event-time">' + esc(timeOf(seg.start) || "—") + '</time>' +
        '<div>' +
          '<h3 class="route-event-title">' + esc(segTitle(seg)) + '</h3>' +
          '<div class="route-event-meta">' +
            '<span>Откуда<strong>' + esc(seg.from || "—") + '</strong></span>' +
            '<span>Куда<strong>' + esc(seg.to || "—") + '</strong></span>' +
            '<span>Тип<strong>' + esc(seg.type || "—") + '</strong></span>' +
            '<span>Статус<strong>' + esc(seg.status || "Запланировано") + '</strong></span>' +
          '</div>' +
          '<div class="route-event-bottom">' + badge +
            '<span class="route-source">Источник: маршрут поездки' + note + '</span>' +
          '</div>' +
        '</div>' +
      '</article>';
    }).join("");
  }

  /* ---- Компактный таймлайн (вкладка Обзор) ---- */
  function renderCompactTimeline(segs){
    var host = document.querySelector('#panel-overview ol.timeline');
    if (!host) return;
    if (!segs.length){
      host.innerHTML = '<li class="timeline-item"><div class="timeline-content"><p class="timeline-event-sub">Сегменты маршрута пока не добавлены.</p></div></li>';
      return;
    }
    var sorted = sortSegs(segs);
    host.innerHTML = sorted.map(function(seg, i){
      var last = i === sorted.length - 1;
      var sub = (seg.type || "") + (seg.ref ? " · " + seg.ref : (seg.provider ? " · " + seg.provider : ""));
      return '<li class="timeline-item">' +
        '<span class="timeline-time mono">' + esc(timeOf(seg.start) || "—") + '</span>' +
        '<div class="timeline-rail"><span class="timeline-dot' + (i === 0 ? " next" : "") + '"></span>' + (last ? "" : '<span class="timeline-line"></span>') + '</div>' +
        '<div class="timeline-content">' +
          '<p class="timeline-event-title">' + esc(segTitle(seg)) + '</p>' +
          '<p class="timeline-event-sub">' + esc(sub) + '</p>' +
        '</div>' +
      '</li>';
    }).join("");
  }

  /* ---- Подзаголовки ---- */
  function updateSubtitles(trip, segs){
    var pts = [];
    if (trip && Array.isArray(trip.routePoints) && trip.routePoints.length) pts = trip.routePoints.slice();
    else if (trip && trip.route) pts = String(trip.route).split("→").map(function(x){ return x.trim(); }).filter(Boolean);
    var first = sortSegs(segs)[0];
    var dl = first ? dateLabel(first.start) : (trip && dateLabel(trip.start || trip.startDate));
    var routeStr = pts.join(" → ");

    var routeSub = document.querySelector(".route-map-card .card-subtitle");
    if (routeSub) routeSub.textContent = (routeStr || "Маршрут") + (dl ? " · " + dl : "");
    var ovSub = document.querySelector('[data-od-id="card-timeline"] .card-subtitle');
    if (ovSub) ovSub.textContent = (dl ? dl + " · " : "") + segs.length + " " + plural(segs.length, "сегмент", "сегмента", "сегментов");
  }
  function plural(n, one, few, many){
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  var lastKey = null;
  function render(){
    var trip = activeTrip();
    var segs = (trip && Array.isArray(trip.segments)) ? trip.segments : [];
    var key = JSON.stringify(segs.map(function(s){ return [s.id, s.type, s.from, s.to, s.start, s.end, s.ref, s.provider, s.status, s.note, s.order]; })) + "|" + (trip ? (trip.route || "") : "");
    if (key === lastKey) return;
    lastKey = key;
    renderRouteTimeline(segs);
    renderCompactTimeline(segs);
    updateSubtitles(trip, segs);
  }

  function boot(){
    render();
    var s = store();
    if (s && s.subscribe) { try { s.subscribe(function(){ render(); }); } catch (e){} }
    document.addEventListener("travel:data-changed", render);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.TravelRouteTimeline = { render: function(){ lastKey = null; render(); } };
})();

(function(){
  "use strict";

  var messages = [];
  var tripId = getTripId();
  var els = {};
  var busy = false;
  var loadingEl = null;

  function getTripId(){
    try {
      var p = new URLSearchParams(location.search);
      return p.get("tripId") || p.get("trip") || null;
    } catch (e) { return null; }
  }

  function esc(s){
    s = (s == null ? "" : String(s));
    s = s.split("&").join("&amp;");
    s = s.split("<").join("&lt;");
    s = s.split(">").join("&gt;");
    s = s.split(String.fromCharCode(34)).join("&quot;");
    return s;
  }
  function nl2br(s){ return esc(s).split(String.fromCharCode(10)).join("<br>"); }

  function panelHtml(){
    return ''
      + '<section class="ai-assistant" id="ai-assistant">'
      + '  <header class="ai-assistant__head">'
      + '    <div class="ai-assistant__heading">'
      + '      <span class="ai-assistant__badge">ИИ</span>'
      + '      <div>'
      + '        <h3 class="ai-assistant__title">ИИ-ассистент мониторинга</h3>'
      + '        <p class="ai-assistant__sub">Опишите ситуацию — помогу с планом Б, шагами и черновиком письма.</p>'
      + '      </div>'
      + '    </div>'
      + '    <span class="ai-assistant__status" id="ai-status" data-tone="wait">Подключение…</span>'
      + '  </header>'
      + '  <div class="ai-assistant__log" id="ai-log" aria-live="polite"></div>'
      + '  <div class="ai-assistant__composer">'
      + '    <textarea id="ai-input" class="ai-assistant__input" rows="2" placeholder="Например: еду на машине, на трассе оторвалось колесо…"></textarea>'
      + '    <div class="ai-assistant__actions">'
      + '      <button type="button" class="coreflow-button coreflow-button--secondary" id="ai-send-dialog">Спросить</button>'
      + '      <button type="button" class="coreflow-button coreflow-button--primary" id="ai-send-plans">Собрать 3 плана Б</button>'
      + '    </div>'
      + '  </div>'
      + '</section>';
  }

  function setStatus(text, tone){
    if (!els.status) return;
    els.status.textContent = text;
    els.status.setAttribute("data-tone", tone || "ok");
  }

  function addBubble(role, html){
    var div = document.createElement("div");
    div.className = "ai-msg ai-msg--" + role;
    div.innerHTML = html;
    els.log.appendChild(div);
    els.log.scrollTop = els.log.scrollHeight;
    return div;
  }

  function addUser(text){ return addBubble("user", nl2br(text)); }
  function addAssistantText(text){ return addBubble("assistant", nl2br(text)); }

  function emailBlockHtml(to, subject, body, compact){
    var emailText = "Кому: " + (to || "") + String.fromCharCode(10) + "Тема: " + (subject || "") + String.fromCharCode(10) + String.fromCharCode(10) + (body || "");
    var h = '<div class="ai-email' + (compact ? ' ai-email--compact' : '') + '">';
    h += '<div class="ai-email__head"><strong>Черновик письма</strong><button type="button" class="ai-email__copy" data-email="' + esc(encodeURIComponent(emailText)) + '">Скопировать</button></div>';
    if (to) h += '<p class="ai-email__row"><span>Кому:</span> ' + esc(to) + '</p>';
    if (subject) h += '<p class="ai-email__row"><span>Тема:</span> ' + esc(subject) + '</p>';
    if (body) h += '<div class="ai-email__body">' + nl2br(body) + '</div>';
    h += '</div>';
    return h;
  }

  function strategyBadge(strategy, i){
    var map = {
      fast: { label: "Быстро и дёшево", cls: "ai-strat--fast" },
      fastest: { label: "Самый быстрый", cls: "ai-strat--fast" },
      cheapest: { label: "Самый дешёвый", cls: "ai-strat--delegate" },
      reliable: { label: "Самый надёжный", cls: "ai-strat--reliable" },
      delegate: { label: "Минимум усилий", cls: "ai-strat--delegate" }
    };
    var order = ["fastest", "cheapest", "reliable"];
    var s = strategy && map[strategy] ? map[strategy] : map[order[i] || "fast"];
    return '<span class="ai-strat ' + s.cls + '">' + esc(s.label) + '</span>';
  }
  function renderPlans(result){
    var h = '';
    if (result.summary) h += '<p class="ai-plans__summary">' + nl2br(result.summary) + '</p>';
    var cq = result.clarifyingQuestions || [];
    if (cq.length){
      h += '<div class="ai-plans__cq"><strong>Уточняющие вопросы:</strong><ul>';
      cq.forEach(function(q){ h += '<li>' + esc(q) + '</li>'; });
      h += '</ul></div>';
    }
    var plans = result.plans || [];
    if (plans.length){
      h += '<div class="ai-plans__grid">';
      plans.forEach(function(p, i){
        h += '<article class="ai-plan">';
        h += '<h4 class="ai-plan__title">План ' + (i + 1) + '. ' + esc(p.title || "") + '</h4>';
        h += strategyBadge(p.strategy, i);
        if (p.revisedRoute) h += '<p class="ai-plan__meta"><span>Маршрут:</span> ' + esc(p.revisedRoute) + '</p>';
        if (p.totalDuration) h += '<p class="ai-plan__meta"><span>В пути:</span> ' + esc(p.totalDuration) + '</p>';
        if (p.estimatedCost != null) h += '<p class="ai-plan__meta"><span>Стоимость:</span> ' + esc(p.estimatedCost + " " + (p.currency || "")) + '</p>';
        if (p.reliability) h += '<p class="ai-plan__meta"><span>Надёжность:</span> ' + esc(p.reliability) + '</p>';
        if (Array.isArray(p.segments) && p.segments.length) {
          h += '<ol class="ai-plan__steps">';
          p.segments.forEach(function(segment){
            h += '<li>' + esc(segment.departurePlace + " → " + segment.arrivalPlace + " · " + segment.transportType) + '</li>';
          });
          h += '</ol>';
        }
        var steps = p.steps || [];
        if (steps.length){
          h += '<ol class="ai-plan__steps">';
          steps.forEach(function(s){ h += '<li>' + esc(s) + '</li>'; });
          h += '</ol>';
        }
        if (p.pros) h += '<p class="ai-plan__meta"><span>Плюсы:</span> ' + esc(p.pros) + '</p>';
        if (p.cons) h += '<p class="ai-plan__meta"><span>Минусы:</span> ' + esc(p.cons) + '</p>';
        if (p.whenToUse) h += '<p class="ai-plan__meta"><span>Когда:</span> ' + esc(p.whenToUse) + '</p>';
        h += '<div class="ai-plan__foot"><small>Предложения ассистента справочные. Для изменения маршрута используйте canonical Plan B Workspace.</small></div>';
        h += '</article>';
      });
      h += '</div>';
    }
    var email = result.emailDraft;
    if (email && (email.subject || email.body)){
      h += emailBlockHtml(email.to, email.subject, email.body, false);
    }
    if (!h) h = '<p class="ai-plans__summary">Пустой ответ. Попробуйте переформулировать запрос.</p>';
    return addBubble("assistant", h);
  }

  function copyEmail(btn){
    var text = decodeURIComponent(btn.getAttribute("data-email") || "");
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){
        var old = btn.textContent; btn.textContent = "Скопировано"; setTimeout(function(){ btn.textContent = old; }, 1500);
      });
    }
  }

  function setBusy(b){
    busy = b;
    if (els.dialogBtn) els.dialogBtn.disabled = b;
    if (els.plansBtn) els.plansBtn.disabled = b;
    if (els.input) els.input.disabled = b;
  }

  function showLoading(){
    loadingEl = addBubble("assistant", '<span class="ai-typing"><span></span><span></span><span></span></span>');
  }
  function hideLoading(){ if (loadingEl){ loadingEl.remove(); loadingEl = null; } }

  async function send(mode){
    if (busy || !tripId) return;
    var text = (els.input.value || "").trim();
    if (!text){ els.input.focus(); return; }
    els.input.value = "";
    addUser(text);
    messages.push({ role: "user", content: text });
    setBusy(true); showLoading();
    try {
      var result = await window.TravelApi.assistant(tripId, messages, mode);
      hideLoading();
      if (mode === "plans"){
        renderPlans(result);
        messages.push({ role: "assistant", content: (result.summary || "План Б предоставлен.") });
      } else {
        var reply = result.reply || "";
        addAssistantText(reply);
        messages.push({ role: "assistant", content: reply });
      }
    } catch (e){
      hideLoading();
      var msg = (e && e.data && e.data.error) || (e && e.message) || "Ошибка запроса.";
      addBubble("error", esc(msg));
    } finally {
      setBusy(false);
    }
  }

  function onLogClick(e){
    var t = e.target;
    var copyBtn = t && t.closest ? t.closest(".ai-email__copy") : null;
    if (copyBtn){ copyEmail(copyBtn); return; }
  }

  async function init(){
    var surface = document.getElementById("monitoring-surface");
    if (!surface || document.getElementById("ai-assistant")) return;

    var wrap = document.createElement("div");
    wrap.innerHTML = panelHtml();
    surface.appendChild(wrap.firstChild);

    els.status = document.getElementById("ai-status");
    els.log = document.getElementById("ai-log");
    els.input = document.getElementById("ai-input");
    els.dialogBtn = document.getElementById("ai-send-dialog");
    els.plansBtn = document.getElementById("ai-send-plans");

    els.dialogBtn.addEventListener("click", function(){ send("dialog"); });
    els.plansBtn.addEventListener("click", function(){ send("plans"); });
    els.input.addEventListener("keydown", function(e){
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter"){ e.preventDefault(); send("dialog"); }
    });
    els.log.addEventListener("click", onLogClick);

    if (!tripId){
      setStatus("Сначала выберите поездку", "wait");
      setBusy(true);
      return;
    }
    if (!window.TravelApi){ setStatus("API недоступен", "err"); return; }
    try {
      await window.TravelApi.ensureAuth();
      setStatus("Готов", "ok");
      try {
        var hist = await window.TravelApi.assistantHistory(tripId);
        var items = (hist && hist.history) || [];
        items.forEach(function(m){
          if (m.role === "user"){ addUser(m.content); messages.push({ role: "user", content: m.content }); }
          else if (m.role === "assistant" && m.mode !== "plans"){ addAssistantText(m.content); messages.push({ role: "assistant", content: m.content }); }
        });
      } catch (e2) { /* history optional */ }
    } catch (e){
      var em = (e && e.data && e.data.error) || (e && e.message) || "не удалось подключиться к серверу";
      setStatus("Офлайн", "err");
      addBubble("error", "Не удалось подключиться к бэкенду: " + esc(em) + ". Убедитесь, что сервер запущен (npm run dev).");
    }
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/*
 * docs-sync.js — слой синхронизации вкладки «Документы» с бэкендом.
 * Принцип: бэкенд — единый источник правды. Реальные документы пушатся в общий
 * store (TravelAppState.documents) — инлайн-рендерер вкладки сам перерисовывает список
 * и метрики. Действия (загрузка/просмотр/скачивание/удаление) перехватываются
 * через глобальные функции, вызываемые из onclick.
 */
(function docsSyncModule(){
  "use strict";

  function store(){ return window.TravelAppState || null; }
  function api(){ return window.TravelApi || null; }
  function toast(m){ if (typeof window.toastInfo === "function") window.toastInfo(m); }

  function getTripId(){
    try {
      var u = new URL(location.href);
      var t = u.searchParams.get("tripId") || u.searchParams.get("trip");
      if (t) return t;
    } catch (e) {}
    var s = store() && store().getState ? store().getState() : null;
    if (s && s.activeTripId) return s.activeTripId;
    if (s && s.trip && s.trip.id) return s.trip.id;
    return "trip-turkey-2026";
  }

  function esc(v){ return String(v == null ? "" : v).replace(/[&<>\"']/g, function(c){ return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]; }); }
  function fmtDate(iso){ if (!iso) return "—"; var d = new Date(iso); if (isNaN(d.getTime())) return "—"; return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  function humanMb(mb){ if (mb == null) return "—"; if (mb < 1) return Math.round(mb * 1024) + " КБ"; return mb.toFixed(1).replace(".", ",") + " МБ"; }

  function ocrLabel(d){
    if (d.ocrStatus === "done") return "OCR: данные распознаны";
    if (d.ocrStatus === "pending") return "OCR: обрабатывается";
    if (d.ocrStatus === "empty") return "OCR: текст не найден";
    if (d.ocrStatus === "failed") return "OCR: ошибка распознавания";
    return "";
  }

  // Сырые документы бэкенда (для действий — hasFile, mime, ocr).
  var rawById = {};

  function mapDoc(d){
    rawById[d.id] = d;
    return {
      id: d.id,
      name: d.name || "Документ",
      type: d.type || "Другое",
      format: d.format || (d.mimeType ? String(d.mimeType).split("/").pop().toUpperCase() : "—"),
      size: d.sizeLabel || humanMb(d.sizeMb),
      uploadedAt: fmtDate(d.uploadedAt),
      status: (d.status === "confirmed") ? "confirmed" : "review",
      visibility: (d.visibility === "private") ? "private" : "shared",
      segment: d.segment || "—",
      source: d.source || "—",
      processedAt: d.processedAt ? fmtDate(d.processedAt) : (ocrLabel(d) || "—"),
      ocrConfirmed: !!d.ocrConfirmed
    };
  }

  function withAuth(fn){
    var a = api();
    if (!a) return;
    if (a.getToken && !a.getToken() && a.ensureAuth){
      a.ensureAuth().then(fn).catch(function(){});
    } else {
      fn();
    }
  }

  // Загрузить документы из бэкенда и отдать их в общий store.
  function refresh(){
    var a = api();
    if (!a || !a.listDocuments) return;
    var id = getTripId();
    withAuth(function(){
      a.listDocuments(id).then(function(r){
        var docs = (r && r.documents) ? r.documents : [];
        rawById = {};
        var mapped = docs.map(mapDoc);
        var s = store();
        if (s && s.setState){
          s.setState({ documents: mapped }, { source: "backend" });
        } else if (typeof window.renderDocuments === "function"){
          try { window.renderDocuments(); } catch (e) {}
        }
      }).catch(function(){});
    });
  }

  // ---- Реальная загрузка файла ----
  function realUpload(){
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".pdf,.png,.jpg,.jpeg,.webp,.bmp,.txt,image/*,application/pdf";
    inp.style.position = "fixed";
    inp.style.left = "-9999px";
    document.body.appendChild(inp);
    inp.addEventListener("change", function(){
      var file = inp.files && inp.files[0];
      document.body.removeChild(inp);
      if (!file) return;
      var a = api();
      if (!a || !a.uploadDocument) return;
      var id = getTripId();
      toast("Загрузка «" + file.name + "»…");
      withAuth(function(){
        a.uploadDocument(id, file, {}).then(function(){
          toast("Файл загружен и обработан");
          refresh();
          document.dispatchEvent(new CustomEvent("travel:data-changed"));
        }).catch(function(e){ toast("Ошибка загрузки: " + ((e && e.message) || "")); });
      });
    });
    inp.click();
  }

  // ---- Просмотр / скачивание / удаление ----
  function openFile(id){
    var a = api(); var tid = getTripId(); var raw = rawById[id];
    if (!a || !raw) return;
    if (!raw.hasFile){ toast("У этого документа нет файла"); return; }
    a.fetchFileBlob(tid, id).then(function(b){
      var url = URL.createObjectURL(b);
      window.open(url, "_blank");
      setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
    }).catch(function(){ window.open(a.fileUrl(tid, id), "_blank"); });
  }

  function downloadFile(id){
    var a = api(); var tid = getTripId(); var raw = rawById[id];
    if (!a || !raw) return;
    if (!raw.hasFile){ toast("У этого документа нет файла"); return; }
    a.fetchFileBlob(tid, id).then(function(b){
      var url = URL.createObjectURL(b);
      var link = document.createElement("a");
      link.href = url; link.download = raw.name || "document";
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
    }).catch(function(){ window.location.href = a.fileUrl(tid, id, true); });
  }

  function deleteDoc(id){
    var a = api(); var tid = getTripId();
    if (!a || !a.removeDocument) return;
    if (!window.confirm("Удалить документ безвозвратно?")) return;
    withAuth(function(){
      a.removeDocument(tid, id).then(function(){
        toast("Документ удалён");
        refresh();
        document.dispatchEvent(new CustomEvent("travel:data-changed"));
      }).catch(function(){ toast("Не удалось удалить"); });
    });
  }

  // ---- Показ распознанных OCR-данных ----
  function clientSegment(fields){
    var head = fields.type || "";
    if (fields.dates && fields.dates.length){
      var d = fields.dates.length > 1 ? (fields.dates[0] + " – " + fields.dates[fields.dates.length - 1]) : fields.dates[0];
      return (head ? head + " · " : "") + d;
    }
    if (fields.route) return (head ? head + " · " : "") + fields.route;
    return head || "";
  }

  // Блок проверки/подтверждения распознанных данных (редактируемый).
  function ocrFieldsHtml(raw){
    var fields = {};
    try { fields = JSON.parse(raw.ocrData || "{}"); } catch (e) {}
    var confirmed = (raw.status === "confirmed") || raw.ocrConfirmed;
    var status = ocrLabel(raw) || "OCR не выполнялся";
    var dstr = (fields.dates && fields.dates.length) ? fields.dates.join(", ") : "";
    var out = '<div class="docs-ocr-block">';
    out += '<div class="docs-ocr-head"><p class="docs-ocr-status">' + esc(status) + '</p>' + (confirmed ? '<span class="badge badge-success">Подтверждено</span>' : '<span class="badge badge-warning">Требует проверки</span>') + '</div>';
    out += '<p class="docs-ocr-hint">Проверьте распознанные данные и при необходимости исправьте их перед подтверждением.</p>';
    out += '<div class="docs-ocr-fields">';
    out += '<label class="docs-ocr-field"><span>Тип</span><input class="input" id="ocr-f-type" value="' + esc(fields.type || raw.type || "") + '"></label>';
    out += '<label class="docs-ocr-field"><span>Даты</span><input class="input" id="ocr-f-dates" value="' + esc(dstr) + '" placeholder="дд.мм.гггг, дд.мм.гггг"></label>';
    out += '<label class="docs-ocr-field"><span>Рейс / бронь</span><input class="input" id="ocr-f-flight" value="' + esc(fields.flight || "") + '"></label>';
    if (fields.route) out += '<label class="docs-ocr-field"><span>Маршрут</span><input class="input" id="ocr-f-route" value="' + esc(fields.route) + '"></label>';
    out += '</div>';
    out += '<div class="docs-ocr-actions"><button type="button" class="btn btn-primary btn-sm" onclick="window.TravelDocsSync.confirm(&quot;' + esc(raw.id) + '&quot;)">' + (confirmed ? 'Сохранить исправления' : 'Подтвердить данные') + '</button></div>';
    if (raw.ocrText){
      out += '<details class="docs-ocr-text"><summary>Распознанный текст</summary><pre>' + esc(String(raw.ocrText).slice(0, 4000)) + '</pre></details>';
    }
    out += '</div>';
    return out;
  }

  // Подтверждение данных: собираем исправления → сохраняем в бэкенд, статус → confirmed.
  function confirmOcr(id){
    var a = api(); var tid = getTripId(); var raw = rawById[id];
    if (!a || !a.updateDocument || !raw) return;
    var fields = {};
    try { fields = JSON.parse(raw.ocrData || "{}"); } catch (e) {}
    var typeEl = document.getElementById("ocr-f-type");
    var datesEl = document.getElementById("ocr-f-dates");
    var flightEl = document.getElementById("ocr-f-flight");
    var routeEl = document.getElementById("ocr-f-route");
    if (typeEl){ var tv = typeEl.value.trim(); if (tv) fields.type = tv; else delete fields.type; }
    if (datesEl){ var ds = datesEl.value.split(",").map(function(s){ return s.trim(); }).filter(Boolean); if (ds.length) fields.dates = ds; else delete fields.dates; }
    if (flightEl){ var fl = flightEl.value.trim(); if (fl) fields.flight = fl; else delete fields.flight; }
    if (routeEl){ var rv = routeEl.value.trim(); if (rv) fields.route = rv; else delete fields.route; }
    var segment = clientSegment(fields);
    var patch = { status: "confirmed", ocrConfirmed: true, ocrStatus: "done", ocrData: JSON.stringify(fields) };
    if (fields.type) patch.type = fields.type;
    if (segment) patch.segment = segment;
    withAuth(function(){
      a.updateDocument(tid, id, patch).then(function(){
        toast("Данные подтверждены");
        if (typeof window.hideModalImmediately === "function") window.hideModalImmediately("modal-doc-view");
        else if (typeof window.closeModal === "function") window.closeModal("modal-doc-view");
        refresh();
        document.dispatchEvent(new CustomEvent("travel:data-changed"));
      }).catch(function(e){ toast("Не удалось подтвердить: " + ((e && e.message) || "")); });
    });
  }

  function showOcr(id){
    var raw = rawById[id];
    if (!raw) return;
    openFile(id); // открыть файл + ниже покажем данные в карточке
    openDocumentViewReal(id);
  }

  // ---- Карточка просмотра: реальный превью + OCR-данные ----
  var origOpenDocumentView = null;
  function openDocumentViewReal(id){
    window.selectedDocumentId = id;
    if (typeof origOpenDocumentView === "function"){ try { origOpenDocumentView(id); } catch (e) {} }
    var raw = rawById[id];
    if (!raw) return;
    var a = api(); var tid = getTripId();
    // Реальный превью файла
    var prev = document.getElementById("doc-view-preview");
    if (prev && raw.hasFile && a && a.fetchFileBlob){
      var mt = String(raw.mimeType || "").toLowerCase();
      prev.innerHTML = '<div class="doc-preview-page"><p>Загрузка предпросмотра…</p></div>';
      a.fetchFileBlob(tid, id).then(function(b){
        var url = URL.createObjectURL(b);
        if (mt.indexOf("image") !== -1){
          prev.innerHTML = '<img src="' + url + '" alt="' + esc(raw.name) + '" style="max-width:100%;border-radius:10px;">';
        } else if (mt.indexOf("pdf") !== -1){
          prev.innerHTML = '<iframe src="' + url + '" style="width:100%;height:440px;border:0;border-radius:10px;" title="' + esc(raw.name) + '"></iframe>';
        } else {
          prev.innerHTML = '<div class="doc-preview-page"><p>Предпросмотр недоступен для этого формата. Нажмите «Скачать».</p></div>';
        }
      }).catch(function(){ prev.innerHTML = '<div class="doc-preview-page"><p>Не удалось загрузить файл.</p></div>'; });
    }
    // OCR-данные в блоке details
    var details = document.getElementById("doc-view-details");
    if (details){
      var existing = details.parentNode ? details.parentNode.querySelector(".docs-ocr-block") : null;
      if (existing) existing.parentNode.removeChild(existing);
      var wrap = document.createElement("div");
      wrap.innerHTML = ocrFieldsHtml(raw);
      if (details.parentNode) details.parentNode.insertBefore(wrap.firstChild, details.nextSibling);
    }
  }

  function installOverrides(){
    // Загрузка файла напрямую (без демо-модалки)
    window.openUploadModal = realUpload;
    // Скачивание текущего документа
    window.downloadMockDocument = function(){ if (window.selectedDocumentId) downloadFile(window.selectedDocumentId); };
    // Действия меню / карточки
    var origRun = window.runDocAction;
    window.runDocAction = function(action, id){
      var did = id || window.activeDocMenuId || window.selectedDocumentId;
      if (typeof window.closeDocActionsMenu === "function") window.closeDocActionsMenu();
      if (typeof window.hideModalImmediately === "function") window.hideModalImmediately("modal-doc-actions");
      if (action === "open") return openFile(did);
      if (action === "download") return downloadFile(did);
      if (action === "delete") return deleteDoc(did);
      if (action === "ocr") return openDocumentViewReal(did);
      if (typeof origRun === "function") return origRun(action, id);
    };
    // Просмотр документа — реальный превью + OCR
    origOpenDocumentView = window.openDocumentView;
    window.openDocumentView = openDocumentViewReal;
    // Открыть OCR-разбор — показать реальные данные
    window.openOcrReview = openDocumentViewReal;
  }

  function boot(){
    installOverrides();
    refresh();
    var tab = document.getElementById("tab-docs");
    if (tab) tab.addEventListener("click", function(){ setTimeout(refresh, 40); });
    document.addEventListener("travel:trip-changed", function(){ refresh(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.TravelDocsSync = { refresh: refresh, confirm: confirmOcr };
})();

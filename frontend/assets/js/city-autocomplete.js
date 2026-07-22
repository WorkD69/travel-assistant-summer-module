(function cityAutocompleteModule() {
  "use strict";
  // checked: lowercased name -> hit object, or null when confirmed "not found".
  var checked = {};
  var pending = {};
  var timers = {};

  function api() { return window.TravelApi || null; }
  function isCityFieldId(id) { return id === "seg-from" || id === "seg-to" || id === "from" || id === "to"; }

  function ensureDatalist() {
    var dl = document.getElementById("city-suggestions");
    if (!dl) { dl = document.createElement("datalist"); dl.id = "city-suggestions"; document.body.appendChild(dl); }
    return dl;
  }
  function fillDatalist(results) {
    var dl = ensureDatalist();
    dl.innerHTML = results.map(function (r) {
      var v = String(r.name).replace(/"/g, "&quot;");
      var lab = String(r.label || r.name).replace(/</g, "&lt;");
      return '<option value="' + v + '">' + lab + "</option>";
    }).join("");
  }
  function attach(el) {
    ensureDatalist();
    if (el.getAttribute("list") !== "city-suggestions") {
      el.setAttribute("list", "city-suggestions");
      el.setAttribute("autocomplete", "off");
    }
  }
  function markField(el) {
    var key = (el.value || "").trim().toLowerCase();
    if (!key) { el.style.borderColor = ""; el.title = ""; return; }
    if (checked[key] === null) { el.style.borderColor = "#d92d20"; el.title = "Город не найден"; }
    else if (checked[key]) { el.style.borderColor = ""; el.title = ""; }
  }
  function query(name, el) {
    var key = String(name || "").trim().toLowerCase();
    if (!key || key.length < 2) return;
    if (Object.prototype.hasOwnProperty.call(checked, key) || pending[key]) { if (el) markField(el); return; }
    var a = api();
    if (!a) return;
    pending[key] = true;
    a.ensureAuth(a.demo)
      .then(function () { return a.geoSearch(name); })
      .then(function (res) {
        var results = (res && res.results) || [];
        checked[key] = results[0] || null;
        results.forEach(function (r) { var k = String(r.name).toLowerCase(); if (!Object.prototype.hasOwnProperty.call(checked, k)) checked[k] = r; });
        fillDatalist(results);
        pending[key] = false;
        if (el) markField(el);
      })
      .catch(function () { pending[key] = false; });
  }

  document.addEventListener("input", function (e) {
    var el = e.target;
    if (!el || !el.id || !isCityFieldId(el.id)) return;
    attach(el);
    var val = el.value;
    var id = el.id;
    clearTimeout(timers[id]);
    timers[id] = setTimeout(function () { query(val, el); }, 350);
  }, true);
  document.addEventListener("focusin", function (e) {
    if (e.target && e.target.id && isCityFieldId(e.target.id)) attach(e.target);
  }, true);

  window.CityValidator = {
    // Only blocks cities we actually queried and that returned zero results.
    isConfirmedInvalid: function (name) { var k = String(name || "").trim().toLowerCase(); return checked[k] === null; },
    canonical: function (name) { var k = String(name || "").trim().toLowerCase(); return (checked[k] && checked[k].name) ? checked[k].name : name; },
    hit: function (name) { var k = String(name || "").trim().toLowerCase(); return checked[k] || null; },
    ensure: function (name) {
      var k = String(name || "").trim().toLowerCase();
      if (Object.prototype.hasOwnProperty.call(checked, k)) return Promise.resolve(checked[k]);
      var a = api();
      if (!a) return Promise.resolve(null);
      return a.ensureAuth(a.demo).then(function () { return a.geoSearch(name); }).then(function (res) {
        var results = (res && res.results) || [];
        checked[k] = results[0] || null;
        return checked[k];
      }).catch(function () { return null; });
    }
  };
})();

(function (global) {
  "use strict";

  var TOKEN_KEY = "travel.auth.token";

  function safeGet(storage) {
    try {
      return storage && storage.getItem(TOKEN_KEY);
    } catch (error) {
      return null;
    }
  }

  function safeSet(storage, value) {
    try {
      storage.setItem(TOKEN_KEY, value);
    } catch (error) {
      throw new Error("Не удалось безопасно сохранить сессию в браузере");
    }
  }

  function safeRemove(storage) {
    try {
      if (storage) storage.removeItem(TOKEN_KEY);
    } catch (error) {
      // An unavailable browser storage must not prevent logout.
    }
  }

  function load() {
    return safeGet(sessionStorage) || safeGet(localStorage) || null;
  }

  function save(token, remember) {
    if (!token) {
      clear();
      return;
    }
    if (remember) {
      safeSet(localStorage, token);
      safeRemove(sessionStorage);
    } else {
      safeSet(sessionStorage, token);
      safeRemove(localStorage);
    }
  }

  function clear() {
    safeRemove(sessionStorage);
    safeRemove(localStorage);
  }

  global.TravelAuthStorage = {
    load: load,
    save: save,
    clear: clear,
  };
}(window));


(function () {
  "use strict";

  const HOME_MODE_TO_V1 = Object.freeze({
    flights: "flight",
    rail: "train",
    buses: "bus",
    electric: "etrain"
  });
  const V1_MODES = Object.freeze(["flight", "train", "bus", "etrain", "mixed"]);

  function localError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function localDateOnly(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function validDateOnly(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + "T00:00:00.000Z");
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  function normalizeDepartureDate(value, now) {
    const text = trim(value);
    if (!text) throw localError("TUTU_DEPARTURE_DATE_REQUIRED", "Departure date is required");
    if (validDateOnly(text)) return text;

    const russian = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (russian) {
      const normalized = russian[3] + "-" + pad(russian[2]) + "-" + pad(russian[1]);
      if (validDateOnly(normalized)) return normalized;
    }

    const offsets = { "Сегодня": 0, "Завтра": 1, "Послезавтра": 2 };
    if (Object.prototype.hasOwnProperty.call(offsets, text)) {
      const base = now instanceof Date ? now : new Date();
      const resolved = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offsets[text]);
      return localDateOnly(resolved);
    }

    throw localError("TUTU_DEPARTURE_DATE_INVALID", "Departure date is invalid");
  }

  function normalizePassengers(value) {
    const text = trim(value).toLocaleLowerCase("ru-RU");
    if (text !== "1 пассажир, эконом") {
      throw localError("TUTU_MULTI_PASSENGER_UNSUPPORTED", "V1 supports exactly one adult");
    }
    return { adults: 1, children: 0, infants: 0 };
  }

  function mapSearchDetail(detail, now) {
    const input = detail && typeof detail === "object" ? detail : {};
    const mode = HOME_MODE_TO_V1[input.mode];
    if (!mode) throw localError("TUTU_MODE_UNSUPPORTED", "Home mode is unsupported by Transport V1");
    if (trim(input.returnDate)) {
      throw localError("TUTU_ROUND_TRIP_UNSUPPORTED", "Round trips are unsupported by Transport V1");
    }
    const origin = trim(input.origin);
    const destination = trim(input.destination);
    if (!origin || !destination || origin.toLocaleLowerCase("ru-RU") === destination.toLocaleLowerCase("ru-RU")) {
      throw localError("TRANSPORT_CONTRACT_INVALID", "Origin and destination must be different non-empty places");
    }
    return {
      schemaVersion: "1",
      mode: mode,
      origin: origin,
      destination: destination,
      departureDate: normalizeDepartureDate(input.outbound, now),
      returnDate: null,
      passengers: normalizePassengers(input.passengers)
    };
  }

  function requestToQuery(request) {
    return new URLSearchParams({
      schemaVersion: request.schemaVersion,
      mode: request.mode,
      origin: request.origin,
      destination: request.destination,
      departureDate: request.departureDate,
      adults: String(request.passengers.adults),
      children: String(request.passengers.children),
      infants: String(request.passengers.infants)
    }).toString();
  }

  function requestFromQuery(query) {
    const params = query instanceof URLSearchParams ? query : new URLSearchParams(String(query || "").replace(/^\?/, ""));
    if (trim(params.get("returnDate"))) {
      throw localError("TUTU_ROUND_TRIP_UNSUPPORTED", "Round trips are unsupported by Transport V1");
    }
    const request = {
      schemaVersion: params.get("schemaVersion"),
      mode: params.get("mode"),
      origin: trim(params.get("origin")),
      destination: trim(params.get("destination")),
      departureDate: trim(params.get("departureDate")),
      returnDate: null,
      passengers: {
        adults: Number(params.get("adults")),
        children: Number(params.get("children")),
        infants: Number(params.get("infants"))
      }
    };
    if (request.schemaVersion !== "1" || !V1_MODES.includes(request.mode) ||
        !request.origin || !request.destination || !validDateOnly(request.departureDate)) {
      throw localError("TRANSPORT_CONTRACT_INVALID", "Search context is invalid");
    }
    if (request.passengers.adults !== 1 || request.passengers.children !== 0 || request.passengers.infants !== 0) {
      throw localError("TUTU_MULTI_PASSENGER_UNSUPPORTED", "V1 supports exactly one adult");
    }
    return request;
  }

  function messageForLocalError(error) {
    const messages = {
      TUTU_ROUND_TRIP_UNSUPPORTED: "Поиск туда и обратно пока недоступен. Выберите поездку в одну сторону.",
      TUTU_MULTI_PASSENGER_UNSUPPORTED: "Сейчас поиск доступен только для одного взрослого пассажира.",
      TUTU_MODE_UNSUPPORTED: "Для этого вида поездки поиск пока не подключён.",
      TUTU_DEPARTURE_DATE_REQUIRED: "Укажите дату отправления.",
      TUTU_DEPARTURE_DATE_INVALID: "Укажите корректную дату отправления.",
      TRANSPORT_CONTRACT_INVALID: "Проверьте параметры поиска."
    };
    return messages[error && error.code] || "Не удалось подготовить параметры поиска.";
  }

  window.TutuSearchAdapter = Object.freeze({
    mapSearchDetail: mapSearchDetail,
    requestToQuery: requestToQuery,
    requestFromQuery: requestFromQuery,
    messageForLocalError: messageForLocalError
  });
})();

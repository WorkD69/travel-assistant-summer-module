(function () {
  "use strict";

  const app = window.TravelAppState;
  const api = window.TravelAPI;
  if (!app || !api) {
    window.TravelSite = { ready: Promise.resolve(false) };
    return;
  }

  function splitName(name) {
    const parts = String(name || "Пользователь").trim().split(/\s+/);
    return { firstName: parts.shift() || "Пользователь", lastName: parts.join(" ") };
  }

  function uiUser(user) {
    return Object.assign({ id: user.id, email: user.email }, splitName(user.name), {
      name: user.name,
      initials: String(user.name || "П").split(/\s+/).slice(0, 2).map(function (part) { return part[0]; }).join("").toUpperCase()
    });
  }

  function dateLabel(start, end) {
    if (!start || !end) return "Даты не указаны";
    const format = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    return format.format(new Date(start + "T00:00:00Z")) + " — " + format.format(new Date(end + "T00:00:00Z"));
  }

  function uiTrip(trip, userId) {
    return {
      id: trip.id,
      title: trip.title,
      route: trip.route,
      start: trip.startDate,
      end: trip.endDate,
      startDate: trip.startDate,
      endDate: trip.endDate,
      dates: dateLabel(trip.startDate, trip.endDate),
      timezone: trip.timezone,
      kind: trip.type === "personal" ? "Личная" : "Групповая",
      type: trip.type,
      status: trip.status,
      role: trip.role,
      participantIds: [userId],
      roles: { [userId]: trip.role },
      participants: [],
      documents: 0,
      planB: 0,
      incidents: 0,
      sortDate: trip.startDate || "9999-12-31"
    };
  }

  function clearSession() {
    const state = app.getState() || {};
    const accountPages = Object.assign({}, state.accountPages || {}, {
      session: { isAuthenticated: false, userId: "", email: "", remember: false, lastLoginAt: "" },
      credentials: {}
    });
    app.setState({ accountPages, currentUser: {}, trips: [], completedTrips: [] }, { source: "backend-session" });
  }

  async function hydrate() {
    let me;
    try {
      me = await api.auth.me();
    } catch (error) {
      if (error && error.status === 401) clearSession();
      return false;
    }
    const result = await api.trips.list();
    const user = uiUser(me.user);
    const trips = (result.items || []).map(function (trip) { return uiTrip(trip, user.id); });
    const active = trips.filter(function (trip) { return trip.status !== "completed"; });
    const completed = trips.filter(function (trip) { return trip.status === "completed"; });
    const state = app.getState() || {};
    const accountPages = Object.assign({}, state.accountPages || {}, {
      session: { isAuthenticated: true, userId: user.id, email: user.email, remember: true, lastLoginAt: new Date().toISOString() },
      users: { [user.id]: user },
      credentials: {}
    });
    const users = Object.assign({}, state.users || {}, { [user.id]: user });
    app.setState({ accountPages, users, currentUser: user, trips: active, completedTrips: completed, networkState: "online" }, { source: "backend-bootstrap" });

    const params = new URLSearchParams(window.location.search);
    const tripId = params.get("tripId") || params.get("trip");
    if (tripId) {
      try {
        const detail = await api.trips.get(tripId);
        const trip = uiTrip(detail.trip, user.id);
        trip.segments = (detail.events || []).map(function (event) {
          return Object.assign({}, event, { start: event.startsAt, end: event.endsAt, from: event.departure, to: event.arrival });
        });
        app.setState({
          trip,
          activeTripId: trip.id,
          accessState: "granted",
          participants: detail.participants || [],
          documents: detail.documents || [],
          monitoringSignals: detail.monitoring || [],
          plans: detail.plans || [],
          messages: detail.messages || [],
          sosTickets: detail.sos || []
        }, { source: "backend-trip" });
      } catch (error) {
        if (error && (error.status === 403 || error.status === 404)) {
          app.setState({ accessState: "denied" }, { source: "backend-trip-denied" });
        }
      }
    }
    return true;
  }

  window.TravelSite = { hydrate, ready: hydrate() };
})();

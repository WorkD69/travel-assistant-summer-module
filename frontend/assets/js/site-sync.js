(function () {
  "use strict";

  const app = window.TravelAppState;
  const api = window.TravelAPI;
  if (!app || !api) {
    window.TravelSite = { ready: Promise.resolve(false) };
    return;
  }

  const localCreateTrip = typeof app.createTrip === "function" ? app.createTrip.bind(app) : null;
  const localUpdateTrip = typeof app.updateTrip === "function" ? app.updateTrip.bind(app) : null;

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

  function isoDateTime(value) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  function confirmedRoutePoints(data, segments) {
    const points = [];
    function append(point) {
      if (!point || !Number.isFinite(Number(point.latitude)) || !Number.isFinite(Number(point.longitude))) return;
      const previous = points[points.length - 1];
      const canonicalName = String(point.canonicalName || point.name || "").trim();
      if (!canonicalName) return;
      if (previous && previous.canonicalName === canonicalName) return;
      points.push({
        name: String(point.name || canonicalName).trim(),
        canonicalName,
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
        sortOrder: points.length,
        source: String(point.source || "nominatim")
      });
    }
    if (segments.length) {
      segments.slice().sort(function (left, right) { return Number(left.order || left.sortOrder || 0) - Number(right.order || right.sortOrder || 0); })
        .forEach(function (segment) { append(segment.fromPoint); append(segment.toPoint); });
    } else {
      append(data.fromPoint);
      append(data.toPoint);
    }
    return points;
  }

  function mutationPayload(payload) {
    const data = payload && payload.data || {};
    const segments = payload && payload.segments || [];
    const first = segments[0] || {};
    const last = segments[segments.length - 1] || {};
    const from = first.from || data.from || "";
    const to = last.to || data.to || "";
    const routePoints = confirmedRoutePoints(data, segments);
    const body = {
      title: data.title,
      route: (routePoints.length ? routePoints.map(function (point) { return point.name; }) : [from, to]).filter(Boolean).join(" → "),
      startDate: data.start,
      endDate: data.end,
      timezone: data.timezone,
      type: data.type === "solo" || data.type === "personal" ? "personal" : "group",
      status: data.status,
      routePoints: routePoints,
      events: segments.map(function (segment, index) {
        return {
          type: segment.type || "other",
          title: segment.title || [segment.from, segment.to].filter(Boolean).join(" → ") || "Сегмент " + (index + 1),
          startsAt: isoDateTime(segment.start || segment.startsAt),
          endsAt: isoDateTime(segment.end || segment.endsAt),
          departure: segment.from || segment.departure || null,
          arrival: segment.to || segment.arrival || null,
          status: segment.status || "scheduled",
          detail: segment.note || segment.detail || null,
          source: segment.source || segment.provider || "manual",
          reference: segment.ref || segment.reference || null,
          sortOrder: Number.isInteger(segment.sortOrder) ? segment.sortOrder : index
        };
      }).filter(function (event) { return Boolean(event.startsAt); })
    };
    if (body.routePoints.length < 2) delete body.routePoints;
    return body;
  }

  function replaceTripInCollections(trip) {
    const state = app.getState() || {};
    const active = (state.trips || []).filter(function (item) { return item.id !== trip.id; });
    const completed = (state.completedTrips || []).filter(function (item) { return item.id !== trip.id; });
    if (trip.status === "completed") completed.unshift(trip); else active.unshift(trip);
    return { active, completed };
  }

  function coreFlowState(detail, trip, user) {
    const monitoring = detail.monitoring || [];
    const plans = detail.plans || [];
    const messages = detail.messages || [];
    const selectedPlan = plans.find(function (plan) { return plan.status === "selected" || plan.status === "published"; });
    return {
      environment: "production",
      sourceStatus: "Backend API",
      accessState: "granted",
      networkState: "online",
      role: detail.trip.role,
      currentUser: { id: user.id, name: user.name, role: detail.trip.role, label: "Вы" },
      trip: { id: trip.id, title: trip.title, status: trip.status },
      participants: (detail.participants || []).map(function (participant) {
        return { id: participant.userId, name: participant.name, role: participant.role };
      }),
      segments: trip.segments,
      selectedSignalId: monitoring[0] && monitoring[0].id || "",
      violationConfirmed: monitoring.some(function (signal) { return signal.status === "confirmed"; }),
      planBVisible: plans.length > 0,
      selectedPlanBId: selectedPlan && selectedPlan.id || "",
      signals: monitoring.map(function (signal) {
        return {
          id: signal.id,
          type: signal.label,
          description: signal.detail || "",
          urgency: signal.severity,
          status: signal.status,
          time: signal.occurredAt,
          source: "Backend API",
          serverBacked: true,
          audience: { type: "all-participants", participantIds: [] }
        };
      }),
      planBOptions: plans.map(function (plan) {
        const affectedElements = Array.isArray(plan.affectedElements) ? plan.affectedElements : [];
        const impactFor = function (kind) {
          return affectedElements.some(function (item) { return String(item).toLowerCase().includes(kind); })
            ? "Затронуто — см. шаги плана"
            : "Без подтверждённых изменений";
        };
        return {
          id: plan.id,
          label: "Plan B — вариант " + plan.rank,
          title: plan.title,
          description: plan.summary || "",
          actions: Array.isArray(plan.steps) ? plan.steps : [],
          pros: Array.isArray(plan.pros) ? plan.pros : [],
          cons: Array.isArray(plan.cons) ? plan.cons : [],
          newTime: plan.timeImpact || "Не указано",
          delay: plan.timeImpact || "Не указано",
          cost: plan.priceImpact || "Не указано",
          risk: plan.strategy,
          complexity: affectedElements.length ? affectedElements.length + " затронуто" : "Не указано",
          hotel: impactFor("отел"),
          transfer: impactFor("трансфер"),
          activities: impactFor("актив"),
          whenToUse: plan.whenToUse || "",
          timeImpact: plan.timeImpact || "",
          priceImpact: plan.priceImpact || "",
          affectedElements: affectedElements,
          emailDraft: plan.emailDraft || null,
          generationSource: plan.generationSource || "deterministic-fallback",
          source: plan.generationSource === "groq" ? "AI provider" : "Безопасный резервный расчёт",
          serverBacked: true
        };
      }),
      messages: messages.map(function (message) {
        return {
          id: message.id,
          topic: message.title,
          text: message.text,
          author: message.authorName,
          time: message.publishedAt || "",
          status: message.status === "draft" ? "Черновик" : "Отправлено",
          recipients: { type: "all-participants", participantIds: [], providerType: null },
          planB: message.isPlanB ? "Plan B" : "",
          serverBacked: true
        };
      })
    };
  }

  function installPersistence() {
    if (localCreateTrip) {
      app.createTrip = async function (payload) {
        const response = await api.trips.create(mutationPayload(payload));
        const data = Object.assign({}, payload && payload.data || {}, { id: response.trip.id });
        return localCreateTrip(Object.assign({}, payload || {}, { data }));
      };
    }
    if (localUpdateTrip) {
      app.updateTrip = async function (id, payload) {
        await api.trips.update(id, mutationPayload(payload));
        return localUpdateTrip(id, payload);
      };
    }
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
        trip.routePoints = (detail.routePoints || []).map(function (point) { return Object.assign({}, point); });
        function pointFor(name) {
          return trip.routePoints.find(function (point) {
            return point.name === name || point.canonicalName === name;
          }) || null;
        }
        trip.segments = (detail.events || []).map(function (event) {
          return Object.assign({}, event, {
            start: event.startsAt, end: event.endsAt, from: event.departure, to: event.arrival,
            fromPoint: pointFor(event.departure), toPoint: pointFor(event.arrival),
            ref: event.reference, order: Number.isInteger(event.sortOrder) ? event.sortOrder + 1 : undefined
          });
        });
        trip.participants = (detail.participants || []).map(function (participant) { return participant.name; });
        trip.participantIds = (detail.participants || []).map(function (participant) { return participant.userId; });
        if (!trip.participantIds.includes(user.id)) trip.participantIds.push(user.id);
        trip.roles = (detail.participants || []).reduce(function (roles, participant) {
          roles[participant.userId] = participant.role;
          return roles;
        }, { [user.id]: detail.trip.role });
        trip.workspaceDocuments = (detail.documents || []).map(function (document) {
          const status = document.status === "confirmed"
            ? "confirmed"
            : document.ocrStatus === "failed" ? "error" : "review";
          return Object.assign({}, document, {
            name: document.title,
            format: String(document.mimeType || "").split("/").pop().toUpperCase() || "FILE",
            size: document.sizeBytes ? Math.max(document.sizeBytes / 1024, 1).toFixed(0) + " КБ" : "—",
            status,
            visibility: document.visibility === "organizer_only" ? "private" : document.visibility,
            ocrStatus: document.ocrStatus || "not_requested",
            extractedData: document.extractedData || {},
            source: "Backend API",
            serverBacked: true
          });
        });
        trip.documents = trip.workspaceDocuments.length;
        trip.planB = (detail.plans || []).length;
        trip.incidents = (detail.monitoring || []).length;
        const collections = replaceTripInCollections(trip);
        app.setState({
          trips: collections.active,
          completedTrips: collections.completed,
          trip,
          activeTripId: trip.id,
          accessState: "granted",
          participants: detail.participants || [],
          documents: detail.documents || [],
          monitoringSignals: detail.monitoring || [],
          plans: detail.plans || [],
          messages: detail.messages || [],
          sosTickets: detail.sos || [],
          coreFlow: coreFlowState(detail, trip, user)
        }, { source: "backend-trip" });
      } catch (error) {
        if (error && (error.status === 403 || error.status === 404)) {
          app.setState({ accessState: "denied" }, { source: "backend-trip-denied" });
        }
      }
    }
    return true;
  }

  installPersistence();
  window.TravelSite = { hydrate, ready: hydrate() };
})();

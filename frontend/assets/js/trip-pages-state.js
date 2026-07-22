(function () {
  "use strict";

  const STORAGE_KEY = "TripPagesPreviewState.v2";
  const WORKSPACE_HREF = "./trip-overview.html";

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const nowIso = () => new Date().toISOString();

  const seedState = {
    user: { id: "u-artem", name: "Артём", initials: "А", role: "Организатор" },
    workspaceHref: WORKSPACE_HREF,
    trips: [
      {
        id: "trip-turkey-2026",
        title: "Отпуск в Турции",
        status: "active",
        kind: "Групповая",
        role: "Организатор",
        route: "Сыктывкар → Москва → Анталья",
        from: "Сыктывкар",
        to: "Анталья",
        dates: "19–25 июля 2026",
        start: "2026-07-19",
        end: "2026-07-25",
        participants: ["Артём", "Станислав", "Анна", "Михаил"],
        documents: 5,
        nextEvent: "19:30 · Трансфер в отель",
        monitoring: "Активен",
        attention: "Требует внимания",
        risk: "Средний",
        routePoints: ["Сыктывкар", "Москва", "Анталья"],
        notify: ["Telegram", "Email", "Ежедневная сводка"],
        segments: [
          segment("seg-skv-mow", "Самолёт", "Сыктывкар", "Москва", "2026-07-19T08:40", "2026-07-19T10:25", "SU6408", "Аэрофлот", "Пересадка в Москве", "Подтверждён", 1),
          segment("seg-mow-ayt", "Самолёт", "Москва", "Анталья", "2026-07-19T14:20", "2026-07-19T18:40", "TK212", "Turkish Airlines", "Проверить багаж", "Подтверждён", 2),
          segment("seg-transfer", "Трансфер", "Аэропорт Антальи", "Akra Antalya", "2026-07-19T19:30", "2026-07-19T20:30", "TR-7791", "Hotel Transfer", "Встреча у выхода", "Подтверждён", 3)
        ]
      },
      {
        id: "trip-kazan-2026",
        title: "Соло-выезд в Казань",
        status: "upcoming",
        kind: "Соло",
        role: "Организатор",
        route: "Москва → Казань",
        from: "Москва",
        to: "Казань",
        dates: "12–15 сентября 2026",
        start: "2026-09-12",
        end: "2026-09-15",
        participants: ["Артём"],
        documents: 2,
        nextEvent: "12 сентября · Поезд",
        monitoring: "Запланирован",
        attention: "Без предупреждений",
        risk: "Низкий",
        routePoints: ["Москва", "Казань"],
        notify: ["Email"],
        segments: []
      },
      {
        id: "trip-spb-2026",
        title: "Командировка в Санкт-Петербург",
        status: "upcoming",
        kind: "Групповая",
        role: "Участник",
        route: "Сыктывкар → Санкт-Петербург",
        from: "Сыктывкар",
        to: "Санкт-Петербург",
        dates: "3–5 октября 2026",
        start: "2026-10-03",
        end: "2026-10-05",
        participants: ["Ольга", "Артём", "Игорь"],
        documents: 3,
        nextEvent: "3 октября · Вылет",
        monitoring: "Ожидает подтверждения",
        attention: "Проверить документы",
        risk: "Средний",
        routePoints: ["Сыктывкар", "Санкт-Петербург"],
        notify: ["Telegram"],
        segments: []
      }
    ],
    invitations: [
      {
        id: "invite-almaty",
        status: "active",
        inviterId: "u-stanislav",
        inviterName: "Станислав",
        title: "Алматы на ноябрьские",
        route: "Москва → Алматы",
        dates: "2–7 ноября 2026",
        startDate: "2026-11-02",
        endDate: "2026-11-07",
        role: "Участник",
        accessMode: "member",
        expiresAt: "2026-07-22T18:00:00.000Z",
        expires: "действует 3 дня"
      },
      {
        id: "invite-minsk",
        status: "active",
        inviterId: "u-anna",
        inviterName: "Анна",
        title: "Минск с друзьями",
        route: "Москва → Минск",
        dates: "5–8 декабря 2026",
        startDate: "2026-12-05",
        endDate: "2026-12-08",
        role: "Только просмотр",
        accessMode: "readonly",
        expiresAt: "2026-07-25T18:00:00.000Z",
        expires: "действует 6 дней"
      },
      {
        id: "invite-istanbul",
        status: "expired",
        inviterId: "u-mikhail",
        inviterName: "Михаил",
        title: "Стамбул на выходные",
        route: "Москва → Стамбул",
        dates: "14–16 июня 2026",
        startDate: "2026-06-14",
        endDate: "2026-06-16",
        role: "Участник",
        accessMode: "member",
        expiresAt: "2026-06-01T18:00:00.000Z",
        expires: "истекло"
      },
      {
        id: "invite-yerevan",
        status: "revoked",
        inviterId: "u-olga",
        inviterName: "Ольга",
        title: "Ереван весной",
        route: "Москва → Ереван",
        dates: "1–6 мая 2026",
        startDate: "2026-05-01",
        endDate: "2026-05-06",
        role: "Участник",
        accessMode: "member",
        expiresAt: "2026-04-20T18:00:00.000Z",
        expires: "отозвано"
      }
    ],
    completedTrips: [
      completed("done-tbilisi", "Весна в Тбилиси", "Москва → Тбилиси → Казбеги", "12–19 апреля 2026", "2026", "Организатор", "Групповая", 4, 7, "Ночной трансфер через Мцхету", 2, "2026-04-19"),
      completed("done-kaliningrad", "Соло-уикенд в Калининграде", "Москва → Калининград", "21–24 февраля 2026", "2026", "Организатор", "Соло", 1, 3, "Не требовался", 0, "2026-02-24"),
      completed("done-karelia", "Летняя Карелия", "Санкт-Петербург → Сортавала → Рускеала", "9–14 августа 2025", "2025", "Участник", "Групповая", 6, 5, "Автобус вместо электрички", 1, "2025-08-14"),
      completed("done-ekb", "Рабочий выезд в Екатеринбург", "Сыктывкар → Москва → Екатеринбург", "3–6 марта 2025", "2025", "Участник", "Групповая", 3, 4, "Перебронирование отеля", 3, "2025-03-06")
    ],
    drafts: [
      {
        id: "draft-turkey-family",
        updatedAt: "2026-07-19T09:40:00.000Z",
        step: 3,
        progress: 38,
        data: wizardSeed("Семейная поездка в Турцию"),
        segments: [
          segment("draft-seg-1", "Самолёт", "Сыктывкар", "Москва", "2026-07-19T08:40", "2026-07-19T10:25", "SU6408", "Аэрофлот", "", "Черновик", 1)
        ]
      }
    ]
  };

  function segment(id, type, from, to, start, end, ref, provider, note, status, order) {
    return { id, type, from, to, start, end, ref, provider, note, status, order };
  }

  function completed(id, title, route, dates, year, role, kind, participants, documents, planB, incidents, sortDate) {
    return { id, title, route, dates, year, role, kind, participants, documents, planB, incidents, status: "completed", sortDate };
  }

  function wizardSeed(title) {
    return {
      id: "trip-" + Math.random().toString(36).slice(2, 8),
      type: "group",
      title,
      description: "",
      start: "",
      end: "",
      timezone: "",
      cover: "",
      hotel: "",
      address: "",
      checkin: "",
      checkout: "",
      transfer: "",
      contacts: "",
      notes: "",
      organizer: "Артём",
      inviteEmail: "",
      inviteExpires: "7 дней",
      readonlyAccess: true,
      invitationDrafts: [],
      documentsMode: "later",
      documentVisibility: "mixed",
      documentSetup: [],
      notifyFlights: false,
      notifyTransfer: false,
      notifyHotel: false,
      notifyTelegram: false,
      notifyEmail: false,
      notifyDaily: false,
      sos: false
    };
  }

  function loadFallback() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && saved.version === 2) return saved.state;
    } catch (_) {}
    return clone(seedState);
  }

  function saveFallback(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, state }));
  }

  const listeners = new Set();
  let fallbackState = loadFallback();

  function emit() {
    saveFallback(fallbackState);
    listeners.forEach((listener) => listener(clone(fallbackState)));
  }

  function mutate(updater) {
    updater(fallbackState);
    emit();
  }

  function publish(type, detail = {}) {
    window.dispatchEvent(new CustomEvent(type, {
      detail: {
        currentUserId: fallbackState.user.id,
        createdAt: nowIso(),
        ...detail
      }
    }));
  }

  function invitationToTrip(invite) {
    return {
      id: "trip-from-" + invite.id,
      title: invite.title,
      status: "upcoming",
      kind: "Групповая",
      role: invite.role === "Только просмотр" ? "Участник" : invite.role,
      accessMode: invite.accessMode,
      route: invite.route,
      from: invite.route.split("→")[0].trim(),
      to: invite.route.split("→").slice(-1)[0].trim(),
      dates: invite.dates,
      start: invite.startDate,
      end: invite.endDate,
      participants: [invite.inviterName, fallbackState.user.name],
      documents: 0,
      nextEvent: "Ожидает детализации маршрута",
      monitoring: "Не настроен",
      attention: "Новая поездка",
      risk: "Низкий",
      routePoints: invite.route.split("→").map((item) => item.trim()),
      notify: ["Email"],
      segments: []
    };
  }

  function draftProgress(data, segments, step) {
    const checks = [data.type, data.title, data.start, data.end, data.timezone, data.hotel, data.documentVisibility, data.notifyEmail || data.notifyTelegram, segments.length > 0];
    return Math.min(100, Math.round((checks.filter(Boolean).length / checks.length) * 100 + step * 2));
  }

  function createApi() {
    const external = window.TravelAppState || null;
    const externalTripPagesState = () => {
      if (!external) return null;
      if (typeof external.getTripPagesState === "function") return external.getTripPagesState();
      if (typeof external.getState === "function") {
        const snapshot = external.getState();
        return normalizeExternalState(snapshot?.tripPages || snapshot?.tripsDashboard || snapshot);
      }
      return null;
    };
    const externalSubscriptions = new Set();
    return {
      source: external ? "TravelAppState" : "TripPagesPreviewState",
      workspaceHref: WORKSPACE_HREF,
      getState() {
        return clone(externalTripPagesState() || fallbackState);
      },
      subscribe(listener) {
        let externalUnsubscribe = null;
        if (external && typeof external.subscribe === "function") {
          externalUnsubscribe = external.subscribe(() => listener(this.getState()));
        } else if (external && typeof external.onChange === "function") {
          externalUnsubscribe = external.onChange(() => listener(this.getState()));
        }
        if (externalUnsubscribe) externalSubscriptions.add(externalUnsubscribe);
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
          if (typeof externalUnsubscribe === "function") {
            externalUnsubscribe();
            externalSubscriptions.delete(externalUnsubscribe);
          }
        };
      },
      acceptInvitation(id) {
        if (external && typeof external.acceptTripInvitation === "function") {
          const result = external.acceptTripInvitation(id);
          publish("trip-pages:invitation-accepted", { invitationId: id, tripId: result?.id || result?.tripId });
          return result;
        }
        let result = null;
        mutate((state) => {
          const invite = state.invitations.find((item) => item.id === id);
          if (!invite || invite.status !== "active") return;
          invite.status = "accepted";
          const trip = invitationToTrip(invite);
          state.trips.unshift(trip);
          result = trip;
        });
        if (result) publish("trip-pages:invitation-accepted", { invitationId: id, tripId: result.id });
        return result;
      },
      rejectInvitation(id) {
        if (external && typeof external.rejectTripInvitation === "function") {
          const result = external.rejectTripInvitation(id);
          publish("trip-pages:invitation-rejected", { invitationId: id });
          return result;
        }
        mutate((state) => {
          const invite = state.invitations.find((item) => item.id === id);
          if (invite && invite.status === "active") invite.status = "rejected";
        });
        publish("trip-pages:invitation-rejected", { invitationId: id });
      },
      createTrip(payload) {
        if (external && typeof external.createTrip === "function") {
          const result = external.createTrip(payload);
          publish("trip-pages:trip-created", { tripId: result?.id || result?.tripId, draftId: payload.draftId, changedFields: Object.keys(payload.data || {}) });
          return result;
        }
        const trip = {
          id: payload.data.id || "trip-" + Date.now(),
          title: payload.data.title,
          status: "active",
          kind: payload.data.type === "solo" ? "Соло" : "Групповая",
          role: "Организатор",
          route: routeFromSegments(payload.segments, payload.data),
          from: payload.segments[0]?.from || payload.data.from || "Начало",
          to: payload.segments[payload.segments.length - 1]?.to || payload.data.to || "Финиш",
          dates: formatDateRange(payload.data.start, payload.data.end),
          start: payload.data.start,
          end: payload.data.end,
          description: payload.data.description,
          timezone: payload.data.timezone,
          cover: payload.data.cover,
          logistics: logisticsFromData(payload.data),
          participants: [fallbackState.user.name],
          invitationDrafts: clone(payload.data.invitationDrafts || []),
          documentSetup: clone(payload.data.documentSetup || []),
          documents: (payload.data.documentSetup || []).length,
          nextEvent: payload.segments[0] ? formatSegmentShort(payload.segments[0]) : "Маршрут ожидает детализации",
          monitoring: payload.data.notifyFlights || payload.data.notifyTransfer ? "Активен" : "Не настроен",
          attention: payload.warnings?.length ? "Есть предупреждения" : "Без предупреждений",
          risk: payload.errors?.length ? "Высокий" : payload.warnings?.length ? "Средний" : "Низкий",
          routePoints: routePoints(payload.segments),
          notify: notifyList(payload.data),
          monitoringSettings: monitoringFromData(payload.data),
          segments: clone(payload.segments),
          updatedAt: nowIso()
        };
        mutate((state) => {
          state.trips.unshift(trip);
          state.drafts = state.drafts.filter((draft) => draft.id !== payload.draftId);
        });
        publish("trip-pages:trip-created", { tripId: trip.id, draftId: payload.draftId, changedFields: Object.keys(payload.data || {}) });
        return trip;
      },
      updateTrip(id, payload) {
        if (external && typeof external.updateTrip === "function") {
          const result = external.updateTrip(id, payload);
          publish("trip-pages:trip-updated", { tripId: id, changedFields: Object.keys(payload.data || {}), updatedAt: nowIso() });
          return result;
        }
        let updated = null;
        mutate((state) => {
          const index = state.trips.findIndex((trip) => trip.id === id);
          if (index === -1) return;
          const base = state.trips[index];
          updated = {
            ...base,
            title: payload.data.title,
            description: payload.data.description,
            kind: payload.data.type === "solo" ? "Соло" : "Групповая",
            dates: formatDateRange(payload.data.start, payload.data.end),
            start: payload.data.start,
            end: payload.data.end,
            timezone: payload.data.timezone,
            route: routeFromSegments(payload.segments, payload.data),
            from: payload.segments[0]?.from || payload.data.from || base.from,
            to: payload.segments[payload.segments.length - 1]?.to || payload.data.to || base.to,
            routePoints: routePoints(payload.segments),
            logistics: logisticsFromData(payload.data),
            hotel: payload.data.hotel,
            transfer: payload.data.transfer,
            invitationDrafts: clone(payload.data.invitationDrafts || []),
            documentSetup: clone(payload.data.documentSetup || []),
            documents: (payload.data.documentSetup || []).length,
            nextEvent: payload.segments[0] ? formatSegmentShort(payload.segments[0]) : base.nextEvent,
            monitoring: payload.data.notifyFlights || payload.data.notifyTransfer ? "Активен" : "Не настроен",
            monitoringSettings: monitoringFromData(payload.data),
            notify: notifyList(payload.data),
            segments: clone(payload.segments),
            updatedAt: nowIso()
          };
          state.trips[index] = updated;
        });
        if (updated) publish("trip-pages:trip-updated", { tripId: id, changedFields: Object.keys(payload.data || {}), updatedAt: updated.updatedAt });
        return updated;
      },
      saveDraft(id, data, segments, step) {
        if (external && typeof external.saveTripDraft === "function") {
          const result = external.saveTripDraft({ id, data, segments, step });
          publish("trip-pages:draft-saved", { draftId: result?.id || id, updatedAt: nowIso() });
          return result;
        }
        const draft = { id: id || "draft-" + Date.now(), updatedAt: nowIso(), step, progress: draftProgress(data, segments, step), data: clone(data), segments: clone(segments) };
        mutate((state) => {
          const index = state.drafts.findIndex((item) => item.id === draft.id);
          if (index === -1) state.drafts.unshift(draft);
          else state.drafts[index] = draft;
        });
        publish("trip-pages:draft-saved", { draftId: draft.id, updatedAt: draft.updatedAt });
        return draft;
      },
      deleteDraft(id) {
        if (external && typeof external.deleteTripDraft === "function") {
          const result = external.deleteTripDraft(id);
          publish("trip-pages:draft-deleted", { draftId: id });
          return result;
        }
        mutate((state) => {
          state.drafts = state.drafts.filter((draft) => draft.id !== id);
        });
        publish("trip-pages:draft-deleted", { draftId: id });
      },
      resetPreview() {
        fallbackState = clone(seedState);
        emit();
      },
      destroy() {
        listeners.clear();
        externalSubscriptions.forEach((unsubscribe) => unsubscribe());
        externalSubscriptions.clear();
      },
      seedWizardData: wizardSeed
    };
  }

  function normalizeExternalState(snapshot) {
    if (!snapshot) return null;
    const trips = Array.isArray(snapshot.trips) ? snapshot.trips : [];
    const completedTrips = Array.isArray(snapshot.completedTrips) ? snapshot.completedTrips : trips.filter((trip) => trip.status === "completed");
    return {
      user: snapshot.currentUser || snapshot.user || seedState.user,
      currentUser: snapshot.currentUser || snapshot.user || seedState.user,
      workspaceHref: snapshot.workspaceHref || WORKSPACE_HREF,
      trips: trips.filter((trip) => trip.status !== "completed"),
      invitations: Array.isArray(snapshot.invitations) ? snapshot.invitations : [],
      drafts: Array.isArray(snapshot.drafts) ? snapshot.drafts : [],
      completedTrips
    };
  }

  function routeFromSegments(segments, data) {
    const points = routePoints(segments);
    return points.length ? points.join(" → ") : [data.from, data.to].filter(Boolean).join(" → ");
  }

  function logisticsFromData(data) {
    return {
      hotel: data.hotel || "",
      address: data.address || "",
      checkin: data.checkin || "",
      checkout: data.checkout || "",
      transfer: data.transfer || "",
      contacts: data.contacts || "",
      notes: data.notes || ""
    };
  }

  function monitoringFromData(data) {
    return {
      flights: Boolean(data.notifyFlights),
      transfer: Boolean(data.notifyTransfer),
      hotel: Boolean(data.notifyHotel),
      telegram: Boolean(data.notifyTelegram),
      email: Boolean(data.notifyEmail),
      daily: Boolean(data.notifyDaily),
      sos: Boolean(data.sos)
    };
  }

  function routePoints(segments) {
    if (!segments.length) return [];
    const points = [segments[0].from];
    segments.forEach((segment) => {
      if (segment.to && points[points.length - 1] !== segment.to) points.push(segment.to);
    });
    return points.filter(Boolean);
  }

  function formatDateRange(start, end) {
    if (!start || !end) return "Даты не заданы";
    return start + " — " + end;
  }

  function formatSegmentShort(segment) {
    const time = segment.start ? segment.start.slice(11, 16) : "";
    return `${time} · ${segment.from} → ${segment.to}`;
  }

  function notifyList(data) {
    return [
      data.notifyTelegram ? "Telegram" : null,
      data.notifyEmail ? "Email" : null,
      data.notifyDaily ? "Ежедневная сводка" : null,
      data.sos ? "SOS" : null
    ].filter(Boolean);
  }

  window.TripPagesAdapter = createApi();
})();

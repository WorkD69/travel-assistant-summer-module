/* app-state-bridge.js — единый state bridge финальной сборки.
   Расширяет TravelAppState основы (features/app-state.js) доменными методами
   и коллекциями, которые нужны веткам trip-pages, core-flow и account-pages.
   Ровно один production source of truth: window.TravelAppState. */
(function () {
  "use strict";

  const app = window.TravelAppState;
  if (!app || app.__finalBridge) return;

  const STORAGE_KEY = "travelAssistant.final.appState.v1";
  const SESSION_STORAGE_KEY = "travelAssistant.final.sessionState.v1";
  const clone = (value) => JSON.parse(JSON.stringify(value === undefined ? null : value));
  const nowIso = () => new Date().toISOString();
  const toArray = (value) => Array.isArray(value) ? value : (value && typeof value === "object" ? Object.values(value) : []);

  const origGetState = app.getState.bind(app);
  const origSetState = app.setState.bind(app);
  const origSubscribe = app.subscribe.bind(app);
  const origUnsubscribe = typeof app.unsubscribe === "function" ? app.unsubscribe.bind(app) : null;
  const origUpdateTrip = typeof app.updateTrip === "function" ? app.updateTrip.bind(app) : null;
  const origReset = typeof app.resetDemoData === "function" ? app.resetDemoData.bind(app) : null;

  /* ── demo seed (единственный источник demo-данных объединённых веток) ── */

  function seg(id, type, from, to, start, end, ref, provider, note, status, order) {
    return { id, type, from, to, start, end, ref, provider, note, status, order };
  }

  function seedTrips() {
    return [
      {
        id: "trip-turkey-2026", title: "Отпуск в Турции", status: "active", kind: "Групповая",
        role: "Организатор", route: "Сыктывкар → Москва → Анталья", from: "Сыктывкар", to: "Анталья",
        dates: "19–25 июля 2026", start: "2026-07-19", end: "2026-07-25", timezone: "Europe/Istanbul",
        participants: ["Артём", "Станислав", "Анна", "Михаил"], participantIds: ["artem", "stanislav", "anna", "mikhail"],
        documents: 5, nextEvent: "19:30 · Трансфер в отель", monitoring: "Активен",
        attention: "Требует внимания", risk: "Средний", routePoints: ["Сыктывкар", "Москва", "Анталья"],
        notify: ["Telegram", "Email", "Ежедневная сводка"],
        logistics: { hotel: "Akra Antalya", address: "Lara Yolu, Antalya", checkin: "2026-07-19T21:00", checkout: "2026-07-25T11:00", transfer: "Трансфер аэропорт → отель", contacts: "+90 242 000 00 00" },
        routePreview: "assets/route-preview.png",
        weather: [
          { city: "Сыктывкар", temp: "+14°", desc: "Пасмурно, ветер 6 м/с" },
          { city: "Москва", temp: "+22°", desc: "Переменная облачность" },
          { city: "Анталья", temp: "+33°", desc: "Ясно, жарко" }
        ],
        weatherUpdated: "Обновлено: сегодня, 07:12 · демонстрационные данные",
        segments: [
          Object.assign(seg("seg-skv-mow", "Самолёт", "Сыктывкар", "Москва", "2026-07-19T08:40", "2026-07-19T10:25", "SU6408", "Аэрофлот", "Пересадка в Москве", "Подтверждён", 1), { terminal: "A", checkinUntil: "до 07:40" }),
          seg("seg-mow-ayt", "Самолёт", "Москва", "Анталья", "2026-07-19T14:20", "2026-07-19T18:40", "TK212", "Turkish Airlines", "Проверить багаж", "Подтверждён", 2),
          seg("seg-transfer", "Трансфер", "Аэропорт Антальи", "Akra Antalya", "2026-07-19T19:30", "2026-07-19T20:30", "TR-7791", "Hotel Transfer", "Встреча у выхода", "Подтверждён", 3)
        ]
      },
      {
        id: "trip-kazan-2026", title: "Соло-выезд в Казань", status: "upcoming", kind: "Соло",
        role: "Организатор", route: "Москва → Казань", from: "Москва", to: "Казань",
        dates: "12–15 сентября 2026", start: "2026-09-12", end: "2026-09-15", timezone: "Europe/Moscow",
        participants: ["Артём"], participantIds: ["artem"], documents: 2,
        nextEvent: "12 сентября · Поезд", monitoring: "Запланирован", attention: "Без предупреждений",
        risk: "Низкий", routePoints: ["Москва", "Казань"], notify: ["Email"],
        logistics: { hotel: "Ногай Отель", address: "ул. Профсоюзная, 16Б, Казань", checkin: "2026-09-13T14:00", checkout: "2026-09-15T12:00" },
        segments: [
          seg("seg-mow-kzn", "Поезд", "Москва", "Казань", "2026-09-12T22:08", "2026-09-13T09:20", "002Й", "РЖД", "Фирменный поезд «Татарстан»", "Подтверждён", 1)
        ],
        workspaceDocuments: [
          { id: "kzn-ticket", name: "Билет Москва — Казань.pdf", type: "Поезд", format: "PDF", size: "360 КБ", sizeMb: 0.36, uploadedAt: "1 сентября 2026, 12:40", status: "confirmed", ocrConfirmed: true, visibility: "shared", segment: "Москва → Казань, 12 сентября, 22:08", source: "Загружено организатором", processedAt: "1 сентября 2026, 12:41" },
          { id: "kzn-hotel", name: "Бронь отеля в Казани.pdf", type: "Отель", format: "PDF", size: "520 КБ", sizeMb: 0.52, uploadedAt: "2 сентября 2026, 09:15", status: "review", ocrConfirmed: false, visibility: "shared", segment: "Казань, 12–15 сентября", source: "Импортировано из бронирования", processedAt: "2 сентября 2026, 09:17" }
        ]
      },
      {
        id: "trip-spb-2026", title: "Командировка в Санкт-Петербург", status: "upcoming", kind: "Групповая",
        role: "Участник", route: "Сыктывкар → Санкт-Петербург", from: "Сыктывкар", to: "Санкт-Петербург",
        dates: "3–5 октября 2026", start: "2026-10-03", end: "2026-10-05", timezone: "Europe/Moscow",
        participants: ["Ольга", "Артём", "Игорь"], participantIds: ["olga", "artem", "igor"], documents: 3,
        nextEvent: "3 октября · Вылет", monitoring: "Ожидает подтверждения", attention: "Проверить документы",
        risk: "Средний", routePoints: ["Сыктывкар", "Санкт-Петербург"], notify: ["Telegram"], segments: []
      }
    ];
  }

  function seedHomeInvitations() {
    return [
      { id: "invite-almaty", status: "active", inviterId: "u-stanislav", inviterName: "Станислав", title: "Алматы на ноябрьские", route: "Москва → Алматы", dates: "2–7 ноября 2026", startDate: "2026-11-02", endDate: "2026-11-07", role: "Участник", accessMode: "member", expiresAt: "2026-07-22T18:00:00.000Z", expires: "действует 3 дня" },
      { id: "invite-minsk", status: "active", inviterId: "u-anna", inviterName: "Анна", title: "Минск с друзьями", route: "Москва → Минск", dates: "5–8 декабря 2026", startDate: "2026-12-05", endDate: "2026-12-08", role: "Только просмотр", accessMode: "readonly", expiresAt: "2026-07-25T18:00:00.000Z", expires: "действует 6 дней" },
      { id: "invite-istanbul", status: "expired", inviterId: "u-mikhail", inviterName: "Михаил", title: "Стамбул на выходные", route: "Москва → Стамбул", dates: "14–16 июня 2026", startDate: "2026-06-14", endDate: "2026-06-16", role: "Участник", accessMode: "member", expiresAt: "2026-06-01T18:00:00.000Z", expires: "истекло" },
      { id: "invite-yerevan", status: "revoked", inviterId: "u-olga", inviterName: "Ольга", title: "Ереван весной", route: "Москва → Ереван", dates: "1–6 мая 2026", startDate: "2026-05-01", endDate: "2026-05-06", role: "Участник", accessMode: "member", expiresAt: "2026-04-20T18:00:00.000Z", expires: "отозвано" }
    ];
  }

  function completed(id, title, route, dates, year, role, kind, participants, documents, planB, incidents, sortDate) {
    return {
      id,
      title,
      route,
      dates,
      year,
      role,
      kind,
      participants,
      participantIds: ["artem"],
      roles: { artem: role === "Организатор" ? "organizer" : "participant" },
      documents,
      planB,
      incidents,
      status: "completed",
      sortDate
    };
  }

  function seedCompleted() {
    return [
      completed("done-tbilisi", "Весна в Тбилиси", "Москва → Тбилиси → Казбеги", "12–19 апреля 2026", "2026", "Организатор", "Групповая", 4, 7, "Ночной трансфер через Мцхету", 2, "2026-04-19"),
      completed("done-kaliningrad", "Соло-уикенд в Калининграде", "Москва → Калининград", "21–24 февраля 2026", "2026", "Организатор", "Соло", 1, 3, "Не требовался", 0, "2026-02-24"),
      completed("done-karelia", "Летняя Карелия", "Санкт-Петербург → Сортавала → Рускеала", "9–14 августа 2025", "2025", "Участник", "Групповая", 6, 5, "Автобус вместо электрички", 1, "2025-08-14"),
      completed("done-ekb", "Рабочий выезд в Екатеринбург", "Сыктывкар → Москва → Екатеринбург", "3–6 марта 2025", "2025", "Участник", "Групповая", 3, 4, "Перебронирование отеля", 3, "2025-03-06")
    ].map(function (record) {
      if (record.id !== "done-tbilisi") return record;
      return Object.assign({}, record, {
        start: "2026-04-12", end: "2026-04-19",
        routePoints: ["Москва", "Тбилиси", "Казбеги"],
        participantIds: ["artem", "anna", "mikhail", "olga"],
        roles: { artem: "organizer", anna: "participant", mikhail: "participant", olga: "participant" },
        logistics: { hotel: "Old Tbilisi Inn", address: "ул. Бетлеми 12, Тбилиси", checkin: "2026-04-12T15:00", checkout: "2026-04-19T11:00", transfer: "Ночной трансфер через Мцхету", contacts: "+995 32 200 00 00" },
        segments: [
          seg("seg-mow-tbs", "Самолёт", "Москва", "Тбилиси", "2026-04-12T09:15", "2026-04-12T14:05", "SU512", "Аэрофлот", "Завершён по расписанию", "Завершён", 1),
          seg("seg-tbs-kzb", "Трансфер", "Тбилиси", "Казбеги", "2026-04-15T21:00", "2026-04-16T00:30", "GT-118", "Georgian Transfer", "Ночной трансфер через Мцхету", "Завершён", 2)
        ],
        documents: 3,
        workspaceDocuments: [
          { id: "tbs-ticket", name: "Авиабилет Москва — Тбилиси", type: "Авиабилет", format: "PDF", size: "480 КБ", sizeMb: 0.48, uploadedAt: "12 апреля 2026", status: "confirmed", ocrConfirmed: true, visibility: "shared", segment: "Москва → Тбилиси", source: "Архив поездки" },
          { id: "tbs-hotel", name: "Бронь Old Tbilisi Inn", type: "Бронь отеля", format: "PDF", size: "350 КБ", sizeMb: 0.35, uploadedAt: "12 апреля 2026", status: "confirmed", ocrConfirmed: true, visibility: "shared", segment: "Тбилиси", source: "Архив поездки" },
          { id: "tbs-transfer", name: "Ваучер трансфера в Казбеги", type: "Трансфер", format: "PDF", size: "210 КБ", sizeMb: 0.21, uploadedAt: "15 апреля 2026", status: "confirmed", ocrConfirmed: true, visibility: "shared", segment: "Тбилиси → Казбеги", source: "Архив поездки" }
        ]
      });
    });
  }

  function seedDrafts() {
    return [{
      id: "draft-turkey-family", updatedAt: "2026-07-19T09:40:00.000Z", step: 3, progress: 38,
      data: {
        id: "trip-family-draft", type: "group", title: "Семейная поездка в Турцию",
        description: "Маршрут с перелётом, трансфером и проживанием.",
        start: "2026-07-19", end: "2026-07-25", timezone: "Europe/Istanbul", cover: "Море и маршрут",
        hotel: "Akra Antalya", address: "Lara Yolu, Antalya", checkin: "2026-07-19T21:00", checkout: "2026-07-25T11:00",
        transfer: "Трансфер аэропорт → отель", contacts: "+90 242 000 00 00", notes: "Проверить позднее заселение.",
        organizer: "Артём", inviteEmail: "", inviteExpires: "7 дней", readonlyAccess: true, invitationDrafts: [],
        documentsMode: "demo", documentVisibility: "mixed",
        documentSetup: [
          { id: "doc-flight", title: "Авиабилеты", type: "Авиабилет", visibility: "Участникам" },
          { id: "doc-hotel", title: "Бронь отеля", type: "Бронь отеля", visibility: "Участникам" },
          { id: "doc-insurance", title: "Страховка", type: "Страховка", visibility: "Только организатору" }
        ],
        notifyFlights: true, notifyTransfer: true, notifyHotel: true,
        notifyTelegram: true, notifyEmail: true, notifyDaily: true, sos: true
      },
      segments: [seg("draft-seg-1", "Самолёт", "Сыктывкар", "Москва", "2026-07-19T08:40", "2026-07-19T10:25", "SU6408", "Аэрофлот", "", "Черновик", 1)]
    }];
  }

  function roleLabel(role) {
    return role === "organizer" ? "Организатор" : "Участник";
  }

  function roleCode(label) {
    return label === "Организатор" || label === "organizer" ? "organizer" : "participant";
  }

  function tripDocuments(trip) {
    if (Array.isArray(trip.workspaceDocuments)) return clone(trip.workspaceDocuments);
    if (Array.isArray(trip.documentSetup) && trip.documentSetup.length) {
      return trip.documentSetup.map((doc, index) => ({
        id: doc.id || "doc-" + trip.id + "-" + index,
        name: doc.title || "Документ поездки",
        type: doc.type || "Документ",
        format: "PDF",
        size: "420 КБ",
        sizeMb: 0.42,
        uploadedAt: "Сохранено в мастере",
        status: "confirmed",
        ocrConfirmed: true,
        visibility: doc.visibility === "Только организатору" ? "private" : "shared",
        segment: trip.route || "Маршрут поездки",
        source: "Данные выбранной поездки",
        processedAt: "После создания"
      }));
    }
    return [];
  }

  function tripParticipants(trip, state, currentUserId, role) {
    const ids = Array.isArray(trip.participantIds) ? trip.participantIds : [];
    const names = Array.isArray(trip.participants) ? trip.participants : [];
    const users = state.users || {};
    const tones = ["a", "b", "c", "d", "e"];
    return (ids.length ? ids : names.map((_, index) => "p-" + trip.id + "-" + index)).map((id, index) => {
      const user = users[id] || {};
      const name = user.name || displayNameOf(user) || names[index] || "Участник";
      const memberRole = (trip.roles && trip.roles[id]) || (id === currentUserId ? role : (index === 0 ? "organizer" : "participant"));
      return {
        id,
        userId: id,
        name,
        initials: initialsOf(name),
        shortLabel: name.slice(0, 2),
        role: memberRole,
        isCurrent: id === currentUserId,
        access: "Активен",
        telegram: id === "anna" ? "Не подключён" : "Подключён",
        joined: "июль 2026",
        tone: tones[index % tones.length]
      };
    });
  }

  function enrichTrip(trip) {
    const copy = Object.assign({}, trip);
    if (!copy.roles) {
      copy.roles = {};
      (copy.participantIds || []).forEach((id, index) => {
        copy.roles[id] = index === 0 && copy.role === "Организатор" ? "organizer" : "participant";
      });
    }
    if (copy.id === "trip-turkey-2026") {
      copy.roles = { artem: "organizer", stanislav: "participant", anna: "participant", mikhail: "participant" };
      copy.workspaceDocuments = [
        { id: "ticket-scw-svo", name: "Билет Сыктывкар — Москва.pdf", type: "Авиабилет", format: "PDF", size: "1,2 МБ", sizeMb: 0.45, uploadedAt: "18 июля 2026, 21:14", status: "confirmed", ocrConfirmed: true, visibility: "shared", segment: "Сыктывкар → Москва, 19 июля, 08:40", source: "Загружено организатором", processedAt: "18 июля 2026, 21:16" },
        { id: "ticket-svo-ayt", name: "Билет Москва — Анталья.pdf", type: "Авиабилет", format: "PDF", size: "1,4 МБ", sizeMb: 0.45, uploadedAt: "18 июля 2026, 21:18", status: "review", ocrConfirmed: false, visibility: "shared", segment: "Москва → Анталья, 19 июля, 14:20", source: "Загружено организатором", processedAt: "18 июля 2026, 21:20" },
        { id: "hotel-booking", name: "Бронь отеля.pdf", type: "Отель", format: "PDF", size: "840 КБ", sizeMb: 0.45, uploadedAt: "17 июля 2026, 18:42", status: "confirmed", ocrConfirmed: true, visibility: "shared", segment: "Отель в Анталье, 19–25 июля", source: "Импортировано из бронирования", processedAt: "17 июля 2026, 18:44" },
        { id: "transfer-voucher", name: "Трансфер аэропорт — отель.jpg", type: "Трансфер", format: "JPG", size: "620 КБ", sizeMb: 0.45, uploadedAt: "17 июля 2026, 19:05", status: "confirmed", ocrConfirmed: true, visibility: "shared", segment: "Анталья → Отель, 19 июля, 19:30", source: "Загружено организатором", processedAt: "17 июля 2026, 19:06" },
        { id: "insurance", name: "Страховка.pdf", type: "Страховка", format: "PDF", size: "930 КБ", sizeMb: 0.55, uploadedAt: "16 июля 2026, 10:30", status: "confirmed", ocrConfirmed: true, visibility: "private", segment: "Вся поездка", source: "Загружено организатором", processedAt: "16 июля 2026, 10:31" }
      ];
    }
    return copy;
  }

  function enrichTrips(trips) {
    const list = trips.map(enrichTrip);
    if (!list.some((trip) => trip.id === "trip-minsk-2026")) {
      list.push(enrichTrip({
        id: "trip-minsk-2026", title: "Минск с друзьями", status: "upcoming", kind: "Групповая",
        role: "Участник", route: "Москва → Минск", from: "Москва", to: "Минск",
        dates: "5–8 декабря 2026", start: "2026-12-05", end: "2026-12-08", timezone: "Europe/Minsk",
        participants: ["Анна", "Артём"], participantIds: ["anna", "artem"], roles: { anna: "organizer", artem: "participant" },
        documents: 1, nextEvent: "5 декабря · Поезд", monitoring: "Мониторинг не настроен",
        attention: "Без предупреждений", risk: "Низкий", routePoints: ["Москва", "Минск"],
        notify: ["Email"], accessMode: "readonly",
        segments: [seg("seg-mow-msq", "Поезд", "Москва", "Минск", "2026-12-05T21:10", "2026-12-06T07:30", "029Б", "БЧ", "Ночной поезд", "Черновик", 1)],
        workspaceDocuments: [{ id: "minsk-ticket", name: "Билет Москва — Минск.pdf", type: "Поезд", format: "PDF", size: "380 КБ", sizeMb: 0.38, uploadedAt: "1 декабря 2026, 10:10", status: "confirmed", ocrConfirmed: true, visibility: "shared", segment: "Москва → Минск", source: "Данные поездки", processedAt: "1 декабря 2026, 10:11" }]
      }));
    }
    return list;
  }

  function currentUserId(state) {
    return (state.accountPages && state.accountPages.session && state.accountPages.session.userId) || (state.currentUser && state.currentUser.id) || "artem";
  }

  function hasTripAccess(trip, userId, state) {
    if (!trip || !userId) return false;
    const user = (state.users && state.users[userId]) || {};
    return (Array.isArray(trip.participantIds) && trip.participantIds.includes(userId)) ||
      (user.tripIds || []).includes(trip.id) ||
      Boolean(trip.roles && trip.roles[userId]);
  }

  function workspacePatchForTrip(trip, state) {
    const userId = currentUserId(state);
    const role = (trip.roles && trip.roles[userId]) || roleCode(trip.role);
    const participants = tripParticipants(trip, state, userId, role);
    const documents = tripDocuments(trip).filter((doc) => role === "organizer" || doc.visibility !== "private");
    const segments = clone(trip.segments || []);
    const routePointList = Array.isArray(trip.routePoints) ? clone(trip.routePoints) : routePoints(segments);
    const normalizedTrip = {
      id: trip.id,
      title: trip.title || "Поездка",
      route: trip.route || routeFromSegments(segments, trip) || "Маршрут не задан",
      start: trip.start || trip.startDate || "",
      end: trip.end || trip.endDate || "",
      startDate: trip.start || trip.startDate || "",
      endDate: trip.end || trip.endDate || "",
      dates: trip.dates || formatDateRange(trip.start || trip.startDate, trip.end || trip.endDate),
      status: trip.status === "completed" ? "completed" : "active",
      kind: trip.kind || "Групповая",
      role: trip.role || (role === "organizer" ? "Организатор" : "Участник"),
      currentUserRole: role,
      from: trip.from || (segments[0] && segments[0].from) || "",
      to: trip.to || (segments[segments.length - 1] && segments[segments.length - 1].to) || "",
      timezone: trip.timezone || "",
      description: trip.description || "",
      cover: trip.cover || "",
      logistics: clone(trip.logistics || logisticsFromData({}, null)),
      participants: Array.isArray(trip.participants) ? clone(trip.participants) : participants.map((person) => person.name),
      participantIds: Array.isArray(trip.participantIds) ? clone(trip.participantIds) : participants.map((person) => person.id),
      roles: Object.assign({}, trip.roles || { [userId]: role }),
      invitationDrafts: clone(trip.invitationDrafts || []),
      documentSetup: clone(trip.documentSetup || []),
      workspaceDocuments: clone(trip.workspaceDocuments || []),
      documents: typeof trip.documents === "number" ? trip.documents : documents.length,
      nextEvent: trip.nextEvent || (segments[0] ? formatSegmentShort(segments[0]) : "Маршрут ожидает детализации"),
      monitoring: trip.monitoring || "Мониторинг не настроен",
      attention: trip.attention || "Без предупреждений",
      risk: trip.risk || "Низкий",
      routePoints: routePointList,
      notify: clone(trip.notify || []),
      weather: clone(trip.weather || []),
      weatherUpdated: trip.weatherUpdated || "",
      routePreview: trip.routePreview || "",
      segments,
      updatedAt: trip.updatedAt || "",
      year: trip.year || "",
      planB: trip.planB || "",
      incidents: typeof trip.incidents === "number" ? trip.incidents : 0,
      sortDate: trip.sortDate || ""
    };
    const storedOfflineCopy = (state.offlineCopyByTripId || {})[trip.id];
    return {
      activeTripId: trip.id,
      accessState: "granted",
      trip: normalizedTrip,
      currentUser: Object.assign({}, state.currentUser, { id: userId, currentTripRole: role, role }),
      participants,
      documents,
      invitations: tripInvitations(trip, state),
      offlineCopy: storedOfflineCopy ? clone(storedOfflineCopy) : Object.assign({}, state.offlineCopy, {
        selectedDocuments: documents.map((doc) => doc.id),
        size: documents.reduce((sum, doc) => sum + (Number(doc.sizeMb) || 0), 0)
      }),
      coreFlow: coreFlowForTrip(trip, state, role, userId, participants)
    };
  }

  /* ── изоляция данных по tripId: приглашения и coreFlow каждой поездки ── */

  function tripInvitations(trip, state) {
    const map = state.invitationsByTripId || {};
    if (Array.isArray(map[trip.id])) return clone(map[trip.id]);
    return [];
  }

  function coreFlowMonthDay(iso) {
    const parts = String(iso || "").slice(0, 10).split("-");
    if (parts.length < 3 || !parts[2]) return "";
    const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
    return Number(parts[2]) + " " + (months[Number(parts[1]) - 1] || "") + " " + parts[0];
  }

  function coreFlowSegmentsForTrip(trip) {
    const segments = toArray(trip.segments).map((segment) => ({
      id: segment.id,
      title: [segment.from, segment.to].filter(Boolean).join(" → ") || "Сегмент маршрута",
      time: [coreFlowMonthDay(segment.start), segment.start && segment.end ? String(segment.start).slice(11, 16) + "–" + String(segment.end).slice(11, 16) : ""].filter(Boolean).join(" · "),
      type: segment.type || "Сегмент",
      document: segment.ref ? "Документ " + segment.ref : "Документ сегмента",
      source: ["Поставщик", segment.provider, segment.ref].filter(Boolean).join(" · "),
      impact: segment.note || "Влияет на последующие сегменты поездки"
    }));
    const logistics = trip.logistics || {};
    if (logistics.hotel) {
      segments.push({ id: "hotel-" + trip.id, title: "Проживание: " + logistics.hotel, time: trip.dates || "", type: "Отель", document: "Бронь отеля", source: "Подтверждение бронирования", impact: "Нужно синхронизировать время заселения" });
    }
    return segments;
  }

  function coreFlowPlanBForTrip(trip) {
    const destination = trip.to || (Array.isArray(trip.routePoints) && trip.routePoints[trip.routePoints.length - 1]) || "пункт назначения";
    const source = "Расчёт по данным поездки «" + (trip.title || "Поездка") + "»";
    return [
      { id: "plan-a", label: "Plan B — вариант A", title: "Ближайший альтернативный маршрут до " + destination, description: "Перестроить маршрут на ближайший доступный вариант и предупредить участников поездки.", newTime: "Ближайшее доступное окно", delay: "Минимальная задержка", cost: "Уточняется", risk: "Средний", complexity: "Высокая", hotel: "Согласовать время заселения", transfer: "Перенести подачу трансфера", activities: "Программа первого дня может сдвинуться", actions: ["Проверить доступность мест", "Предупредить участников", "Согласовать трансфер"], pros: ["Самое раннее прибытие", "Группа остаётся вместе"], cons: ["Возможна доплата", "Плотная пересадка"], source: source },
      { id: "plan-b", label: "Plan B — вариант B", title: "Ожидание следующего планового отправления", description: "Дождаться следующего планового отправления по текущему маршруту и сохранить брони.", newTime: "Следующее плановое отправление", delay: "Задержка до следующего окна", cost: "Без существенной доплаты", risk: "Низкий", complexity: "Средняя", hotel: "Отметить позднее заселение", transfer: "Перенести на новое время", activities: "Первая активность переносится", actions: ["Подтвердить новое время", "Обновить брони", "Уточнить трансфер"], pros: ["Меньше пересадок", "Ниже риск ошибки"], cons: ["Большая задержка"], source: source },
      { id: "plan-c", label: "Plan B — вариант C", title: "Перестроение маршрута по частям", description: "Разбить маршрут на части и добраться до " + destination + " комбинированным способом.", newTime: "Комбинированное расписание", delay: "Зависит от выбранных сегментов", cost: "Средняя доплата", risk: "Высокий", complexity: "Высокая", hotel: "Сообщить отелю два времени прибытия", transfer: "Нужны дополнительные трансферы", activities: "Программа первого дня дробится", actions: ["Согласовать состав групп", "Проверить документы", "Заказать дополнительный трансфер"], pros: ["Гибкость по местам"], cons: ["Сложнее коммуникация"], source: source }
    ];
  }

  function coreFlowDefaultsForTrip(trip) {
    return {
      uiScenario: "normal",
      scenario: "normal",
      telegramConnected: true,
      lastUpdated: "—",
      sourceStatus: "Источник данных поездки «" + (trip.title || "Поездка") + "»",
      selectedSignalId: "",
      violationConfirmed: false,
      planBVisible: false,
      selectedPlanBId: "",
      selectedMessageId: "",
      mobileMessageMode: "list",
      signals: [],
      messages: [],
      history: [],
      segments: coreFlowSegmentsForTrip(trip),
      planBOptions: coreFlowPlanBForTrip(trip)
    };
  }

  function coreFlowForTrip(trip, state, role, userId, participants) {
    const map = state.coreFlowByTripId || {};
    let stored = map[trip.id] ? clone(map[trip.id]) : null;
    if (!stored && typeof window !== "undefined" && typeof window.coreFlowDemoDefaults === "function") {
      const demo = window.coreFlowDemoDefaults();
      if (demo && demo.trip && demo.trip.id === trip.id) stored = demo;
    }
    if (!stored) stored = coreFlowDefaultsForTrip(trip);
    return Object.assign(stored, {
      trip: { id: trip.id, title: trip.title, status: trip.status === "completed" ? "completed" : "active" },
      role,
      currentUser: { id: userId, name: displayNameOf((state.users && state.users[userId]) || state.currentUser || {}), role, label: "Вы" },
      participants: clone(participants),
      accessState: "granted",
      networkState: state.networkState || "online"
    });
  }

  function seedTbilisiCoreFlow() {
    const base = coreFlowDefaultsForTrip({ id: "done-tbilisi", title: "Весна в Тбилиси", to: "Казбеги", dates: "12–19 апреля 2026" });
    return Object.assign(base, {
      lastUpdated: "19 апреля, 10:20",
      sourceStatus: "Архив поездки «Весна в Тбилиси»",
      selectedSignalId: "signal-tbilisi-1",
      violationConfirmed: true,
      planBVisible: true,
      selectedPlanBId: "plan-b",
      segments: [
        { id: "seg-mow-tbs", title: "Москва → Тбилиси", time: "12 апреля 2026 · 09:15–14:05", type: "Авиаперелёт", document: "Билет Москва → Тбилиси", source: "Поставщик · SU512", impact: "Завершён без нарушений" },
        { id: "seg-tbs-kzb", title: "Тбилиси → Казбеги", time: "15 апреля 2026 · 21:00–00:30", type: "Трансфер", document: "Ваучер трансфера", source: "Georgian Transfer · GT-118", impact: "Проведён по Plan B — вариант B" }
      ],
      signals: [
        { id: "signal-tbilisi-1", authorId: "anna", authorName: "Анна", type: "Дорога перекрыта", segmentId: "seg-tbs-kzb", segment: "Тбилиси → Казбеги", urgency: "Высокая", source: "SOS участника", confidence: "Подтверждено", time: "15 апреля, 18:40", description: "Военно-Грузинская дорога временно перекрыта, трансфер задержан.", status: "Нарушение подтверждено", audience: { type: "organizer-and-author", participantIds: ["anna"] } }
      ],
      messages: [
        { id: "message-tbilisi-plan", topic: "Переход на Plan B", recipients: { type: "all-participants", participantIds: [], providerType: null }, channel: "Telegram", author: "Артём (Вы)", time: "15 апреля, 19:05", status: "Отправлено", segment: "Тбилиси → Казбеги", planB: "Plan B — вариант B", text: "Дорога перекрыта, выезжаем ночным трансфером через Мцхету. Новое время выезда — 21:00.", type: "participant" },
        { id: "message-tbilisi-system", topic: "Мониторинг завершён", recipients: { type: "all-participants", participantIds: [], providerType: null }, channel: "Системное", author: "Система", time: "19 апреля, 10:20", status: "Системное сообщение", segment: "Маршрут целиком", planB: "", text: "Поездка завершена, мониторинг остановлен. Данные доступны в режиме просмотра.", type: "system" }
      ],
      history: [
        { id: "history-tbilisi-1", time: "18:40", text: "Анна отправила SOS: дорога в Казбеги перекрыта", audience: { type: "organizer", participantIds: [] } },
        { id: "history-tbilisi-2", time: "18:55", text: "Артём подтвердил нарушение по сегменту Тбилиси → Казбеги", audience: { type: "organizer", participantIds: [] } },
        { id: "history-tbilisi-3", time: "19:05", text: "Опубликован Plan B — вариант B для всех участников", audience: { type: "all-participants", participantIds: [] } },
        { id: "history-tbilisi-4", time: "10:20", text: "Поездка завершена, мониторинг остановлен", audience: { type: "all-participants", participantIds: [] } }
      ]
    });
  }

  function seedExtension() {
    const trips = enrichTrips(seedTrips());
    return {
      trips,
      homeInvitations: seedHomeInvitations(),
      completedTrips: seedCompleted(),
      tripDrafts: seedDrafts(),
      activeTripId: "trip-turkey-2026",
      invitationsByTripId: { "trip-turkey-2026": clone(toArray((origGetState() || {}).invitations)) },
      coreFlowByTripId: { "done-tbilisi": seedTbilisiCoreFlow() },
      offlineCopyByTripId: { "trip-turkey-2026": clone((origGetState() || {}).offlineCopy || {}) },
      networkState: "online",
      accessState: "granted",
      users: {
        artem: { id: "artem", firstName: "Артём", lastName: "Иванов", name: "Артём", email: "artem@example.test", tripIds: trips.filter((trip) => hasTripAccess(trip, "artem", { users: {} })).map((trip) => trip.id) },
        stanislav: { id: "stanislav", firstName: "Станислав", lastName: "", name: "Станислав", email: "stanislav@example.test", tripIds: ["trip-turkey-2026"] },
        anna: { id: "anna", firstName: "Анна", lastName: "Соколова", name: "Анна", email: "anna@example.test", tripIds: ["trip-turkey-2026", "trip-minsk-2026"] },
        mikhail: { id: "mikhail", firstName: "Михаил", lastName: "", name: "Михаил", email: "mikhail@example.test", tripIds: ["trip-turkey-2026"] },
        olga: { id: "olga", firstName: "Ольга", lastName: "", name: "Ольга", email: "olga@example.test", tripIds: ["trip-spb-2026"] },
        igor: { id: "igor", firstName: "Игорь", lastName: "", name: "Игорь", email: "igor@example.test", tripIds: ["trip-spb-2026"] }
      },
      accountPages: {
        session: { isAuthenticated: false, userId: "", email: "", remember: false, lastLoginAt: "" },
        credentials: {},
        users: {},
        invitations: {
          "invite-001": {
            id: "invite-001", tripId: "trip-spb-2026", invitedByUserId: "artem",
            invitedUserId: "anna", invitedEmail: "anna@example.test",
            role: "participant", accessMode: "member", status: "active",
            expiresAt: "2026-07-30T18:00:00.000Z", acceptedAt: "", declinedAt: ""
          }
        },
        recoveryRequests: {},
        offlineCopies: {},
        deletedAccounts: []
      }
    };
  }

  /* ── helpers (перенесены из веток, чтобы логика жила в одном месте) ── */

  function routePoints(segments) {
    if (!segments || !segments.length) return [];
    const points = [segments[0].from];
    segments.forEach((s) => { if (s.to && points[points.length - 1] !== s.to) points.push(s.to); });
    return points.filter(Boolean);
  }

  function routeFromSegments(segments, data) {
    const points = routePoints(segments || []);
    if (points.length) return points.join(" → ");
    return [data && data.from, data && data.to].filter(Boolean).join(" → ");
  }

  function formatDateRange(start, end) {
    if (!start || !end) return "Даты не заданы";
    return start + " — " + end;
  }

  function formatSegmentShort(segment) {
    const time = segment.start ? segment.start.slice(11, 16) : "";
    return time + " · " + segment.from + " → " + segment.to;
  }

  function logisticsFromData(data, fallback) {
    const prev = fallback || {};
    return {
      hotel: data.hotel !== undefined ? data.hotel : (prev.hotel || ""),
      address: data.address !== undefined ? data.address : (prev.address || ""),
      checkin: data.checkin !== undefined ? data.checkin : (prev.checkin || ""),
      checkout: data.checkout !== undefined ? data.checkout : (prev.checkout || ""),
      transfer: data.transfer !== undefined ? data.transfer : (prev.transfer || ""),
      contacts: data.contacts !== undefined ? data.contacts : (prev.contacts || ""),
      notes: data.notes !== undefined ? data.notes : (prev.notes || "")
    };
  }

  function notifyList(data) {
    return [
      data.notifyTelegram ? "Telegram" : null,
      data.notifyEmail ? "Email" : null,
      data.notifyDaily ? "Ежедневная сводка" : null,
      data.sos ? "SOS" : null
    ].filter(Boolean);
  }

  function draftProgress(data, segments, step) {
    const checks = [data.type, data.title, data.start, data.end, data.timezone, data.hotel, data.documentVisibility, data.notifyEmail || data.notifyTelegram, (segments || []).length > 0];
    return Math.min(100, Math.round((checks.filter(Boolean).length / checks.length) * 100 + (step || 0) * 2));
  }

  function initialsOf(name) {
    return String(name || "П").trim().charAt(0).toUpperCase() || "П";
  }

  function displayNameOf(user) {
    if (!user) return "Пользователь";
    return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || "Пользователь";
  }

  /* ── sanitize: защита базовых структур основы от форм веток ── */

  function sanitizePartial(partial) {
    const out = Object.assign({}, partial);
    const current = origGetState() || {};
    if (out.participants && !Array.isArray(out.participants)) {
      out.participants = Object.values(out.participants);
    }
    if (out.trips) {
      const incoming = toArray(out.trips);
      const existing = toArray(current.trips);
      out.trips = incoming.map((trip) => {
        const prev = existing.find((item) => item && trip && item.id === trip.id);
        return prev ? Object.assign({}, prev, trip) : trip;
      });
    }
    if (out.completedTrips && !Array.isArray(out.completedTrips)) {
      out.completedTrips = Object.values(out.completedTrips);
    }
    if (out.currentUser) {
      const prev = current.currentUser || {};
      const merged = Object.assign({}, prev, out.currentUser);
      if (!merged.name && (merged.firstName || merged.lastName)) {
        merged.name = [merged.firstName, merged.lastName].filter(Boolean).join(" ");
      }
      if (!merged.currentTripRole) merged.currentTripRole = prev.currentTripRole || "organizer";
      out.currentUser = merged;
    }
    return out;
  }

  /* ── persistence ── */

  const PERSIST_KEYS = ["trip", "currentUser", "participants", "invitations", "documents", "offlineCopy", "trips", "homeInvitations", "tripDrafts", "completedTrips", "accountPages", "activeTripId", "networkState", "accessState", "users", "coreFlow", "coreFlowByTripId", "invitationsByTripId", "offlineCopyByTripId"];
  let persistTimer = null;

  function persistNow() {
    persistTimer = null;
    try {
      const state = origGetState() || {};
      const snapshot = {};
      PERSIST_KEYS.forEach((key) => { if (state[key] !== undefined) snapshot[key] = state[key]; });
      const session = snapshot.accountPages && snapshot.accountPages.session;
      const useSession = session && session.isAuthenticated && session.remember === false;
      const target = useSession ? sessionStorage : localStorage;
      const other = useSession ? localStorage : sessionStorage;
      target.setItem(useSession ? SESSION_STORAGE_KEY : STORAGE_KEY, JSON.stringify({ version: 1, state: snapshot }));
      other.removeItem(useSession ? STORAGE_KEY : SESSION_STORAGE_KEY);
    } catch (error) { /* приватный режим браузера — демо продолжает работать в памяти */ }
  }

  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(persistNow, 0);
  }

  // Интеграция: при мгновенном переходе на другую страницу (вход → возврат к приглашению)
  // отложенный setTimeout(0) мог не успеть выполниться, и свежая сессия терялась.
  // Перед выгрузкой страницы принудительно сбрасываем незаписанное состояние.
  window.addEventListener("pagehide", function () {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistNow();
    }
  });

  function readStored() {
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1 && parsed.state) return parsed.state;
    } catch (error) { /* повреждённый snapshot игнорируем */ }
    return null;
  }

  /* ── завершение поездки: перенос в историю ── */

  let reconciling = false;
  function reconcileCompleted() {
    if (reconciling) return;
    const state = origGetState() || {};
    const baseTrip = state.trip;
    if (!baseTrip || baseTrip.status !== "completed") return;
    const trips = toArray(state.trips);
    const active = trips.find((trip) => trip.id === baseTrip.id && trip.status !== "completed");
    if (!active) return;
    reconciling = true;
    try {
      const year = String((active.end || active.start || "").slice(0, 4) || new Date().getFullYear());
      const record = Object.assign({}, active, {
        status: "completed", year,
        participants: Array.isArray(active.participants) ? active.participants.length : (active.participants || 1),
        planB: active.planB || "Не требовался", incidents: active.incidents || 0,
        sortDate: active.end || active.start || nowIso().slice(0, 10)
      });
      origSetState(sanitizePartial({
        trips: trips.filter((trip) => trip.id !== baseTrip.id),
        completedTrips: [record].concat(toArray(state.completedTrips))
      }), { source: "app-state-bridge", action: "completeTrip" });
      schedulePersist();
    } finally {
      reconciling = false;
    }
  }

  /* ── обёртки над базовым API ── */

  /* ── зеркалирование записей модулей в структуры по tripId ── */

  function capturePerTripWrites(partial, meta) {
    const out = Object.assign({}, partial);
    const state = origGetState() || {};
    const source = (meta && meta.source) || "";
    const activeId = out.activeTripId !== undefined ? out.activeTripId : state.activeTripId;
    if (!activeId || source === "app-state-bridge") return out;
    if (out.coreFlow && typeof out.coreFlow === "object" && out.coreFlow.accessState !== "denied") {
      const flowTripId = (out.coreFlow.trip && out.coreFlow.trip.id) || activeId;
      const flowMap = Object.assign({}, state.coreFlowByTripId, out.coreFlowByTripId || {});
      flowMap[flowTripId] = Object.assign({}, flowMap[flowTripId] || {}, clone(out.coreFlow));
      out.coreFlowByTripId = flowMap;
    }
    if (Array.isArray(out.invitations)) {
      const inviteMap = Object.assign({}, state.invitationsByTripId, out.invitationsByTripId || {});
      inviteMap[activeId] = clone(out.invitations);
      out.invitationsByTripId = inviteMap;
    }
    if (out.offlineCopy && typeof out.offlineCopy === "object") {
      const copyMap = Object.assign({}, state.offlineCopyByTripId, out.offlineCopyByTripId || {});
      copyMap[activeId] = Object.assign({}, state.offlineCopy || {}, copyMap[activeId] || {}, clone(out.offlineCopy));
      out.offlineCopyByTripId = copyMap;
    }
    const touchesCatalog = Array.isArray(out.documents) || (Array.isArray(out.participants) && out.participants.length) || (out.trip && typeof out.trip === "object");
    if (touchesCatalog) {
      const trips = toArray(state.trips).map((trip) => clone(trip));
      const index = trips.findIndex((trip) => trip && trip.id === activeId);
      if (index !== -1) {
        if (Array.isArray(out.documents)) {
          const role = (state.currentUser && state.currentUser.currentTripRole) || "organizer";
          let docs = clone(out.documents);
          if (role !== "organizer") {
            const hidden = toArray(trips[index].workspaceDocuments).filter((doc) => doc && doc.visibility === "private" && !docs.some((item) => item && item.id === doc.id));
            docs = docs.concat(hidden);
          }
          trips[index].workspaceDocuments = docs;
          trips[index].documents = docs.length;
        }
        if (Array.isArray(out.participants) && out.participants.length) {
          trips[index].participants = out.participants.map((person) => (person && person.name) || String(person));
          trips[index].participantIds = out.participants.map((person) => person && (person.userId || person.id)).filter(Boolean);
          const roles = Object.assign({}, trips[index].roles);
          out.participants.forEach((person) => {
            const personId = person && (person.userId || person.id);
            if (personId) roles[personId] = person.role === "organizer" ? "organizer" : "participant";
          });
          trips[index].roles = roles;
        }
        if (out.trip && typeof out.trip === "object" && (!out.trip.id || out.trip.id === activeId)) {
          ["title", "description", "dates", "timezone", "route", "routePoints", "logistics", "notify", "segments", "nextEvent", "start", "end"].forEach((key) => {
            if (out.trip[key] !== undefined) trips[index][key] = clone(out.trip[key]);
          });
          if (out.trip.startDate !== undefined) trips[index].start = out.trip.startDate;
          if (out.trip.endDate !== undefined) trips[index].end = out.trip.endDate;
          if (out.trip.route !== undefined) {
            trips[index].routePoints = String(out.trip.route).split("→").map((point) => point.trim()).filter(Boolean);
          }
        }
        out.trips = out.trips || trips;
      }
    }
    return out;
  }

  /* ── удалённая поездка исчезает из каталога и структур по tripId ── */

  function reconcileDeleted() {
    if (reconciling) return;
    const state = origGetState() || {};
    const trip = state.trip || {};
    if (!trip.id || trip.status !== "deleted") return;
    const trips = toArray(state.trips);
    if (!trips.some((item) => item && item.id === trip.id)) return;
    reconciling = true;
    try {
      const patch = {
        trips: trips.filter((item) => item && item.id !== trip.id),
        coreFlowByTripId: Object.assign({}, state.coreFlowByTripId),
        invitationsByTripId: Object.assign({}, state.invitationsByTripId),
        offlineCopyByTripId: Object.assign({}, state.offlineCopyByTripId)
      };
      delete patch.coreFlowByTripId[trip.id];
      delete patch.invitationsByTripId[trip.id];
      delete patch.offlineCopyByTripId[trip.id];
      origSetState(patch, { source: "app-state-bridge", action: "deleteTrip" });
      schedulePersist();
    } finally {
      reconciling = false;
    }
  }

  app.setState = function (partial, meta) {
    const result = origSetState(sanitizePartial(capturePerTripWrites(partial || {}, meta)), meta);
    schedulePersist();
    reconcileCompleted();
    reconcileDeleted();
    return result;
  };


  app.subscribe = function (listener) {
    origSubscribe(listener);
    return function dispose() {
      if (origUnsubscribe) origUnsubscribe(listener);
    };
  };

  function baseTripPatch(rich, state) {
    const status = rich.status === "completed" ? "completed" : "active";
    return {
      activeTripId: rich.id,
      trip: Object.assign({}, state.trip && state.trip.id === rich.id ? state.trip : {}, rich, {
        id: rich.id,
        title: rich.title,
        route: rich.route || routeFromSegments(rich.segments, rich),
        startDate: rich.start || rich.startDate || "",
        endDate: rich.end || rich.endDate || "",
        status
      })
    };
  }

  function updateTripById(id, payload) {
    const state = origGetState() || {};
    if (state.networkState === "offline") return null;
    const trips = toArray(state.trips).map(clone);
    const index = trips.findIndex((trip) => trip.id === id);
    if (index === -1) return null;
    const data = (payload && payload.data) || {};
    const segments = (payload && payload.segments) || trips[index].segments || [];
    const updated = Object.assign({}, trips[index], {
      title: data.title || trips[index].title,
      description: data.description !== undefined ? data.description : trips[index].description,
      kind: data.type ? (data.type === "solo" ? "Соло" : "Групповая") : trips[index].kind,
      start: data.start || trips[index].start,
      end: data.end || trips[index].end,
      dates: data.start && data.end ? formatDateRange(data.start, data.end) : trips[index].dates,
      timezone: data.timezone || trips[index].timezone,
      route: routeFromSegments(segments, data) || trips[index].route,
      routePoints: segments.length ? routePoints(segments) : trips[index].routePoints,
      logistics: logisticsFromData(data, trips[index].logistics),
      invitationDrafts: clone(data.invitationDrafts || trips[index].invitationDrafts || []),
      documentSetup: clone(data.documentSetup || trips[index].documentSetup || []),
      documents: (data.documentSetup || trips[index].documentSetup || []).length || trips[index].documents || 0,
      nextEvent: segments[0] ? formatSegmentShort(segments[0]) : trips[index].nextEvent,
      notify: Object.keys(data).length ? notifyList(data) : trips[index].notify,
      segments: clone(segments),
      updatedAt: nowIso()
    });
    trips[index] = updated;
    const partial = { trips };
    if (state.activeTripId === id || (state.trip && state.trip.id === id)) {
      Object.assign(partial, baseTripPatch(updated, state));
    }
    app.setState(partial, { source: "app-state-bridge", action: "updateTrip" });
    return updated;
  }

  app.updateTrip = function (first, second) {
    if ((origGetState() || {}).networkState === "offline") return null;
    if (typeof first === "string") return updateTripById(first, second || {});
    if (origUpdateTrip) {
      const result = origUpdateTrip(first, second);
      schedulePersist();
      reconcileCompleted();
      return result;
    }
    return app.setState({ trip: Object.assign({}, (origGetState() || {}).trip, first) }, second);
  };

  if (origReset) {
    app.resetDemoData = function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (error) { /* ignore */ }
      try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch (error) { /* ignore */ }
      const result = origReset();
      origSetState(sanitizePartial(seedExtension()), { source: "app-state-bridge", action: "reseed" });
      schedulePersist();
      return result;
    };
  }

  /* ── контракт trip-pages (Главная/История/Мастер) ── */

  app.getTripPagesState = function () {
    const state = origGetState() || {};
    const sessionUserId = state.accountPages && state.accountPages.session && state.accountPages.session.userId;
    const accountUser = sessionUserId && ((state.accountPages.users && state.accountPages.users[sessionUserId]) || (state.users && state.users[sessionUserId]));
    const cu = accountUser || state.currentUser || {};
    const name = displayNameOf(cu);
    const userId = cu.id || "artem";
    const user = { id: userId, name, initials: initialsOf(name), role: "Организатор" };
    const activeTrips = toArray(state.trips)
      .filter((trip) => trip.status !== "completed" && hasTripAccess(trip, userId, state))
      .map((trip) => Object.assign({}, trip, { role: roleLabel((trip.roles && trip.roles[userId]) || roleCode(trip.role)) }));
    const completedTrips = toArray(state.completedTrips)
      .filter((trip) => hasTripAccess(trip, userId, state))
      .map((trip) => Object.assign({}, trip, { role: roleLabel((trip.roles && trip.roles[userId]) || roleCode(trip.role)) }));
    return {
      user,
      currentUser: user,
      workspaceHref: "./trip-overview.html",
      trips: activeTrips,
      completedTrips,
      invitations: toArray(state.homeInvitations),
      drafts: toArray(state.tripDrafts),
      networkState: state.networkState || "online",
      accessState: state.accessState || "granted"
    };
  };

  function invitationToTrip(invite, state) {
    const userId = currentUserId(state || {});
    const userName = displayNameOf(((state && state.users && state.users[userId]) || (state && state.currentUser)) || {});
    const inviterId = invite.inviterId || invite.invitedByUserId || "inviter-" + invite.id;
    const points = String(invite.route || "").split("→").map((item) => item.trim()).filter(Boolean);
    return {
      id: "trip-from-" + invite.id,
      title: invite.title,
      status: "upcoming",
      kind: "Групповая",
      role: invite.role === "Только просмотр" ? "Участник" : (invite.role || "Участник"),
      accessMode: invite.accessMode,
      route: invite.route,
      from: points[0] || "",
      to: points[points.length - 1] || "",
      dates: invite.dates,
      start: invite.startDate,
      end: invite.endDate,
      participants: [invite.inviterName, userName].filter(Boolean),
      participantIds: Array.from(new Set([inviterId, userId].filter(Boolean))),
      roles: { [inviterId]: "organizer", [userId]: invite.accessMode === "readonly" ? "participant" : "participant" },
      documents: 0,
      nextEvent: "Ожидает детализации маршрута",
      monitoring: "Не настроен",
      attention: "Новая поездка",
      risk: "Низкий",
      routePoints: points,
      notify: ["Email"],
      segments: []
    };
  }

  app.acceptTripInvitation = function (id) {
    const state = origGetState() || {};
    if (state.networkState === "offline") return null;
    const invitations = toArray(state.homeInvitations).map(clone);
    const invite = invitations.find((item) => item.id === id);
    if (!invite || invite.status !== "active") return null;
    invite.status = "accepted";
    invite.acceptedAt = nowIso();
    const trip = invitationToTrip(invite, state);
    const userId = currentUserId(state);
    const users = Object.assign({}, state.users || {});
    if (users[userId]) users[userId] = Object.assign({}, users[userId], { tripIds: Array.from(new Set([].concat(users[userId].tripIds || [], [trip.id]))) });
    app.setState({
      homeInvitations: invitations,
      users,
      trips: [trip].concat(toArray(state.trips))
    }, { source: "app-state-bridge", action: "acceptInvitation" });
    return trip;
  };

  app.rejectTripInvitation = function (id) {
    const state = origGetState() || {};
    if (state.networkState === "offline") return null;
    const invitations = toArray(state.homeInvitations).map(clone);
    const invite = invitations.find((item) => item.id === id);
    if (!invite || invite.status !== "active") return null;
    invite.status = "rejected";
    app.setState({ homeInvitations: invitations }, { source: "app-state-bridge", action: "rejectInvitation" });
    return invite;
  };

  app.createTrip = function (payload) {
    const state = origGetState() || {};
    if (state.networkState === "offline") return null;
    const data = (payload && payload.data) || {};
    const segments = (payload && payload.segments) || [];
    const userName = displayNameOf(state.currentUser || {});
    const trip = {
      id: data.id || "trip-" + Date.now().toString(36),
      title: data.title || "Новая поездка",
      status: "active",
      kind: data.type === "solo" ? "Соло" : "Групповая",
      role: "Организатор",
      route: routeFromSegments(segments, data),
      from: (segments[0] && segments[0].from) || data.from || "Начало",
      to: (segments[segments.length - 1] && segments[segments.length - 1].to) || data.to || "Финиш",
      dates: formatDateRange(data.start, data.end),
      start: data.start,
      end: data.end,
      description: data.description,
      timezone: data.timezone,
      cover: data.cover,
      logistics: logisticsFromData(data, null),
      participants: [userName],
      participantIds: [(state.currentUser && state.currentUser.id) || "artem"],
      roles: { [(state.currentUser && state.currentUser.id) || "artem"]: "organizer" },
      invitationDrafts: clone(data.invitationDrafts || []),
      documentSetup: clone(data.documentSetup || []),
      documents: (data.documentSetup || []).length,
      nextEvent: segments[0] ? formatSegmentShort(segments[0]) : "Маршрут ожидает детализации",
      monitoring: data.notifyFlights || data.notifyTransfer ? "Активен" : "Не настроен",
      attention: payload && payload.warnings && payload.warnings.length ? "Есть предупреждения" : "Без предупреждений",
      risk: payload && payload.errors && payload.errors.length ? "Высокий" : (payload && payload.warnings && payload.warnings.length ? "Средний" : "Низкий"),
      routePoints: routePoints(segments),
      notify: notifyList(data),
      segments: clone(segments),
      updatedAt: nowIso()
    };
    app.setState(Object.assign({
      trips: [trip].concat(toArray(state.trips)),
      tripDrafts: toArray(state.tripDrafts).filter((draft) => draft.id !== (payload && payload.draftId))
    }, workspacePatchForTrip(trip, state)), { source: "app-state-bridge", action: "createTrip" });
    return trip;
  };

  app.saveTripDraft = function (input) {
    const payload = input || {};
    const state = origGetState() || {};
    if (state.networkState === "offline") return null;
    const drafts = toArray(state.tripDrafts).map(clone);
    const draft = {
      id: payload.id || "draft-" + Date.now().toString(36),
      updatedAt: nowIso(),
      step: payload.step || 0,
      progress: draftProgress(payload.data || {}, payload.segments || [], payload.step || 0),
      data: clone(payload.data || {}),
      segments: clone(payload.segments || [])
    };
    const index = drafts.findIndex((item) => item.id === draft.id);
    if (index === -1) drafts.unshift(draft); else drafts[index] = draft;
    app.setState({ tripDrafts: drafts }, { source: "app-state-bridge", action: "saveTripDraft" });
    return draft;
  };

  app.deleteTripDraft = function (id) {
    const state = origGetState() || {};
    if (state.networkState === "offline") return { ok: false };
    app.setState({ tripDrafts: toArray(state.tripDrafts).filter((draft) => draft.id !== id) }, { source: "app-state-bridge", action: "deleteTripDraft" });
    return { ok: true };
  };

  /* ── активная поездка рабочего пространства ── */

  app.setActiveTrip = function (tripId) {
    const state = origGetState() || {};
    const all = toArray(state.trips).concat(toArray(state.completedTrips));
    const rich = all.find((trip) => trip.id === tripId);
    if (!rich) return null;
    if (!hasTripAccess(rich, currentUserId(state), state)) {
      app.setState({ accessState: "denied", activeTripId: "", trip: { id: "", title: "", route: "", status: "denied" }, documents: [], participants: [], invitations: [], coreFlow: { accessState: "denied" } }, { source: "app-state-bridge", action: "setActiveTripDenied" });
      return null;
    }
    const partial = Object.assign(baseTripPatch(rich, state), workspacePatchForTrip(rich, state));
    app.setState(partial, { source: "app-state-bridge", action: "setActiveTrip" });
    return rich;
  };

  /* ── сессия ── */

  app.getSession = function () {
    const state = origGetState() || {};
    return (state.accountPages && state.accountPages.session) || { isAuthenticated: false, userId: "", email: "" };
  };

  app.logoutSession = function () {
    const state = origGetState() || {};
    const accountPages = Object.assign({}, state.accountPages, {
      session: { isAuthenticated: false, userId: "", email: "", remember: false, lastLoginAt: "" }
    });
    try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch (error) { /* ignore */ }
    app.setState({ accountPages }, { source: "app-state-bridge", action: "logout" });
  };

  /* ── boot ── */

  const stored = readStored();
  if (stored) {
    const seeded = seedExtension();
    const restored = Object.assign({}, seeded, stored, {
      trips: enrichTrips(toArray(stored.trips || seeded.trips)),
      users: Object.assign({}, seeded.users || {}, stored.users || {}),
      accountPages: Object.assign({}, seeded.accountPages || {}, stored.accountPages || {})
    });
    origSetState(sanitizePartial(restored), { source: "app-state-bridge", action: "restore" });
  } else {
    origSetState(sanitizePartial(seedExtension()), { source: "app-state-bridge", action: "seed" });
  }

  // Обогащаем базовую поездку данными каталога, чтобы обе схемы были согласованы.
  (function enrichBaseTrip() {
    const state = origGetState() || {};
    if (!state.trip || !state.trip.id) return;
    const rich = toArray(state.trips).find((trip) => trip.id === state.trip.id);
    if (rich) {
      const enrichPatch = Object.assign({}, workspacePatchForTrip(rich, state));
      delete enrichPatch.coreFlow;
      origSetState(sanitizePartial(enrichPatch), { source: "app-state-bridge", action: "enrich" });
    }
  })();

  schedulePersist();
  app.__finalBridge = true;
})();

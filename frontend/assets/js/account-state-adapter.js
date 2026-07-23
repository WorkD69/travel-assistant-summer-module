(function () {
  "use strict";

  const STORAGE_KEY = "travelAssistant.accountPages.final.state";
  const SESSION_KEY = "travelAssistant.accountPages.final.session";
  const RETURN_KEY = "travelAssistant.accountPages.return";
  const PASSWORD_MIN = 8;

  const clone = (value) => JSON.parse(JSON.stringify(value || null));
  const nowIso = () => new Date().toISOString();
  const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
  const isEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  const addMinutes = (minutes) => new Date(Date.now() + minutes * 60 * 1000).toISOString();

  function maskEmail(email) {
    const normalized = normalizeEmail(email);
    const [name, domain] = normalized.split("@");
    if (!name || !domain) return normalized;
    return `${name.slice(0, 2)}***@${domain}`;
  }

  function getDefaultNotifications() {
    const events = [
      "nextSegment",
      "timeChange",
      "gateChange",
      "delay",
      "cancel",
      "transferChange",
      "hotelChange",
      "newDocument",
      "invitation",
      "sos",
      "violation",
      "planB",
      "organizerMessage",
      "dailySummary"
    ];
    return {
      selectedTripId: "all",
      quietHours: { enabled: true, from: "22:00", to: "07:00" },
      timezone: "Europe/Moscow",
      criticalAlerts: true,
      onlySelectedTrip: false,
      matrix: events.reduce((acc, event) => {
        acc[event] = {
          app: true,
          telegram: ["delay", "cancel", "sos", "planB", "organizerMessage"].includes(event),
          email: ["timeChange", "newDocument", "dailySummary", "invitation"].includes(event)
        };
        return acc;
      }, {})
    };
  }

  function getDefaultAppearance() {
    return {
      theme: "dark",
      contrast: "normal",
      motion: "normal",
      density: "comfortable",
      fontScale: "normal"
    };
  }

  function makeUser(id, firstName, lastName, email, extras) {
    return Object.assign({
      id,
      firstName,
      lastName,
      email,
      avatarDataUrl: "",
      createdAt: "2026-07-01T10:00:00+03:00",
      accountStatus: "active",
      telegram: {
        state: "notConnected",
        username: "",
        connectedAt: "",
        selectedTripId: "trip-turkey-2026",
        settings: {
          routeChanges: true,
          delays: true,
          violations: true,
          planB: true,
          organizerMessages: true,
          documents: true,
          dailySummary: false,
          sos: true
        }
      },
      mail: {
        state: "notConnected",
        email,
        provider: "",
        connectedAt: "",
        permissions: ["Поиск бронирований", "Уведомления об изменениях"],
        settings: {
          searchBookings: true,
          notifyChanges: true,
          noRawMail: true
        }
      },
      notifications: getDefaultNotifications(),
      appearance: getDefaultAppearance(),
      tripIds: []
    }, extras || {});
  }

  function getPreviewFixture() {
    const users = {
      artem: makeUser("artem", "Артём", "Иванов", "artem@example.test", {
        createdAt: "2026-06-28T09:10:00+03:00",
        tripIds: ["trip-turkey-2026", "trip-weekend-2026"],
        telegram: {
          state: "connected",
          username: "@artem_travel",
          connectedAt: "2026-07-10T14:35:00+03:00",
          selectedTripId: "trip-turkey-2026",
          settings: {
            routeChanges: true,
            delays: true,
            violations: true,
            planB: true,
            organizerMessages: true,
            documents: true,
            dailySummary: false,
            sos: true
          }
        },
        mail: {
          state: "connected",
          email: "artem@example.test",
          provider: "Gmail",
          connectedAt: "2026-07-11T11:00:00+03:00",
          permissions: ["Поиск бронирований", "Уведомления об изменениях"],
          settings: {
            searchBookings: true,
            notifyChanges: true,
            noRawMail: true
          }
        }
      }),
      "invitee-001": makeUser("invitee-001", "Ирина", "Петрова", "irina@example.test", {
        createdAt: "2026-07-18T12:00:00+03:00",
        tripIds: []
      }),
      boris: makeUser("boris", "Борис", "Смирнов", "boris@example.test", {
        createdAt: "2026-07-03T13:00:00+03:00",
        tripIds: []
      })
    };

    return {
      version: 4,
      session: {
        isAuthenticated: true,
        userId: "artem",
        email: "artem@example.test",
        remember: true,
        lastLoginAt: nowIso()
      },
      users,
      credentials: {
        "artem@example.test": "Travel2026!",
        "irina@example.test": "Invite2026!",
        "boris@example.test": "Boris2026!"
      },
      trips: {
        "trip-turkey-2026": {
          id: "trip-turkey-2026",
          title: "Отпуск в Турции",
          route: "Сыктывкар → Москва → Анталья",
          dates: "19–25 июля 2026",
          startsAt: "2026-07-19T06:30:00+03:00",
          endsAt: "2026-07-25T21:00:00+03:00",
          status: "active",
          participantIds: ["artem", "stanislav", "anna", "mikhail"],
          roles: {
            artem: "organizer",
            stanislav: "participant",
            anna: "participant",
            mikhail: "participant"
          }
        },
        "trip-weekend-2026": {
          id: "trip-weekend-2026",
          title: "Выходные в Казани",
          route: "Москва → Казань",
          dates: "14–16 августа 2026",
          startsAt: "2026-08-14T10:00:00+03:00",
          endsAt: "2026-08-16T18:00:00+03:00",
          status: "upcoming",
          participantIds: ["artem"],
          roles: { artem: "organizer" }
        }
      },
      participants: {
        artem: { id: "artem", userId: "artem", firstName: "Артём", lastName: "Иванов", email: "artem@example.test" },
        stanislav: { id: "stanislav", firstName: "Станислав", lastName: "Орлов", email: "stanislav@example.test" },
        anna: { id: "anna", firstName: "Анна", lastName: "Соколова", email: "anna@example.test" },
        mikhail: { id: "mikhail", firstName: "Михаил", lastName: "Лебедев", email: "mikhail@example.test" }
      },
      invitations: {
        "invite-001": {
          id: "invite-001",
          tripId: "trip-turkey-2026",
          invitedByUserId: "artem",
          invitedUserId: "invitee-001",
          invitedEmail: "irina@example.test",
          role: "participant",
          accessMode: "view",
          status: "active",
          expiresAt: "2026-07-25T20:00:00+03:00",
          acceptedAt: "",
          declinedAt: ""
        },
        "invite-own": {
          id: "invite-own",
          tripId: "trip-turkey-2026",
          invitedByUserId: "artem",
          invitedUserId: "artem",
          invitedEmail: "artem@example.test",
          role: "participant",
          accessMode: "view",
          status: "active",
          expiresAt: "2026-07-25T20:00:00+03:00",
          acceptedAt: "",
          declinedAt: ""
        }
      },
      recoveryRequests: {},
      offlineCopies: {
        artem: { accountBytes: 210000, updatedAt: "2026-07-18T19:40:00+03:00" }
      },
      deletedAccounts: []
    };
  }

  function emptyState() {
    return {
      version: 4,
      session: { isAuthenticated: false, userId: "", email: "", remember: false, lastLoginAt: "" },
      users: {},
      credentials: {},
      trips: {},
      participants: {},
      invitations: {},
      recoveryRequests: {},
      offlineCopies: {},
      deletedAccounts: []
    };
  }

  function ensureStateShape(state, usePreviewFixture) {
    const base = usePreviewFixture ? getPreviewFixture() : emptyState();
    const next = Object.assign(base, clone(state) || {});
    next.users = Object.assign({}, usePreviewFixture ? getPreviewFixture().users : {}, next.users || {});
    next.credentials = Object.assign({}, usePreviewFixture ? getPreviewFixture().credentials : {}, next.credentials || {});
    next.trips = Object.assign({}, usePreviewFixture ? getPreviewFixture().trips : {}, next.trips || {});
    next.participants = Object.assign({}, usePreviewFixture ? getPreviewFixture().participants : {}, next.participants || {});
    next.invitations = Object.assign({}, usePreviewFixture ? getPreviewFixture().invitations : {}, next.invitations || {});
    next.recoveryRequests = next.recoveryRequests || {};
    next.offlineCopies = next.offlineCopies || {};
    next.deletedAccounts = next.deletedAccounts || [];
    Object.keys(next.users).forEach((id) => {
      const user = next.users[id];
      user.telegram = Object.assign(clone(makeUser(id, "", "", user.email).telegram), user.telegram || {});
      user.telegram.settings = Object.assign(clone(makeUser(id, "", "", user.email).telegram.settings), user.telegram.settings || {});
      user.mail = Object.assign(clone(makeUser(id, "", "", user.email).mail), user.mail || {});
      user.mail.settings = Object.assign({ searchBookings: true, notifyChanges: true, noRawMail: true }, user.mail.settings || {});
      user.notifications = Object.assign(getDefaultNotifications(), user.notifications || {});
      user.notifications.matrix = Object.assign(getDefaultNotifications().matrix, user.notifications.matrix || {});
      user.appearance = Object.assign(getDefaultAppearance(), user.appearance || {});
      user.tripIds = Array.isArray(user.tripIds) ? user.tripIds : [];
    });
    return next;
  }

  function readStorage(storage, key) {
    try {
      const raw = storage && storage.getItem ? storage.getItem(key) : "";
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function writeStorage(storage, key, value) {
    if (!storage || !storage.setItem) return;
    storage.setItem(key, JSON.stringify(value));
  }

  function normalizeCollection(value, fallbackKey) {
    if (!value) return {};
    if (Array.isArray(value)) {
      return value.reduce((acc, item, index) => {
        if (item && typeof item === "object") acc[item.id || `${fallbackKey}-${index}`] = clone(item);
        return acc;
      }, {});
    }
    if (typeof value === "object") return clone(value);
    return {};
  }

  function normalizeTravelState(travelState) {
    const source = travelState || {};
    const currentUser = clone(source.currentUser || source.user || null);
    const users = normalizeCollection(source.users, "user");
    if (currentUser && currentUser.id) users[currentUser.id] = Object.assign({}, users[currentUser.id] || {}, currentUser);

    const trips = normalizeCollection(source.trips, "trip");
    if (source.trip && source.trip.id) trips[source.trip.id] = clone(source.trip);

    const participants = normalizeCollection(source.participants, "participant");
    Object.keys(trips).forEach((tripId) => {
      const trip = trips[tripId];
      if (trip.participants) {
        Object.assign(participants, normalizeCollection(trip.participants, "participant"));
        trip.participantIds = Array.isArray(trip.participantIds)
          ? trip.participantIds
          : Object.keys(normalizeCollection(trip.participants, "participant"));
      }
      trip.roles = Object.assign({}, trip.roles || trip.participantRoles || {});
    });

    const account = source.accountPages || source.account || {};
    const normalizedUsers = {};
    Object.keys(users).forEach((id) => {
      const user = users[id];
      normalizedUsers[id] = makeUser(
        user.id || id,
        user.firstName || user.name || user.displayName || "Пользователь",
        user.lastName || "",
        user.email || `${id}@example.test`,
        Object.assign({}, user, account.users && account.users[id])
      );
    });

    return ensureStateShape({
      version: 4,
      session: Object.assign({
        isAuthenticated: Boolean(currentUser && currentUser.id),
        userId: currentUser && currentUser.id ? currentUser.id : "",
        email: currentUser && currentUser.email ? currentUser.email : "",
        remember: false,
        lastLoginAt: ""
      }, account.session || source.session || {}),
      users: normalizedUsers,
      credentials: clone(account.credentials || {}),
      trips,
      participants,
      invitations: normalizeCollection(account.invitations || source.invitations, "invite"),
      recoveryRequests: clone(account.recoveryRequests || {}),
      offlineCopies: clone(account.offlineCopies || source.offlineCopies || {}),
      deletedAccounts: clone(account.deletedAccounts || [])
    }, false);
  }

  function createAccountStateAdapter(options) {
    const config = options || {};
    const travelAppState = config.travelAppState || window.TravelAppState || null;
    const explicitMode = config.mode === "integration" || config.mode === "production" ? "integration" : config.mode;
    const mode = explicitMode || (travelAppState ? "integration" : "preview");
    const storage = config.previewStorage || window.localStorage;
    const sessionStorageRef = config.sessionStorage || window.sessionStorage;
    let previewState = mode === "preview"
      ? ensureStateShape(readStorage(storage, STORAGE_KEY) || getPreviewFixture(), false)
      : null;
    let listeners = new Set();
    let travelDispose = null;
    let suppressTravelNotify = false;

    function getTravelRawState() {
      if (!travelAppState) return {};
      if (typeof travelAppState.getState === "function") return travelAppState.getState() || {};
      if (travelAppState.state) return travelAppState.state;
      return travelAppState;
    }

    function networkOffline() {
      return mode === "integration" && getTravelRawState().networkState === "offline";
    }

    function getState() {
      return mode === "integration" ? normalizeTravelState(getTravelRawState()) : ensureStateShape(previewState, false);
    }

    function commit(nextState, meta) {
      const normalized = ensureStateShape(nextState, false);
      if (mode === "integration") {
        const raw = Object.assign({}, getTravelRawState());
        raw.accountPages = Object.assign({}, raw.accountPages || {}, {
          session: normalized.session,
          users: normalized.users,
          credentials: normalized.credentials,
          invitations: normalized.invitations,
          recoveryRequests: normalized.recoveryRequests,
          offlineCopies: normalized.offlineCopies,
          deletedAccounts: normalized.deletedAccounts
        });
        raw.currentUser = normalized.users[normalized.session.userId] || raw.currentUser;
        raw.trips = normalized.trips;
        raw.participants = normalized.participants;
        suppressTravelNotify = true;
        try {
          if (travelAppState && typeof travelAppState.setState === "function") {
            travelAppState.setState(raw, meta || { source: "account-pages" });
          } else if (travelAppState && typeof travelAppState.update === "function") {
            travelAppState.update(raw, meta || { source: "account-pages" });
          } else if (travelAppState && typeof travelAppState === "object") {
            Object.assign(travelAppState, raw);
          }
        } finally {
          suppressTravelNotify = false;
        }
      } else {
        writeStorage(storage, STORAGE_KEY, normalized);
        previewState = normalized;
      }
      listeners.forEach((listener) => listener(getState(), meta || { source: "account-pages" }));
      return normalized;
    }

    function mutate(mutator, meta) {
      if (networkOffline() && (!meta || meta.source !== "logout")) return { ok: false, code: "offline" };
      const draft = getState();
      const result = mutator(draft);
      if (result && result.ok === false) return result;
      commit(draft, meta);
      return result || { ok: true };
    }

    function subscribe(callback) {
      listeners.add(callback);
      if (mode === "integration" && travelAppState && typeof travelAppState.subscribe === "function" && !travelDispose) {
        const dispose = travelAppState.subscribe(() => {
          if (suppressTravelNotify) return;
          listeners.forEach((listener) => listener(getState(), { source: "TravelAppState" }));
        });
        travelDispose = typeof dispose === "function" ? dispose : null;
      }
      return () => {
        listeners.delete(callback);
        if (!listeners.size && typeof travelDispose === "function") {
          travelDispose();
          travelDispose = null;
        }
      };
    }

    function getCurrentUser(state) {
      const current = state || getState();
      return current.users[current.session && current.session.userId] || null;
    }

    function getFullName(user) {
      return [user && user.firstName, user && user.lastName].filter(Boolean).join(" ") || "Пользователь";
    }

    function getInitials(user) {
      return [user && user.firstName, user && user.lastName]
        .filter(Boolean)
        .map((part) => String(part).trim().charAt(0))
        .join("")
        .slice(0, 2)
        .toUpperCase() || "П";
    }

    function getAccessibleTrips(userId, state) {
      const current = state || getState();
      const id = userId || (current.session && current.session.userId);
      return Object.values(current.trips || {}).filter((trip) => {
        const participantIds = Array.isArray(trip.participantIds) ? trip.participantIds : [];
        const user = current.users[id];
        return participantIds.includes(id) || (user && Array.isArray(user.tripIds) && user.tripIds.includes(trip.id));
      });
    }

    function authenticate(payload) {
      const email = normalizeEmail(payload && payload.email);
      const password = payload && payload.password;
      const remember = Boolean(payload && payload.remember);
      const current = getState();
      if (!isEmail(email) || !password) return { ok: false, code: "invalid_input" };
      if (!Object.prototype.hasOwnProperty.call(current.credentials, email)) {
        return { ok: false, code: "not_found" };
      }
      if (current.credentials[email] !== password) {
        return { ok: false, code: "invalid_credentials" };
      }
      const user = Object.values(current.users).find((item) => normalizeEmail(item.email) === email);
      if (!user || user.accountStatus === "deleted") return { ok: false, code: "not_found" };
      commit(Object.assign({}, current, {
        session: { isAuthenticated: true, userId: user.id, email, remember, lastLoginAt: nowIso() }
      }), { source: "authenticate" });
      try {
        const sessionSnapshot = { userId: user.id, email, remember, lastLoginAt: nowIso() };
        writeStorage(remember ? storage : sessionStorageRef, SESSION_KEY, sessionSnapshot);
        if (remember && sessionStorageRef && sessionStorageRef.removeItem) sessionStorageRef.removeItem(SESSION_KEY);
        if (!remember && storage && storage.removeItem) storage.removeItem(SESSION_KEY);
      } catch (error) {
        // Session persistence is best effort in standalone preview.
      }
      return { ok: true, user: clone(user) };
    }

    function adoptBackendUser(backendUser, remember) {
      if (!backendUser || !backendUser.id || !backendUser.email) {
        return { ok: false, code: "invalid_backend_user" };
      }
      const current = getState();
      const fullName = String(backendUser.name || "").trim();
      const nameParts = fullName.split(/\s+/).filter(Boolean);
      const firstName = nameParts.shift() || backendUser.email.split("@")[0];
      const lastName = nameParts.join(" ");
      const id = String(backendUser.id);
      const existing = current.users[id] || {};
      current.users[id] = Object.assign(
        makeUser(id, firstName, lastName, backendUser.email),
        existing,
        {
          id: id,
          firstName: firstName,
          lastName: lastName,
          email: backendUser.email,
          accountStatus: "active",
        },
      );
      current.session = {
        isAuthenticated: true,
        userId: id,
        email: backendUser.email,
        remember: Boolean(remember),
        lastLoginAt: nowIso(),
      };
      commit(current, { source: "backend-auth" });
      return { ok: true, user: clone(current.users[id]) };
    }

    function register(payload) {
      if (networkOffline()) return { ok: false, code: "offline" };
      const email = normalizeEmail(payload.email);
      const current = getState();
      if (!isEmail(email)) return { ok: false, code: "invalid_email" };
      if (current.credentials[email] || Object.values(current.users).some((user) => normalizeEmail(user.email) === email)) {
        return { ok: false, code: "email_taken" };
      }
      const id = `user-${Date.now()}`;
      const user = makeUser(id, payload.firstName, payload.lastName, email, {
        createdAt: nowIso(),
        tripIds: []
      });
      current.users[id] = user;
      current.credentials[email] = payload.password;
      current.session = { isAuthenticated: true, userId: id, email, remember: true, lastLoginAt: nowIso() };
      commit(current, { source: "register" });
      return { ok: true, user: clone(user) };
    }

    function logout() {
      return mutate((state) => {
        state.session = { isAuthenticated: false, userId: "", email: "", remember: false, lastLoginAt: "" };
        try {
          if (sessionStorageRef && sessionStorageRef.removeItem) sessionStorageRef.removeItem(SESSION_KEY);
        } catch (error) {
          // Best effort.
        }
      }, { source: "logout" });
    }

    function updateAccountEmail(payload) {
      const userId = payload && payload.userId;
      const oldEmail = normalizeEmail(payload && payload.oldEmail);
      const newEmail = normalizeEmail(payload && payload.newEmail);
      if (!userId || !isEmail(newEmail)) return { ok: false, code: "invalid_email" };
      const current = getState();
      const user = current.users[userId];
      if (!user) return { ok: false, code: "not_found" };
      const actualOldEmail = oldEmail || normalizeEmail(user.email);
      if (actualOldEmail === newEmail) return { ok: true, user: clone(user), changed: false };
      const owner = Object.values(current.users).find((candidate) => normalizeEmail(candidate.email) === newEmail);
      if (owner && owner.id !== userId) return { ok: false, code: "email_taken" };
      if (current.credentials[newEmail]) return { ok: false, code: "email_taken" };
      if (!Object.prototype.hasOwnProperty.call(current.credentials, actualOldEmail)) {
        return { ok: false, code: "credential_missing" };
      }
      current.credentials[newEmail] = current.credentials[actualOldEmail];
      delete current.credentials[actualOldEmail];
      user.email = newEmail;
      Object.values(current.participants || {}).forEach((participant) => {
        if (participant.userId === userId || normalizeEmail(participant.email) === actualOldEmail) participant.email = newEmail;
      });
      if (user.mail && normalizeEmail(user.mail.email) === actualOldEmail) user.mail.email = newEmail;
      if (current.session && current.session.userId === userId) current.session.email = newEmail;
      commit(current, { source: "updateAccountEmail" });
      return { ok: true, user: clone(user), changed: true };
    }

    function updateAccountProfile(payload) {
      const userId = payload && payload.userId;
      const current = getState();
      const user = current.users[userId];
      if (!user) return { ok: false, code: "not_found" };
      const nextEmail = normalizeEmail(payload.email || user.email);
      const currentEmail = normalizeEmail(user.email);
      if (nextEmail !== currentEmail) {
        const existing = Object.values(current.users).find((candidate) => normalizeEmail(candidate.email) === nextEmail);
        if (existing && existing.id !== userId) return { ok: false, code: "email_taken" };
        if (current.credentials[nextEmail]) return { ok: false, code: "email_taken" };
        if (!current.credentials[currentEmail]) return { ok: false, code: "credential_missing" };
        current.credentials[nextEmail] = current.credentials[currentEmail];
        delete current.credentials[currentEmail];
      }
      user.firstName = String(payload.firstName || "").trim();
      user.lastName = String(payload.lastName || "").trim();
      user.email = nextEmail;
      Object.values(current.participants || {}).forEach((participant) => {
        if (participant.userId === userId || normalizeEmail(participant.email) === currentEmail) {
          participant.firstName = user.firstName;
          participant.lastName = user.lastName;
          participant.email = nextEmail;
        }
      });
      if (user.mail && normalizeEmail(user.mail.email) === currentEmail) user.mail.email = nextEmail;
      if (current.session && current.session.userId === userId) current.session.email = nextEmail;
      commit(current, { source: "updateAccountProfile" });
      return { ok: true, user: clone(user) };
    }

    function updateUser(payload) {
      return mutate((state) => {
        const user = state.users[payload.userId || (state.session && state.session.userId)];
        if (!user) return { ok: false, code: "not_found" };
        Object.assign(user, payload.patch || payload);
      }, { source: "updateUser" });
    }

    function updatePasswordForUser(userId, newPassword) {
      return mutate((state) => {
        const user = state.users[userId];
        if (!user) return { ok: false, code: "not_found" };
        state.credentials[normalizeEmail(user.email)] = newPassword;
      }, { source: "updatePassword" });
    }

    function beginPasswordRecovery(email) {
      if (networkOffline()) return { ok: false, code: "offline" };
      const normalizedEmail = normalizeEmail(email);
      const current = getState();
      if (!isEmail(normalizedEmail)) return { ok: false, code: "invalid_email" };
      if (!current.credentials[normalizedEmail]) return { ok: false, code: "not_found" };
      const id = `recovery-${Date.now()}`;
      const token = `preview-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
      const expiresAt = addMinutes(20);
      current.recoveryRequests[id] = {
        id,
        email: normalizedEmail,
        token,
        status: "active",
        createdAt: nowIso(),
        expiresAt,
        usedAt: ""
      };
      commit(current, { source: "beginPasswordRecovery" });
      return { ok: true, recoveryRequestId: id, maskedEmail: maskEmail(normalizedEmail), expiresAt, previewToken: token };
    }

    function findRecoveryByToken(token, state) {
      return Object.values((state || getState()).recoveryRequests || {}).find((request) => request.token === token) || null;
    }

    function validateRecoveryToken(token) {
      const current = getState();
      const request = findRecoveryByToken(token, current);
      if (!request) return { ok: false, code: "invalid_token" };
      if (request.status === "used" || request.usedAt) return { ok: false, code: "used_token" };
      if (new Date(request.expiresAt).getTime() < Date.now()) return { ok: false, code: "expired_token" };
      return { ok: true, email: request.email, maskedEmail: maskEmail(request.email), expiresAt: request.expiresAt };
    }

    function resetPassword(payload) {
      if (networkOffline()) return { ok: false, code: "offline" };
      const token = payload && payload.token;
      const newPassword = payload && payload.newPassword;
      const email = normalizeEmail(payload && payload.email);
      const current = getState();
      const request = findRecoveryByToken(token, current);
      if (!request || normalizeEmail(request.email) !== email) return { ok: false, code: "invalid_token" };
      if (request.status === "used" || request.usedAt) return { ok: false, code: "used_token" };
      if (new Date(request.expiresAt).getTime() < Date.now()) return { ok: false, code: "expired_token" };
      if (!current.credentials[email]) return { ok: false, code: "not_found" };
      current.credentials[email] = newPassword;
      request.status = "used";
      request.usedAt = nowIso();
      commit(current, { source: "resetPassword" });
      return { ok: true, email };
    }

    function getInvitation(invitationId) {
      const current = getState();
      return current.invitations[invitationId] ? clone(current.invitations[invitationId]) : null;
    }

    function isExpired(invitation) {
      return invitation && invitation.expiresAt && new Date(invitation.expiresAt).getTime() < Date.now();
    }

    function acceptInvitation(invitationId, actorUserId) {
      if (networkOffline()) return { ok: false, code: "offline" };
      const current = getState();
      const invitation = current.invitations[invitationId];
      if (!invitation) return { ok: false, code: "invalid" };
      if (invitation.status !== "active") return { ok: false, code: invitation.status };
      if (isExpired(invitation)) return { ok: false, code: "expired" };
      const actor = current.users[actorUserId];
      if (!actor) return { ok: false, code: "noAccess" };
      if (actor.id === invitation.invitedByUserId) return { ok: false, code: "own_invitation" };
      if (invitation.invitedUserId && invitation.invitedUserId !== actor.id && normalizeEmail(actor.email) !== normalizeEmail(invitation.invitedEmail)) {
        return { ok: false, code: "noAccess" };
      }
      const trip = current.trips[invitation.tripId];
      if (!trip) return { ok: false, code: "invalid" };
      trip.participantIds = Array.isArray(trip.participantIds) ? trip.participantIds : [];
      trip.roles = trip.roles || {};
      if (trip.participantIds.includes(actor.id) || trip.roles[actor.id]) return { ok: false, code: "already_participant" };
      trip.participantIds.push(actor.id);
      trip.roles[actor.id] = invitation.role || "participant";
      // Интеграция: синхронизируем и список имён участников поездки,
      // чтобы Главная и рабочее пространство сразу показывали нового участника.
      const actorDisplayName = [actor.firstName, actor.lastName].filter(Boolean).join(" ").trim() || actor.email || actor.id;
      if (Array.isArray(trip.participants)) {
        const hasActor = trip.participants.some(function (p) {
          if (typeof p === "string") return p === actorDisplayName || p === actor.firstName;
          return p && (p.id === actor.id || p.userId === actor.id || p.name === actorDisplayName);
        });
        if (!hasActor) trip.participants.push(actor.firstName || actorDisplayName);
      }
      actor.tripIds = Array.from(new Set([].concat(actor.tripIds || [], [trip.id])));
      current.participants[actor.id] = {
        id: actor.id,
        userId: actor.id,
        firstName: actor.firstName,
        lastName: actor.lastName,
        email: actor.email
      };
      invitation.status = "accepted";
      invitation.acceptedAt = nowIso();
      commit(current, { source: "acceptInvitation" });
      return { ok: true, invitation: clone(invitation), trip: clone(trip) };
    }

    function declineInvitation(invitationId, actorUserId) {
      if (networkOffline()) return { ok: false, code: "offline" };
      const current = getState();
      const invitation = current.invitations[invitationId];
      if (!invitation) return { ok: false, code: "invalid" };
      if (invitation.status !== "active") return { ok: false, code: invitation.status };
      if (actorUserId && actorUserId === invitation.invitedByUserId) return { ok: false, code: "own_invitation" };
      invitation.status = "declined";
      invitation.declinedAt = nowIso();
      commit(current, { source: "declineInvitation" });
      return { ok: true, invitation: clone(invitation) };
    }

    function updateConnection(userId, type, patch) {
      return mutate((state) => {
        const user = state.users[userId || (state.session && state.session.userId)];
        if (!user) return { ok: false, code: "not_found" };
        user[type] = Object.assign({}, user[type] || {}, patch || {});
      }, { source: `update-${type}` });
    }

    function updateMailSettings(userId, settings) {
      return mutate((state) => {
        const user = state.users[userId || (state.session && state.session.userId)];
        if (!user) return { ok: false, code: "not_found" };
        user.mail = user.mail || {};
        user.mail.settings = Object.assign({ searchBookings: true, notifyChanges: true, noRawMail: true }, user.mail.settings || {}, settings || {});
      }, { source: "updateMailSettings" });
    }

    function saveNotifications(userId, notifications) {
      return mutate((state) => {
        const user = state.users[userId || (state.session && state.session.userId)];
        if (!user) return { ok: false, code: "not_found" };
        user.notifications = Object.assign(getDefaultNotifications(), notifications || {});
        user.notifications.matrix = Object.assign(getDefaultNotifications().matrix, user.notifications.matrix || {});
      }, { source: "saveNotifications" });
    }

    function saveAppearance(userId, appearance) {
      return mutate((state) => {
        const user = state.users[userId || (state.session && state.session.userId)];
        if (!user) return { ok: false, code: "not_found" };
        user.appearance = Object.assign(getDefaultAppearance(), appearance || {});
      }, { source: "saveAppearance" });
    }

    function canDeleteAccount(userId) {
      const current = getState();
      const blockingTrips = Object.values(current.trips || {}).filter((trip) => {
        const isActive = trip.status === "active" || trip.status === "upcoming";
        const isGroup = Array.isArray(trip.participantIds) && trip.participantIds.length > 1;
        return isActive && isGroup && trip.roles && trip.roles[userId] === "organizer";
      });
      return { ok: blockingTrips.length === 0, blockingTrips };
    }

    function removeOrganizerBlocksForPreview(userId) {
      if (mode !== "preview") return { ok: false, code: "preview_only" };
      return mutate((state) => {
        Object.values(state.trips || {}).forEach((trip) => {
          if (trip.roles && trip.roles[userId] === "organizer") trip.roles[userId] = "participant";
        });
      }, { source: "removeOrganizerBlocksForPreview" });
    }

    function deleteAccount(userId) {
      const check = canDeleteAccount(userId);
      if (!check.ok) return { ok: false, code: "organizer_blocked", blockingTrips: check.blockingTrips };
      return mutate((state) => {
        const user = state.users[userId];
        if (!user) return { ok: false, code: "not_found" };
        const email = normalizeEmail(user.email);
        delete state.credentials[email];
        Object.values(state.trips || {}).forEach((trip) => {
          trip.participantIds = (trip.participantIds || []).filter((id) => id !== userId);
          if (trip.roles) delete trip.roles[userId];
        });
        Object.keys(state.participants || {}).forEach((participantId) => {
          const participant = state.participants[participantId];
          if (participant.userId === userId || participantId === userId || normalizeEmail(participant.email) === email) {
            delete state.participants[participantId];
          }
        });
        delete state.offlineCopies[userId];
        user.accountStatus = "deleted";
        user.email = "";
        user.avatarDataUrl = "";
        user.telegram = makeUser(userId, "", "", "").telegram;
        user.mail = makeUser(userId, "", "", "").mail;
        state.deletedAccounts.push({ userId, deletedAt: nowIso() });
        state.session = { isAuthenticated: false, userId: "", email: "", remember: false, lastLoginAt: "" };
      }, { source: "deleteAccount" });
    }

    function rememberReturn(value) {
      try {
        writeStorage(sessionStorageRef, RETURN_KEY, value || "");
      } catch (error) {
        // Best effort.
      }
    }

    function consumeReturn() {
      try {
        const value = readStorage(sessionStorageRef, RETURN_KEY) || "";
        if (sessionStorageRef && sessionStorageRef.removeItem) sessionStorageRef.removeItem(RETURN_KEY);
        return value;
      } catch (error) {
        return "";
      }
    }

    function resetPreview() {
      if (mode !== "preview") return { ok: false, code: "preview_only" };
      previewState = getPreviewFixture();
      writeStorage(storage, STORAGE_KEY, previewState);
      listeners.forEach((listener) => listener(getState(), { source: "resetPreview" }));
      return { ok: true };
    }

    return {
      mode,
      getState,
      setState: (state, meta) => commit(state, meta),
      mutate,
      subscribe,
      getCurrentUser,
      getFullName,
      getInitials,
      getAccessibleTrips,
      authenticate,
      login: (email, password, remember) => authenticate({ email, password, remember }),
      adoptBackendUser,
      register,
      logout,
      updateUser,
      updateAccountProfile,
      updateAccountEmail,
      updatePasswordForUser,
      beginPasswordRecovery,
      validateRecoveryToken,
      resetPassword,
      getInvitation,
      acceptInvitation,
      declineInvitation,
      updateConnection,
      updateMailSettings,
      saveNotifications,
      saveAppearance,
      canDeleteAccount,
      removeOrganizerBlocksForPreview,
      deleteAccount,
      rememberReturn,
      consumeReturn,
      resetPreview,
      helpers: { normalizeEmail, isEmail, maskEmail, PASSWORD_MIN }
    };
  }

  window.createAccountStateAdapter = createAccountStateAdapter;
  window.AccountPagesPreviewState = {
    getDefaultState: getPreviewFixture,
    storageKey: STORAGE_KEY,
    sessionKey: SESSION_KEY,
    returnKey: RETURN_KEY
  };
  window.AccountStateAdapter = createAccountStateAdapter({
    travelAppState: window.TravelAppState,
    mode: window.TravelAppState ? "integration" : "preview"
  });
}());

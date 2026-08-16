/**
 * TravelAppState — единый центральный store бизнес-данных поездки «Отпуск в Турции».
 *
 * Публичный API (window.TravelAppState):
 *   getState()                      — текущее состояние. Читайте свободно, но изменяйте
 *                                     данные ТОЛЬКО через setState/updateTrip/resetDemoData.
 *   setState(partialUpdate, meta?)  — сливает переданные top-level ключи в состояние и
 *                                     уведомляет подписчиков. Массивы заменяются целиком,
 *                                     объекты (trip, currentUser, offlineCopy) сливаются по полям.
 *   updateTrip(partialTrip, meta?)  — сокращение для setState({ trip: partialTrip }).
 *   subscribe(listener)             — подписка; listener(state, changedKeys, meta).
 *   unsubscribe(listener)           — отписка.
 *   resetDemoData()                 — восстанавливает исходные демо-данные
 *                                     (подписчики получают meta.reset === true).
 *
 * meta.source (например 'members' | 'settings' | 'docs') позволяет модулю-инициатору
 * игнорировать собственные обновления и избегать циклов.
 *
 * В store хранятся только общие бизнес-данные: trip, currentUser, participants,
 * invitations, documents, offlineCopy, environment. Временные UI-состояния
 * (открытые модальные окна, фокус, прогресс, dropdown) остаются локальными в модулях.
 *
 * Модуль безопасен при повторной инициализации (повторное подключение скрипта не
 * пересоздаёт store) и рассчитан на будущую замену демо-данных на backend API:
 * достаточно заменить appInitialState загрузкой с сервера, а setState — вызовами API.
 */
(function appStateModule() {
  'use strict';

  if (window.TravelAppState && window.TravelAppState.appIsTravelAppState) {
    return;
  }

  function appClone(appValue) {
    return JSON.parse(JSON.stringify(appValue));
  }

  function appReadEnvironment() {
    var appBody = document.body;
    var appEnvironment = appBody ? appBody.getAttribute('data-app-environment') : null;
    return appEnvironment === 'production' ? 'production' : 'development';
  }

  var appInitialState = {
    trip: {
      id: 'trip-turkey-2026',
      title: 'Отпуск в Турции',
      route: 'Сыктывкар → Москва → Анталья',
      startDate: '2026-07-19',
      endDate: '2026-07-25',
      status: 'active' // 'active' | 'completed' | 'deleted'
    },
    currentUser: {
      id: 'artem',
      name: 'Артём',
      currentTripRole: 'organizer' // 'organizer' | 'participant'
    },
    participants: [
      { id: 'artem', name: 'Артём', initials: 'А', shortLabel: 'Ар', role: 'organizer', isCurrent: true, access: 'Активен', telegram: 'Подключён', joined: '12 июля 2026', tone: 'a' },
      { id: 'stanislav', name: 'Станислав', initials: 'С', shortLabel: 'Ст', role: 'participant', isCurrent: false, access: 'Активен', telegram: 'Подключён', joined: '13 июля 2026', tone: 'b' },
      { id: 'anna', name: 'Анна', initials: 'А', shortLabel: 'Ан', role: 'participant', isCurrent: false, access: 'Активен', telegram: 'Не подключён', joined: '13 июля 2026', tone: 'c' },
      { id: 'mikhail', name: 'Михаил', initials: 'М', shortLabel: 'Ми', role: 'participant', isCurrent: false, access: 'Активен', telegram: 'Подключён', joined: '14 июля 2026', tone: 'd' }
    ],
    invitations: [
      { id: 'invite-nina', recipient: 'nina@example.com', email: 'nina@example.com', status: 'Ожидает ответа', created: '17 июля 2026, 12:30', expiresLabel: '20 июля 2026, 12:30', expiresPrefix: 'Истекает', active: true, link: 'https://travel.local/invite/nina-2026-demo' },
      { id: 'invite-sergey', recipient: 'sergey@example.com', email: 'sergey@example.com', status: 'Срок истёк', created: '14 июля 2026', expiresLabel: '15 июля 2026', expiresPrefix: 'Истекло', active: false, link: 'https://travel.local/invite/sergey-expired-demo' }
    ],
    documents: [
      { id: 'ticket-scw-svo', name: 'Билет Сыктывкар — Москва.pdf', type: 'Авиабилет', format: 'PDF', size: '1,2 МБ', sizeMb: 0.45, uploadedAt: '18 июля 2026, 21:14', status: 'confirmed', ocrConfirmed: true, visibility: 'shared', segment: 'Сыктывкар → Москва, 19 июля, 08:40', source: 'Загружено организатором', processedAt: '18 июля 2026, 21:16' },
      { id: 'ticket-svo-ayt', name: 'Билет Москва — Анталья.pdf', type: 'Авиабилет', format: 'PDF', size: '1,4 МБ', sizeMb: 0.45, uploadedAt: '18 июля 2026, 21:18', status: 'review', ocrConfirmed: false, visibility: 'shared', segment: 'Москва → Анталья, 19 июля, 14:20', source: 'Загружено организатором', processedAt: '18 июля 2026, 21:20' },
      { id: 'hotel-booking', name: 'Бронь отеля.pdf', type: 'Отель', format: 'PDF', size: '840 КБ', sizeMb: 0.45, uploadedAt: '17 июля 2026, 18:42', status: 'confirmed', ocrConfirmed: true, visibility: 'shared', segment: 'Отель в Анталье, 19–25 июля', source: 'Импортировано из бронирования', processedAt: '17 июля 2026, 18:44' },
      { id: 'transfer-voucher', name: 'Трансфер аэропорт — отель.jpg', type: 'Трансфер', format: 'JPG', size: '620 КБ', sizeMb: 0.45, uploadedAt: '17 июля 2026, 19:05', status: 'confirmed', ocrConfirmed: true, visibility: 'shared', segment: 'Анталья → Отель, 19 июля, 19:30', source: 'Загружено организатором', processedAt: '17 июля 2026, 19:06' },
      { id: 'insurance', name: 'Страховка.pdf', type: 'Страховка', format: 'PDF', size: '930 КБ', sizeMb: 0.55, uploadedAt: '16 июля 2026, 10:30', status: 'confirmed', ocrConfirmed: true, visibility: 'private', segment: 'Вся поездка', source: 'Загружено организатором', processedAt: '16 июля 2026, 10:31' }
    ],
    offlineCopy: {
      status: 'saved',
      savedAt: '2026-07-17T14:30:00',
      size: 8.4,
      includeRouteMap: true,
      includeObservations: true,
      includeDocuments: true,
      selectedDocuments: ['ticket-scw-svo', 'ticket-svo-ayt', 'hotel-booking', 'transfer-voucher']
    },
    environment: 'development' // фактическое значение берётся из body[data-app-environment]
  };

  var appState = appClone(appInitialState);
  appState.environment = appReadEnvironment();

  var appListeners = [];

  function appNotify(appChangedKeys, appMeta) {
    appListeners.slice().forEach(function (appListener) {
      try {
        appListener(appState, appChangedKeys, appMeta || {});
      } catch (appListenerError) {
        if (window.console && console.error) console.error('TravelAppState: ошибка подписчика', appListenerError);
      }
    });
  }

  function appMergeValue(appKey, appValue) {
    if (Array.isArray(appValue)) {
      appState[appKey] = appValue.map(function (appItem) {
        return appItem && typeof appItem === 'object' ? appClone(appItem) : appItem;
      });
      return;
    }
    if (appValue && typeof appValue === 'object' && appState[appKey] && typeof appState[appKey] === 'object' && !Array.isArray(appState[appKey])) {
      appState[appKey] = Object.assign({}, appState[appKey], appClone(appValue));
      return;
    }
    appState[appKey] = appValue;
  }

  var TravelAppState = {
    appIsTravelAppState: true,

    getState: function appGetState() {
      return appState;
    },

    setState: function appSetState(appPartialUpdate, appMeta) {
      if (!appPartialUpdate || typeof appPartialUpdate !== 'object') return appState;
      var appChangedKeys = [];
      Object.keys(appPartialUpdate).forEach(function (appKey) {
        appMergeValue(appKey, appPartialUpdate[appKey]);
        appChangedKeys.push(appKey);
      });
      if (appChangedKeys.length) appNotify(appChangedKeys, appMeta);
      return appState;
    },

    updateTrip: function appUpdateTrip(appPartialTrip, appMeta) {
      appState.trip = Object.assign({}, appState.trip, appClone(appPartialTrip || {}));
      appNotify(['trip'], appMeta);
      return appState.trip;
    },

    subscribe: function appSubscribe(appListener) {
      if (typeof appListener === 'function' && appListeners.indexOf(appListener) === -1) {
        appListeners.push(appListener);
      }
      return appListener;
    },

    unsubscribe: function appUnsubscribe(appListener) {
      var appIndex = appListeners.indexOf(appListener);
      if (appIndex !== -1) appListeners.splice(appIndex, 1);
    },

    resetDemoData: function appResetDemoData() {
      var appEnvironment = appState.environment;
      appState = appClone(appInitialState);
      appState.environment = appEnvironment;
      appNotify(Object.keys(appState), { reset: true });
      return appState;
    }
  };

  window.TravelAppState = TravelAppState;
}());

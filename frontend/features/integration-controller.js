/**
 * Integration controller — связывает общую шапку поездки, data-driven карточки
 * вкладок «Обзор» и «Маршрут», глобальные кнопки «Пригласить»/«Редактировать»,
 * SOS и режимы completed/deleted с центральным store TravelAppState.
 *
 * Единый интерфейс для всех поездок: панели вкладок НИКОГДА не подменяются
 * альтернативной разметкой. Для любого tripId используется одна и та же
 * DOM-разметка trip-overview.html; различаются только данные выбранной поездки.
 * Рендер обновляет текст и повторяющиеся списки внутри существующих карточек,
 * не разрушая обработчики, подписки и модальные окна.
 *
 * Инициализация идемпотентна: повторное подключение не добавляет обработчики.
 */
(function integrationControllerModule() {
  'use strict';

  if (window.AppIntegration && window.AppIntegration.appInited) return;
  var appStore = window.TravelAppState;
  if (!appStore) return;

  var appActiveTab = 'overview';
  var appDeletedHandled = false;

  var appMonths = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var appStatusLabels = { active: 'Активная', completed: 'Завершена', deleted: 'Удалена' };
  var appRoleLabels = { organizer: 'Организатор', participant: 'Участник' };

  function appQ(appSelector) {
    return document.querySelector(appSelector);
  }

  function appEscape(appValue) {
    return String(appValue == null ? '' : appValue).replace(/[&<>"']/g, function (appChar) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[appChar];
    });
  }

  /* Обновляет innerHTML контейнера только при реальном изменении разметки,
     чтобы не пересоздавать DOM на каждом изменении состояния. */
  function appSetHtmlIfChanged(appElement, appHtml) {
    if (!appElement) return;
    if (appElement.appLastHtml === appHtml) return;
    appElement.appLastHtml = appHtml;
    appElement.innerHTML = appHtml;
  }

  function appParseDate(appIso) {
    var appParts = String(appIso || '').slice(0, 10).split('-');
    if (appParts.length < 3 || !appParts[0] || !appParts[1] || !appParts[2]) return null;
    return { appYear: Number(appParts[0]), appMonth: Number(appParts[1]) - 1, appDay: Number(appParts[2]) };
  }

  function appFormatDateRange(appStartIso, appEndIso) {
    var appStart = appParseDate(appStartIso);
    var appEnd = appParseDate(appEndIso);
    if (!appStart && !appEnd) return '';
    if (!appEnd) appEnd = appStart;
    if (!appStart) appStart = appEnd;
    if (appStart.appYear === appEnd.appYear && appStart.appMonth === appEnd.appMonth) {
      if (appStart.appDay === appEnd.appDay) {
        return appStart.appDay + ' ' + appMonths[appEnd.appMonth] + ' ' + appEnd.appYear;
      }
      return appStart.appDay + '–' + appEnd.appDay + ' ' + appMonths[appEnd.appMonth] + ' ' + appEnd.appYear;
    }
    if (appStart.appYear === appEnd.appYear) {
      return appStart.appDay + ' ' + appMonths[appStart.appMonth] + ' — ' + appEnd.appDay + ' ' + appMonths[appEnd.appMonth] + ' ' + appEnd.appYear;
    }
    return appStart.appDay + ' ' + appMonths[appStart.appMonth] + ' ' + appStart.appYear + ' — ' + appEnd.appDay + ' ' + appMonths[appEnd.appMonth] + ' ' + appEnd.appYear;
  }

  function appFormatDayLong(appIso) {
    var appDate = appParseDate(appIso);
    if (!appDate) return '';
    return appDate.appDay + ' ' + appMonths[appDate.appMonth];
  }

  function appCanManageTrip(appState) {
    return appState.currentUser.currentTripRole === 'organizer' && appState.trip.status === 'active';
  }

  /* ── Хелперы данных поездки (одинаковые для всех tripId) ── */

  function appRouteList(appTrip) {
    if (Array.isArray(appTrip.routePoints) && appTrip.routePoints.length) return appTrip.routePoints;
    return String(appTrip.route || '').split('→').map(function (appPoint) { return appPoint.trim(); }).filter(Boolean);
  }

  function appSortedSegments(appTrip) {
    var appSegments = Array.isArray(appTrip.segments) ? appTrip.segments.slice() : [];
    appSegments.sort(function (appA, appB) {
      var appOrderA = appA && appA.order != null ? Number(appA.order) : 999;
      var appOrderB = appB && appB.order != null ? Number(appB.order) : 999;
      if (appOrderA !== appOrderB) return appOrderA - appOrderB;
      return String((appA && appA.start) || '').localeCompare(String((appB && appB.start) || ''));
    });
    return appSegments;
  }

  function appSegmentKind(appType) {
    var appText = String(appType || '').toLowerCase();
    if (appText.indexOf('само') !== -1 || appText.indexOf('авиа') !== -1 || appText.indexOf('перел') !== -1) return 'flight';
    if (appText.indexOf('поезд') !== -1) return 'train';
    if (appText.indexOf('автобус') !== -1) return 'bus';
    if (appText.indexOf('трансфер') !== -1) return 'transfer';
    if (appText.indexOf('отел') !== -1 || appText.indexOf('прожив') !== -1) return 'hotel';
    return 'other';
  }

  function appSegmentTime(appSegment, appField) {
    var appIso = String((appSegment && appSegment[appField || 'start']) || '');
    return appIso.length >= 16 ? appIso.slice(11, 16) : '—';
  }

  function appSegmentTitle(appSegment) {
    var appKind = appSegmentKind(appSegment.type);
    var appRoute = [appSegment.from, appSegment.to].filter(Boolean).join(' → ') || 'маршрут уточняется';
    if (appKind === 'flight') return 'Вылет ' + appRoute;
    if (appKind === 'train') return 'Поезд ' + appRoute;
    if (appKind === 'bus') return 'Автобус ' + appRoute;
    if (appKind === 'transfer') return 'Трансфер ' + appRoute;
    return (appSegment.type || 'Сегмент') + ' ' + appRoute;
  }

  function appSegmentSource(appKind) {
    if (appKind === 'flight') return 'Источник: авиабилет и расписание перевозчика';
    if (appKind === 'train') return 'Источник: билет и расписание перевозчика';
    if (appKind === 'transfer' || appKind === 'bus') return 'Источник: подтверждение трансферной компании';
    return 'Источник: данные поездки';
  }

  function appPlural(appCount, appOne, appFew, appMany) {
    var appMod10 = appCount % 10;
    var appMod100 = appCount % 100;
    if (appMod10 === 1 && appMod100 !== 11) return appOne;
    if (appMod10 >= 2 && appMod10 <= 4 && (appMod100 < 12 || appMod100 > 14)) return appFew;
    return appMany;
  }

  /* ── Шапка ── */

  function appRenderHeader(appState) {
    var appTitle = appQ('[data-od-id="trip-title"]');
    if (appTitle) appTitle.textContent = appState.trip.title;

    var appRoute = appQ('[data-od-id="trip-route"]');
    if (appRoute) appRoute.textContent = appState.trip.route;

    var appMembersRoute = appQ('#members-trip-route');
    if (appMembersRoute) appMembersRoute.textContent = appState.trip.route || 'Маршрут поездки';

    var appDates = appQ('[data-od-id="trip-dates"]');
    if (appDates) {
      var appDatesSvg = appDates.querySelector('svg');
      appDates.textContent = ' ' + (appFormatDateRange(appState.trip.startDate, appState.trip.endDate) || appState.trip.dates || '');
      if (appDatesSvg) appDates.insertBefore(appDatesSvg, appDates.firstChild);
    }

    var appStatusBadge = appQ('[data-od-id="badge-status"]');
    if (appStatusBadge) {
      appStatusBadge.textContent = appStatusLabels[appState.trip.status] || appState.trip.status;
      appStatusBadge.classList.toggle('badge-success', appState.trip.status === 'active');
    }

    var appRoleBadge = appQ('[data-od-id="badge-role"]');
    if (appRoleBadge) appRoleBadge.textContent = appRoleLabels[appState.currentUser.currentTripRole] || appState.currentUser.currentTripRole;
  }

  function appRenderAvatars(appState) {
    var appStack = appQ('[data-od-id="participant-avatars"]');
    if (!appStack) return;
    var appNames = appState.participants.map(function (appParticipant) { return appParticipant.name; });
    appStack.setAttribute('aria-label', 'Участники (' + appState.participants.length + '): ' + appNames.join(', '));
    appSetHtmlIfChanged(appStack, appState.participants.map(function (appParticipant) {
      var appLabel = appParticipant.shortLabel || String(appParticipant.name || '?').slice(0, 2);
      return '<span class="avatar avatar-' + appEscape(appParticipant.tone || 'a') + '" title="' + appEscape(appParticipant.name) + '">' + appEscape(appLabel) + '</span>';
    }).join(''));
  }

  function appRenderTitleMentions(appState) {
    document.title = 'Поездка — Обзор · ' + appState.trip.title + ' · Тревел-помощник';
    var appMembersContext = appQ('.members-context');
    if (appMembersContext) appMembersContext.textContent = appState.trip.title + ' · ' + appFormatDateRange(appState.trip.startDate, appState.trip.endDate);
    var appSettingsKicker = appQ('.settings-kicker');
    if (appSettingsKicker) appSettingsKicker.textContent = appState.trip.title;
  }

  /* ── Вкладка «Обзор»: данные выбранной поездки в исходных карточках ── */

  function appRenderOverviewPanel(appState) {
    var appTrip = appState.trip || {};
    var appSegments = appSortedSegments(appTrip);
    var appLogistics = appTrip.logistics || {};
    var appPoints = appRouteList(appTrip);
    var appNext = appSegments[0] || null;
    var appNextKind = appNext ? appSegmentKind(appNext.type) : 'other';

    /* Карточка «Ближайшее событие» */
    var appNextTitle = appQ('[data-od-id="card-next-event"] .next-event-title');
    if (appNextTitle) appNextTitle.textContent = appNext ? appSegmentTitle(appNext) : 'Событий пока нет';
    var appNextDetail = appQ('[data-od-id="card-next-event"] .next-event-detail');
    if (appNextDetail) {
      appNextDetail.textContent = appNext
        ? [appFormatDayLong(appNext.start), appSegmentTime(appNext, 'start'), [appNext.from, appNext.to].filter(Boolean).join(' → ')].filter(Boolean).join(' · ')
        : 'Сегменты маршрута пока не добавлены';
    }
    var appCountdownLabel = appQ('[data-od-id="card-next-event"] .countdown-label');
    if (appCountdownLabel) {
      appCountdownLabel.textContent = appNextKind === 'flight' ? 'до вылета' : (appNext ? 'до отправления' : 'до события');
    }
    var appMetaCells = document.querySelectorAll('[data-od-id="card-next-event"] .next-event-meta > div');
    if (appMetaCells.length >= 4) {
      var appRefLabel = appMetaCells[0].querySelector('.meta-cell-label');
      var appRefValue = appMetaCells[0].querySelector('.meta-cell-value');
      if (appRefLabel) appRefLabel.textContent = appNextKind === 'flight' ? 'Рейс' : 'Номер';
      if (appRefValue) appRefValue.textContent = (appNext && appNext.ref) || '—';
      var appTerminalValue = appMetaCells[1].querySelector('.meta-cell-value');
      if (appTerminalValue) appTerminalValue.textContent = (appNext && appNext.terminal) || '—';
      var appCheckinValue = appMetaCells[2].querySelector('.meta-cell-value');
      if (appCheckinValue) appCheckinValue.textContent = (appNext && appNext.checkinUntil) || '—';
      var appStatusValue = appMetaCells[3].querySelector('.badge');
      if (appStatusValue) {
        var appNextStatus = (appNext && appNext.status) || 'Запланировано';
        appStatusValue.textContent = appNextStatus;
        appStatusValue.className = 'badge badge-dot ' + (/подтвержд|расписан|завершён/i.test(appNextStatus) ? 'badge-success' : 'badge-info');
      }
    }

    /* Карточка «Ближайшие события» (таймлайн) */
    var appTimelineSubtitle = appQ('[data-od-id="card-timeline"] .card-subtitle');
    if (appTimelineSubtitle) {
      appTimelineSubtitle.textContent = appNext
        ? (appFormatDayLong(appNext.start) || 'Маршрут') + ' · ближайшие события'
        : 'События появятся после добавления сегментов';
    }
    var appEvents = [];
    appSegments.forEach(function (appSegment) {
      appEvents.push({
        appTime: appSegmentTime(appSegment, 'start'),
        appTitle: appSegmentTitle(appSegment),
        appSub: [appSegment.type, appSegment.ref, appSegment.provider].filter(Boolean).join(' · ') || 'Сегмент маршрута'
      });
    });
    var appLastSegment = appSegments[appSegments.length - 1] || null;
    if (appLastSegment) {
      appEvents.push({
        appTime: appSegmentTime(appLastSegment, 'end'),
        appTitle: 'Прибытие — ' + (appLastSegment.to || appTrip.to || 'пункт назначения'),
        appSub: appLastSegment.note || 'По расписанию последнего сегмента'
      });
    }
    if (appLogistics.hotel && appLogistics.checkin) {
      appEvents.push({
        appTime: String(appLogistics.checkin).length >= 16 ? String(appLogistics.checkin).slice(11, 16) : '—',
        appTitle: 'Заселение в отель',
        appSub: [appLogistics.hotel, appLogistics.address].filter(Boolean).join(' · ')
      });
    }
    var appTimelineList = appQ('[data-od-id="card-timeline"] ol.timeline');
    if (appTimelineList) {
      appSetHtmlIfChanged(appTimelineList, appEvents.length ? appEvents.map(function (appEvent, appIndex) {
        return '<li class="timeline-item">' +
          '<span class="timeline-time mono">' + appEscape(appEvent.appTime) + '</span>' +
          '<div class="timeline-rail"><span class="timeline-dot' + (appIndex === 0 ? ' next' : '') + '"></span>' +
          (appIndex < appEvents.length - 1 ? '<span class="timeline-line"></span>' : '') + '</div>' +
          '<div class="timeline-content"><p class="timeline-event-title">' + appEscape(appEvent.appTitle) + '</p>' +
          '<p class="timeline-event-sub">' + appEscape(appEvent.appSub) + '</p></div></li>';
      }).join('') :
        '<li class="timeline-item"><span class="timeline-time mono">—</span>' +
        '<div class="timeline-rail"><span class="timeline-dot"></span></div>' +
        '<div class="timeline-content"><p class="timeline-event-title">Сегменты маршрута пока не добавлены</p>' +
        '<p class="timeline-event-sub">Добавьте сегменты через редактирование поездки — таймлайн обновится автоматически.</p></div></li>');
    }

    /* Карточка «Мониторинг · Погода» */
    var appWeatherGrid = appQ('[data-od-id="card-monitoring"] .weather-grid');
    if (appWeatherGrid) {
      var appWeatherCards = Array.isArray(appTrip.weather) && appTrip.weather.length
        ? appTrip.weather.map(function (appEntry) { return { appCity: appEntry.city, appTemp: appEntry.temp, appDesc: appEntry.desc }; })
        : appPoints.slice(0, 3).map(function (appPoint) { return { appCity: appPoint, appTemp: '—', appDesc: 'Прогноз появится ближе к дате поездки' }; });
      if (!appWeatherCards.length) appWeatherCards = [{ appCity: 'Маршрут не задан', appTemp: '—', appDesc: 'Добавьте точки маршрута' }];
      appSetHtmlIfChanged(appWeatherGrid, appWeatherCards.map(function (appCard) {
        return '<div class="weather-card"><p class="weather-city">' + appEscape(appCard.appCity) + '</p>' +
          '<p class="weather-temp mono">' + appEscape(appCard.appTemp) + '</p>' +
          '<p class="weather-desc">' + appEscape(appCard.appDesc) + '</p></div>';
      }).join(''));
    }
    var appWeatherUpdated = appQ('[data-od-id="card-monitoring"] .weather-updated');
    if (appWeatherUpdated) {
      appWeatherUpdated.textContent = appTrip.weatherUpdated || ('Мониторинг: ' + (appTrip.monitoring || 'не настроен'));
    }

    /* Карточка «Маршрут» (мини-карта) */
    var appMiniSubtitle = appQ('[data-od-id="card-mini-map"] .card-subtitle');
    if (appMiniSubtitle) appMiniSubtitle.textContent = appTrip.route || 'Маршрут не задан';
    var appMiniMap = appQ('[data-od-id="mini-map"]');
    if (appMiniMap) {
      appMiniMap.setAttribute('aria-label', appPoints.length ? 'Мини-карта маршрута: ' + appPoints.join(', ') : 'Мини-карта маршрута: маршрут не задан');
      var appMiniHtml;
      if (appTrip.routePreview) {
        appMiniHtml = '<img class="route-preview-img" src="' + appEscape(appTrip.routePreview) + '" alt="Превью маршрута: ' + appEscape(appPoints.join(', ')) + '" />';
      } else if (appPoints.length) {
        appMiniHtml = appMiniMapSvg(appPoints);
      } else {
        appMiniHtml = '<div style="display:grid;place-items:center;height:100%;min-height:120px;color:var(--muted);font-size:14px;padding:16px;text-align:center;">Сегменты маршрута пока не добавлены</div>';
      }
      appSetHtmlIfChanged(appMiniMap, appMiniHtml);
    }
    var appSummaryStrong = appQ('[data-od-id="card-mini-map"] .route-summary strong');
    if (appSummaryStrong) appSummaryStrong.textContent = appTrip.route || 'Маршрут не задан';
    var appSummarySpan = appQ('[data-od-id="card-mini-map"] .route-summary span');
    if (appSummarySpan) {
      var appCounts = { flight: 0, train: 0, bus: 0, transfer: 0, other: 0, hotel: 0 };
      appSegments.forEach(function (appSegment) { appCounts[appSegmentKind(appSegment.type)] += 1; });
      var appSummaryParts = [];
      if (appCounts.flight) appSummaryParts.push(appCounts.flight + ' ' + appPlural(appCounts.flight, 'перелёт', 'перелёта', 'перелётов'));
      if (appCounts.train) appSummaryParts.push(appCounts.train + ' ' + appPlural(appCounts.train, 'поезд', 'поезда', 'поездов'));
      if (appCounts.bus) appSummaryParts.push(appCounts.bus + ' ' + appPlural(appCounts.bus, 'автобус', 'автобуса', 'автобусов'));
      if (appCounts.transfer) appSummaryParts.push('трансфер');
      if (appLogistics.hotel) appSummaryParts.push('отель');
      appSummarySpan.textContent = appSummaryParts.join(' · ') || 'Сегменты маршрута пока не добавлены';
    }

    /* Карточка «Документы» */
    var appDocs = Array.isArray(appState.documents) ? appState.documents : [];
    var appConfirmedCount = appDocs.filter(function (appDoc) { return appDoc.status === 'confirmed'; }).length;
    var appReviewCount = appDocs.filter(function (appDoc) { return appDoc.status === 'review'; }).length;
    var appMetricValues = document.querySelectorAll('[data-od-id="card-documents"] .doc-metric-value');
    if (appMetricValues.length >= 3) {
      appMetricValues[0].textContent = String(appDocs.length);
      appMetricValues[1].textContent = String(appConfirmedCount);
      appMetricValues[2].textContent = String(appReviewCount);
    }
    var appCheckline = appQ('[data-od-id="card-documents"] .doc-checkline');
    if (appCheckline) {
      var appChecklineSvg = appCheckline.querySelector('svg');
      appCheckline.textContent = ' ' + (appDocs.length === 0
        ? 'Документы пока не добавлены'
        : (appReviewCount ? 'Требует проверки: ' + appReviewCount : 'Все документы подтверждены'));
      if (appChecklineSvg) appCheckline.insertBefore(appChecklineSvg, appCheckline.firstChild);
    }

    /* Карточка «Plan B» */
    var appFlow = appState.coreFlow || {};
    var appAlert = Boolean(appFlow.violationConfirmed && appFlow.planBVisible);
    var appPlanbBadge = appQ('[data-od-id="card-planb"] .card-header .badge');
    if (appPlanbBadge) {
      appPlanbBadge.textContent = appAlert ? 'Требует внимания' : 'Спокойно';
      appPlanbBadge.className = 'badge badge-dot ' + (appAlert ? 'badge-accent' : 'badge-success');
    }
    var appPlanbEmpty = appQ('[data-od-id="card-planb"] .planb-empty');
    if (appPlanbEmpty) {
      appPlanbEmpty.classList.toggle('calm', !appAlert);
      var appPlanbText = appPlanbEmpty.querySelector('p');
      if (appPlanbText) {
        appPlanbText.textContent = appAlert
          ? 'Нарушение подтверждено. Три варианта Plan B доступны на вкладке «Мониторинг».'
          : 'Подтверждённых нарушений нет. Plan B появится после подтверждения конкретной проблемы.';
      }
    }

    if (typeof window.appUpdateCountdown === 'function') window.appUpdateCountdown();
  }

  function appMiniMapSvg(appPoints) {
    var appCount = appPoints.length;
    var appCoords = appPoints.map(function (appPoint, appIndex) {
      var appX = appCount === 1 ? 200 : Math.round(52 + (296 * appIndex) / (appCount - 1));
      var appY = appIndex % 2 === 0 ? 118 : 62;
      return [appX, appY];
    });
    var appPath = appCoords.map(function (appPair, appIndex) { return (appIndex ? 'L' : 'M') + appPair[0] + ' ' + appPair[1]; }).join(' ');
    return '<svg viewBox="0 0 400 180" role="presentation" style="width:100%;height:100%;display:block;">' +
      '<path d="' + appPath + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="7 6" stroke-linecap="round"></path>' +
      appCoords.map(function (appPair, appIndex) {
        var appIsLast = appIndex === appCount - 1 && appCount > 1;
        var appTextX = appIsLast ? appPair[0] - 12 : appPair[0] + 12;
        return '<circle cx="' + appPair[0] + '" cy="' + appPair[1] + '" r="6" fill="var(--accent)"></circle>' +
          '<text x="' + appTextX + '" y="' + (appPair[1] - 12) + '" text-anchor="' + (appIsLast ? 'end' : 'start') + '" style="fill: var(--text, #e6e9f0); font-size: 13px;">' + appEscape(appPoints[appIndex]) + '</text>';
      }).join('') +
      '</svg>';
  }

  /* ── Вкладка «Маршрут»: карта и полный таймлайн из данных поездки ── */

  function appMapAnchors(appCount) {
    if (appCount <= 0) return [];
    if (appCount === 1) return [[555, 268]];
    if (appCount === 2) return [[170, 150], [1000, 470]];
    if (appCount === 3) return [[170, 150], [555, 268], [1000, 470]];
    var appList = [];
    for (var appIndex = 0; appIndex < appCount; appIndex += 1) {
      appList.push([Math.round(170 + (830 * appIndex) / (appCount - 1)), Math.round(150 + (320 * appIndex) / (appCount - 1))]);
    }
    return appList;
  }

  function appRouteMapLayerHtml(appPoints, appSegments, appLogistics) {
    var appHtml = '<rect width="1200" height="620" fill="transparent"></rect>' +
      '<ellipse class="map-water" cx="820" cy="420" rx="430" ry="260"></ellipse>' +
      '<path class="map-land" d="M-20 150C130 40 290 80 430 150C560 215 615 330 545 420C455 535 245 505 90 430C-35 368 -95 255 -20 150Z"></path>' +
      '<path class="map-land" d="M470 330C610 230 770 230 905 315C1030 393 1065 510 950 588C810 682 575 615 480 505C430 446 418 372 470 330Z"></path>';
    if (!appPoints.length) {
      return appHtml +
        '<text x="600" y="296" text-anchor="middle" style="fill: var(--muted); font-size: 26px;">Сегменты маршрута пока не добавлены</text>' +
        '<text x="600" y="336" text-anchor="middle" style="fill: var(--muted); font-size: 16px;">Добавьте сегменты — карта построится по данным поездки</text>';
    }
    var appAnchors = appMapAnchors(appPoints.length);
    var appLastAnchor = appAnchors[appAnchors.length - 1];
    var appHotelX = appLastAnchor[0] + 80;
    var appHotelY = appLastAnchor[1] + 50;
    if (appLogistics.hotel) {
      appHtml += '<path class="route-stay" d="M' + (appHotelX - 74) + ' ' + (appHotelY - 46) + 'h96v64h-96z"></path>';
    }
    for (var appIndex = 0; appIndex < appAnchors.length - 1; appIndex += 1) {
      var appFrom = appAnchors[appIndex];
      var appTo = appAnchors[appIndex + 1];
      var appKind = appSegments[appIndex] ? appSegmentKind(appSegments[appIndex].type) : 'flight';
      var appPathClass = appKind === 'transfer' || appKind === 'bus' ? 'route-transfer' : 'route-flight';
      var appMidX = Math.round((appFrom[0] + appTo[0]) / 2);
      var appMidY = Math.round((appFrom[1] + appTo[1]) / 2) - 60;
      appHtml += '<path class="' + appPathClass + '" d="M' + appFrom[0] + ' ' + appFrom[1] + 'Q' + appMidX + ' ' + appMidY + ' ' + appTo[0] + ' ' + appTo[1] + '"></path>';
    }
    if (appLogistics.hotel) {
      appHtml += '<path class="route-transfer" d="M' + appLastAnchor[0] + ' ' + appLastAnchor[1] + 'C' + (appLastAnchor[0] + 26) + ' ' + (appLastAnchor[1] + 17) + ' ' + (appHotelX - 32) + ' ' + (appHotelY - 14) + ' ' + appHotelX + ' ' + appHotelY + '"></path>';
    }
    appPoints.forEach(function (appPoint, appPointIndex) {
      var appPair = appAnchors[appPointIndex];
      var appRoleText = appPoints.length === 1 ? 'точка маршрута' : (appPointIndex === 0 ? 'отправление' : (appPointIndex === appPoints.length - 1 ? 'прибытие' : 'пересадка'));
      var appIsLast = appPointIndex === appPoints.length - 1 && appPoints.length > 1;
      var appTextX = appIsLast ? -142 : 24;
      appHtml += '<g class="route-marker" transform="translate(' + appPair[0] + ' ' + appPair[1] + ')">' +
        '<circle r="15"></circle>' +
        '<text x="' + appTextX + '" y="-10">' + appEscape(appPoint) + '</text>' +
        '<text class="code" x="' + (appIsLast ? -142 : 25) + '" y="12">' + appEscape(appRoleText) + '</text></g>';
    });
    if (appLogistics.hotel) {
      var appCheckinTime = String(appLogistics.checkin || '').length >= 16 ? String(appLogistics.checkin).slice(11, 16) : '';
      appHtml += '<g class="route-marker hotel" transform="translate(' + appHotelX + ' ' + appHotelY + ')">' +
        '<circle r="15"></circle>' +
        '<text x="-136" y="44">Отель</text>' +
        '<text class="code" x="-136" y="66">' + appEscape(appCheckinTime ? 'заселение · ' + appCheckinTime : 'проживание') + '</text></g>';
    }
    return appHtml;
  }

  function appRouteEventCardHtml(appEvent) {
    return '<article class="route-event-card">' +
      '<time class="route-event-time">' + appEscape(appEvent.appTime) + '</time>' +
      '<div><h3 class="route-event-title">' + appEscape(appEvent.appTitle) + '</h3>' +
      '<div class="route-event-meta">' +
      '<span>Откуда<strong>' + appEscape(appEvent.appFrom) + '</strong></span>' +
      '<span>Куда<strong>' + appEscape(appEvent.appTo) + '</strong></span>' +
      '<span>Тип<strong>' + appEscape(appEvent.appType) + '</strong></span>' +
      '<span>Статус<strong>' + appEscape(appEvent.appStatus) + '</strong></span>' +
      '</div>' +
      '<div class="route-event-bottom">' +
      '<span class="badge ' + appEvent.appBadgeClass + '">' + appEscape(appEvent.appBadge) + '</span>' +
      '<span class="route-source">' + appEscape(appEvent.appSource) + '</span>' +
      '</div></div></article>';
  }

  function appRouteTimelineHtml(appSegments, appLogistics, appTrip) {
    if (!appSegments.length && !appLogistics.hotel) {
      return '<article class="route-event-card"><time class="route-event-time">—</time>' +
        '<div><h3 class="route-event-title">Сегменты маршрута пока не добавлены</h3>' +
        '<div class="route-event-meta"><span>Статус<strong>Маршрут ожидает детализации</strong></span></div>' +
        '<div class="route-event-bottom"><span class="route-source">Добавьте сегменты через редактирование поездки — таймлайн обновится автоматически.</span></div></div></article>';
    }
    var appEvents = [];
    appSegments.forEach(function (appSegment) {
      var appKind = appSegmentKind(appSegment.type);
      appEvents.push({
        appTime: appSegmentTime(appSegment, 'start'),
        appTitle: appSegmentTitle(appSegment),
        appFrom: appSegment.from || '—',
        appTo: appSegment.to || '—',
        appType: appSegment.type || 'Сегмент',
        appStatus: appSegment.status || 'Запланировано',
        appBadge: appSegment.ref
          ? ((appKind === 'flight' || appKind === 'train') ? 'Билет ' + appSegment.ref : (appKind === 'transfer' || appKind === 'bus' ? 'Ваучер ' + appSegment.ref : appSegment.ref))
          : 'Без номера',
        appBadgeClass: appKind === 'transfer' || appKind === 'bus' ? 'badge-info' : 'badge-accent',
        appSource: appSegmentSource(appKind)
      });
    });
    var appLastSegment = appSegments[appSegments.length - 1] || null;
    if (appLastSegment) {
      var appLastKind = appSegmentKind(appLastSegment.type);
      appEvents.push({
        appTime: appSegmentTime(appLastSegment, 'end'),
        appTitle: 'Прибытие — ' + (appLastSegment.to || (appTrip && appTrip.to) || 'пункт назначения'),
        appFrom: appLastSegment.from || '—',
        appTo: appLastSegment.to || '—',
        appType: 'Прибытие',
        appStatus: appLastSegment.status || 'Запланировано',
        appBadge: appLastSegment.ref ? ((appLastKind === 'flight' || appLastKind === 'train') ? 'Билет ' + appLastSegment.ref : appLastSegment.ref) : 'Без номера',
        appBadgeClass: 'badge-accent',
        appSource: appSegmentSource(appLastKind)
      });
    }
    if (appLogistics.hotel) {
      appEvents.push({
        appTime: String(appLogistics.checkin || '').length >= 16 ? String(appLogistics.checkin).slice(11, 16) : '—',
        appTitle: 'Заселение в отель',
        appFrom: (appTrip && appTrip.to) || '—',
        appTo: appLogistics.hotel,
        appType: 'Проживание / отель',
        appStatus: 'Бронирование подтверждено',
        appBadge: 'Ваучер отеля',
        appBadgeClass: 'badge-success',
        appSource: 'Источник: подтверждение бронирования'
      });
    }
    return appEvents.map(appRouteEventCardHtml).join('');
  }

  function appRenderRoutePanel(appState) {
    var appTrip = appState.trip || {};
    var appSegments = appSortedSegments(appTrip);
    var appLogistics = appTrip.logistics || {};
    var appPoints = appRouteList(appTrip);
    var appDatesText = appFormatDateRange(appTrip.startDate, appTrip.endDate) || appTrip.dates || 'Даты не заданы';

    var appMapSubtitle = appQ('[data-od-id="route-interactive-map"] .card-subtitle');
    if (appMapSubtitle) appMapSubtitle.textContent = (appTrip.route || 'Маршрут не задан') + ' · ' + appDatesText;

    var appLayer = document.getElementById('route-map-layer');
    if (appLayer) {
      var appLayerHtml = appRouteMapLayerHtml(appPoints, appSegments, appLogistics);
      if (appLayer.appLastHtml !== appLayerHtml) {
        appLayer.appLastHtml = appLayerHtml;
        appLayer.innerHTML = appLayerHtml;
        if (typeof window.centerRouteMap === 'function') window.centerRouteMap();
      }
    }

    var appTimelineSubtitle = appQ('[data-od-id="route-full-timeline"] .card-subtitle');
    if (appTimelineSubtitle) appTimelineSubtitle.textContent = appDatesText + ' · все сегменты поездки';

    var appTimeline = appQ('[data-od-id="route-full-timeline"] .route-timeline');
    if (appTimeline) appSetHtmlIfChanged(appTimeline, appRouteTimelineHtml(appSegments, appLogistics, appTrip));
  }

  /* ── Глобальные кнопки (дубли «Пригласить»/«Редактировать») ── */

  function appRenderGlobalButtons(appState) {
    var appManage = appCanManageTrip(appState);
    var appInviteButton = appQ('[data-od-id="btn-invite"]');
    if (appInviteButton) appInviteButton.hidden = !appManage || appActiveTab === 'members';
    var appEditButton = appQ('[data-od-id="btn-edit"]');
    if (appEditButton) appEditButton.hidden = !appManage || appActiveTab === 'settings';
    var appCompleteItem = appQ('#more-menu .dropdown-item.danger');
    if (appCompleteItem) appCompleteItem.hidden = !appManage;
  }

  /* ── Завершение / удаление поездки ── */

  function appCloseAllBaseModals() {
    var appOverlays = document.querySelectorAll('.modal-overlay');
    Array.prototype.forEach.call(appOverlays, function (appOverlay) {
      if (!appOverlay.hasAttribute('hidden') && typeof window.hideModalImmediately === 'function') {
        window.hideModalImmediately(appOverlay.id);
      }
    });
    var appMembersLayer = document.getElementById('members-modal-layer');
    var appMembersClose = document.getElementById('members-modal-close');
    if (appMembersLayer && appMembersLayer.classList.contains('members-open') && appMembersClose) appMembersClose.click();
  }

  function appEnsureDeletedScreen() {
    var appScreen = document.getElementById('app-deleted-screen');
    if (appScreen) return appScreen;
    appScreen = document.createElement('div');
    appScreen.id = 'app-deleted-screen';
    appScreen.setAttribute('hidden', '');
    appScreen.setAttribute('role', 'region');
    appScreen.setAttribute('aria-label', 'Поездка удалена');
    appScreen.style.cssText = 'position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);overflow:auto;';
    appScreen.innerHTML = '<div style="max-width:440px;width:100%;text-align:center;display:grid;gap:16px;justify-items:center;">' +
      '<h1 style="margin:0;">Поездка удалена</h1>' +
      '<p style="margin:0;color:var(--muted);">Данные этой поездки больше недоступны на устройстве. Демонстрационная офлайн-копия очищена.</p>' +
      '<button type="button" class="btn btn-primary" id="app-deleted-home" style="min-height:44px;">Вернуться на Главную</button>' +
      '<button type="button" class="btn btn-secondary" id="app-deleted-reset" data-development-only="true" style="min-height:44px;">Сбросить демо-данные</button>' +
      '</div>';
    document.body.appendChild(appScreen);
    var appHomeButton = document.getElementById('app-deleted-home');
    if (appHomeButton) appHomeButton.addEventListener('click', function () {
      if (window.AppRoutes && typeof window.AppRoutes.goToHome === 'function') window.AppRoutes.goToHome();
      else window.location.href = 'home.html';
    });
    var appResetButton = document.getElementById('app-deleted-reset');
    if (appResetButton) appResetButton.addEventListener('click', function () {
      appStore.resetDemoData();
      if (typeof window.toastSuccess === 'function') window.toastSuccess('Демо-данные восстановлены');
    });
    return appScreen;
  }

  function appApplyTripStatus(appState) {
    var appStatus = appState.trip.status;
    document.body.classList.toggle('app-trip-completed', appStatus === 'completed');
    document.body.classList.toggle('app-trip-deleted', appStatus === 'deleted');

    var appPage = appQ('main.page');
    var appSosButton = appQ('.btn.btn-sos');
    var appDeletedScreen = appEnsureDeletedScreen();

    if (appStatus === 'deleted') {
      if (!appDeletedHandled) {
        appDeletedHandled = true;
        appCloseAllBaseModals();
        if (window.appCountdownTimer) {
          window.clearInterval(window.appCountdownTimer);
          window.appCountdownTimer = null;
        }
        document.body.style.overflow = '';
      }
      if (appPage) appPage.setAttribute('hidden', '');
      if (appSosButton) appSosButton.setAttribute('hidden', '');
      appDeletedScreen.removeAttribute('hidden');
    } else {
      appDeletedHandled = false;
      if (appPage) appPage.removeAttribute('hidden');
      if (appSosButton) appSosButton.removeAttribute('hidden');
      appDeletedScreen.setAttribute('hidden', '');
    }

    if (appSosButton) {
      if (appStatus === 'completed') appSosButton.setAttribute('aria-disabled', 'true');
      else appSosButton.removeAttribute('aria-disabled');
    }

    var appReadonlyDocs = appStatus !== 'active' || appState.currentUser.currentTripRole !== 'organizer';
    var appDocsAddButton = document.getElementById('docs-add-btn');
    if (appDocsAddButton) appDocsAddButton.hidden = appReadonlyDocs;
    var appDocsMailButton = document.getElementById('docs-mail-btn');
    if (appDocsMailButton) appDocsMailButton.hidden = appReadonlyDocs;
  }

  /* ── Общий рендер: одинаковый для каждого tripId, различаются только данные ── */

  /* ── SOS: список сегментов выбранной поездки ── */

  function appRenderSosSegments(appState) {
    var appSelect = document.getElementById('sos-segment');
    if (!appSelect) return;
    var appSegments = appSortedSegments(appState.trip);
    var appOptions = appSegments.map(function (appSegment) {
      var appLabel = [appSegment.from, appSegment.to].filter(Boolean).join(' → ') || 'Сегмент маршрута';
      var appTime = appSegmentTime(appSegment, 'start');
      return '<option value="' + appEscape(appSegment.id) + '">' + appEscape(appLabel + (appTime ? ' · ' + appTime : '')) + '</option>';
    });
    appOptions.push('<option value="route-whole">Маршрут целиком</option>');
    appSetHtmlIfChanged(appSelect, appOptions.join(''));
  }

  function appRenderAll(appState) {
    appRenderHeader(appState);
    appRenderSosSegments(appState);
    appRenderAvatars(appState);
    appRenderTitleMentions(appState);
    appRenderOverviewPanel(appState);
    appRenderRoutePanel(appState);
    appRenderGlobalButtons(appState);
    appApplyTripStatus(appState);
    if (typeof window.appSyncDocsRole === 'function') window.appSyncDocsRole(appState);
    document.body.setAttribute('data-app-environment', appState.environment);
  }

  /* ── Обёртка switchTab: скрытие дублей на активной вкладке ── */

  if (typeof window.switchTab === 'function' && !window.switchTab.appWrapped) {
    var appOriginalSwitchTab = window.switchTab;
    var appWrappedSwitchTab = function appSwitchTabWrapper(appTabId) {
      appOriginalSwitchTab(appTabId);
      appActiveTab = appTabId;
      appRenderGlobalButtons(appStore.getState());
    };
    appWrappedSwitchTab.appWrapped = true;
    window.switchTab = appWrappedSwitchTab;
  }

  /* ── Обёртка openModal: read-only защита старых обработчиков (клики и клавиатура) ── */

  if (typeof window.openModal === 'function' && !window.openModal.appWrapped) {
    var appOriginalOpenModal = window.openModal;
    var appGuardedModals = ['modal-doc-upload', 'modal-mail-import', 'modal-doc-access', 'modal-doc-delete', 'modal-ocr-review'];
    var appWrappedOpenModal = function appOpenModalWrapper(appModalId) {
      var appState = appStore.getState();
      if (appState.trip.status !== 'active') {
        if (appModalId === 'modal-sos') {
          if (typeof window.toastInfo === 'function') window.toastInfo('Поездка завершена — новые сигналы SOS недоступны');
          return;
        }
        if (appGuardedModals.indexOf(appModalId) !== -1) {
          if (typeof window.toastInfo === 'function') window.toastInfo('Поездка завершена: изменения недоступны');
          return;
        }
      }
      if (appState.networkState === 'offline' && appGuardedModals.indexOf(appModalId) !== -1) {
        if (typeof window.toastInfo === 'function') window.toastInfo('Вы офлайн: изменения недоступны');
        return;
      }
      return appOriginalOpenModal(appModalId);
    };
    appWrappedOpenModal.appWrapped = true;
    window.openModal = appWrappedOpenModal;
  }

  /* ── Глобальные действия шапки (единые системы участников/настроек) ── */

  window.appOpenGlobalInvite = function appOpenGlobalInvite() {
    if (!appCanManageTrip(appStore.getState())) return;
    window.switchTab('members');
    if (typeof window.membersOpenInviteModal === 'function') window.membersOpenInviteModal();
  };

  window.appOpenGlobalEdit = function appOpenGlobalEdit() {
    if (!appCanManageTrip(appStore.getState())) return;
    window.switchTab('settings');
    if (typeof window.settingsOpenTripEditModal === 'function') window.settingsOpenTripEditModal();
  };

  /* ── Подписка и первый рендер ── */

  appStore.subscribe(function appIntegrationListener(appState) {
    appRenderAll(appState);
  });
  appRenderAll(appStore.getState());

  window.AppIntegration = {
    appInited: true,
    appGetActiveTab: function () { return appActiveTab; }
  };
}());

# parallel-trip-pages final · интеграция

Ветка готовит отдельные глобальные страницы личного кабинета поездок без изменения основной версии. `travel-assistant-merged-fixed.zip` остается единственным источником визуальной системы, состояния поездки и production workspace.

## Структура архива

```text
parallel-trip-pages/
  home.html
  history.html
  trip-wizard.html
  trip-readonly.html
  trip-pages.css
  trip-pages.js
  trip-pages-state.js
  trip-pages-routes.js
  trip-pages-preview.html
  TRIP-PAGES-INTEGRATION.md
  screenshots/
  open-design-meta/
```

В production переносить `home.html`, `history.html`, `trip-wizard.html`, `trip-pages.css`, `trip-pages.js`, `trip-pages-state.js`, `trip-pages-routes.js`. `trip-pages-preview.html` нужен только для обзора ветки. `trip-readonly.html` остается standalone preview completed-режима, а не вторым рабочим пространством. `open-design-meta/` можно игнорировать при переносе в Notion/production.

## Порядок подключения

Standalone-страницы уже подключают:

```html
<link rel="stylesheet" href="trip-pages.css">
<script src="trip-pages-state.js"></script>
<script src="trip-pages-routes.js"></script>
<script src="trip-pages.js"></script>
```

После объединения сначала подключить общий `design-tokens.css` основной версии в shell приложения, затем `parallel-trip-pages/trip-pages.css`, затем скрипты в порядке:

```html
<script src="parallel-trip-pages/trip-pages-state.js"></script>
<script src="parallel-trip-pages/trip-pages-routes.js"></script>
<script src="parallel-trip-pages/trip-pages.js"></script>
```

CSS ограничен корнями `.home-surface`, `.history-surface`, `.trip-wizard-surface`, `.trip-readonly-surface` и не должен переопределять существующий `trip-overview.html`.

## Маршруты

`TripPagesRoutes` публикует единый route adapter:

```js
TripPagesRoutes.goToHome();
TripPagesRoutes.goToHistory();
TripPagesRoutes.goToProfile("account");
TripPagesRoutes.goToWizard({ mode: "edit", tripId: "trip-turkey" });
TripPagesRoutes.goToTrip("trip-turkey", { tab: "documents" });
TripPagesRoutes.goToInvitation("invite-almaty");
TripPagesRoutes.logout();
```

Открытие активной поездки идет через `./trip-overview.html?trip=<tripId>`. Имя папки исходного архива не вшито. При финальном объединении router основной версии может заменить методы `TripPagesRoutes`, сохранив те же сигнатуры.

## TravelAppState

`TripPagesAdapter` использует `window.TravelAppState`, если он доступен. Preview fallback применяется только при отсутствии внешнего store.

Жизненный цикл adapter:

```js
const state = TripPagesAdapter.getState();      // initial read
const off = TripPagesAdapter.subscribe(render); // external + local subscribe
TripPagesAdapter.updateTrip(tripId, changes);   // update через внешний store или fallback
off();                                          // unsubscribe
TripPagesAdapter.destroy();                     // снять все подписки adapter
```

Поддерживаемые источники чтения: `getTripPagesState()`, `getState().tripPages`, `getState().tripsDashboard` или нормализуемый `getState()`.

Нормализованные коллекции:

```js
{
  currentUser,
  trips,
  invitations,
  drafts,
  completedTrips
}
```

Если `completedTrips` отсутствует, adapter берет `trips.filter(trip => trip.status === "completed")`.

## Схемы данных

Invitation:

```js
{
  id,
  title,
  route,
  startDate,
  endDate,
  inviterId,
  inviterName,
  role,
  accessMode,
  expiresAt,
  status
}
```

Draft:

```js
{
  id,
  updatedAt,
  step,
  progress,
  data,
  segments
}
```

Trip:

```js
{
  id,
  title,
  description,
  status,
  kind,
  role,
  start,
  end,
  dates,
  timezone,
  from,
  to,
  route,
  routePoints,
  segments,
  logistics,
  participants,
  invitationDrafts,
  documentSetup,
  documents,
  monitoringSettings,
  notify,
  nextEvent,
  updatedAt
}
```

Подготовленные приглашения хранятся отдельно в `invitationDrafts` и не являются участниками до принятия. Пустой email не создает фиктивного пользователя. Подготовленные документы хранятся в `documentSetup` с типом и видимостью; настоящая загрузка и OCR остаются в существующей вкладке «Документы».

## События интеграции

После пользовательских действий публикуются `CustomEvent`:

```js
window.addEventListener("trip-pages:trip-created", (event) => {
  const { tripId, draftId, currentUserId, changedFields, createdAt } = event.detail;
});
```

События:

- `trip-pages:invitation-accepted`
- `trip-pages:invitation-rejected`
- `trip-pages:draft-saved`
- `trip-pages:draft-deleted`
- `trip-pages:trip-created`
- `trip-pages:trip-updated`
- `trip-pages:trip-open-requested`

Payload содержит релевантные `tripId`, `invitationId`, `draftId`, `currentUserId`, `changedFields`, `createdAt` или `updatedAt`.

## Lifecycle страниц

Глобальные функции:

```js
tripPagesHomeInit(root, adapter, routes);
tripPagesHomeDestroy(root);
tripPagesHistoryInit(root, adapter, routes);
tripPagesHistoryDestroy(root);
tripWizardInit(root, adapter, routes);
tripWizardDestroy(root);
tripReadonlyInit(root, adapter, routes);
tripReadonlyDestroy(root);
```

Повторный init не добавляет дублирующиеся listeners. Destroy снимает AbortController, отписку от `TravelAppState`, закрывает меню, modal, toast, отменяет timers и убирает `beforeunload` конкретного wizard.

## Production и development

Standalone-страницы используют:

```html
<body data-app-environment="development">
```

В production выставить:

```html
<body data-app-environment="production">
```

Тогда `[data-development-only="true"]` скрывается без пустого места. Development-панель закрыта по умолчанию, меняет только `uiScenario` и не трогает `networkState`, `accessState`, `trip.status`, роли или бизнес-данные. Полный сброс выполняет только кнопка «Сбросить демо-данные».

## Completed-режим

`trip-readonly.html` является только preview. В production завершенная поездка должна открываться через существующий `trip-overview.html` при `trip.status = "completed"`. Не создавать второе production workspace.

Preview читает `?trip=<completedTripId>`. Если id не найден, показывается безопасное состояние с возвратом в Историю и без подстановки данных другой поездки.

## QA, выполнено в браузере

Проверено через локальный static server `http://127.0.0.1:4177/parallel-trip-pages/` после JS-render:

- History: поиск «Тбилиси», фильтр `2025`, роль «Участник», тип «Соло», сортировка по нарушениям, очистка/empty state. Ошибка `Cannot read properties of undefined (reading 'filter')` не воспроизводится.
- Home: активные приглашения, принятие первого приглашения, исчезновение приглашения, появление поездки с датами конкретного приглашения, отклонение второго приглашения с подтверждением, вкладка «Черновики», меню поездки, profile menu, скрытие панели в production.
- Wizard: переход без перескакивания, inline error у названия, сегмент с введенным временем, подготовленное приглашение, подготовленный документ, сохранение черновика и возврат на Главную.
- Read-only: открытие `done-karelia` по id, проверка заголовка/маршрута/вкладок, безопасное состояние для неизвестного id.
- TravelAppState: внешний `subscribe` обновил Home после изменения названия поездки извне.

Console errors в проверенных сценариях: 0. Page errors, uncaught errors и unhandled rejections в браузерных прогонах не обнаружены. Все PNG в `screenshots/` сделаны после JS-render.

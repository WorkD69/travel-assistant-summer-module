# Core Flow Integration Contract

Назначение ветки: добавить две встраиваемые вкладки существующего `trip-overview.html` без переноса preview-shell в production.

## Финальная структура ZIP

```text
parallel-core-flow/
  trip-monitoring.html
  trip-monitoring.css
  trip-monitoring.js
  trip-messages.html
  trip-messages.css
  trip-messages.js
  core-flow-shared.css
  core-flow-state-adapter.js
  core-flow-preview.html
  CORE-FLOW-INTEGRATION.md
  screenshots/
```

`core-flow-preview.html` нужен только для проверки в Open Design. Его shell, app-bar, trip-header, tabs, demo-panel и preview SOS не переносятся целиком в основной проект.

## HTML fragments

Вставить мониторинг в существующую панель:

```html
<div id="panel-monitor" class="tab-panel" role="tabpanel" aria-labelledby="tab-monitor">
  <!-- содержимое trip-monitoring.html -->
</div>
```

Вставить сообщения:

```html
<div id="panel-messages" class="tab-panel" role="tabpanel" aria-labelledby="tab-messages">
  <!-- содержимое trip-messages.html -->
</div>
```

Фрагменты не содержат `html`, `head`, `body`, `main`, общей шапки, навигации, названия поездки, аватаров или второй SOS.

## CSS order

Подключать после основной дизайн-системы:

```html
<link rel="stylesheet" href="design-tokens.css">
<link rel="stylesheet" href="parallel-core-flow/core-flow-shared.css">
<link rel="stylesheet" href="parallel-core-flow/trip-monitoring.css">
<link rel="stylesheet" href="parallel-core-flow/trip-messages.css">
```

Компонентные селекторы ограничены `.monitoring-surface` и `.messages-surface`. Shared classes используют `.coreflow-*`. Для portal нужен theme scope:

```html
<div id="coreflow-shared-modal-root" class="coreflow-modal-root coreflow-theme-scope"></div>
<div id="coreflow-shared-toast-root" class="coreflow-toast-root coreflow-theme-scope"></div>
```

Если portal создаётся adapter-ом, класс `coreflow-theme-scope` добавляется автоматически.

Production UI:

```css
[data-app-environment="production"] [data-development-only="true"] {
  display: none !important;
}
```

## JS order

```html
<script src="parallel-core-flow/core-flow-state-adapter.js"></script>
<script src="parallel-core-flow/trip-monitoring.js"></script>
<script src="parallel-core-flow/trip-messages.js"></script>
```

## Init / destroy

```js
const coreFlowAdapter = window.coreFlowCreateStateAdapter({
  modalRoot: document.getElementById("coreflow-shared-modal-root"),
  toastRoot: document.getElementById("coreflow-shared-toast-root")
});

const monitoringRoot = document.querySelector("#panel-monitor .monitoring-surface");
const messagesRoot = document.querySelector("#panel-messages .messages-surface");

monitoringInit(monitoringRoot, coreFlowAdapter);
messagesInit(messagesRoot, coreFlowAdapter);

// При размонтировании:
monitoringDestroy(monitoringRoot);
messagesDestroy(messagesRoot);
coreFlowAdapter.destroy();
```

`init` идемпотентен для одного root. `destroy` снимает root listeners, unregister handlers, закрывает shared UI и удаляет subscriptions. `registerSosHandler` и `registerDraftHandler` возвращают disposer.

## Adapter API

Использовать функции, а не прямой доступ к массивам:

```js
adapter.getPlanBOptions(); // safe copy, always 3 items
adapter.getSegments();     // safe copy
adapter.getParticipants(); // safe copy
```

Дополнительные методы:

```js
adapter.getState();
adapter.subscribe((state, eventName) => {});
adapter.canMutate(action);
adapter.visibleSignals();
adapter.visibleMessages();
adapter.visibleHistory();
adapter.normalizeRecipients(value);
adapter.formatRecipients(value);
adapter.openSos(options);
adapter.openMessageDraft(options);
```

## TravelAppState

Если `window.TravelAppState` доступен, adapter:

1. Выполняет initial read через `TravelAppState.getState()`.
2. Подписывается через `TravelAppState.subscribe(handler)`.
3. На внешние изменения синхронизирует `currentUser`, `role`, `trip.status`, `accessState`, `networkState`, `environment`, `participants`, `activeTrip/trip`, `telegramConnected`.
4. Пишет core-flow данные через `TravelAppState.setState({ coreFlow })`, если метод доступен.
5. В `destroy()` вызывает unsubscribe.

В production не создавать независимый постоянный store для `role`, `currentUser` и `trip.status`. Источник этих полей — общий store. Preview fallback использует in-memory `CoreFlowPreviewState` только когда `TravelAppState` отсутствует.

## Scenario vs trip status

Разделены:

- `uiScenario` / `scenario` — демо-сценарий вкладки;
- `trip.status` — бизнес-статус поездки;
- `accessState` — доступ к поездке;
- `networkState` — online/offline.

Обычный demo-сценарий не реактивирует завершённую поездку. `trip.status = completed` блокирует изменения до явного reset preview fixture.

## Existing SOS

В основной версии сохраняется один глобальный SOS. Он вызывает:

```js
window.coreFlowOpenSos({
  source: "global-sos",
  currentSegmentId,
  tripId
});
```

Функция открывает форму текущей ветки через зарегистрированный monitoring handler. В `monitoringDestroy()` handler снимается.

## Message draft

После подтверждения Plan B мониторинг вызывает:

```js
adapter.openMessageDraft({
  planId: "plan-b",
  messageId: "message-draft-plan-b"
});
```

Messages handler открывает редактор без reload. `messagesDestroy()` снимает draft handler.

## Plan selected event

После подтверждения Plan B публикуется событие:

```js
window.addEventListener("coreflow:plan-selected", (event) => {
  console.log(event.detail);
});
```

Payload:

```json
{
  "tripId": "trip-turkey-2026",
  "disruptionId": "signal-anna-1",
  "planId": "plan-b",
  "selectedAt": "2026-07-19T14:10:00+03:00",
  "selectedBy": "artem",
  "affectedSegmentIds": ["mow-ayt", "transfer-hotel", "hotel-stay"],
  "updatedTimes": { "arrival": "20 июля, 11:45" },
  "hotelImpact": "Нужна отметка о позднем заселении",
  "transferImpact": "Перенести на дневное окно",
  "activityImpact": "Первая активность переносится",
  "estimatedCost": "≈ 22 000 ₽",
  "messageDraftId": "message-draft-plan-b"
}
```

Notion/integration-controller связывает это событие с Route, Timeline, Overview, Monitoring и Messages. Ветка не покупает билеты, не отменяет бронирования и не выполняет переоформление.

## Privacy model

SOS не использует `signal.public`. Личный SOS:

```js
audience: {
  type: "organizer-and-author",
  participantIds: ["anna"]
}
```

Организатор видит все SOS. Автор видит свой статус. Другой участник не видит чужой SOS. Публичное групповое уведомление создаётся отдельным event с `audience.type = "all-participants"`.

Recipients нормализованы:

```js
recipients: {
  type: "all-participants" | "selected-participants" | "provider" | "organizer",
  participantIds: [],
  providerType: null
}
```

Для `selected-participants` редактор показывает реальные checkbox участников и требует минимум один ID. Provider/hotel/transfer/support скрыты от участников.

## Access, offline, completed

- `accessState !== "granted"`: показывается только безопасный экран, данные поездки не раскрываются.
- `networkState === "offline"`: read-only, изменяющие handlers возвращают `false`.
- `trip.status === "completed"`: read-only, история и опубликованный Plan B доступны для просмотра.

## Preview notes

`core-flow-preview.html` содержит единственный preview shell, один mobile selector разделов и один preview SOS. В production его не переносить. Он может использовать fallback-токены, чтобы не падать без распакованного `design-tokens.css`; при объединении source of truth остаётся `design-tokens.css` основного проекта.

`DESIGN-HANDOFF.md` и `DESIGN-MANIFEST.json` не являются runtime-файлами этой ветки. Если Open Design создаст их автоматически, Notion не должен переносить их в production.

## Tests actually run in this pass

- Syntax check для `core-flow-state-adapter.js`, `trip-monitoring.js`, `trip-messages.js`.
- Playwright smoke-test core flow: confirm violation → 3 Plan B → 6 comparison rows → choose B → confirm → message editor → save draft → Messages → demo send → history/status update.
- Playwright validation checks: empty topic, empty text, selected participants without IDs, provider + Telegram.
- Playwright privacy checks: participant B does not see Anna SOS; participant does not see provider message; participant filters are shortened.
- Playwright state checks: offline direct handlers do not mutate state; completed is not reactivated by normal scenario; TravelAppState subscribe/unsubscribe works.
- Playwright mobile checks: SOS is 64×64, no horizontal overflow on checked mobile screens.

Do not claim browser coverage beyond these checks unless rerun during integration.

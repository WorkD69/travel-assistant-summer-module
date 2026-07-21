# MERGE REPORT — travel-assistant-final

## Источники объединения

| Архив | Роль |
|---|---|
| travel-assistant-merged-fixed.zip | ОСНОВА: trip-overview.html, design-tokens.css, TravelAppState, SOS, shell |
| parallel-trip-pages(3).zip | home.html, history.html, trip-wizard.html, черновики, приглашения |
| parallel-core-flow(5).zip | Мониторинг, Сообщения, SOS-сценарий, Plan B, Offline, No Access |
| parallel-account-pages(3).zip | login/register/recovery/invitation/profile, Telegram, уведомления, оформление |

## Изменённые файлы основы (точечные правки)

- `trip-overview.html` — вставлены панели #panel-monitor/#panel-messages, portal-контейнеры, 5 скриптов core-flow, pagehide-flush персистенции, OFF-2/NACC-1 хуки
- `features/app-state.js` — без изменений (сохранён полностью)
- `features/integration-controller.js` — без изменений
- `assets/js/app-state-bridge.js` — pagehide-flush для устранения гонки персистенции
- `assets/js/account-pages.js` — session-auth приоритет над auth=1 при возврате к приглашению
- `assets/js/account-state-adapter.js` — acceptInvitation добавляет имя в trip.participants
- `assets/js/trip-monitoring.js` — ROLE-1: verdict-confirm/reject/more скрыты от участников
- `assets/js/trip-monitoring.js` — OFF-2: SOS disabled при networkState=offline

## Исключённые файлы

- `trip-pages-preview.html` → dev-preview/
- `core-flow-preview.html` → dev-preview/
- `account-pages-preview.html` → dev-preview/
- `trip-readonly.html` → dev-preview/
- DESIGN-HANDOFF.md, DESIGN-MANIFEST.json → docs/open-design-meta/

## Конфликты и решения

| Конфликт | Решение |
|---|---|
| Три независимых :root CSS | design-tokens.css основы — единый источник токенов |
| Три разных шапки | Шапка основы (app-shell.js/css) унифицирована для всех страниц |
| Множество state-store | Один TravelAppState + adapter-bridge для каждой ветки |
| Дублирующиеся SOS | Единая кнопка .btn-sos из основы, coreFlowOpenSos() |
| Гонка персистенции при навигации | pagehide event → flush setTimeout |
| SessionAuth vs auth=1 param | SessionStorage приоритетнее URL-параметров |

## Встраивание Monitoring и Messages

frag `trip-monitoring.html` вставлен в `#panel-monitor`, `trip-messages.html` в `#panel-messages`.
Оба подключают CSS и JS через `<link>`/`<script>` в trip-overview.html.
Один экземпляр coreFlowCreateStateAdapter — общий для обеих вкладок.

## Completed-режим

Поездки со `status=completed` открываются через trip-overview.html с баннером.
SOS скрыт, кнопки мутации disabled, вкладки доступны только для просмотра.

## AppRoutes

assets/js/app-routes.js объединяет AccountRoutes + TripPagesRoutes.
Все страницы используют единый router adapter.
Bezopasnyj return URL: только /invitation.html?invitationId= разрешён как return.

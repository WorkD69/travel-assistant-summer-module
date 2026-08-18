# Final Frontend Integration Phase A — Design

**Дата:** 18 августа 2026  
**Статус:** согласовано пользователем  
**Baseline:** `integration/hackathon-2026@3b9fbd90703027cdbd6e7815167d73064d0bf702`  
**Рабочая ветка:** `feat/final-frontend-integration-phase-a`

## Цель

Реализовать в существующем frontend целостный factual flow `Home/Search → Search Results → isolated Tutu checkout → explicit demo purchase → canonical Trip reread → existing Trip route`. Работа ограничена frontend и не изменяет `backend/src/**`, Prisma, Tutu adapter, transport contracts, security/access или Smart Workspace интерфейс.

## Границы и неизменяемые части

Изменения затронут только общий API-клиент, runtime-конфигурацию, Search Results flow, его CSS/HTML при необходимости и frontend-тесты. Не создаются новые страницы, `/trips/:id`, fixture-поездки или альтернативное Trip представление. `trip-overview.html` используется только существующим маршрутом `AppRoutes.goToTrip(tripId)` и визуально не перерабатывается.

## API base

Единая точка конфигурации остаётся `window.TRAVEL_API_BASE`, устанавливаемая до загрузки `assets/js/api-client.js`. API-клиент получает origin только из неё; при отсутствии значения его default — same-origin пустая строка. В финальном execution path не остаётся B2 staging origin, page-specific base или hardcoded временный URL. Этот подход сохраняет существующий способ runtime override для test harness и обеспечивает общий origin для auth, search, checkout, demo purchase и Trip.

## Search Results и transient selection intent

Результаты factual поиска продолжают хранить opaque `selectionToken` только в закрытом состоянии контроллера Search Results. Token не сериализуется в query string, DOM/HTML, `localStorage`, `sessionStorage` или Trip state. При поиске контроллер сбрасывает текущий selection intent; при reload страницы состояние отсутствует, поэтому пользователь обязан выполнить новый factual search.

При выборе карточки контроллер создаёт transient selection intent, содержащий только token, option id, состояние checkout и один криптографически случайный `Idempotency-Key` длиной не менее 16 символов. Intent существует исключительно в памяти текущей Results page. Повторная попытка demo purchase для того же intent использует тот же ключ. Новый ключ создаётся только при новом выборе/новом intent, а не после `409 IDEMPOTENCY_KEY_REUSE`.

## Isolated checkout handoff

Нажатие «Выбрать билет» синхронно открывает пустой placeholder window в рамках user gesture c feature string `noopener,noreferrer`. Если browser не возвращает окно, контроллер остаётся на Results page, отображает safe error и не делает переход текущей вкладки.

После `POST /api/tutu/checkout-link` frontend принимает URL только если `new URL(checkoutUrl).protocol === "https:"`. Перед навигацией устанавливается `placeholder.opener = null`; затем placeholder направляется на валидный provider URL. Главная вкладка Travel Assistant остаётся на Search Results. При сетевой/API ошибке или невалидном URL placeholder закрывается, а пользователь получает безопасное сообщение и может выбрать билет заново.

## Explicit demo purchase

После успешного isolated handoff выбранная карточка показывает отдельное действие с недвусмысленной копией: это демонстрационное подтверждение для Travel Assistant и не реальная покупка у Туту или перевозчика. Нажатие вызывает `POST /api/tutu/demo-purchase-success` с body ровно `{ selectionToken }`, действующими cookie/Authorization от общего API-клиента, `Content-Type: application/json` и заголовком `Idempotency-Key` из transient intent.

Action блокируется до завершения запроса. Сетевые retry используют тот же ключ. Ответы `201 { created: true, tripId }` и `200 { created: false, tripId }` являются converged success. `409 IDEMPOTENCY_KEY_REUSE` не генерирует новый ключ автоматически и выводит отдельное безопасное состояние. Истёкший/невалидный token, user mismatch, неаутентифицированная сессия, provider temporary unavailable и canonical load failure имеют отдельные безопасные русские сообщения; frontend не подменяет их фиктивным purchase success.

## Canonical Trip handoff

После converged demo-purchase success frontend не строит поездку из selected option. Он обязательно вызывает `GET /api/trips/:tripId` через `TravelApi.getTrip(tripId)`. Лишь после успешного canonical reread выполняется `AppRoutes.goToTrip(tripId)`, который ведёт на существующий `trip-overview.html?tripId=<encoded tripId>`. Если reread неудачен, пользователь остаётся на Results page и получает сообщение о невозможности открыть созданную поездку; фиктивной fallback-навигации нет.

## Тестируемость и проверка

Новые focused tests используют существующий `node --test` style и проверяют runtime override/default, отсутствие B2 в final execution, isolated `noopener` handoff и popup-safe placeholder, запрет token в URL/storage/HTML, reload loss, exact demo payload, stable Idempotency-Key, convergence `201/200`, canonical GET до `goToTrip`, отсутствие `/trips/:id` и fixture Trip construction. Существующие Search Results регрессии сохраняются, затем выполняется полный frontend suite, `git diff --check`, сканирование conflict markers, сборка standalone bundle и SHA-256.

## Рассмотренные альтернативы

| Вариант | Причина отказа |
|---|---|
| Открывать checkout window после `await` | Popup может быть заблокирован, а требование требует popup-safe behaviour. |
| Сохранять token или idempotency key в URL/storage | Нарушает требование transient-only lifecycle и расширяет риск раскрытия opaque token. |
| Навигировать в Trip сразу после demo purchase | Нарушает обязательный canonical `GET /api/trips/:tripId` до route handoff. |
| Сохранить B2 staging backend как fallback | Противоречит требованию убрать historical B2 из final production/demo execution path. |

## Self-review

Документ покрывает единый API base, isolated checkout, popup blocking, token lifecycle, exact demo request, idempotency, 201/200 convergence, canonical reread, error states, routing, тесты и явные scope boundaries. В документе нет placeholder-пунктов, новых backend contracts или требований затронуть Smart Workspace UI.

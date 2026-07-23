# Account pages · финальная ветка

Папка `parallel-account-pages/` содержит самостоятельные глобальные страницы аккаунта для интеграции в «Тревел-помощник». Они не являются вкладками конкретной поездки и не меняют `trip-overview.html`, `design-tokens.css`, `features/app-state.js` или существующие feature-модули.

## Структура ZIP

Финальный архив должен содержать папку верхнего уровня:

```text
parallel-account-pages/
  login.html
  register.html
  password-recovery.html
  invitation.html
  profile.html
  account-pages.css
  account-pages.js
  account-state-adapter.js
  account-routes.js
  account-pages-preview.html
  ACCOUNT-PAGES-INTEGRATION.md
  screenshots/
```

`account-pages-preview.html` нужен только для автономной проверки. В production его не переносить в пользовательскую навигацию.

## Назначение страниц

`login.html` и `register.html` открываются до входа и после успеха ведут на Главную со списком поездок.

`password-recovery.html` выполняет frontend-сценарий восстановления через request/token. Сброс не зависит от текущей сессии.

`invitation.html` открывается из ссылки приглашения. Для `active` и `accepted` показывает разрешённые детали, для `invalid`, `noAccess`, `revoked` не раскрывает данные поездки.

`profile.html` является глобальной страницей аккаунта: Аккаунт, Telegram, Почта, Уведомления, Оформление. Профиль не добавляется во вкладки поездки.

## CSS и визуальная система

В основной сборке подключайте существующий `design-tokens.css` перед `account-pages.css`:

```html
<link rel="stylesheet" href="../design-tokens.css" />
<link rel="stylesheet" href="account-pages/account-pages.css" />
```

`account-pages.css` использует account-scoped fallback-токены с теми же значениями, что и основная тёмная система: графитовый фон, поверхности, границы, бирюзовая primary-кнопка, красный для ошибок, янтарный для предупреждений, зелёный для успеха.

Глобальные правила ограничены `body.account-page` и корнями:

- `.login-surface`
- `.register-surface`
- `.recovery-surface`
- `.invitation-surface`
- `.profile-surface`
- `.account-preview-surface`

## JavaScript порядок

Подключайте скрипты в таком порядке:

```html
<script src="account-pages/account-state-adapter.js"></script>
<script src="account-pages/account-routes.js"></script>
<script src="account-pages/account-pages.js"></script>
```

Публичные функции:

- `createAccountStateAdapter({ travelAppState, previewStorage, mode })`
- `AccountRoutes.configure(config)`
- `accountPageInit(rootElement, pageType, adapter, routes)`
- `accountPageDestroy(rootElement)`
- `loginInit(root, adapter, routes)`
- `registerInit(root, adapter, routes)`
- `recoveryInit(root, adapter, routes)`
- `invitationInit(root, adapter, routes)`
- `profileInit(root, adapter, routes)`

`accountPageInit` идемпотентен: повторный вызов сначала уничтожает старый instance. `destroy` снимает delegated listeners, disposer подписки, таймеры, dropdown, modal focus trap и object URL аватара.

## Adapter modes

Создание adapter:

```js
const adapter = createAccountStateAdapter({
  travelAppState: window.TravelAppState,
  mode: window.TravelAppState ? "integration" : "preview"
});
```

В `integration` режиме `TravelAppState` является единственным source of truth. Adapter не читает preview `localStorage` и не накладывает demo fixture поверх production state.

В `preview` режиме используется `AccountPagesPreviewState` и локальное хранилище только для автономной проверки.

## TravelAppState mapping

Adapter нормализует:

- `currentUser`
- `users`
- `trips` и одиночный `trip`
- `participants`
- роли внутри `trip.roles` или `trip.participantRoles`
- `accountPages.invitations`
- `accountPages.credentials`
- `accountPages.recoveryRequests`
- `accountPages.offlineCopies`
- настройки `telegram`, `mail`, `notifications`, `appearance` внутри user

Если основная база пока содержит одну поездку, она нормализуется как коллекция. При добавлении нескольких поездок profile selects и Telegram select читают их через `adapter.getAccessibleTrips(userId)`.

## Subscribe contract

`adapter.subscribe(callback)` возвращает `unsubscribe`. Если `TravelAppState.subscribe` сам возвращает disposer, adapter вызывает именно его. Adapter не полагается на неподтверждённую сигнатуру `unsubscribe(id)`.

Мутации уведомляют подписчиков один раз. UI использует модель `mutation → subscription → render`, поэтому обработчики не вызывают второй render после успешной записи.

## User schema

Минимальная user-схема:

```js
{
  id,
  firstName,
  lastName,
  email,
  avatarDataUrl,
  createdAt,
  accountStatus,
  tripIds,
  telegram,
  mail,
  notifications,
  appearance
}
```

## Credentials schema

Для preview:

```js
credentials: {
  "user@example.test": "Password2026!"
}
```

В production это место заменяется настоящей backend-авторизацией. Пароли не показываются в UI.

## Atomic email update

Для смены email использовать:

```js
adapter.updateAccountEmail({ userId, oldEmail, newEmail })
```

или профильный helper:

```js
adapter.updateAccountProfile({ userId, firstName, lastName, email })
```

Операция выполняется как единая транзакция: проверка уникальности, перенос credential на новый email, удаление старого credential, обновление `user.email`, `participant.email`, `mail.email` при совпадении со старым account email, текущей session identity и запись в `TravelAppState`.

## Recovery request/token

Восстановление использует:

- `beginPasswordRecovery(email)`
- `validateRecoveryToken(token)`
- `resetPassword({ email, token, newPassword })`

Сброс меняет credential именно введённого email. Недействительный, истёкший или использованный token отклоняется. Открытие `password-recovery.html?step=reset` без корректного token показывает безопасное состояние.

## Invitation privacy

Invitation schema:

```js
{
  id,
  tripId,
  invitedByUserId,
  invitedUserId,
  invitedEmail,
  role,
  accessMode,
  status,
  expiresAt,
  acceptedAt,
  declinedAt
}
```

Для `invalid`, `noAccess`, `revoked` страница показывает только безопасный экран «Приглашение недоступно» и не раскрывает название, маршрут, даты, участников или организатора.

Принятие проверяет `status === "active"`, срок ссылки, текущего пользователя, запрет принятия собственного приглашения и отсутствие участника в поездке. После успеха пользователь добавляется один раз в `participantIds`, получает роль внутри поездки, поездка добавляется в `user.tripIds`, invitation получает `acceptedAt`.

## Routes

Production defaults:

```js
home: "home.html"
trip: "trip-overview.html?tripId={tripId}"
history: "history.html"
profile: "profile.html"
invitation: "invitation.html"
```

Preview launcher до подключения `account-routes.js` задаёт отдельный config:

```js
window.AccountRoutesConfig = {
  home: "account-pages-preview.html#home",
  trip: "account-pages-preview.html#trip-{tripId}",
  history: "account-pages-preview.html#history"
};
```

Успешный вход и регистрация вызывают `AccountRoutes.routeAfterAuth(adapter)`. Если был `?return=invitation&invitationId=...`, пользователь возвращается к тому же приглашению. Иначе открывается `home.html`.

## Profile header

Кнопка «Уведомления» переключает профиль на `section=notifications`.

Аватар открывает menu с действиями:

- Главная
- История поездок
- Профиль
- Выйти

Menu закрывается по Escape и клику вне, поддерживает `aria-expanded` и возвращает focus.

## Telegram

Telegram section показывает ровно одно состояние: `notConnected`, `connecting`, `connected`, `error`, `lost`.

В `connected` отображается select доступных активных/предстоящих поездок из `adapter.getAccessibleTrips(user.id)`. Выбранный `selectedTripId` сохраняется в `user.telegram.selectedTripId`.

## Mail

Mail section показывает одно состояние: `notConnected`, `connecting`, `connected`, `error`, `reauth`.

Настройки сохраняются в:

```js
user.mail.settings = {
  searchBookings,
  notifyChanges,
  noRawMail
}
```

Настоящие IMAP/OAuth, чтение писем и отправка содержимого писем здесь не реализуются.

## Notifications

Список поездок формируется через adapter. На desktop используется матрица, на mobile карточки событий без горизонтальной прокрутки. Недоступные Telegram/Email каналы disabled и имеют пояснение.

## Appearance

Theme control взаимоисключающий: `dark` или `system`. Пока светлая тема не утверждена, `system` безопасно сохраняет тёмный внешний вид. Контраст, анимация, плотность и размер текста применяются через атрибуты `body` и сохраняются в `user.appearance`.

## Modal lifecycle

Модальные окна профиля используют:

- focus trap
- Shift+Tab
- Escape
- overlay close, кроме финального опасного подтверждения
- возврат focus
- `inert` и `aria-hidden` для background
- один открытый modal за раз

## Preview-only

Не переносить в production:

- `account-pages-preview.html`
- открытые сценарии проверки
- demo reset controls
- `.artifact.json`
- файлы из `open-design-meta/`, если Open Design добавит их в сборку

Панели с `data-development-only="true"` доступны только при `body[data-app-environment="development"]`.

## QA, выполнено в этом проходе

Фактически выполнены в финальном проходе:

- `node --check` для `account-pages.js`, `account-state-adapter.js`, `account-routes.js`: синтаксических ошибок нет.
- Browser smoke `login.html`: console errors = 0, page errors = 0, обычный вход не содержит конкретную поездку.
- Browser functional adapter checks: atomic email update, вход новым email, отказ старого email, синхронизация `user.email`, `participant.email`, `mail.email`, session identity и credentials.
- Browser recovery checks: request/token для пользователя A, сброс пароля A при активной сессии пользователя B, пароль B не меняется, invalid token и повторное использование token отклоняются.
- Browser invitation checks: invitee не является участником до принятия, принятие добавляет его один раз, повторное принятие отклоняется, Артём не принимает собственное приглашение, существующий участник не получает повторное принятие.
- Browser route checks: успешная регистрация уходит на `home.html`, возврат `?return=invitation&invitationId=invite-001` возвращает на то же приглашение, production defaults не ведут в launcher.
- Browser profile checks: кнопка «Уведомления» переключает section, avatar menu открывается и закрывается по Escape, modal focus trap циклит Tab/Shift+Tab и возвращает focus.
- Browser mail/Telegram checks: mail settings сохраняются в preview state, Telegram selectedTripId сохраняется и восстанавливается.
- Browser responsive sweep: `1440×900`, `1366×768`, `1180×900`, `1024×768`, `820×1180`, `768×1024`, `430×932`, `390×844`, `360×800` на login/register/recovery/invitation/profile account/profile notifications: горизонтального overflow, белого фона, открытых development-панелей и production technical text не обнаружено.
- Browser privacy check: unknown invitation ID не раскрывает «Отпуск в Турции» или детали поездки.
- Сняты новые screenshots в `parallel-account-pages/screenshots/`.

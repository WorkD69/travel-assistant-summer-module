# FILE MAP — travel-assistant-final-polished

## Production entry points

- `index.html` — корневой entry point: отправляет пользователя на `login.html` или `home.html`.
- `login.html` — вход.
- `register.html` — регистрация.
- `password-recovery.html` — восстановление пароля.
- `invitation.html` — принятие приглашения.
- `home.html` — Главная: приглашения, активные поездки, черновики.
- `history.html` — завершённые поездки.
- `trip-wizard.html` — создание и редактирование поездки.
- `trip-overview.html` — рабочее пространство поездки: Обзор, Маршрут, Документы, Участники, Мониторинг, Сообщения, Настройки.
- `profile.html` — профиль, контакты, уведомления, внешний вид.

## assets/css

- `design-tokens.css` — единая тёмная дизайн-система проекта: цвета, радиусы, типографика, размеры.
- `global.css` — базовые стили и утилиты.
- `app-shell.css` — единая глобальная шапка, меню пользователя, SOS.
- `trip-pages.css` — Главная, История, Мастер.
- `account-pages.css` — auth, invitation, profile.
- `core-flow-shared.css` — общие стили Monitoring/Messages.
- `trip-monitoring.css` — вкладка «Мониторинг».
- `trip-messages.css` — вкладка «Сообщения».

## assets/js

- `app-routes.js` — единый `AppRoutes` для login, register, recovery, invitation, home, history, wizard, profile, trip-overview, logout.
- `app-shell.js` — единая авторизованная шапка, уведомления, аватар, user menu.
- `app-state-bridge.js` — production bridge вокруг `TravelAppState`: поездки, роли по `currentUserId + tripId`, приглашения, offline, remember/session.
- `trip-pages-state.js` — adapter для home/history/wizard.
- `trip-pages.js` — логика Главной, Истории и Мастера.
- `account-state-adapter.js` — adapter для аккаунта, сессий и invitation flow.
- `account-pages.js` — логика login/register/recovery/invitation/profile.
- `core-flow-state-adapter.js` — adapter Monitoring/Messages/SOS/Plan B.
- `trip-monitoring.js` — интерактивная логика вкладки «Мониторинг».
- `trip-messages.js` — интерактивная логика вкладки «Сообщения».
- `workspace-integration.js` — выбор поездки по URL, auth guard, no-access, completed/offline sync.

## features

- `app-state.js` — базовый `TravelAppState`.
- `integration-controller.js` — синхронизация workspace с центральным state: единый data-driven интерфейс для всех поездок (без generic-панелей и ветвлений по trip.id), см. docs/WORKSPACE-FINAL-FIX.md.
- `trip-members.js` / `trip-members.css` — вкладка «Участники».
- `trip-settings.js` / `trip-settings.css` — вкладка «Настройки».
- `trip-documents.js` / `trip-documents.css` — вкладка «Документы».

## docs

- `QA-REPORT.md` — фактически выполненные проверки.
- `KNOWN-ISSUES.md` — реальные ограничения текущего статического прототипа.
- `FILE-MAP.md` — этот файл.
- `MERGE-REPORT.md` — исторический отчёт объединения.
- `integration/` — заметки по интеграции feature-модулей.
- `open-design-meta/` — служебные metadata Open Design.

## screenshots

- `screenshots/final/` — предыдущий набор контрольных скриншотов.
- `screenshots/final-polished/` — финальный набор polished-скриншотов для этой поставки.

## Delivery

- `START_PREVIEW.bat` — запуск локального preview на Windows.
- `start-preview.sh` — запуск локального preview в shell.
- `README.md` — инструкция по запуску.
- `travel-assistant-final-polished.zip` — итоговый архив на уровне рабочей папки, содержит папку `travel-assistant-final-polished/`.

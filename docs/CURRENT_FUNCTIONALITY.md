# Текущая функциональность B2

Статусы ниже основаны на исходном коде и автоматических/ручных проверках B2, а
не на обещании доступности внешних провайдеров.

## Полностью работающие в проверенном B2 flow

| Функция | Подтверждённое поведение |
| --- | --- |
| Регистрация и авторизация | Backend JWT, login/logout, восстановление сохранённой сессии без скрытого demo-login |
| Поездки и настройки | Создание, открытие, редактирование; канонические данные загружаются из backend |
| Маршрут | Изменения сохраняются в SQLite, видны после refresh и записываются как TripChange |
| Погода | Backend получает weather context через Open-Meteo для распознанных городов |
| Telegram linking | Одноразовый link token связывает web-user и Telegram account |
| Уведомления | Backend outbox/API и Telegram consumer доставляют route/Plan B события |
| Plan B apply | После подтверждения выбранный структурированный plan меняет канонический маршрут и сохраняется |
| Telegram AI | В проверенном стенде отвечает о текущем маршруте и погоде через AI provider/context |
| Приглашения | Public token flow, срок действия, принятие и привязка участника |
| Права доступа | JWT ownership checks и отдельный service token для bot API |

## Работающие с ограничениями

| Функция | Ограничение |
| --- | --- |
| Профиль | Основные profile/settings экраны и state integration есть; полный account lifecycle и deletion отсутствуют |
| Карта | Маршрут отображается при доступных координатах; это не live navigation |
| Документы и OCR | Изображения/PDF обрабатываются, но качество зависит от скана; production file scanning/object storage нет |
| Участники и роли | Организатор управляет поездкой и приглашениями; granular role/permission matrix ограничена |
| Сообщения | Trip messages представлены в интерфейсе/API, но это не полнофункциональный realtime chat |
| Monitoring | Есть сигналы, события и UI, но нет live carrier/GDS feed |
| SOS | Bot/web flow и API реализованы; это не интеграция с экстренными службами |
| Offline/PWA | Service worker и read/cache сценарии есть; конфликт-устойчивые offline writes не реализованы |
| Telegram deep link | Linking работает, но действующий VPS `WEB_APP_BASE_URL` пока может открыть старый production frontend |

## Демонстрационные функции

- Mock GDS создаёт три различающиеся альтернативы Plan B из демонстрационных
  данных.
- Plan B показывает правдоподобную замену маршрута, но не меняет реальные
  бронирования, билеты, места или оплату.
- Часть monitoring/расписаний основана на сохранённых пользователем или demo
  данных, а не на live transport feeds.
- Mock AI и MockTravelApiClient предназначены для тестов и локального режима.

## Ещё не реализовано

- настоящий GDS/carrier и booking/payment adapter;
- email delivery для приглашений и password recovery;
- production-grade realtime chat;
- account/data deletion workflow и retention policy;
- horizontal database scaling, object storage и централизованный monitoring;
- полноценная antivirus/DLP проверка документов;
- webhook/HA topology Telegram consumer.

## Требующие отдельного исправления или hardening

- синхронизировать `WEB_APP_BASE_URL` Telegram с каноническим frontend в
  отдельной operation, не меняя token;
- обновить dependency chain с найденными npm audit findings и regression review;
- расширить mobile/accessibility/browser QA;
- добавить AI observability, provider limits и безопасную оценку качества;
- проверить multi-user concurrency и стратегию перехода с SQLite;
- формализовать backup/restore drills и privacy/legal controls документов.

Полный список границ: [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md).

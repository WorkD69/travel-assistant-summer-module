# Roadmap

Roadmap фиксирует направления и не означает, что они уже реализованы.

## 1. Стабилизация

- инвентаризировать demo/non-working controls;
- закрыть dependency audit findings без регрессий;
- расширить contract, browser и regression suites.

## 2. Безопасность и данные

- refresh/session strategy, rate limits и независимый security review;
- account deletion, retention, consent и privacy controls;
- object storage, malware scanning и lifecycle документов.

## 3. Реальные travel-интеграции

- sandbox-first GDS/carrier adapter;
- live transport status и provider fallback;
- email delivery для invitations/recovery.

## 4. AI и Plan B

- provider observability, budgets, evaluation и fallback telemetry;
- объяснимость и user confirmation критических действий;
- отделение live предложений от demo alternatives.

## 5. UX, PWA и mobile

- accessibility и полная browser/device matrix;
- конфликт-устойчивый offline sync и cache migration;
- локализация, timezone и degraded-mode UX.

## 6. Мониторинг и эксплуатация

- structured logs, metrics, tracing, alerts и audit trail;
- регулярные backup/restore drills;
- безопасная Telegram HA/webhook topology.

## 7. Подготовка к реальному личному использованию

- PostgreSQL и управляемые миграции;
- production file/data controls и support runbooks;
- проверка стоимости, квот и SLA внешних API.

## 8. Возможная подготовка публичного продукта

- granular roles/permissions и multi-tenant isolation;
- legal/compliance/security assessment;
- capacity planning, incident response и публичные product/SLA boundaries.

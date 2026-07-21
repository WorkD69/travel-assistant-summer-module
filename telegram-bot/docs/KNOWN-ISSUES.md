# Known Issues

1. Текущая версия frontend не обрабатывает query-параметр tab. Deep link открывает рабочее пространство нужной поездки, после чего пользователь выбирает вкладку вручную. Исправление маршрутизации frontend отложено, поскольку frontend зафиксирован и параллельно интегрируется с backend.
2. `BOT_UPDATE_MODE=webhook` - post-MVP. Текущая версия разрешает только long polling и отклоняет webhook понятной ошибкой конфигурации.
3. API mode требует готового общего backend; offline-тест подтверждает HTTP-контракт, schemas, headers, errors, pagination и retry, но не внешний end-to-end.
4. Live Telegram polling и реальный Gemini нельзя подтвердить без пользовательских tokens/keys.
5. SQLite FSM рассчитан на один процесс. Для нескольких replicas потребуется распределённое storage.

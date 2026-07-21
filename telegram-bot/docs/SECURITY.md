# Безопасность

- Секреты только в `.env`; файл исключён из Git и финального ZIP.
- Service token не является пользовательским JWT и не передаётся в URL.
- Link tokens одноразовые; полный token не логируется и не хранится после использования.
- Backend обязан проверять Telegram binding, membership, role и object ownership на каждом endpoint.
- Mock использует только вымышленные данные и PDF с маркировкой `DEMO ONLY`.
- Документы фильтруются до выдачи; чужие personal, organizer-only, revoked и deleted недоступны.
- SOS защищён idempotency key, rate limit и FSM confirmation.
- Notification dispatcher не дублирует event ID, повторяет только временные transport errors и отдельно отмечает blocked bot.
- AI prompt и история проходят sanitation; traceback и внутренние детали пользователю не показываются.
- Deep links содержат только `tripId`; доступ к странице всё равно проверяет сайт/backend.
- `STOP_BOT.bat` проверяет PID, executable path и команду, не завершает все `python.exe`.

Не публикуйте `.env`, `bot.pid`, логи, runtime SQLite и реальные пользовательские документы. При утечке Telegram token немедленно отзовите его через BotFather.

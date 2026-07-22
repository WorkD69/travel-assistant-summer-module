# Rollback

## Backend/frontend

- Promote предыдущий READY deployment backend.
- Promote предыдущий deployment frontend или временно убрать `/api/*` rewrite.
- Не удалять Neon database во время диагностики; сначала сохранить backup и
  проверить migration history.

## Telegram bot

1. Восстановить три bot API variables из свежего backup env.
2. Вернуть `BOT_DATA_MODE=mock`.
3. Перезапустить только `travel-assistant-bot.service`.
4. Проверить один polling PID, отсутствие Telegram 409 и рабочие Groq fallbacks.

SQLite link state сохраняется неизменным до подтверждённого production API.

## VPN invariant

Rollback не включает reboot, x-ui, firewall, routes, DNS или listeners 443/2096.
После действий сравнить PID/restart count/listeners с baseline. При любом отличии
остановить дальнейшие изменения и восстановить только bot env/service.

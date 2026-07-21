# Backend Integration Checklist

- [ ] Backend реализует все operations из `bot-api.openapi.yaml` без переименования paths/fields.
- [ ] Выдан отдельный `TRAVEL_API_SERVICE_TOKEN`; rotation документирован.
- [ ] `X-Telegram-User-Id` всегда сопоставляется с привязанным site user на backend.
- [ ] Link token короткоживущий, одноразовый, не является JWT и атомарно consume-ится.
- [ ] Role/object permissions проверяются для trips, documents, messages, SOS и assistant context.
- [ ] Lists поддерживают `cursor`, `limit`, `items`, `next_cursor`.
- [ ] SOS сохраняет и повторно возвращает результат по `Idempotency-Key`.
- [ ] Temporary document link короткоживущий и выдаётся только после permission check.
- [ ] Pending notifications имеют стабильные `id` и глобальный `event_id` для deduplication.
- [ ] delivered/failed endpoints идемпотентны.
- [ ] Assistant context не содержит закрытые документы, чужие SOS, drafts/internal messages и секреты.
- [ ] 401/403/404/409/422/429/5xx возвращают `ErrorEnvelope` с безопасным `message_ru`.
- [ ] Контракт прогнан OpenAPI validator и consumer tests бота.
- [ ] Staging smoke: link → trips → document → SOS → notification → assistant context.

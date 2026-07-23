# Rollback

Rollback готовится до изменения любого окружения.

## Backend и база

1. Зафиксировать deployment ID/image digest текущей версии.
2. Снять согласованную копию SQLite и checksum.
3. При ошибке остановить write traffic.
4. Вернуть предыдущий backend artifact.
5. Если схема/данные менялись, восстановить полную согласованную копию базы,
   включая WAL/SHM по правилам SQLite.
6. Проверить health, login и чтение существующей поездки.

Нельзя «откатывать» production схему случайным `prisma db push`.

## Frontend

Вернуть заранее зафиксированный Vercel deployment/alias, затем проверить login,
API base, CORS и service-worker cache в новом browser session.

## Telegram

1. Остановить service.
2. Убедиться, что старый polling process завершён.
3. Вернуть backup env без вывода token.
4. При необходимости вернуть release directory/systemd unit.
5. Запустить service.
6. Проверить ровно один polling process, `NRestarts`, отсутствие 409/traceback и
   фактический backend URL без вывода service token.

Backup нельзя удалять до окончания периода наблюдения.


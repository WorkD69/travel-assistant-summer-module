#!/usr/bin/env bash
# Тревел-помощник — локальный предпросмотр (macOS / Linux)
set -e
cd "$(dirname "$0")"

PY=""
if command -v python3 >/dev/null 2>&1; then PY=python3;
elif command -v python >/dev/null 2>&1; then PY=python;
else
  echo "[Ошибка] Python не найден. Установите Python 3 и повторите запуск."
  exit 1
fi

URL="http://localhost:8000/index.html"
echo "Запускаю локальный сервер: $URL"
echo "Чтобы остановить сервер, нажмите Ctrl+C."

if command -v open >/dev/null 2>&1; then (sleep 1 && open "$URL") &
elif command -v xdg-open >/dev/null 2>&1; then (sleep 1 && xdg-open "$URL") &
fi

exec "$PY" -m http.server 8000

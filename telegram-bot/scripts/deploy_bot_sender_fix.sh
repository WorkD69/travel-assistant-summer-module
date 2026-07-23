#!/usr/bin/env bash
set -Eeuo pipefail

service="travel-assistant-bot.service"
target="/opt/travel-assistant-bot/app/bot.py"
candidate="/opt/travel-assistant-bot/app/bot.py.new"
backup="/opt/travel-assistant-bot/app/bot.py.before-chat-not-found-fix"

rollback() {
  local exit_code=$?
  trap - ERR
  set +e
  install -m 644 "$backup" "$target"
  systemctl restart "$service"
  systemctl is-active --quiet "$service"
  printf '{"ok":false,"file_rollback":true}\n'
  exit "$exit_code"
}

test -f "$candidate"
test -f "$target"
test ! -e "$backup"
/opt/travel-assistant-bot/.venv/bin/python -m py_compile "$candidate"
install -m 644 "$target" "$backup"
trap rollback ERR
install -m 644 "$candidate" "$target"
rm -f "$candidate"
systemctl restart "$service"
for _ in {1..15}; do
  if systemctl is-active --quiet "$service"; then
    break
  fi
  sleep 1
done
systemctl is-active --quiet "$service"
main_pid="$(systemctl show "$service" -p MainPID --value)"
polling_count="$(ps -C python -o args= | grep -F "/opt/travel-assistant-bot/.venv/bin/python -m app.bot" | wc -l)"
[[ "$main_pid" != "0" ]]
[[ "$polling_count" == "1" ]]
trap - ERR
printf '{"ok":true,"main_pid":%s,"polling_count":%s}\n' "$main_pid" "$polling_count"

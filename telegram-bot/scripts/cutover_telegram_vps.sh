#!/usr/bin/env bash
set -Eeuo pipefail

service="travel-assistant-bot.service"
active="/opt/travel-assistant-bot"
staging="/opt/travel-assistant-bot-version-b-staging-oKuc4D"
previous="/opt/travel-assistant-bot.previous-20260722-141633"
backup="/root/travel-assistant-backups/20260722-141633-before-version-b"
environment_file="/etc/travel-assistant-bot.env"
swapped=0

preflight() {
  test -d "$active"
  test -d "$staging"
  test ! -e "$previous"
  test -x "$staging/.venv/bin/python"
  test -f "$staging/app/bot.py"
  test -f "$staging/.env.cutover"
  test -f "$backup/travel-assistant-bot.env"
  test -f "$backup/travel-assistant-bot.service"
  systemctl is-active --quiet "$service"
}

rollback() {
  local exit_code=$?
  trap - ERR
  set +e
  systemctl stop "$service"
  if [[ "$swapped" == "1" ]]; then
    if [[ -d "$active" ]]; then
      mv "$active" "${active}.failed-$(date +%Y%m%d-%H%M%S)"
    fi
    if [[ -d "$previous" ]]; then
      mv "$previous" "$active"
    fi
  fi
  install -m 600 "$backup/travel-assistant-bot.env" "$environment_file"
  install -m 644 "$backup/travel-assistant-bot.service" "/etc/systemd/system/$service"
  systemctl daemon-reload
  systemctl start "$service"
  systemctl is-active --quiet "$service"
  printf '{"ok":false,"rollback":true}\n'
  exit "$exit_code"
}

if [[ "${1:-}" == "--preflight" ]]; then
  preflight
  printf '{"ok":true,"preflight":true}\n'
  exit 0
fi

preflight
trap rollback ERR

systemctl stop "$service"
[[ "$(systemctl show "$service" -p MainPID --value)" == "0" ]]

install -m 600 "$staging/.env.cutover" "$environment_file"
rm -f "$staging/.env.cutover"
mv "$active" "$previous"
swapped=1
mv "$staging" "$active"

systemctl daemon-reload
systemctl start "$service"
for _ in {1..15}; do
  if systemctl is-active --quiet "$service"; then
    break
  fi
  sleep 1
done
systemctl is-active --quiet "$service"

main_pid="$(systemctl show "$service" -p MainPID --value)"
[[ "$main_pid" != "0" ]]
polling_count="$(ps -C python -o args= | grep -F "/opt/travel-assistant-bot/.venv/bin/python -m app.bot" | wc -l)"
[[ "$polling_count" == "1" ]]
nrestarts="$(systemctl show "$service" -p NRestarts --value)"

trap - ERR
printf '{"ok":true,"service":"%s","main_pid":%s,"polling_count":%s,"nrestarts":%s}\n' \
  "$service" "$main_pid" "$polling_count" "$nrestarts"

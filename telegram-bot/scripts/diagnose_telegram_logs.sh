#!/usr/bin/env bash
set -Eeuo pipefail

service="travel-assistant-bot.service"
start="$(systemctl show "$service" -p ActiveEnterTimestamp --value)"
printf 'START=%s\n' "$start"
journalctl -u "$service" --since "$start" --no-pager \
  | tail -200 \
  | sed -E 's/((token|key|secret)[=:])[A-Za-z0-9._-]+/\1REDACTED/Ig'

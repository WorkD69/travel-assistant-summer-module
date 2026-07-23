#!/usr/bin/env bash
set -Eeuo pipefail

service="travel-assistant-bot.service"
sleep 25
systemctl is-active --quiet "$service"

main_pid="$(systemctl show "$service" -p MainPID --value)"
nrestarts="$(systemctl show "$service" -p NRestarts --value)"
polling_count="$(ps -C python -o args= | grep -F "/opt/travel-assistant-bot/.venv/bin/python -m app.bot" | wc -l)"
active_since="$(systemctl show "$service" -p ActiveEnterTimestamp --value)"
logs="$(journalctl -u "$service" --since "$active_since" --no-pager || true)"

count_pattern() {
  local pattern="$1"
  local count
  count="$(grep -Eic "$pattern" <<<"$logs" || true)"
  printf '%s' "$count"
}

printf '{"active":true,"main_pid":%s,"polling_count":%s,"nrestarts":%s,' \
  "$main_pid" "$polling_count" "$nrestarts"
printf '"conflict_409":%s,' "$(count_pattern '409[[:space:]]+Conflict')"
printf '"tracebacks":%s,' "$(count_pattern 'Traceback')"
printf '"service_token_errors":%s,' "$(count_pattern 'service token|TRAVEL_API_SERVICE_TOKEN|access_denied')"
printf '"link_token_errors":%s,' "$(count_pattern 'link_token_(invalid|expired|used)|link token.*error')"
printf '"document_download_errors":%s}\n' "$(count_pattern 'ERROR.*download|download.*ERROR')"

PYTHONPATH=/opt/travel-assistant-bot /opt/travel-assistant-bot/.venv/bin/python - <<'PY'
import json
import urllib.request
from pathlib import Path

values = {}
for line in Path("/etc/travel-assistant-bot.env").read_text(encoding="utf-8").splitlines():
    if line and not line.lstrip().startswith("#") and "=" in line:
        key, value = line.split("=", 1)
        values[key.strip()] = value

token = values.get("TELEGRAM_BOT_TOKEN", "")
request = urllib.request.Request(f"https://api.telegram.org/bot{token}/getMe")
with urllib.request.urlopen(request, timeout=15) as response:
    payload = json.load(response)
result = payload.get("result") or {}
print(json.dumps({
    "telegram_get_me": payload.get("ok") is True,
    "username_ok": result.get("username") == "travel_assistent10_bot",
}))
PY

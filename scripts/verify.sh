#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export DATABASE_URL="${DATABASE_URL:-file:./test.db}"

echo "==> Prisma generate"
(cd "$repo_root/backend" && npx prisma generate)

echo "==> Prisma validate"
(cd "$repo_root/backend" && npx prisma validate)

echo "==> Backend tests"
(cd "$repo_root/backend" && npm test)

echo "==> Frontend tests"
(cd "$repo_root/frontend" && node --test 'tests/*.test.cjs')

echo "==> Telegram tests"
(cd "$repo_root/telegram-bot" && python -m pytest -q)

echo "All local verification suites passed."

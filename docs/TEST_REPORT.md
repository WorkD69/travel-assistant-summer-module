# Test report — Version B2 canonical

Дата: 2026-07-24.

Проверки выполнялись в отдельном worktree
`C:\Projects\travel-assistant-b2-canonical`. Команды deployment, remote
migration и Telegram polling не запускались.

## Результаты

| Проверка | Результат |
| --- | --- |
| `npm ci` (backend) | PASS, 133 packages |
| `npx prisma generate` | PASS, Prisma Client 5.22.0 |
| `npx prisma validate` с `DATABASE_URL=file:./test.db` | PASS |
| `npm test` (backend) | PASS, 17/17 |
| `node --test "tests/*.test.cjs"` (frontend) | PASS, 19/19 |
| `python -m pytest -q` (Telegram) | PASS, 151/151 |
| forbidden-file scan | PASS, 0 files |
| Gitleaks working tree после staging | PASS, 0 unallowlisted findings |
| Gitleaks Git history | PASS, 44 commits, 0 unallowlisted findings |

Backend suite включает B2 schema, production CORS, Railway exclusions, weather,
HTTP browser/bot contract, Mock GDS, OCR, Plan B validation, Express loading и
TripChange diff. Telegram suite использует mock/HTTP consumers и не запускает
реальный polling.

## Dependency observation

Первый `npm ci` audit сообщил 3 известных dependency findings: 2 high и
1 critical. В выводе также отмечены deprecated transitive packages, включая
Multer 1.x. Автоматический `npm audit fix --force` не применялся: он может
изменить runtime и нарушить соответствие развернутому B2. Требуется отдельное
обновление зависимостей с regression/security review. Повторный online audit
оказался недоступен из-за TLS/network error registry, поэтому исходный результат
не считается устранённым.

## Перед публикацией

После этого отчёта повторяется staged tree secret scan и remote fast-forward
check. Итоговый commit hash фиксируется в release/tag и обоих remotes.

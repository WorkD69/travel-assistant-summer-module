#!/usr/bin/env bash

set -euo pipefail



repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

harness="$repo_root/scripts/hackathon-verify.sh"

powershell_harness="$repo_root/scripts/hackathon-verify.ps1"

fixture_root="$(mktemp -d)"

trap 'rm -rf "$fixture_root"' EXIT



fail() {

  printf 'FAIL: %s\n' "$1" >&2
  
  exit 1
  
}



create_fixture() {

  local outcome="$1"
  
  mkdir -p "$fixture_root/frontend/tests" "$fixture_root/backend/test"
  
  cat > "$fixture_root/frontend/tests/no-demo-trip-fallback.test.cjs" <<'EOF'
  
const test = require('node:test');

test('canonical Trip/demo isolation fixture', () => {});

EOF

  cat > "$fixture_root/frontend/tests/tutu-native-shell.test.cjs" <<'EOF'
  
const test = require('node:test');

test('Tutu Home/Search fixture', () => {});

EOF

  cat > "$fixture_root/backend/test/trip-access.test.js" <<'EOF'
  
const test = require('node:test');

test('access/IDOR fixture', () => {});

EOF

  cat > "$fixture_root/backend/package.json" <<'EOF'
  
{"scripts":{"test":"node --test \"test/*.test.js\""}}

EOF

  if [ "$outcome" = "fail-frontend" ]; then
  
    cat > "$fixture_root/frontend/tests/failing.test.cjs" <<'EOF'
    
const test = require('node:test');

test('forced frontend failure', () => { throw new Error('expected failure'); });

EOF

  fi
  
  cd "$fixture_root"
  
  git init -q
  
  git config user.email test@example.invalid
  
  git config user.name test
  
  git add .
  
  git commit -qm fixture
  
}



[ -f "$harness" ] || fail "missing scripts/hackathon-verify.sh"

[ -f "$powershell_harness" ] || fail "missing scripts/hackathon-verify.ps1"



grep -q "frontend suite" "$harness" || fail "shell harness must report frontend suite"

grep -q "backend suite" "$harness" || fail "shell harness must report backend suite"

grep -q "conflict marker scan" "$harness" || fail "shell harness must scan conflict markers"

grep -q "git diff --check" "$harness" || fail "shell harness must run git diff --check"

grep -q "SKIP" "$harness" || fail "shell harness must support optional SKIP"

grep -q "frontend suite" "$powershell_harness" || fail "PowerShell harness must report frontend suite"

grep -q "backend suite" "$powershell_harness" || fail "PowerShell harness must report backend suite"



create_fixture pass

pass_output="$(bash "$harness" --repo-root "$fixture_root" --skip-optional)" || fail "passing fixture must exit zero"

printf '%s\n' "$pass_output" | grep -q 'PASS frontend suite' || fail "passing fixture must report frontend PASS"

printf '%s\n' "$pass_output" | grep -q 'PASS backend suite' || fail "passing fixture must report backend PASS"

printf '%s\n' "$pass_output" | grep -q 'PASS canonical Trip/demo-isolation regressions' || fail "passing fixture must report canonical Trip/demo-isolation PASS"

printf '%s\n' "$pass_output" | grep -q 'PASS access/security regression checks' || fail "passing fixture must report security PASS"

printf '%s\n' "$pass_output" | grep -q 'PASS git diff --check' || fail "passing fixture must report diff-check PASS"

printf '%s\n' "$pass_output" | grep -q 'PASS conflict marker scan' || fail "passing fixture must report marker-scan PASS"

printf '%s\n' "$pass_output" | grep -q 'SKIP optional visual sanity' || fail "passing fixture must report optional visual SKIP"



rm -rf "$fixture_root"

fixture_root="$(mktemp -d)"

create_fixture fail-frontend

if fail_output="$(bash "$harness" --repo-root "$fixture_root" --skip-optional 2>&1)"; then

  fail "failing frontend fixture must exit non-zero"
  
fi

printf '%s\n' "$fail_output" | grep -q 'FAIL frontend suite' || fail "failing fixture must report frontend FAIL"



rm -rf "$fixture_root"

fixture_root="$(mktemp -d)"

create_fixture pass

mkdir -p "$fixture_root/backend/node_modules/.bin"

cat > "$fixture_root/backend/node_modules/.bin/prisma" <<'EOF'

#!/usr/bin/env bash

if [ -z "${DATABASE_URL:-}" ]; then

  printf 'DATABASE_URL missing\n' >&2
  
  exit 41
  
fi

if [ "$1" = "validate" ]; then

  printf 'forced Prisma validation failure\n' >&2
  
  exit 42
  
fi

exit 0

EOF

chmod +x "$fixture_root/backend/node_modules/.bin/prisma"

if prisma_output="$(bash "$harness" --repo-root "$fixture_root" --skip-optional 2>&1)"; then

  fail "Prisma validation failure must make the harness exit non-zero"
  
fi

printf '%s\n' "$prisma_output" | grep -q 'FAIL backend suite' || fail "Prisma validation failure must report backend FAIL"



printf 'PASS: hackathon verify harness contract\n'

























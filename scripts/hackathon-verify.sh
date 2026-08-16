#!/usr/bin/env bash

set -uo pipefail



repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export DATABASE_URL="${DATABASE_URL:-file:./test.db}"

skip_optional=false

failed=0



usage() {

  cat <<'EOF'
  
Usage: scripts/hackathon-verify.sh [--repo-root PATH] [--skip-optional]



Runs mandatory integration verification and prints PASS, FAIL, or SKIP for each check.

EOF

}



while [ "$#" -gt 0 ]; do

  case "$1" in
  
    --repo-root)
    
      [ "$#" -ge 2 ] || { usage >&2; exit 2; }
      
      repo_root="$2"
      
      shift 2
      
      ;;
      
    --skip-optional)
    
      skip_optional=true
      
      shift
      
      ;;
      
    --help|-h)
    
      usage
      
      exit 0
      
      ;;
      
    *)
    
      usage >&2
      
      exit 2
      
      ;;
      
  esac
  
done



repo_root="$(cd "$repo_root" && pwd)"



run_required() {

  local label="$1"
  
  shift
  
  if "$@"; then
  
    printf 'PASS %s\n' "$label"
    
  else
  
    printf 'FAIL %s\n' "$label" >&2
    
    failed=1
    
  fi
  
}



run_frontend_suite() {

  (cd "$repo_root/frontend" && node --test 'tests/*.test.cjs')
  
}



run_backend_suite() {

  (
  
    cd "$repo_root/backend"
    
    if [ -x node_modules/.bin/prisma ]; then
    
      npx prisma generate || return 1
      
      npx prisma validate || return 1
      
    fi
    
    npm test
    
  )
  
}



run_canonical_trip_regressions() {

  (cd "$repo_root/frontend" && node --test tests/no-demo-trip-fallback.test.cjs)
  
}



run_access_security_regressions() {

  (cd "$repo_root/backend" && node --test test/trip-access.test.js)
  
}



run_diff_check() {

  (cd "$repo_root" && git diff --check)
  
}



run_conflict_marker_scan() {

  local status
  
  set +e
  
  git -C "$repo_root" grep -nE '^(<<<<<<<|=======|>>>>>>>)' -- .
  
  status=$?
  
  set -e
  
  [ "$status" -eq 1 ]
  
}



run_javascript_syntax_checks() {

  local status=0
  
  while IFS= read -r -d '' file; do
  
    node --check "$file" >/dev/null 2>&1 || status=1
    
  done < <(find "$repo_root" -type f \( -name '*.js' -o -name '*.cjs' \) -not -path '*/node_modules/*' -print0)
  
  return "$status"
  
}



run_required 'frontend suite' run_frontend_suite

run_required 'backend suite' run_backend_suite

run_required 'canonical Trip/demo-isolation regressions' run_canonical_trip_regressions

run_required 'access/security regression checks' run_access_security_regressions

run_required 'JavaScript syntax checks' run_javascript_syntax_checks

run_required 'git diff --check' run_diff_check

run_required 'conflict marker scan' run_conflict_marker_scan



if [ "$skip_optional" = true ]; then

  printf 'SKIP optional visual sanity (explicitly skipped)\n'
  
elif [ -n "${HACKATHON_VISUAL_CHECK:-}" ]; then

  if (cd "$repo_root" && bash -lc "$HACKATHON_VISUAL_CHECK"); then
  
    printf 'PASS optional visual sanity\n'
    
  else
  
    printf 'FAIL optional visual sanity\n' >&2
    
    failed=1
    
  fi
  
else

  printf 'SKIP optional visual sanity (HACKATHON_VISUAL_CHECK is not configured)\n'
  
fi



if [ "$failed" -ne 0 ]; then

  exit 1
  
fi



printf 'PASS hackathon verification\n'






























































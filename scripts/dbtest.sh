#!/usr/bin/env bash
# Runs every migration on a fresh local Postgres, then each security test on its own fresh database.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres bash scripts/dbtest.sh   (CI provides a Postgres service)
set -euo pipefail
cd "$(dirname "$0")/.."
DB=tomo_test
all=$(mktemp); cat supabase/tests/stub_supabase.sql supabase/migrations/*.sql > "$all"
fail=0; total=0
for t in supabase/tests/security_test*.sql; do
  dropdb --if-exists "$DB" >/dev/null 2>&1 || true; createdb "$DB"
  if ! psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$all" >/dev/null 2>"$all.err"; then
    echo "migrations failed:"; grep -iE "error" "$all.err" | head -5; exit 1
  fi
  if out=$(psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$t" 2>&1); then
    n=$(grep -c 'NOTICE:  ok' <<<"$out" || true); total=$((total + n)); echo "pass $t ($n checks)"
  else
    echo "FAIL $t"; grep -iE "error|failed" <<<"$out" | head -5; fail=1
  fi
done
dropdb --if-exists "$DB" >/dev/null 2>&1 || true
echo "checks=$total"; exit $fail

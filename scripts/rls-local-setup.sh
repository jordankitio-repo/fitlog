#!/usr/bin/env bash
# Boot a minimal local Supabase stack and load the prod schema into it, so the
# RLS harness has a faithful, throwaway target. Safe to re-run.
#
# Requires: a running container engine (Colima/Docker) + supabase CLI.
set -euo pipefail
cd "$(dirname "$0")/.."

# vector/analytics can't mount the docker socket under Colima; the rest aren't
# needed for RLS testing. Keep db, auth, rest, kong.
EXCLUDES="vector,analytics,edge-runtime,functions,imgproxy,inbucket,realtime,storage,studio,meta"

if ! docker info >/dev/null 2>&1; then
  echo "Container engine not running. Start it first (e.g. 'colima start')." >&2
  exit 1
fi

echo "Starting local Supabase (excluding: $EXCLUDES)..."
supabase start -x "$EXCLUDES" >/dev/null

DBC="$(docker ps --format '{{.Names}}' | grep -m1 '^supabase_db_' || true)"
if [ -z "$DBC" ]; then echo "Could not find the supabase db container." >&2; exit 1; fi

echo "Loading prod schema baseline into $DBC ..."
docker exec -i "$DBC" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/schema/prod_public.sql >/dev/null

# Apply migrations created AFTER the baseline dump (the dump already contains
# everything up to BASELINE_CUTOFF). This keeps the local test DB at the
# intended post-migration state and auto-includes any future migrations.
BASELINE_CUTOFF="20260614140000"
for f in supabase/migrations/*.sql; do
  ts="$(basename "$f" | cut -d_ -f1)"
  if [ "$ts" \> "$BASELINE_CUTOFF" ]; then
    echo "Applying post-baseline migration $(basename "$f") ..."
    docker exec -i "$DBC" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f" >/dev/null
  fi
done

echo "RLS test DB ready. Run:  npm run test:rls"

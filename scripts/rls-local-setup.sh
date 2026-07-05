#!/usr/bin/env bash
# Boot a minimal local Supabase stack and load the prod schema into it, so the
# RLS harness has a faithful, throwaway target. Idempotent: every run resets to
# the same known-good state, so it works from a clean machine and re-runs safely.
#
# Requires: a running container engine (Colima/Docker) + supabase CLI.
#
# Why the migrations dance below: on a *fresh* volume `supabase start` auto-applies
# every file in supabase/migrations/ — including ones that predate the baseline
# dump and reference tables the dump (not those migrations) creates, e.g.
# add_paused_for_coaching -> subscriptions. That start fails. So we bring the DB
# up with the migrations dir hidden (empty schema), load the baseline, then apply
# only the migrations created *after* the baseline cutoff.
set -euo pipefail
cd "$(dirname "$0")/.."

# vector/analytics can't mount the docker socket under Colima; the rest aren't
# needed for RLS testing. Keep db, auth, rest, kong.
EXCLUDES="vector,analytics,edge-runtime,functions,imgproxy,inbucket,realtime,storage,studio,meta"
BASELINE_CUTOFF="20260614140000"   # baseline dump == prod public schema as of this migration
MIG_DIR="supabase/migrations"
MIG_HIDE="supabase/.migrations.hidden"

if ! docker info >/dev/null 2>&1; then
  echo "Container engine not running. Start it first (e.g. 'colima start')." >&2
  exit 1
fi

# Restore the migrations dir if it's currently hidden and the real one is gone.
# Used both as a pre-flight heal (recover from an interrupted prior run) and as
# the EXIT trap, so a mid-run failure never leaves migrations/ moved aside.
restore_migrations() {
  if [ -d "$MIG_HIDE" ] && [ ! -d "$MIG_DIR" ]; then
    mv "$MIG_HIDE" "$MIG_DIR"
  fi
}
restore_migrations                 # heal any leftover from a crashed run
[ -d "$MIG_HIDE" ] && rm -rf "$MIG_HIDE"   # both dirs present => stale hidden copy; drop it
trap restore_migrations EXIT

# Start from a clean slate so a re-run doesn't stack a second baseline onto an
# existing schema (that errors with "multiple primary keys for table ...").
echo "Resetting any existing local stack..."
supabase stop --no-backup >/dev/null 2>&1 || true

echo "Starting local Supabase with an empty schema (excluding: $EXCLUDES)..."
mv "$MIG_DIR" "$MIG_HIDE"
supabase start -x "$EXCLUDES" >/dev/null
restore_migrations                 # DB is up; bring migrations back for the loop below

DBC="$(docker ps --format '{{.Names}}' | grep -m1 '^supabase_db_' || true)"
if [ -z "$DBC" ]; then echo "Could not find the supabase db container." >&2; exit 1; fi

echo "Loading prod schema baseline into $DBC ..."
docker exec -i "$DBC" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/schema/prod_public.sql >/dev/null

# Apply migrations created AFTER the baseline dump (the dump already contains
# everything up to BASELINE_CUTOFF). This keeps the local test DB at the
# intended post-migration state and auto-includes any future migrations.
for f in "$MIG_DIR"/*.sql; do
  ts="$(basename "$f" | cut -d_ -f1)"
  if [ "$ts" \> "$BASELINE_CUTOFF" ]; then
    echo "Applying post-baseline migration $(basename "$f") ..."
    docker exec -i "$DBC" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f" >/dev/null
  fi
done

echo "RLS test DB ready. Run:  npm run test:rls"

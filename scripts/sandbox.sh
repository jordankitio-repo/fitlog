#!/usr/bin/env bash
# The hosted sandbox — spin it up or take it down with ONE command.
#
#   ./scripts/sandbox.sh          # up  (default) — build CURRENT branch → deploy
#   ./scripts/sandbox.sh up       # same as above
#   ./scripts/sandbox.sh down     # take it offline (the URL 404s)
#
# UP rebuilds the sandbox from whatever is checked out right now — this branch's DB
# schema, a fresh seed, and this branch's frontend — and (re)deploys to the SAME url:
#
#   https://gardnr-demo.vercel.app     (log in with a seed account below)
#
# DOWN deletes the demo Vercel project so nothing serves that url. Nothing is lost:
# `up` recreates the project (reclaiming the same url) and redeploys. The isolated
# Supabase backend is left untouched either way.
#
# It is isolated: a throwaway Supabase project + its own Vercel project. Your prod
# DB and prod site are never touched. `up` needs Colima/Docker up and the Vercel CLI
# logged in; `down` only needs the Vercel CLI. Secrets + deploy target live in
# .env.demo.seed (gitignored).
set -euo pipefail
cd "$(dirname "$0")/.."

CMD="${1:-up}"

[ -f .env.demo.seed ] || { echo "✗ .env.demo.seed missing (sandbox backend keys)." >&2; exit 1; }
set -a; . ./.env.demo.seed; set +a

DEMO_PROJECT="gardnr-demo"
DEMO_URL="https://gardnr-demo.vercel.app"

require_vercel() {
  if ! npx vercel whoami >/dev/null 2>&1; then
    echo "✗ Vercel CLI isn't logged in. Run:  npx vercel login" >&2; exit 1
  fi
}

# Echo the id of the demo project, or nothing if it doesn't exist.
# NB: the Vercel CLI prints `project inspect` output on stderr, so merge it in (2>&1).
project_id() {
  VERCEL_ORG_ID="$VERCEL_ORG_ID" npx vercel project inspect "$DEMO_PROJECT" 2>&1 \
    | awk '/^[[:space:]]*ID[[:space:]]/{print $2; exit}'
}

# ─────────────────────────────────────────────────────────────── down ──
if [[ "$CMD" == down || "$CMD" == end || "$CMD" == stop || "$CMD" == terminate ]]; then
  require_vercel
  if [ -z "$(project_id)" ]; then
    echo "✓ Sandbox already down — nothing serves $DEMO_URL."
    exit 0
  fi
  echo "→ Taking the sandbox down…"
  VERCEL_ORG_ID="$VERCEL_ORG_ID" npx vercel remove "$DEMO_PROJECT" --yes >/dev/null 2>&1
  echo
  echo "✓ Sandbox down. $DEMO_URL now 404s — nobody can reach it."
  echo "  Bring it back anytime:  ./scripts/sandbox.sh"
  exit 0
fi

if [[ "$CMD" == -h || "$CMD" == --help || "$CMD" == help ]]; then
  echo "Usage: ./scripts/sandbox.sh [up|down]"
  echo "  up   (default)  build the current branch and deploy to $DEMO_URL"
  echo "  down            take the sandbox offline (the url 404s)"
  exit 0
fi

if [[ "$CMD" != up ]]; then
  echo "✗ Unknown command '$CMD'. Usage: ./scripts/sandbox.sh [up|down]" >&2; exit 1
fi

# ───────────────────────────────────────────────────────────────── up ──
# Preflight — fail early with a fix, not a cryptic error mid-run.
if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker isn't running. Start it first:  colima start" >&2; exit 1
fi
require_vercel

BRANCH=$(git branch --show-current 2>/dev/null || echo detached)
PSQL() { docker run --rm -i postgres:15 psql "$DEMO_DBURL" -v ON_ERROR_STOP=1 -q; }

# Make sure the demo Vercel project exists (a prior `down` deletes it), and resolve
# its id fresh so a stale VERCEL_PROJECT_ID can never point at a deleted project.
PID="$(project_id)"
if [ -z "$PID" ]; then
  echo "→ [0/4] Recreating the demo Vercel project…"
  VERCEL_ORG_ID="$VERCEL_ORG_ID" npx vercel project add "$DEMO_PROJECT" >/dev/null 2>&1
  PID="$(project_id)"
fi
[ -n "$PID" ] || { echo "✗ Couldn't create or find the '$DEMO_PROJECT' Vercel project." >&2; exit 1; }
if [ "$PID" != "${VERCEL_PROJECT_ID:-}" ]; then
  # Keep .env.demo.seed truthful for anything else that reads it.
  sed -i '' -E "s#^VERCEL_PROJECT_ID=.*#VERCEL_PROJECT_ID=$PID#" .env.demo.seed
fi
VERCEL_PROJECT_ID="$PID"

echo "→ [1/4] Reset sandbox DB to '$BRANCH' schema…"
# Clean slate, then rebuild the schema from THIS checkout: prod baseline dump +
# every post-baseline migration. Guarantees the sandbox matches the branch.
PSQL <<'SQL'
drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
SQL
PSQL < supabase/schema/prod_public.sql
for f in supabase/migrations/*.sql; do
  ts=$(basename "$f" | cut -d_ -f1)
  [[ "$ts" > "20260614140000" ]] && PSQL < "$f"
done

echo "→ [2/4] Seed sandbox (coach + GREEN/AMBER/RED clients, 8wk data)…"
SUPA_URL="$SUPA_URL" SERVICE_KEY="$SERVICE_KEY" ALLOW_REMOTE_HOST="$ALLOW_REMOTE_HOST" \
  node scripts/sandbox-seed.mjs
PSQL < scripts/sandbox-fill.sql >/dev/null

echo "→ [3/4] Build '$BRANCH' frontend…"
rm -rf dist && npx vite build --mode demo >/dev/null 2>&1

echo "→ [4/4] Deploy to the demo Vercel project…"
STAGE=$(mktemp -d)
cp -R dist/. "$STAGE"/
cat > "$STAGE/vercel.json" <<'JSON'
{ "rewrites": [{ "source": "/((?!.*\\.).*)", "destination": "/index.html" }] }
JSON
VERCEL_ORG_ID="$VERCEL_ORG_ID" VERCEL_PROJECT_ID="$VERCEL_PROJECT_ID" \
  npx vercel deploy --prod --yes --cwd "$STAGE" >/dev/null 2>&1
rm -rf "$STAGE"

echo
echo "✓ Sandbox live for branch '$BRANCH'  →  $DEMO_URL"
echo "  Coach:  alex@gardnr.demo  / Demo!Passw0rd123   (open Marcus Webb)"
echo "  Client: maya@gardnr.demo  / Demo!Passw0rd123"
echo
echo "  Take it down when you're done:  ./scripts/sandbox.sh down"

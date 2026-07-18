#!/usr/bin/env bash
# ONE command → a fully self-contained hosted sandbox of the CURRENT branch.
#
#   ./scripts/sandbox.sh
#
# Run it from `main` to record the walkthrough, or from a feature branch to give
# someone a feel of that feature. Each run rebuilds the sandbox from whatever is
# checked out right now — this branch's DB schema, a fresh seed, and this branch's
# frontend — and redeploys to the SAME url:
#
#   https://gardnr-demo.vercel.app     (log in with a seed account below)
#
# It is isolated: a throwaway Supabase project + its own Vercel project. Your prod
# DB and prod site are never touched. Needs Colima/Docker up and the Vercel CLI
# logged in. Secrets + deploy target live in .env.demo.seed (gitignored).
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env.demo.seed ] || { echo "✗ .env.demo.seed missing (sandbox backend keys)." >&2; exit 1; }
set -a; . ./.env.demo.seed; set +a

# Preflight — fail early with a fix, not a cryptic error mid-run.
if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker isn't running. Start it first:  colima start" >&2; exit 1
fi
if ! npx vercel whoami >/dev/null 2>&1; then
  echo "✗ Vercel CLI isn't logged in. Run:  npx vercel login" >&2; exit 1
fi

BRANCH=$(git branch --show-current 2>/dev/null || echo detached)
PSQL() { docker run --rm -i postgres:15 psql "$DEMO_DBURL" -v ON_ERROR_STOP=1 -q; }

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
echo "✓ Sandbox live for branch '$BRANCH'  →  https://gardnr-demo.vercel.app"
echo "  Coach:  alex@gardnr.demo  / Demo!Passw0rd123   (open Marcus Webb)"
echo "  Client: maya@gardnr.demo  / Demo!Passw0rd123"

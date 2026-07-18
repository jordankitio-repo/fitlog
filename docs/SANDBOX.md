# Sandbox — spin up a shareable demo on demand

A fully self-contained, hosted copy of the app you can spin up from **any branch**
and hand to coaches/prospects. One command. Same URL every time.

- **Live URL:** https://gardnr-demo.vercel.app
- **Isolated from prod:** its own Supabase project + its own Vercel project. Nothing
  it does can touch your live app (`gardnr.fit`) or its database.

---

## TL;DR

```bash
cd ~/fitlog
git checkout main            # or a feature branch — whatever you want to show
./scripts/sandbox.sh         # ~40s, then prints the URL + logins
```

Hand the prospect the URL + one login below. Run the command again anytime to
reset the sandbox to fresh data.

---

## Step by step

### 1. Make sure the two prerequisites are up
The script checks these and stops with the exact fix if either is missing, but on
a fresh day you'll usually just need to start Docker:

```bash
colima start                 # starts Docker (only if it isn't already running)
npx vercel whoami            # should print your username; if not: npx vercel login
```

### 2. Pick the branch you want to demo
```bash
git checkout main            # most up-to-date — use this to record the walkthrough
# ...or a feature branch to give someone a feel of that feature
```

### 3. Spin it up
```bash
./scripts/sandbox.sh
```
This rebuilds the sandbox **from whatever is checked out**: resets the sandbox DB to
this branch's schema, re-seeds it, builds this branch's frontend, and redeploys to
the same URL. When it finishes it prints:

```
✓ Sandbox live for branch 'main'  →  https://gardnr-demo.vercel.app
  Coach:  alex@gardnr.demo  / Demo!Passw0rd123   (open Marcus Webb)
  Client: maya@gardnr.demo  / Demo!Passw0rd123
```

### 4. Share it
Send the prospect:
- **Link:** https://gardnr-demo.vercel.app
- **A login** (below). No password gate — logging in *is* the access control; nobody
  sees any data without an account.

Works on any phone/computer, anywhere (not just your Wi-Fi). It's a PWA, so on a
phone they can "Add to Home Screen" and it feels native.

### 5. Reset between prospects (optional)
Just run `./scripts/sandbox.sh` again — it wipes their edits and re-seeds fresh.
(Or don't bother; it doesn't matter.)

---

## Logins (sandbox accounts)

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| Coach | `alex@gardnr.demo` | `Demo!Passw0rd123` | The main view. Open **Marcus Webb** for the fullest client record. |
| Client | `maya@gardnr.demo` | `Demo!Passw0rd123` | The client-side logging experience. |

The roster always shows one client at each triage level: **Sam Rivera** (red / at
risk), **Marcus Webb** (amber / needs review), **Maya Chen** (green / on track).

---

## Recording the walkthrough

Do it on the sandbox from `main` (most up-to-date). Spin it up, open
https://gardnr-demo.vercel.app, log in as the coach, and record. Same app, fully
populated, nothing looks empty.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `✗ Docker isn't running` | `colima start`, then re-run. |
| `✗ Vercel CLI isn't logged in` | `npx vercel login`, then re-run. |
| Command not found / wrong dir | `cd ~/fitlog` first. |
| Want to see it worked | Open the URL and log in as the coach — the roster should show Sam/Marcus/Maya. |

---

## Good to know

- **One sandbox at a time.** It reuses a single backend + URL, so spinning it from a
  new branch **replaces** what was there. Fine for "demo the branch I'm on"; you
  can't have two branches live at once without another Supabase/Vercel project.
- **Isolation.** The sandbox is Supabase project `gardnr-demo`
  (`zcleierckgbemsgzjqwg`); prod is `fitlog` (`mlqaurxefttbqsrllbyj`). The sandbox
  config names only the sandbox host, and the seed refuses to run against any host
  you don't explicitly name — so prod can't be hit.
- **The files** (all gitignored secrets or untracked helpers — nothing committed):
  - `scripts/sandbox.sh` — the command
  - `scripts/sandbox-seed.mjs` — creates the seed accounts
  - `scripts/sandbox-fill.sql` — fills the data + fixes the dates
  - `.env.demo` / `.env.demo.seed` — sandbox keys + deploy target (secrets)

## Setting it up on another machine

`git pull` brings the **scripts**, but the sandbox keys live in two **gitignored**
files that never leave your machine (`.env.demo`, `.env.demo.seed`). So on a new
Mac you must also bring those over — otherwise `sandbox.sh` stops at
`✗ .env.demo.seed missing`. One-time setup:

1. Clone/pull the repo, then `npm install`.
2. Install + start Docker:  `brew install colima docker && colima start`
3. Log into Vercel:  `npx vercel login`
4. Copy **`.env.demo`** and **`.env.demo.seed`** from your other Mac into `~/fitlog/`
   — securely (AirDrop, 1Password, a secure note). **Never** email/Slack/commit them.
5. `./scripts/sandbox.sh`

**If you ever lose `.env.demo.seed`:** most of it is recoverable — the Supabase keys
via `supabase projects api-keys --project-ref zcleierckgbemsgzjqwg`, and the Vercel
IDs from the Vercel dashboard. The one exception is the database password inside
`DEMO_DBURL`: reset it in Supabase → Project Settings → Database → Reset password,
then update that line.

## Later, if you want (not needed now)

- **Branded URL** (`demo.gardnr.fit` instead of `*.vercel.app`) — add one CNAME at
  Namecheap.
- **Real access protection** (beyond login) — Cloudflare Access (free) or Vercel
  deployment protection (Pro).

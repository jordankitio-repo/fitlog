# Working on Gardnr — the safe loop

**The one rule:** work on a branch against the **fake local DB**. Never touch `main`
or the real database until a feature is finished. Local runs entirely on your Mac
and *cannot* reach real users' data.

```
new branch  +  fake DB   →   build & test   →   merge to main   →   kill fake DB
```

Same loop every time. That's it.

---

## 1. Start (spin up the fake DB + app)

```bash
supabase start                    # boots the fake local DB (Docker must be running)
./scripts/seed-walkthrough.sh     # optional: fill it with demo coach + clients
npm run dev                       # start the app → http://localhost:5173
```

Also make a branch so you're off `main`:

```bash
git checkout -b feat/whatever-im-building
```

The app auto-points at the fake DB (`.env.local` is already set). No real data is
touched.

**Demo logins** (after seeding):
- Coach:  `alex@gardnr.demo` / `Demo!Passw0rd123`
- Client: `marcus@gardnr.demo` / `Demo!Passw0rd123`

---

## 2. Work

- Edit code → the browser reloads instantly.
- App:            http://localhost:5173
- See the DB:     http://127.0.0.1:54323  (local Studio — this is where your seed data lives)
- Re-seed anytime: `./scripts/seed-walkthrough.sh` (safe to re-run, no duplicates)

**Showing a coach in the same room, on their phone/laptop** (same WiFi):
```bash
npm run dev -- --host             # then give them  http://<your-mac-ip>:5173
```
Your Mac's IP is currently `192.168.1.71` (it can change on a different WiFi —
`--host` prints the live address when it starts).

---

## 3. Done — ship it

```bash
git add -A
git commit -m "feat: whatever I built"
git push -u origin feat/whatever-im-building
# open the PR, check the Vercel preview link, then merge to main
```

Merging to `main` auto-deploys the frontend to production (gardnr.fit).

Then kill the fake DB:

```bash
supabase stop
```

Next feature? Start over at step 1.

---

## ⚠️ The only gotcha: database changes

Merging to `main` ships your **code**, not **database changes**.

- Feature was just UI / logic (no new column or table)? → merge and you're done.
- Feature **added a column/table** (a new file in `supabase/migrations/`)? → after
  merging, run this **once** to apply it to the real DB:

  ```bash
  supabase db push
  ```

  Skip this and the feature works locally but breaks in production (the column
  won't exist for real users).

---

## Quick reference

| What | Command / URL |
|---|---|
| Start fake DB | `supabase start` |
| Seed demo data | `./scripts/seed-walkthrough.sh` |
| Run the app | `npm run dev` → http://localhost:5173 |
| Look at the DB | http://127.0.0.1:54323 |
| Kill fake DB | `supabase stop` |
| Wipe fake DB clean | `supabase db reset` |
| New feature branch | `git checkout -b feat/name` |
| Push schema to real DB | `supabase db push` *(only if schema changed)* |

**If something's off:** make sure Docker (Colima) is running before `supabase start`.
To reset everything, `supabase stop` then `supabase start` again.

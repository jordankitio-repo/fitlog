# Passwordless Client Auth & Session Policy — Design

> **Status:** Phases 1 + 2 implemented 2026-08-25 (not yet deployed — see §6).
> **Scope:** Client-side auth only. Coaches keep passwords (see §8, D-6).
> **Why now:** Client daily-use adoption is the gating risk on the coach product —
> a client who never logs is a coach who churns. The invite path is where they are lost.

---

## 1. What we're trying to accomplish

**G1 — Zero-friction invite accept.** Tap the emailed link → in the app. No password, no second email.
**G2 — No lockout.** A client who loses their session gets back in without a password.
**G3 — Close the real security gap.** Sensitive actions require re-auth; sessions have an absolute cap.
**G4 — Don't regress the coach.** Coach auth is unchanged by Phase 1.
**G5 — Defensible compliance posture.** A written call, not drift.

**Non-goals:** passkeys/WebAuthn (Supabase has no native support); TOTP MFA (later, coaches only);
in-app email change (doesn't exist today, stays out of scope); native mobile app.

---

## 2. Current architecture (as-is)

**Invite:** coach writes an `invitations` row → `notify-invite` emails `/join?token=<uuid>` →
`Join.jsx` calls `get_invitation_by_token` (SECURITY DEFINER, token-gated) → forces
`auth.signUp({ email, password })` → then **three sequential client-side writes**
(`profiles` upsert, `coach_clients` upsert, `invitations` status flip).

**Login:** password only (`signInWithPassword`). Recovery via `resetPasswordForEmail`.

**Session:** bare `createClient` in `src/supabase.js` → `persistSession` + `autoRefreshToken`
on localStorage. Access token 1h; refresh tokens rotate with reuse detection (GoTrue V2).
No absolute cap, no inactivity timeout.

**Sensitive actions:** none gated by re-auth.

### Defects this design fixes

| | Defect | Where |
|---|---|---|
| **D1** | `updateUser(attrs, { currentPassword })` — `currentPassword` is not a supabase-js option and is **silently ignored**. Reauth uses a `nonce`. The "Current password" field is decorative; any live session can change the password. | `Profile.jsx:338` |
| **D2** | Three sequential client-side writes on accept — a closed tab between them strands a client with a profile but no coach. | `Join.jsx:158-230` |
| **D3** | `account_exists` is snapshotted at invite time and goes stale; the code pivots on a signup error string to recover. | `Join.jsx:112-122` |
| **D4** | `invitations` has no expiry — only `created_at`. Tokens are valid forever. | `prod_public.sql:168` |
| **D5** | `service_role` has no SELECT grant on `invitations`. | noted in `notify-invite` |

D5 turned out to need no fix: every read and write goes through a `SECURITY
DEFINER` function, which executes as the table owner rather than as the caller,
so `redeem-invite` never touches the table directly and `service_role` still
gets no grant. Least privilege preserved by doing less, not more.

---

## 3. Target architecture (to-be)

The invite token is a 122-bit random UUID delivered to the client's inbox. **That is already
proof of email possession** — the same proof an OTP would establish. So we stop discarding it
and let it buy a session directly, exactly once, for a brand-new account only.

```
                 ┌─ no account ──► redeem-invite (edge) ──► session. Done. One tap.
  /join?token=X ─┤
                 └─ account exists ─► OTP code ─► accept_invitation() RPC ─► linked.
```

The asymmetry is the entire security model. A forwarded link can **create** an account
(bounded, recoverable). It can never **enter** one (that would be takeover).

---

## 4. Component designs

### 4.1 `accept_invitation()` — the atomic core  *(fixes D2, D4, D5)*

One `SECURITY DEFINER` RPC does every database mutation of an accept, in one transaction:

1. **Claim the token under a row lock** — `SELECT * FROM invitations WHERE token::text = p_token
   FOR UPDATE`, then validate status / `redeemed_at` / `expires_at` and mark it accepted.
   `FOR UPDATE` is what serializes concurrent redeems: the loser blocks, and once the winner
   commits it re-reads the row, sees `redeemed_at` set, and raises `invite_already_used`.
   (Implemented as a lock + validate rather than a single conditional `UPDATE … RETURNING`
   so each failure mode raises its own symbol and the Join page can say something useful.)
2. Guard: caller's profile role ≠ `'coach'`; caller has no active `coach_clients` row.
3. Upsert `profiles` with `role = 'client'`.
4. Insert `coach_clients` (active).

**Why the lock, not read-then-write:** single-use is now the *primary* defense (we
deliberately declined IP rate limiting), so the claim must be atomic or two concurrent redeems
both win. This is the load-bearing line in the whole design, and it is **verified by
construction**: with `for update` removed, test 3 fails and both callers redeem the same
token. See §7.

**Two callers, one RPC:**
- **Mode A (new account)** — `redeem-invite` calls it with the freshly created `user_id`.
- **Mode B (existing account)** — the **browser** calls it directly via `supabase.rpc()` once
  authenticated. Email match enforced inside via `auth.jwt() ->> 'email'`. No edge function needed.

Mode B also replaces the existing-session "Accept invite" branch at `Join.jsx:232-250`.

### 4.2 `redeem-invite` edge function  *(new; `verify_jwt = false`)*

Only Mode A needs a server. Input `{ token, fullName }`:

1. Validate token shape (UUID regex, as `notify-invite` does).
2. Peek the invite via `get_invitation_by_token` — **no mutation yet**.
3. `auth_user_exists(client_email)` (SECURITY DEFINER, service-role grant only).
   → **exists**: return `{ requiresOtp: true }`. **Nothing is consumed.** The token survives
   for the OTP round-trip. This also makes `account_exists` advisory only, killing D3.
4. → **not exists**: `POST /auth/v1/admin/users` with `{ email, email_confirm: true,
   user_metadata: { full_name } }`. **No password is set.**
5. `accept_invitation(token, newUserId, fullName)` — atomic per §4.1.
6. `POST /auth/v1/admin/generate_link` `{ type: 'magiclink' }` → return `hashed_token`.
   Client calls `verifyOtp({ token_hash, type: 'magiclink' })` → session. **No email is sent**;
   the admin endpoint returns the link rather than mailing it.

**Do not put `role: 'client'` in `user_metadata`.** `handle_new_user` whitelists role to
`('coach','solo')` on purpose — client is invite-only and self-serve metadata must never claim
it. The trigger stays untouched; §4.1 step 3 sets the role with the service role instead.

**Crash recovery:** if step 4 succeeds and step 5 fails, an unlinked auth user exists and the
token is unclaimed. A retry takes the `requiresOtp` branch and completes via Mode B. Self-healing.

### 4.3 `Join.jsx`

383 lines → ~150. Name field, one button. The password input, the `handleLoginToAccept`
branch, the signup-error pivot, and all three sequential writes are deleted.
The existing-account branch becomes: "We sent a 6-digit code to `<email>`."

### 4.4 OTP login  *(ships with Phase 1 — not optional)*

`signInWithOtp({ email, shouldCreateUser: false })` → `verifyOtp({ email, token, type: 'email' })`.

**`shouldCreateUser: false` is mandatory** — without it, `/login` becomes an open signup
endpoint that mints accounts from typos.

**6-digit code, not magic link.** A magic link opens in the OS default browser, which is
frequently *not* the browser holding the installed PWA — the session lands in the wrong place.
A code keeps the user in the tab they're already in. Requires `{{ .Token }}` in the Supabase
email template.

### 4.5 Step-up re-authentication  *(fixes D1)*

Never log the user out; challenge them when they touch something irreversible.

| Action | Mechanism | Built |
|---|---|---|
| Change/add password | GoTrue native: `auth.reauthenticate()` → emailed nonce → `updateUser({ password }, { nonce })` | ✅ |
| Delete account | Own `step_up_challenges` table + a code emailed via Resend, verified inside `delete-account` | ✅ |
| Data export | — | ❌ **not gated, deliberately** |
| Coach offboarding a client | — | ❌ **not gated, deliberately** |

**Two actions were dropped from this list during the build, and the reasoning
matters more than the omission:**

- *Data export* runs entirely in the browser: `Profile.jsx` reads the user's own
  rows under their own RLS and assembles a JSON file. There is no server call to
  gate. A code prompt in front of it would be **security theatre** — the same
  session can already read every one of those rows just by using the app, so the
  prompt would stop nobody while implying protection. Gating it for real means
  moving export server-side, which belongs to the compliance export/consent work,
  not here.
- *Coach offboarding a client* is reversible (the coach can re-invite) and is a
  routine part of the job. An email round trip on a routine action trains people
  to click through prompts, which makes the prompt on deletion worth less.

What survived is the set where the action is irreversible **and** the check can
actually be enforced server-side. `delete-account` now refuses outright without a
valid code — the browser cannot skip the step by not asking for it, and the check
**fails closed**: if the code cannot be confirmed, nothing is deleted.

Enabling **"Secure password change"** in Supabase Auth settings makes the nonce
mandatory inside the auth server too, so a modified client cannot bypass it. The
client-side flow works either way; the setting is what makes it enforced. That is
the real fix for D1 — the old `{ currentPassword }` argument was never a check.

### 4.6 Session policy

**No inactivity timeout for clients.** Idle timeout defends against unattended *shared
terminals* — the reason it appears in HIPAA/FFIEC guidance. A client on a personal phone
behind Face ID is not that threat, and a 48h timer would only ever fire on the lapsed client
we are trying to win back with `nudge-client`.

| | Absolute cap | Inactivity | Rationale |
|---|---|---|---|
| Client | 90 days | none | Own data only, personal device, daily habit is the product |
| Coach | 30 days | 14 days | Blast radius is N clients' health data; they're the payer, friction tolerable |

Supabase is on **Pro**, so native session limits are available — but they apply
**project-wide**, not per role. So: set the project to the client tier (90-day time-box,
inactivity off), and enforce the tighter coach tier in `src/hooks/useSessionPolicy.js`,
checked on load, on tab focus (the case that matters — a laptop reopened weeks later), and
every 5 minutes while open.

The in-app half is client-side and therefore clearable. That is acceptable: the threat model
is a lost or stolen device, not a coach evading their own timeout, and the Supabase time-box
is the backstop that cleared localStorage cannot reach past.

A policy sign-out writes a reason that `Login.jsx` shows once. Without it, a security logout
is indistinguishable from a bug, and gets reported as one.

### 4.7 Profile changes

- **"Add a password"** — optional, never surfaced during onboarding. Uses the §4.5 reauth
  nonce, so we never need to detect whether the user currently has one.
- **"Log out everywhere"** — `signOut({ scope: 'global' })`. Cheap, and it's the control users
  reach for when a device goes missing.

---

## 5. Data model changes

Migration `<ts>_passwordless_invites.sql`:

```sql
alter table public.invitations
  add column if not exists expires_at timestamptz not null default (now() + interval '14 days'),
  add column if not exists redeemed_at timestamptz;

update public.invitations                        -- backfill live pending invites
   set expires_at = created_at + interval '14 days'
 where status = 'pending' and expires_at is null;

-- No service_role table grant: see the D5 note in §2.

-- get_invitation_by_token: add `and expires_at > now() and redeemed_at is null`
-- accept_invitation(p_token uuid, p_user_id uuid, p_full_name text) — §4.1
-- auth_user_exists(p_email text) — service_role grant only
```

Plus `step_up_challenges (user_id, purpose, code_hash, expires_at, consumed_at)`, RLS on,
service-role only — same shape as `rate_limits`.

`search_path` pinned on every new function (per `20260624150000_advisor_hardening`).

---

## 6. Phasing

**Phase 1 — the invite path. DONE (local), NOT deployed.** Migration
`20260825000000_passwordless_invites`, the `redeem-invite` function + its `config.toml` entry,
`Join.jsx` (383 → ~330 lines, password removed), `src/utils/inviteErrors.js`, OTP sign-in on
`Login.jsx`, and the test suite. 172 unit + 113 integration tests green, lint clean on the
touched files, `npm run build` passing. OTP login shipped *in this release*, not after:
without it a passwordless client who loses a session has no door.

Deploying is a separate, deliberate step (this repo keeps frontend and Supabase deploys
apart): apply the migration, `supabase functions deploy redeem-invite`, then push the
frontend. **Do not deploy the frontend before the migration** — `Join.jsx` calls
`accept_invitation`, which will not exist yet. And OTP is inert until custom SMTP is
configured (§9.2).

**Phase 2 — the security posture. DONE (local), NOT deployed.** Migration
`20260825010000_step_up_challenges` (+ `issue_step_up` / `verify_step_up`), the
`request-step-up` function, `delete-account` gated on a verified code,
`src/hooks/useSessionPolicy.js` wired into `App.jsx`, the password flow rebuilt on GoTrue's
reauthentication nonce, "Sign out everywhere", and the policy-signout notice on `Login.jsx`.
Data export and coach offboarding were deliberately left ungated — see §4.5.

**Phase 3 — record.** Compliance memo, `decisions.md` entries, `architecture.md` wiring.

Tests land with each phase, not at the end.

---

## 7. Test plan

`tests/rls/passwordlessInvite.test.js` — 10 tests, extending the existing harness
(service-role setup in `globalSetup.js`, run by `npm run test:rls`). They exercise the
**RPCs**, not the HTTP function: every guarantee lives in `accept_invitation` /
`auth_user_exists`, and `redeem-invite` is thin orchestration over them.

1. New invitee → user created, `role='client'`, `coach_clients` active, invite spent
2. Same token twice → second refused
3. **A token another transaction is mid-claim → refused** (the load-bearing one, below)
4. Expired token → refused
4b. Expired or spent invites are invisible to `get_invitation_by_token`
5. `auth_user_exists` is accurate **and** not executable by `anon`/`authenticated`
5b. A signed-in caller passing someone else's `p_user_id` is ignored → `invite_email_mismatch`
6. Coach account → refused
7. Client who already has an active coach → refused
8. Unknown token → refused, and the error carries no email

**Test 3 needed two corrections before it meant anything**, both worth knowing:

- *Racing N calls through PostgREST does not work.* Whether the transactions actually overlap
  is a timing accident — the first version passed against a function with **no locking at all**.
  It is replaced by a pinned interleaving: a direct `pg` connection (added as a devDependency;
  PostgREST cannot hold a transaction open across statements) holds the invitation row
  mid-claim, the accept is fired, and only then does the holder commit.
- *supabase-js query builders are lazy thenables.* `const p = admin.rpc(...)` sends nothing
  until something subscribes, so the call reached the database only at the final `await` —
  after the commit — and again passed against the unlocked function. The test now calls
  `.then()` to force dispatch before the sleep.

Both failure modes had the same signature: a green test over a broken guarantee. The test is
now checked in both directions — it fails with `for update` removed, passes with it restored.

`tests/rls/stepUp.test.js` — 7 tests on the deletion challenge: right code works exactly once;
wrong code refused; dead after 5 attempts even if the right code arrives later; expired
challenge refused; re-issuing supersedes the old code and resets the attempt count; the table
and both functions are unreachable from a signed-in browser; and — same pinned interleaving,
same teeth check — a code another transaction is mid-consume is refused.

Totals: **172 unit + 120 integration tests green**, no new lint errors (repo sits at its
pre-existing 11), `npm run build` passing.

## 8. Decisions (resolved 2026-08-25)

- **D-1 — Invite token buys a session, new accounts only.** 14-day expiry, single-use.
  *Consequence:* a forwarded invite can create an account. Bounded and recoverable; it can
  never enter an existing one.
- **D-2 — Clients may never set a password.** Optional, via Profile.
  *Consequence:* OTP login is load-bearing (§4.4), and PWA install becomes a **dependency** —
  Safari ITP evicts localStorage after 7 idle days for *tabs*, but installed PWAs are exempt.
  An uninstalled client silently logs out weekly.
- **D-3 — Single-use + expiry only; no IP rate limiting.**
  *Consequence:* §4.1's claim must be atomic, and test 3 guards it.
- **D-4 — Passwordless is compliance-acceptable.** Neither FTC HBNR nor WA MHMDA prescribes an
  auth factor; the standard is "reasonable security" under FTC §5. NIST SP 800-63B does not
  permit email as an out-of-band channel at AAL2 — but that binds federal agencies, and the
  *current* password + email-reset design already fails it identically. Email was always the
  root credential. The genuine upgrade path is passkeys/TOTP, not keeping passwords.
- **D-5 — Idle timeout rejected; step-up auth adopted instead.** See §4.6.
- **D-6 — Coaches keep passwords.** Different risk tier, different blast radius. TOTP for
  coaches is the eventual upgrade and doubles as a sales line.

## 9. Open items — all now dashboard settings, no code left

1. ~~Supabase plan~~ — **Pro confirmed.** Native session limits available.
2. **Custom SMTP (Resend) in Supabase Auth.** Default auth email is capped near 4/hour, so
   **OTP sign-in and the password nonce will not work in production** until this is set.
   **Hard go-live blocker.** (The deletion code goes through Resend directly and is unaffected.)
3. **Email template** must render `{{ .Token }}` for 6-digit codes.
4. **Auth → Sessions:** time-box 90 days, inactivity timeout off.
5. **Auth → "Secure password change": on.** Without it the nonce is enforced only by our
   client, not the auth server.

## 10. Trade-offs accepted

- Forwarded invite → account creation. Bounded by expiry + single-use + new-accounts-only.
- No IP rate limiting → an attacker can hammer `redeem-invite`. Each attempt is one indexed
  lookup against a 122-bit space. Revisit if abuse appears.
- Email as sole factor. Documented in D-4; unchanged from today in substance.
- Two step-up mechanisms (§4.5). Accepted for layer-nativeness over uniformity.

# AI Resilience — Implementation Spec (Phase 1 + Phase 2)

> **For the implementing agent (Codex).** Build exactly what's below. This is the
> first slice of the plan in `docs/ai-resilience-design.md` (read it for rationale).
> **Scope:** Phase 1 (shared Anthropic wrapper: retry/backoff/timeout/friendly
> errors) + Phase 2 (response cache for **nutrition-coach only**) + one small
> frontend fix. Do NOT build the global concurrency gate, circuit breaker,
> tiered limits, or batch pacing — those are later PRs (design §7, Phases 3–5).
> Open it as ONE PR. Do not deploy or apply the migration — leave those for the owner.

---

## 0. Context you need

- **Stack:** Supabase **edge functions** at `supabase/functions/<name>/index.ts` — Deno runtime (TypeScript, Web APIs, `Deno.env`, global `fetch`, `crypto.subtle`, `AbortController`; **no npm, no Node**). Frontend is React under `src/`.
- **The three Anthropic callers** (verify, don't trust: `grep -rl "api.anthropic.com" supabase/functions/`) are **`nutrition-coach`**, **`weekly-report`**, **`call-prep`**. `weekly-digest` and `notify-*` use Resend, not Anthropic — do not touch them.
- **These functions differ in their return style — match each one's existing style, don't standardize:**
  | Function | Auth var | Success return (keep the key + the style) | `model` | `max_tokens` |
  |---|---|---|---|---|
  | `nutrition-coach` | `user.id` (inline JWT check) | `return jsonResponse({ message })` | `claude-haiku-4-5-20251001` | 300 |
  | `weekly-report` | `auth.userId` (`verifyCoachOwnsClient`) | `return new Response(JSON.stringify({ report }), { headers })` | `claude-haiku-4-5-20251001` | 800 |
  | `call-prep` | `auth.userId` (`verifyCoachOwnsClient`) | `return new Response(JSON.stringify({ briefing }), { headers })` | **`claude-opus-4-5`** | 1024 |
- **Secrets/model already correct.** Keep each function's **existing** `model` and `max_tokens` per the table above — the three are **not** all on the same model (`call-prep` runs Opus; the other two run Haiku). `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` are already in the edge env — **add no new secrets, no new deps.**
- **Shared modules:** put shared code in **`supabase/functions/_shared/`** (a `_`-prefixed dir is NOT deployed as a function) and import with a plain **relative path** (`../_shared/anthropic.ts`). This needs **no** change to any function's `deno.json` / import map — a relative import isn't an import-map entry.
- **Migration convention:** `supabase/migrations/YYYYMMDDHHMMSS_<name>.sql`, timestamp strictly greater than the latest existing migration. Mirror `supabase/migrations/20260624140000_rate_limits.sql` for style.

### Hard guardrails (this repo has been bitten by these)
1. **New tables need BOTH `enable row level security` AND explicit `grant … to service_role`.** RLS scopes rows; GRANTs allow touching the table at all. Missing the GRANT → `42501 permission denied` (this repo has hit it repeatedly). Copy the `rate_limits` pattern exactly.
2. **Fail-open, always.** A cache miss, cache error, or hash error must **never** block a real user — on any cache/infra error, fall through and call Anthropic as if it were a miss. The cache helpers must never throw.
3. **Don't remove existing logic.** Preserve every function's JWT verification, active-coach/relationship checks, subscription checks, and `check_rate_limit`/`withinRateLimit` calls.
4. **Don't leak raw upstream errors.** Log the real error server-side (`console.error`); return a generic friendly message to the client.
5. **Don't change the request/response contract** (same success keys per the table above).

---

## Phase 1 — Shared Anthropic wrapper

### 1.1 Create `supabase/functions/_shared/anthropic.ts`

```ts
export interface CallOpts {
  maxAttempts?: number   // default 3 (1 try + 2 retries)
  timeoutMs?: number     // per-attempt abort, default 20000
}

export type CallResult =
  | { ok: true;  text: string }
  | { ok: false; retryable: boolean; status: number | null; error: string }

// `body` is the full Messages request the caller already builds:
//   { model, max_tokens, messages }
// The wrapper adds headers + auth. It NEVER throws.
export async function callAnthropic(
  body: Record<string, unknown>,
  opts?: CallOpts,
): Promise<CallResult>
```

**Behavior:**
- POST `https://api.anthropic.com/v1/messages` with headers `content-type: application/json`, `anthropic-version: 2023-06-01`, `x-api-key: <Deno.env.get("ANTHROPIC_API_KEY") ?? "">`.
- **Per-attempt timeout** via `AbortController` (`timeoutMs`, default **20000**); pass `signal` to `fetch`. An abort counts as a retryable network failure.
- **Success** = HTTP 2xx AND parsed body `type !== "error"` AND `body.content?.[0]?.text` present → `{ ok: true, text }`.
- **Classify failures:**
  - **Retryable:** HTTP `429`, `529`, or `5xx`; a thrown/aborted fetch (network/timeout); OR a 200-with-error body whose `error.type` ∈ `{ overloaded_error, api_error, rate_limit_error }`.
  - **Non-retryable:** HTTP `400/401/403/404/413`, or error body type ∈ `{ invalid_request_error, authentication_error, permission_error, not_found_error }`.
- **Retry** (retryable only): up to `maxAttempts`. Backoff before retry `i` (0-indexed): `base * 2^i + jitter`, `base = 500ms`, `jitter = random 0–250ms`; if the response carried a `retry-after` header (seconds), use `max(computed, retryAfter*1000)`; **cap any single delay at 4000ms.** Sleep via `await new Promise(r => setTimeout(r, ms))`.
- After the last attempt, return `{ ok: false, retryable, status, error }` with the final classification.
- **Worst-case wall time** ≈ `3 × 20s + 2 × 4s = 68s`, all I/O wait — comfortably under the edge runtime limit and only reached if the upstream truly hangs. **No circuit breaker in this PR** (Phase 3).

### 1.2 Refactor all three call sites to use it

In each of the three files, replace the inline `fetch("https://api.anthropic.com/v1/messages", …)` + its `data.type === "error"` / `data.content[0].text` handling with `callAnthropic(...)`, **matching that function's own return style from the table in §0.** Example (nutrition-coach style):

```ts
import { callAnthropic } from "../_shared/anthropic.ts"
const result = await callAnthropic({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 300,                       // use each function's own value
  messages: [{ role: "user", content: prompt }],
})
if (!result.ok) {
  console.error("nutrition-coach anthropic failed:", result.status, result.error)
  return jsonResponse(                    // weekly-report/call-prep: use `new Response(JSON.stringify({error:…}),{status,headers})`
    { error: result.retryable
        ? "Our AI is busy right now — please try again in a moment."
        : "Couldn't generate a response right now." },
    result.retryable ? 503 : 502,
  )
}
// weekly-report composes: const report = `Weekly Report (${rangeLabel})\n\n${result.text}`; return { report }
// call-prep: const briefing = result.text; return { briefing }
// nutrition-coach: return jsonResponse({ message: result.text })
```

---

## Phase 2 — Response cache (nutrition-coach ONLY)

> **Why only nutrition-coach:** identical daily log → identical feedback is exactly what a solo user wants on a re-click, and re-clicks are common (highest volume, free tier — the cost/load we most want to cut). **Do NOT cache `weekly-report` or `call-prep`** in this PR: a coach may legitimately re-generate to get a *different* draft, and caching identical inputs would silently return the same draft (breaks "regenerate"). Report/prep caching is a deliberate later decision (needs a force-refresh bypass).

### 2.1 Migration `supabase/migrations/<new-ts>_ai_cache.sql`

```sql
create table if not exists public.ai_cache (
  fn          text        not null,   -- namespaced, e.g. 'nutrition-coach:v1'
  user_id     uuid        not null,
  input_hash  text        not null,   -- sha256 hex of the normalized inputs
  response    jsonb       not null,   -- the cached success payload, e.g. { "message": "..." }
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  primary key (fn, user_id, input_hash)
);

create index if not exists ai_cache_expires_at_idx on public.ai_cache (expires_at);

-- RLS ON with NO policies = locked to service_role only (service_role bypasses RLS).
-- Same intended-lockdown pattern as rate_limits / trial_ledger.
alter table public.ai_cache enable row level security;

-- Table-level GRANT is still required for service_role to touch the table.
grant select, insert, update, delete on public.ai_cache to service_role;
```

Reads filter on `expires_at`, so stale rows are ignored. **Ops follow-up (NOT in this migration — keeps it bulletproof):** add a nightly pg_cron sweep so the table doesn't grow unbounded (the repo already uses pg_cron for weekly-digest):
`select cron.schedule('ai-cache-cleanup', '17 4 * * *', $$delete from public.ai_cache where expires_at < now()$$);`

### 2.2 Create `supabase/functions/_shared/aiCache.ts`

```ts
export async function hashInput(value: unknown): Promise<string>
export async function getCached(fn: string, userId: string, inputHash: string): Promise<any | null>
export async function setCached(fn: string, userId: string, inputHash: string, response: unknown, ttlSeconds: number): Promise<void>
```

- **`hashInput`:** stable-stringify (recursively sort object keys so key order can't cause misses) → `crypto.subtle.digest("SHA-256", …)` → lowercase hex.
- **`getCached`:** REST `GET {SUPABASE_URL}/rest/v1/ai_cache?fn=eq.<fn>&user_id=eq.<userId>&input_hash=eq.<hash>&expires_at=gt.<now-iso>&select=response&limit=1`, headers `apikey` + `Authorization: Bearer` = `SUPABASE_SERVICE_ROLE_KEY`. **URL-encode every query value** (`encodeURIComponent`). Return `rows[0]?.response ?? null`. On non-2xx or thrown → `null` (fail-open).
- **`setCached`:** REST `POST {SUPABASE_URL}/rest/v1/ai_cache` with header `Prefer: resolution=merge-duplicates`, body `{ fn, user_id: userId, input_hash: inputHash, response, expires_at: new Date(Date.now()+ttlSeconds*1000).toISOString() }`. Swallow all errors.

### 2.3 Wire the cache into `nutrition-coach` (namespace `"nutrition-coach:v1"`, TTL `21600` = 6h)

**Order matters: the cache check goes BEFORE the rate-limit call**, so a cache hit costs neither an Anthropic call nor a rate-limit token. In `nutrition-coach` today, the body is parsed (`const { entries } = await req.json()`) *after* the `withinRateLimit(...)` call — **move the `entries` parse up** so the final order is:

```
existing auth → profile → subscription checks   (unchanged)
const { entries } = await req.json()             // moved to here, above the rate-limit call
const inputHash = await hashInput(entries)
const cached = await getCached("nutrition-coach:v1", user.id, inputHash)
if (cached?.message) return jsonResponse({ message: cached.message })
… existing withinRateLimit(…) check …           // now runs only on a cache MISS
… build prompt → callAnthropic (Phase 1) …       // on !ok: friendly error, do NOT cache
await setCached("nutrition-coach:v1", user.id, inputHash, { message: result.text }, 21600)
return jsonResponse({ message: result.text })
```

The `:v1` suffix is a manual cache-buster — bump to `:v2` in any future PR that changes the prompt, so stale outputs are ignored.

---

## Frontend fix (required — otherwise the friendly message never shows)

`getAIFeedback()` in **`src/pages/Log.jsx`** currently does `const data = await response.json(); setFeedback(data.message)` with **no status/error check and no try/catch** — so a 503 renders blank and a network error leaves the spinner stuck. Fix it to surface the error and always clear loading. Use the app's existing error surface (a `Toast`/inline error — match how `Log.jsx` shows other failures):

```js
async function getAIFeedback() {
  setLoading(true)
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/nutrition-coach',
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, body: JSON.stringify({ entries }) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.error) {
      // surface the friendly message (e.g. a Toast) instead of blanking
      /* show data.error || 'Something went wrong — please try again.' */
      return
    }
    setFeedback(data.message)
  } finally {
    setLoading(false)
  }
}
```

The **coach-side callers already handle this** — `ClientView.jsx` does `setReport(data.report || data.error || 'Failed…')` (and similar for the briefing), so `weekly-report`/`call-prep` need **no** frontend change; their 503 body renders as-is.

---

## Non-goals (do NOT do in this PR)
- No global gate, no circuit breaker, no rate-limit changes, no batch pacing (Phases 3–5).
- **No caching of `weekly-report` or `call-prep`** (reroll tradeoff — deferred).
- No model/prompt/`max_tokens`/secret/dependency changes; no changes to `weekly-digest` or `notify-*`; no import-map edits.

---

## Acceptance criteria
1. `grep -rl "api.anthropic.com" supabase/functions/` → the only direct reference is inside `_shared/anthropic.ts`; all three call sites go through `callAnthropic`, each preserving its own return style/key (`message` / `report` / `briefing`).
2. A transient 429/529/5xx is retried with backoff; after exhaustion the function returns a friendly `503` (not a raw 500 with the upstream message). Non-retryable errors return `502`.
3. Two identical `nutrition-coach` requests (same `entries`, same user) within 6h: the **second makes no Anthropic call** and returns the cached `{ message }`. It also does **not** consume a rate-limit token (cache check precedes the limiter).
4. A new/edited log (different `entries`) → different `input_hash` → cache miss → fresh call.
5. Cache/DB errors never surface to the user or block the call (fail-open, verified by code review of the null/try-catch paths).
6. Existing behavior unchanged: unauthenticated / non-active-coach / over-limit / wrong-account-type requests are still rejected exactly as before; success keys unchanged.
7. Solo AI-feedback UX: on a 503 the user sees the friendly message (not a blank), and the spinner always clears (try/finally).
8. Type-check each edited function + the two `_shared/*.ts` with `deno check` if available; otherwise a successful `supabase functions deploy` (owner-run) confirms bundling.

---

## Deploy / apply (owner runs after review — commands only, do not run)
```sh
# 1) Apply the migration. `supabase db push` — NOTE: from a local machine this repo
#    must use the IPv4 *session pooler* (the direct host is IPv6-only). If db push
#    can't connect, paste the migration SQL into the Supabase dashboard SQL editor.
supabase db push
# (optional ops) run the pg_cron cleanup statement from §2.1 once.

# 2) Deploy the three touched functions (no Docker; NOT `vercel deploy`).
for fn in nutrition-coach weekly-report call-prep; do
  supabase functions deploy "$fn" --project-ref mlqaurxefttbqsrllbyj
done
# 3) Push the frontend change to main → Vercel auto-deploys.
```

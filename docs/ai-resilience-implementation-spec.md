# AI Resilience — Implementation Spec (Phase 1 + Phase 2)

> **For the implementing agent (Codex).** Build exactly what's below. This is the
> first slice of the plan in `docs/ai-resilience-design.md` (read it for rationale).
> **Scope: Phase 1 (shared Anthropic wrapper with retry/backoff) + Phase 2
> (response cache) only.** Do NOT build the global concurrency gate, circuit
> breaker, tiered limits, or batch pacing — those are later PRs (design §7,
> Phases 3–5).

---

## 0. Context you need

- **Stack:** Supabase **edge functions** in `supabase/functions/<name>/index.ts` — Deno runtime (TypeScript, Web APIs, `Deno.env`, global `fetch`, `crypto.subtle`, `AbortController`; **no npm, no Node**).
- **The Anthropic-calling functions** are the ones that POST to `https://api.anthropic.com/v1/messages`. **Find them yourself — do not assume:**
  ```
  grep -rl "api.anthropic.com" supabase/functions/
  ```
  (At time of writing this matches `nutrition-coach`, `weekly-report`, and `call-prep`. `weekly-digest` sends Resend emails and does NOT call Anthropic — leave it alone.)
- **Model/secrets are already correct.** Keep `model: "claude-haiku-4-5-20251001"` and each function's existing `max_tokens` unchanged. `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` are already in the edge-function env — **add no new secrets**.
- **Shared-module convention:** files/dirs under `supabase/functions/` whose name starts with `_` are NOT deployed as functions. Put shared code in **`supabase/functions/_shared/`** and import with a relative path (`../_shared/anthropic.ts`).
- **Migration convention:** `supabase/migrations/YYYYMMDDHHMMSS_<name>.sql`; use a timestamp strictly greater than the latest existing migration. Mirror the existing `supabase/migrations/20260624140000_rate_limits.sql` for style.

### Hard guardrails (this repo has been bitten by these)
1. **New tables need BOTH `enable row level security` AND explicit `grant … to service_role`.** RLS scopes rows; GRANTs allow touching the table at all. Missing the GRANT → `42501 permission denied`. Copy the `rate_limits` pattern exactly.
2. **Fail-open, always.** A cache miss, cache error, hash error, or limiter hiccup must **never** block a real user — on any cache/infra error, fall through and call Anthropic as if it were a miss. Never throw out of the cache helpers.
3. **Don't remove existing logic.** Preserve every function's current JWT verification, active-coach/relationship checks, and `check_rate_limit` calls. The wrapper + cache slot *around* them; they do not replace them.
4. **Don't leak raw upstream errors to users.** Log the real error server-side (`console.error`); return a generic friendly message to the client.
5. **Do not change the request/response contract** each function has with the frontend (same success JSON keys — e.g. `nutrition-coach` returns `{ message }`, `weekly-report` returns `{ report }`).

---

## Phase 1 — Shared Anthropic wrapper (retry / backoff / timeout / friendly errors)

### 1.1 Create `supabase/functions/_shared/anthropic.ts`

Export a single function that wraps the Messages API call. Signature:

```ts
export interface CallOpts {
  maxAttempts?: number   // default 3 (1 try + 2 retries)
  timeoutMs?: number     // per-attempt abort, default 30000
}

export type CallResult =
  | { ok: true;  text: string }
  | { ok: false; retryable: boolean; status: number | null; error: string }

// `body` is the full Messages request the caller already builds today:
//   { model, max_tokens, messages }
// The wrapper adds headers + auth. It never throws.
export async function callAnthropic(
  body: Record<string, unknown>,
  opts?: CallOpts,
): Promise<CallResult>
```

**Behavior:**
- POST `https://api.anthropic.com/v1/messages` with headers:
  `content-type: application/json`, `anthropic-version: 2023-06-01`, `x-api-key: <Deno.env.get("ANTHROPIC_API_KEY") ?? "">`.
- **Per-attempt timeout** via `AbortController` (`timeoutMs`, default 30000); pass `signal` to `fetch`. An abort counts as a retryable network failure.
- **Success** = HTTP 2xx AND parsed body `type !== "error"` AND `body.content?.[0]?.text` present → `{ ok: true, text }`.
- **Classify failures:**
  - **Retryable:** HTTP `429`, `529`, or `5xx`; a thrown/aborted fetch (network/timeout); OR a 200-with-error body whose `error.type` ∈ `{ overloaded_error, api_error, rate_limit_error }`.
  - **Non-retryable:** HTTP `400/401/403/404/413`, or error body type ∈ `{ invalid_request_error, authentication_error, permission_error, not_found_error }`.
- **Retry loop** (only on retryable): up to `maxAttempts` total. Backoff before retry `i` (0-indexed): `base * 2^i + jitter`, `base = 500ms`, `jitter = random 0–250ms`. If the response carried a `retry-after` header (seconds), use `max(computedDelay, retryAfter*1000)`. **Cap any single delay at 8000ms.** Sleep with `await new Promise(r => setTimeout(r, ms))`. (`Math.random()` is fine in the edge runtime.)
- After the last attempt, return `{ ok: false, retryable, status, error }` with the final classification (a still-retryable exhaustion stays `retryable: true`).
- Keep it self-contained: **no circuit breaker, no global gate in this PR.**

### 1.2 Refactor every Anthropic call site to use it

For **each** file from the grep above, replace the inline
`fetch("https://api.anthropic.com/v1/messages", …)` + its `data.type === "error"` / `data.content[0].text` handling with:

```ts
import { callAnthropic } from "../_shared/anthropic.ts"
// …build `prompt` exactly as today…
const result = await callAnthropic({
  model: "claude-haiku-4-5-20251001",
  max_tokens: /* this function's existing value: 300 for nutrition-coach, 800 for weekly-report, etc. */,
  messages: [{ role: "user", content: prompt }],
})
if (!result.ok) {
  console.error("<fn-name> anthropic failed:", result.status, result.error)
  return jsonResponse(
    { error: result.retryable
        ? "Our AI is busy right now — please try again in a moment."
        : "Couldn't generate a response right now." },
    result.retryable ? 503 : 502,
  )
}
// use result.text where the code previously used data.content[0].text
```

Keep each function's existing success shape (`{ message }`, `{ report }`, etc.).

---

## Phase 2 — Response cache (skip Anthropic on identical inputs)

### 2.1 Migration: `supabase/migrations/<new-ts>_ai_cache.sql`

```sql
create table if not exists public.ai_cache (
  fn          text        not null,   -- namespaced, e.g. 'nutrition-coach:v1'
  user_id     uuid        not null,
  input_hash  text        not null,   -- sha256 hex of the normalized inputs
  response    jsonb       not null,   -- the cached success payload
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

Expired rows are simply filtered out on read (below); a periodic cleanup is a nice-to-have, **not** in this PR.

### 2.2 Create `supabase/functions/_shared/aiCache.ts`

```ts
// Deterministic hash of the inputs that feed the prompt.
export async function hashInput(value: unknown): Promise<string>
// Returns the cached `response` payload, or null on miss / not-found / any error.
export async function getCached(fn: string, userId: string, inputHash: string): Promise<any | null>
// Best-effort upsert; swallows all errors (never throws).
export async function setCached(fn: string, userId: string, inputHash: string, response: unknown, ttlSeconds: number): Promise<void>
```

Implementation notes:
- **`hashInput`:** stable-stringify (recursively sort object keys so key order can't cause misses) → `crypto.subtle.digest("SHA-256", …)` → lowercase hex.
- **`getCached`:** REST `GET {SUPABASE_URL}/rest/v1/ai_cache?fn=eq.<fn>&user_id=eq.<userId>&input_hash=eq.<hash>&expires_at=gt.<now-iso>&select=response&limit=1`, headers `apikey` + `Authorization: Bearer` = `SUPABASE_SERVICE_ROLE_KEY`. Return `rows[0]?.response ?? null`. On non-2xx or thrown → return `null` (fail-open).
- **`setCached`:** REST `POST {SUPABASE_URL}/rest/v1/ai_cache` with header `Prefer: resolution=merge-duplicates` and body `{ fn, user_id, input_hash, response, expires_at: new Date(Date.now()+ttlSeconds*1000).toISOString() }`. Swallow all errors.
- All env via `Deno.env.get(...)`.

### 2.3 Wire the cache into `nutrition-coach` and `weekly-report`

Insert the cache check/store **after** the existing auth + `check_rate_limit`, and **around** `callAnthropic`:

**`nutrition-coach`** (namespace `"nutrition-coach:v1"`, TTL `21600` = 6h):
```ts
import { hashInput, getCached, setCached } from "../_shared/aiCache.ts"
// after auth + rate limit, before building the prompt:
const inputHash = await hashInput(entries)      // the day's log that feeds the prompt
const cached = await getCached("nutrition-coach:v1", user.id, inputHash)
if (cached?.message) return jsonResponse({ message: cached.message })
// …callAnthropic as in Phase 1…  (on !ok, return the friendly error, do NOT cache)
await setCached("nutrition-coach:v1", user.id, inputHash, { message: result.text }, 21600)
return jsonResponse({ message: result.text })
```

**`weekly-report`** (namespace `"weekly-report:v1"`, TTL `86400` = 24h): same pattern, but hash **all** inputs that shape the report — `hashInput({ clientId, weekRange, weekData, checkIn })` — key by the **coach's** user id (the caller), and cache/return `{ report }`.

> The `:v1` suffix is a manual cache-buster: if a future PR changes a prompt, bump it to `:v2` so stale cached outputs are ignored.

`call-prep` may adopt the cache later; **not required in this PR.**

---

## Non-goals (do NOT do in this PR)
- No global concurrency gate, no circuit breaker, no tiered/changed rate limits, no batch pacing (Phases 3–5).
- Do not change models, `max_tokens`, prompts, or the auth/relationship checks.
- Do not add new env secrets or new Deno dependencies.
- Do not touch `weekly-digest` or the `notify-*` functions.

---

## Acceptance criteria
1. `grep -rl "api.anthropic.com" supabase/functions/` — the only remaining direct references are inside `_shared/anthropic.ts`; every function call site goes through `callAnthropic`.
2. A transient Anthropic 429/529/5xx is retried with backoff; after exhaustion the function returns a friendly `503` (not a raw 500 with the upstream message).
3. Two identical `nutrition-coach` requests (same `entries`, same user) within the TTL: the **second makes no Anthropic call** and returns the cached `{ message }`. Same for `weekly-report` with identical inputs.
4. A new log entry (different `entries`) produces a different `input_hash` → cache miss → fresh call.
5. Cache/DB errors never surface to the user or block the call (verify by pointing the service key at a bad value locally, or by code review of the fail-open paths).
6. Existing behavior unchanged: unauthenticated / non-active-coach / over-rate-limit requests are still rejected exactly as before; success JSON keys unchanged.
7. Each edited function still type-checks: `deno check supabase/functions/<name>/index.ts` (and the two `_shared/*.ts`).

---

## Deploy / apply (owner runs after review — include the commands, don't run them unprompted)
```sh
# 1) Apply the migration to prod (project ref mlqaurxefttbqsrllbyj).
#    `supabase db push` — NOTE: from a local machine this repo must use the
#    IPv4 *session pooler* connection (the direct host is IPv6-only). If db push
#    can't connect, run the migration SQL in the Supabase dashboard SQL editor.
supabase db push

# 2) Deploy the touched functions (no Docker needed; do NOT use `vercel deploy`).
for fn in nutrition-coach weekly-report call-prep; do
  supabase functions deploy "$fn" --project-ref mlqaurxefttbqsrllbyj
done
```

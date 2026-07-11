# AI Feature Resilience & Scale — Design

> **Status:** Proposed design. **Not implemented.** Reviewed by the owner 2026-07-11.
> **Scope:** the four AI edge functions that call Anthropic — `nutrition-coach`
> (solo/client nutrition feedback), `weekly-report` (coach→client report),
> `call-prep` (coach meeting brief), `weekly-digest` (Monday cron; report-adjacent).

---

## 1. What we're trying to accomplish

Make the AI features **degrade gracefully instead of hard-failing** under
concurrency, and make their **cost bounded and predictable** — without adding
new infrastructure (stay on the existing Supabase + edge + Postgres stack).

**Goals**
- Under a load spike, users get a friendly "busy, try again" — never a raw 500.
- Survive Anthropic 429 (rate limit) / 529 (overloaded) / transient 5xx.
- Cut redundant Anthropic calls (repeat clicks, identical inputs).
- Batch jobs (digest/reports) never stampede the shared API key.
- Free-tier AI cost is capped and observable.

**Non-goals (deliberately out of scope for now)**
- No external queue/broker (Redis, SQS) or dedicated workers — Postgres is enough at this scale.
- No streaming responses (outputs are short, ≤300–800 tokens).
- No self-hosted / multi-provider fallback models.
- Not building for millions of users — right-sized for the growth curve, revisit thresholds when volume proves it.

---

## 2. Current architecture (as-is)

```
Client ──▶ Edge Function ──▶ [verify JWT + active relationship]
                          ──▶ check_rate_limit RPC  (Postgres, per-user, atomic, FAIL-OPEN)
                          ──▶ POST api.anthropic.com  (Haiku 4.5; ONE shared ANTHROPIC_API_KEY)
                          ──▶ return { message | report }
```

**What's already good**
- `check_rate_limit` is concurrency-safe: `INSERT … ON CONFLICT DO UPDATE … RETURNING count` — atomic per-user row, no lost increments, contention is per-user only.
- Edge functions are stateless Deno isolates; the runtime autoscales horizontally.
- Model is Haiku 4.5, `max_tokens` 300 (nutrition-coach) / 800 (report) — cheap per call.

**Failure modes**
| # | Problem | Effect at scale/concurrency |
|---|---------|------------------------------|
| F1 | **Single shared Anthropic key** = one global RPM/ITPM/OTPM budget for ALL AI calls across ALL users. | N users calling at the same second contend globally; per-user limits don't help. |
| F2 | **No retry/backoff.** `if (data.type==='error') return 500` passes 429/529 straight to the user. | Spikes → raw error storms at the worst moment. |
| F3 | **No cache/dedup.** Same day's log re-analyzed on every click. | Wasted calls + cost + load. |
| F4 | **Rate limiter fails OPEN.** DB hiccup → call allowed. | Under DB stress, MORE traffic into an already-strained key (cascade). |
| F5 | **Batch stampede.** A Monday `weekly-digest`/report run fires per-client synchronously. | One cron tick can blow the whole RPM budget. |
| F6 | **Unbounded free cost.** Solo AI is free (`hasSoloPremium` always true since Solo Premium was retired). | Cost scales with the free base, no ceiling. |

---

## 3. Target architecture (to-be)

Add three thin, Postgres-backed layers between the function and Anthropic. All AI
functions import one shared module.

```
Client ──▶ Edge Function
   │
   ├─▶ [verify JWT + relationship]                         (unchanged)
   ├─▶ per-user rate limit (TIERED: free-solo tight)       (F6)  ── check_rate_limit
   ├─▶ ai_cache lookup by (fn, user, input_hash)           (F3)  ── HIT → return cached, no Anthropic
   │        │ miss
   ├─▶ global concurrency/token gate                       (F1)  ── over cap → 429-friendly "busy"
   ├─▶ callAnthropic() wrapper                              (F2,F4)
   │        ├─ retry w/ exp backoff + jitter on 429/529/5xx (honor retry-after)
   │        ├─ circuit breaker (recent-429 cooldown)
   │        └─ timeout + friendly error mapping
   ├─▶ on success → write ai_cache                          (F3)
   └─▶ return { message | report | busy-error }

Batch (weekly-digest / bulk reports):                       (F5)
   cron ──▶ enqueue jobs ──▶ paced worker (N-at-a-time, delay) ──▶ callAnthropic()
```

---

## 4. Component designs

### 4.1 Shared Anthropic client wrapper  *(fixes F2, F4; foundation for F1)*
A single Deno module (`supabase/functions/_shared/anthropic.ts`) imported by the
**three** Anthropic-calling functions (`nutrition-coach`, `weekly-report`,
`call-prep` — grep `api.anthropic.com`; `weekly-digest`/`notify-*` use Resend, not
Anthropic). Responsibilities **in this phase**:
- **Retry**: on `429`, `529`, `5xx`, or network error → exponential backoff with
  jitter, 3 attempts; honor the `retry-after` header; cap each delay (~4s) and the
  per-attempt timeout (~20s) so worst-case wall time stays well under the edge limit.
- **Timeout**: abort a hung upstream so it doesn't pin an isolate.
- **Error mapping**: all failures → a stable `{ ok:false, retryable, status, error }`
  shape (the module never throws) that each function turns into friendly copy
  ("Our AI is busy right now — please try again in a moment.").
- **Circuit breaker — NOT in this phase.** It ships in **Phase 3** alongside the
  global gate (per-isolate in-memory to start; DB-backed if too loose). Keep the
  Phase-1 wrapper to retry/backoff/timeout only.

*Rollout note:* this is a drop-in refactor — each function replaces its inline
`fetch(api.anthropic.com…)` with `callAnthropic(body, opts)`, **matching that
function's own return style** (`nutrition-coach` uses the `jsonResponse` helper;
`weekly-report`/`call-prep` use `new Response(JSON.stringify(…))`). Highest
leverage, lowest risk. Ship first. **Frontend note:** the solo caller
(`getAIFeedback` in `Log.jsx`) ignores errors today (reads `data.message`, no
try/catch) — it needs a small fix to surface the friendly copy; the coach callers
in `ClientView.jsx` already render `data.error`.

### 4.2 Response cache — `ai_cache`  *(fixes F3)*
Before calling Anthropic, hash the **inputs** and look up a recent result. The
lookup runs **before** the per-user rate limiter, so a cache hit costs neither an
Anthropic call nor a limiter token.
- **`nutrition-coach` (this phase):** hash the day's log signature (foods +
  calories) — a repeat click on an unchanged day returns instantly, no call. TTL
  ~6h. Namespace the cache key (`nutrition-coach:v1`) so a future prompt change can
  bump the version and bypass stale entries.
- **`weekly-report` / `call-prep`: DEFERRED (not cached yet).** A coach may
  legitimately re-generate to get a *different* draft; caching identical inputs
  would silently return the same one. Cache these only once a "force refresh"
  bypass exists (later PR).
- Invalidation is natural: a new/edited log changes the hash → cache miss → fresh call.
- Growth control: reads filter on `expires_at`; add a nightly pg_cron sweep
  (`delete … where expires_at < now()`) so the table doesn't grow unbounded.

### 4.3 Global concurrency / token gate  *(fixes F1)*
A **global** bucket (not per-user) that caps total in-flight AI work below the
Anthropic tier ceiling. Two options:
- **A — global rate/concurrency limiter (preferred to start):** reuse the
  `check_rate_limit` pattern with a shared bucket (e.g., `user_id = <sentinel>`,
  `bucket = 'anthropic-global'`, a per-minute request cap sized to the tier). Over
  cap → return "busy" *before* calling Anthropic. Simple, atomic, no new infra.
- **B — semaphore (in-flight count):** increment on start / decrement on finish
  with a max; more precise for true concurrency but needs reliable decrement
  (finally/timeout) — more moving parts. Defer unless A proves insufficient.

### 4.4 Tiered per-user rate limits  *(fixes F6)*
Keep the atomic per-user limiter but vary the limit by context:
- **Free solo:** tight (e.g., ~3/day) — a taste, not a buffet; the limit doubles
  as a "connect with a coach for more" conversion nudge.
- **Coach / paid context:** generous (current 30–60/hr).
- Decision still open (see §7): tighten vs. lifetime-cap-that-converts vs. coach-only.

### 4.5 Batch pacing  *(fixes F5)*
For `weekly-digest` and any bulk report generation, don't fire per-client
synchronously. Enqueue into a small jobs table and process **N-at-a-time with a
delay** (a paced loop or pg_cron-driven worker), staying under the global gate.
Interactive calls always take priority over batch.

---

## 5. Data model changes

```sql
-- 4.2 response cache
create table ai_cache (
  fn          text        not null,      -- 'nutrition-coach' | 'weekly-report' | …
  user_id     uuid        not null,
  input_hash  text        not null,      -- sha256 of the normalized inputs
  response    jsonb       not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  primary key (fn, user_id, input_hash)
);
-- service_role only; index on expires_at for cleanup (pg_cron sweep).

-- 4.3 global gate: reuse rate_limits with a sentinel user_id + 'anthropic-global' bucket,
--     OR a dedicated table if a true in-flight semaphore (option B) is chosen.

-- 4.5 batch: ai_jobs (id, fn, payload jsonb, status, attempts, created_at, ...) if/when needed.
```
All new tables: RLS on, `service_role`-only DML (same pattern as `rate_limits`).

---

## 6. Target control flow — `nutrition-coach`

1. Verify JWT (+ active relationship for coach-facing fns). *(unchanged)*
2. **Per-user rate limit** (tiered). Over → 429 friendly.
3. Compute `input_hash` from the day's log. **`ai_cache` lookup** → HIT → return cached.
4. **Global gate** check. Over → "busy, try again."
5. **`callAnthropic()`** (retry / backoff / breaker / timeout).
6. Success → **write `ai_cache`** → return.
7. Failure (retries exhausted / breaker open) → friendly retryable error.

---

## 7. Phasing (highest leverage first)

| Phase | Work | Fixes | Risk | Notes |
|-------|------|-------|------|-------|
| **1** | Shared `callAnthropic()` wrapper: retry/backoff + friendly errors | F2, F4 | Low | Drop-in; biggest resilience win alone |
| **2** | `ai_cache` (**nutrition-coach only**; report/prep deferred — reroll) | F3 | Low | Biggest cost/load reduction |
| **3** | Global concurrency gate + circuit breaker | F1 | Med | Protects the shared key under spikes |
| **4** | Tiered / tightened free-solo limits | F6 | Low | Also a conversion lever; needs a product call (§8) |
| **5** | Batch pacing for digest/reports | F5 | Med | Prevents cron stampede |

Phases 1–2 remove ~most of the real-world risk cheaply. 3–5 matter as concurrent
volume grows; each has a clear trigger metric (see §9).

---

## 8. Decisions (resolved 2026-07-11) + open items

**Resolved:**
- **Free-solo AI policy (F6): KEEP it for solo** (not coach-only) — it's the activation taste. Phase 4 still applies a **tightened free cap** (default ~3/day, tunable; doubles as a "connect with a coach for more" nudge). Owner may leave the current 30/hr if preferred — the number is a one-line change.
- **Cache staleness (§4.2): 6–24h is fine.** Nutrition feedback caching at that TTL reads as fresh; input-hash invalidation refreshes on any new log.
- **Anthropic account/tier (F1):** rate limits are per **API org** (the org owning the `ANTHROPIC_API_KEY` in Supabase secrets — separate from any Claude.ai chat subscription). Keep all app usage on **one** org so tiers auto-advance (spend + time); don't split across accounts. A dedicated business org is the clean long-term home (billing/security isolation) but is a post-launch migration, not urgent. For headroom before a spike, request a limit increase in Console → Limits. Cost is negligible (Haiku, ~$0.0025/call); the tier matters only for the **RPM/concurrency ceiling**, which Phases 1+3 address.

**Still open:**
- **Circuit-breaker state:** per-isolate in-memory (simple, loose) vs. DB-backed (consistent, +1 read). Start simple; promote if isolate-local proves too loose.
- **Exact free-solo cap number** (~3/day vs keep 30/hr) — owner's call at Phase 4.

## 9. Trade-offs

- **Postgres-for-coordination** (cache/limiter/gate) over external infra: zero new
  ops, atomic, already there. Ceiling is the DB's write throughput on these small
  tables — far above current needs; revisit if the gate/cache tables show lock
  contention (trigger: sustained > ~a few hundred AI calls/min).
- **Global gate rejects some calls** during spikes (by design) — bounded, friendly
  "busy" beats an unbounded 429 storm.
- **Caching trades freshness for cost/load** — acceptable for nutrition feedback;
  TTL + input-hash invalidation keeps it honest.

---

## 10. Cost model (context)

Haiku 4.5, ~500–1500 input tokens + ≤300 output/call → fractions of a cent each.
Per-call cost is small; the risk is **volume × free users** (F6) and **spike
concurrency** (F1), not unit price. Phases 2 (cache) + 4 (tiered limits) address
the cost axis; Phases 1 + 3 address the resilience axis.

create table if not exists public.ai_cache (
  fn          text        not null,
  user_id     uuid        not null,
  input_hash  text        not null,
  response    jsonb       not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  primary key (fn, user_id, input_hash)
);

create index if not exists ai_cache_expires_at_idx on public.ai_cache (expires_at);

-- RLS with no policies keeps this internal table locked to service_role only.
alter table public.ai_cache enable row level security;

grant select, insert, update, delete on public.ai_cache to service_role;

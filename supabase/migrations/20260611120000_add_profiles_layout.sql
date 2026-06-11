-- Per-user dashboard card order (drag-to-reorder). One jsonb blob holding a key
-- list per screen, e.g. { "clientView": ["consistency", ...], "dashboard": [...] }.
-- Updatable by the owner via the existing profiles_update_self policy.
alter table public.profiles
  add column if not exists layout jsonb not null default '{}'::jsonb;

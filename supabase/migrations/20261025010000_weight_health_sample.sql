-- The Apple Health sample a typed weigh-in was written to.
--
-- Gardnr writes a weigh-in the client TYPES into Apple Health (HealthPlugin
-- saveWeight), and only that: a reading that arrived from Health -- a scale --
-- is already there. This is the handle that lets a later edit or delete in
-- Gardnr follow it, since HealthKit only lets an app change a sample it wrote
-- itself, and needs that sample's id to do it.
--
-- Not external_id, which is the opposite direction: the id of a sample READ
-- from Health, the dedupe key for imports. A row has one or the other, never
-- both, and sharing the column would let an edit to a scale reading try to
-- delete the scale's sample.
alter table public.weight_log add column if not exists health_sample_id text;

notify pgrst, 'reload schema';

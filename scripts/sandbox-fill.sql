-- Walkthrough demo extension — run AFTER scripts/seed-hero-roster.mjs.
--
-- LOCAL ONLY. Two jobs:
--   1) Re-anchor the hero seed's FROZEN dates (anchored to 2026-07-12 so the hero
--      SCREENSHOT is reproducible) onto the REAL clock, so a LIVE walkthrough shows
--      the intended GREEN / AMBER / RED triage split on the day you record. Triage
--      reads days-since-last-nutrition-log against "now", so a stale anchor makes
--      every client look abandoned (all RED).
--   2) Fill the coach-facing surfaces the hero seed leaves empty: reports, message
--      threads, notifications, a custom check-in questionnaire + answers, body
--      measurements for the AMBER/RED clients, coach notes, and a milestone streak.
--
-- IDEMPOTENT ONLY as part of seed-walkthrough.sh (seed recreates the users fresh,
-- cascading away old extension rows). Do NOT run this file twice without re-running
-- the seed first — the date shift would apply twice.

begin;

-- id lookup, alive for the whole transaction
create temporary table _ids on commit drop as
select
  (select id from profiles where email = 'alex@gardnr.demo')   as coach,
  (select id from profiles where email = 'maya@gardnr.demo')   as maya,   -- GREEN
  (select id from profiles where email = 'marcus@gardnr.demo') as marcus, -- AMBER
  (select id from profiles where email = 'sam@gardnr.demo')    as sam;    -- RED

-- ── 1. Shift the frozen seed dates onto today ──────────────────────────────────
-- delta = today - anchor. Same expression everywhere so every table moves together
-- and the internal story (streaks, gaps, trends) is preserved, just slid forward.
update nutrition_log     set logged_date = logged_date + (current_date - date '2026-07-12') where user_id in (select maya from _ids union select marcus from _ids union select sam from _ids);
update weight_log        set logged_date = logged_date + (current_date - date '2026-07-12') where user_id in (select maya from _ids union select marcus from _ids union select sam from _ids);
update steps_log         set logged_date = logged_date + (current_date - date '2026-07-12') where user_id in (select maya from _ids union select marcus from _ids union select sam from _ids);
update cardio_log        set logged_date = logged_date + (current_date - date '2026-07-12') where user_id in (select maya from _ids union select marcus from _ids union select sam from _ids);
update body_measurements set logged_date = logged_date + (current_date - date '2026-07-12') where user_id in (select maya from _ids union select marcus from _ids union select sam from _ids);
-- Lock cleared "today" so triage is driven by logging pattern, not a new-client grace lock.
update coach_clients set lock_cleared_at = current_date where coach_id = (select coach from _ids);

-- check_ins are keyed by week_of and matched against THIS week's Sunday, so they
-- must land on a real Sunday, not just shift by the delta. Pin the seeded ones
-- (Maya, Marcus) to the current week's Sunday.
update check_ins set week_of = (current_date - extract(dow from current_date)::int)
  where client_id in (select maya from _ids union select marcus from _ids);

-- Give Marcus (AMBER) a log for TODAY so his "Today's stats" and "Nutrition log"
-- panels aren't empty when the coach opens his record on camera. Meals + weigh-in
-- + steps only — deliberately NO cardio, so his 7-day cardio stays weak (1/7) and
-- he remains the AMBER "logging food but cardio has drifted" story. (Sam the RED
-- client is left with an empty today on purpose — that IS his went-quiet story.)
insert into nutrition_log (user_id, food, meal, calories, protein, carbs, fat, logged_date, serving_size, serving_unit) values
  ((select marcus from _ids), 'Greek yoghurt, berries, granola', 'breakfast', 700, 56, 74, 20, current_date, 1, 'serving'),
  ((select marcus from _ids), 'Chicken, rice and greens',        'lunch',     985, 79, 103, 28, current_date, 1, 'serving'),
  ((select marcus from _ids), 'Salmon, potatoes, broccoli',      'dinner',    840, 67, 88, 24, current_date, 1, 'serving'),
  ((select marcus from _ids), 'Protein shake',                   'snack',     280, 22, 29, 8,  current_date, 1, 'serving');
insert into weight_log (user_id, weight, unit, logged_date, weighed_at) values
  ((select marcus from _ids), 81.6, 'kg', current_date, '07:15:00');
insert into steps_log (user_id, steps, logged_date) values
  ((select marcus from _ids), 7350, current_date);

-- ── 2. Custom check-in questionnaire (coach-defined questions) ─────────────────
-- Presence of ≥1 non-archived question flips every client's check-in from the
-- legacy 4-field form to this custom questionnaire.
insert into checkin_questions (coach_id, prompt, type, config, required, position) values
  ((select coach from _ids), 'How would you rate your adherence this week?', 'rating',  '{"max":5}'::jsonb, true,  0),
  ((select coach from _ids), 'Energy levels this week?',                     'rating',  '{"max":5}'::jsonb, true,  1),
  ((select coach from _ids), 'How was your sleep?',                          'select',  '{"options":["Poor","OK","Good","Great"]}'::jsonb, false, 2),
  ((select coach from _ids), 'Did you miss any planned training sessions?',  'boolean', '{}'::jsonb, false, 3),
  ((select coach from _ids), 'Average sleep per night',                      'number',  '{"unit":"hrs"}'::jsonb, false, 4),
  ((select coach from _ids), 'Anything you want me to know this week?',      'text',    '{}'::jsonb, false, 5);

-- Snapshot answers into check_ins.answers (question_id + prompt/type/config/value,
-- exactly as the client form's buildAnswers writes them, so the coach view renders
-- them instead of "—"). Maya = strong week, Marcus = travel week.
update check_ins ci set answers = (
  select jsonb_agg(jsonb_build_object(
    'question_id', q.id, 'prompt', q.prompt, 'type', q.type, 'config', q.config,
    'value', case q.position
      when 0 then to_jsonb(5)  when 1 then to_jsonb(4)
      when 2 then to_jsonb('Great'::text)  when 3 then to_jsonb(false)
      when 4 then to_jsonb(7.5)  when 5 then to_jsonb('Felt strong — hit every session and the weekend was easy this time.'::text)
    end) order by q.position)
  from checkin_questions q where q.coach_id = (select coach from _ids) and not q.archived)
  where ci.client_id = (select maya from _ids);

update check_ins ci set answers = (
  select jsonb_agg(jsonb_build_object(
    'question_id', q.id, 'prompt', q.prompt, 'type', q.type, 'config', q.config,
    'value', case q.position
      when 0 then to_jsonb(3)  when 1 then to_jsonb(3)
      when 2 then to_jsonb('OK'::text)  when 3 then to_jsonb(true)
      when 4 then to_jsonb(6)  when 5 then to_jsonb('Travelling for work — missed two cardio sessions, food stayed on point.'::text)
    end) order by q.position)
  from checkin_questions q where q.coach_id = (select coach from _ids) and not q.archived)
  where ci.client_id = (select marcus from _ids);

-- Sam (RED) gets a check-in from TWO weeks ago — he checked in before going quiet.
-- Deliberately NOT the current week, so his triage still reads "no check-in this
-- period" and he stays the at-risk story on the roster.
insert into check_ins (client_id, week_of, answers)
select (select sam from _ids),
       (current_date - extract(dow from current_date)::int) - 14,
       (select jsonb_agg(jsonb_build_object(
          'question_id', q.id, 'prompt', q.prompt, 'type', q.type, 'config', q.config,
          'value', case q.position
            when 0 then to_jsonb(2)  when 1 then to_jsonb(2)
            when 2 then to_jsonb('Poor'::text)  when 3 then to_jsonb(true)
            when 4 then to_jsonb(5)  when 5 then to_jsonb('Rough stretch, work blew up. Going to reset this week.'::text)
          end) order by q.position)
        from checkin_questions q where q.coach_id = (select coach from _ids) and not q.archived);

-- ── 3. Body measurements for the AMBER/RED clients (Maya already has hers) ─────
-- Six tape sessions across ~8 weeks so the per-site trend charts have a line to draw.
insert into body_measurements (user_id, logged_date, unit, neck, chest, waist, hips, arm, thigh) values
  -- Marcus (reverse diet — everything drifting gently UP as he adds calories)
  ((select marcus from _ids), current_date - 55, 'cm', 39.0, 104.0, 84.0, 100.0, 37.5, 60.0),
  ((select marcus from _ids), current_date - 44, 'cm', 39.1, 104.6, 84.4, 100.2, 37.8, 60.2),
  ((select marcus from _ids), current_date - 33, 'cm', 39.2, 105.1, 84.9, 100.4, 38.0, 60.5),
  ((select marcus from _ids), current_date - 22, 'cm', 39.3, 105.5, 85.3, 100.6, 38.2, 60.7),
  ((select marcus from _ids), current_date - 11, 'cm', 39.3, 105.8, 85.7, 100.8, 38.4, 60.9),
  ((select marcus from _ids), current_date - 0,  'cm', 39.4, 106.2, 86.0, 101.0, 38.6, 61.1),
  -- Sam (maintenance — essentially flat, a touch of drift while he's been off-plan)
  ((select sam from _ids), current_date - 55, 'cm', 40.0, 106.0, 90.0, 102.0, 36.0, 59.0),
  ((select sam from _ids), current_date - 44, 'cm', 40.1, 106.1, 90.3, 102.1, 36.0, 59.1),
  ((select sam from _ids), current_date - 33, 'cm', 40.1, 106.2, 90.6, 102.2, 36.1, 59.2),
  ((select sam from _ids), current_date - 22, 'cm', 40.2, 106.3, 90.9, 102.3, 36.1, 59.3),
  ((select sam from _ids), current_date - 11, 'cm', 40.2, 106.4, 91.2, 102.4, 36.2, 59.4),
  ((select sam from _ids), current_date - 0,  'cm', 40.2, 106.5, 91.5, 102.5, 36.2, 59.5);

-- ── 4. Coach reports (saved rows — no edge function / AI call needed) ──────────
-- content is the report body the coach reviewed & sent. Unread (read_at null) so
-- they surface as fresh on both the coach's "Sent reports" list and the client's app.
insert into reports (coach_id, client_id, content, week_of, created_at) values
  ((select coach from _ids), (select maya from _ids),
   E'# Weekly Report — Maya\n\n**Great week.** Nutrition adherence held at ~94% and your weekend stayed in range, which has been the hard part.\n\n- **Weight:** trending down gently, right on plan for the cut.\n- **Body comp:** waist down 5.5cm since we started while your arm is *up* — that''s a recomp the scale alone would hide. This is the win.\n- **Cardio & steps:** consistently clearing target.\n\n**This week:** hold protein where it is, keep the Zone-2 walks. Nothing to change — momentum is the strategy.',
   (current_date - extract(dow from current_date)::int), now() - interval '1 day'),
  ((select coach from _ids), (select marcus from _ids),
   E'# Weekly Report — Marcus\n\nReverse is doing exactly what it should: **weight is holding flat** while calories climb. That''s the goal.\n\n- **Watch-out:** cardio and steps dropped off during the travel week (1 session logged, steps ~7.4k vs 10k target).\n- **Nutrition:** on point at ~108% — good.\n\n**This week:** now you''re back, let''s re-anchor the daily walk and get two cardio sessions back on the board. Reply here with which days work.',
   (current_date - extract(dow from current_date)::int), now() - interval '2 days'),
  ((select coach from _ids), (select marcus from _ids),
   E'# Weekly Report — Marcus (prev week)\n\nSolid week. Weight steady, calories up another 100/day with no scale response — the reverse is working. Keep logging through the weekend and we''ll keep nudging intake up.',
   (current_date - extract(dow from current_date)::int) - 7, now() - interval '9 days'),
  ((select coach from _ids), (select sam from _ids),
   E'# Weekly Report — Sam\n\nLogging went quiet mid-week and I don''t have a check-in from you, so this one''s short.\n\n- Last few logged days were under target on calories and steps.\n- Weight''s drifted up a touch, which is fine — but I can''t coach what I can''t see.\n\n**This week:** just log. Even a rough day logged is worth more than a perfect day I never hear about. Let''s get a call on the calendar.',
   (current_date - extract(dow from current_date)::int) - 7, now() - interval '6 days');

-- ── 5. Message threads (coach ↔ client) ───────────────────────────────────────
-- sender_id = coach for coach messages, = client for client messages. Latest
-- incoming message left unread (read_at null) so the coach's bell shows a badge.
insert into messages (coach_id, client_id, sender_id, content, created_at, read_at) values
  ((select coach from _ids), (select maya from _ids), (select coach from _ids), 'Great work this week — the waist trend is really showing now.', now() - interval '3 days', now() - interval '3 days'),
  ((select coach from _ids), (select maya from _ids), (select maya from _ids),  'Thank you! Honestly feeling the best I have in a while.', now() - interval '2 days', now() - interval '2 days'),
  ((select coach from _ids), (select maya from _ids), (select coach from _ids), 'Love it. Same plan next week, we hold this.', now() - interval '2 days', now() - interval '1 day'),
  ((select coach from _ids), (select marcus from _ids), (select coach from _ids), 'How''s the travel going? Saw the cardio dip.', now() - interval '4 days', now() - interval '4 days'),
  ((select coach from _ids), (select marcus from _ids), (select marcus from _ids), 'Yeah, hotel week got me. Food was fine though.', now() - interval '3 days', now() - interval '3 days'),
  ((select coach from _ids), (select marcus from _ids), (select marcus from _ids), 'Back home now — ready to lock the walks back in.', now() - interval '5 hours', null),
  ((select coach from _ids), (select sam from _ids), (select coach from _ids), 'Haven''t seen a log in a few days — everything ok? Let''s find a time to talk.', now() - interval '2 days', now() - interval '2 days');

-- ── 6. Notifications (coach's bell) ───────────────────────────────────────────
insert into notifications (user_id, type, title, body, href, created_at) values
  ((select coach from _ids), 'message',   'New message from Marcus Webb',            'Back home now — ready to lock the walks back in.', '/', now() - interval '5 hours'),
  ((select coach from _ids), 'checkin',   'Marcus Webb submitted a check-in',        'Adherence 3/5 · energy 3/5 · missed 2 sessions',    '/', now() - interval '6 hours'),
  ((select coach from _ids), 'milestone', 'Maya Chen hit a 7-day logging streak 🎉', 'Longest streak yet — momentum is building.',        '/', now() - interval '1 day');

-- Mark Maya's 7-day milestone as already celebrated (streak card still shows the
-- live count; this just stops a stale "new milestone!" banner from re-firing).
update profiles set last_milestone_streak = 7 where id = (select maya from _ids);

-- ── 7. Private coach notes ────────────────────────────────────────────────────
insert into coach_notes (coach_id, client_id, content) values
  ((select coach from _ids), (select maya from _ids),   'Cutting well; recomp shows in the tape more than the scale. Keep reassuring her the weight stall is expected.'),
  ((select coach from _ids), (select marcus from _ids), 'Reverse on plan, weight holding. Cardio/steps drift whenever he travels — build a hotel-week fallback.'),
  ((select coach from _ids), (select sam from _ids),    'Went quiet ~5 days ago, no check-in this week. Was consistent before the gap. Nudge sent, needs a call.');

commit;

select 'walkthrough-extend: done' as status;

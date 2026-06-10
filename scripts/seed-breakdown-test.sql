-- ============================================================
-- gardnr — seed data to test the coach "weekday vs weekend" adherence panel
-- (ComplianceBreakdown on the client view).
--
-- Produces 6 weeks of nutrition logs for ONE client with a deliberate pattern:
--   • weekdays  ~2000 cal  → ON TARGET (target 2000, ±10% band = 1800–2200)
--   • weekends  ~2900 cal  → OVER by ~900
-- Expected panel result: "Adherence dips on weekends",
--   Weekdays "N of N on target", Weekends "0 of M on target · M over (avg +900 cal)".
--
-- HOW TO RUN
-- 1. This is the CLIENT's user id (the person the coach views), NOT the coach.
--    Supabase → Authentication → Users → copy the client's UUID.
-- 2. Replace YOUR_CLIENT_USER_ID below.
-- 3. Paste into Supabase → SQL Editor → Run. Safe to re-run (clears its own range first).
-- 4. Open the coach view of that client → "Logging consistency" section.
-- ============================================================

DO $$
DECLARE
  uid UUID := 'YOUR_CLIENT_USER_ID';
  d   DATE;
  cal INT;
BEGIN
  -- A calorie target is required for the panel to render.
  INSERT INTO targets (user_id, calories)
  VALUES (uid, 2000)
  ON CONFLICT (user_id) DO UPDATE SET calories = 2000;

  -- Clear the last 6 weeks so this is safe to re-run.
  DELETE FROM nutrition_log
  WHERE user_id = uid
    AND logged_date BETWEEN CURRENT_DATE - 41 AND CURRENT_DATE;

  FOR d IN SELECT generate_series(CURRENT_DATE - 41, CURRENT_DATE, INTERVAL '1 day')::date
  LOOP
    -- EXTRACT(DOW): 0 = Sunday, 6 = Saturday.
    IF EXTRACT(DOW FROM d) IN (0, 6) THEN
      cal := 2900;   -- weekend: over target
    ELSE
      cal := 2000;   -- weekday: on target
    END IF;

    INSERT INTO nutrition_log
      (user_id, logged_date, food, calories, protein, carbs, fat, serving_size, serving_unit)
    VALUES
      (uid, d, 'Test day total', cal, 150, ROUND(cal * 0.45 / 4), ROUND(cal * 0.30 / 9), 1, 'day');
  END LOOP;
END $$;

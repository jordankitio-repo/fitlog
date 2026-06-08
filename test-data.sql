-- ============================================================
-- gardnr — 30-day solo test data (May 10 → June 8, 2026)
-- 1. Go to Supabase Dashboard → Authentication → Users
-- 2. Copy your user UUID
-- 3. Replace e2843a0a-7602-440d-a77a-bf0c3b3aa60b below
-- 4. Paste entire script into Supabase SQL Editor → Run
-- ============================================================

DO $$
DECLARE
  uid UUID := 'YOUR_USER_ID_HERE';
BEGIN

-- Clear existing data for this range (safe to re-run)
DELETE FROM weight_log    WHERE user_id = uid AND logged_date BETWEEN '2026-05-10' AND '2026-06-08';
DELETE FROM nutrition_log WHERE user_id = uid AND logged_date BETWEEN '2026-05-10' AND '2026-06-08';
DELETE FROM cardio_log    WHERE user_id = uid AND logged_date BETWEEN '2026-05-10' AND '2026-06-08';
DELETE FROM steps_log     WHERE user_id = uid AND logged_date BETWEEN '2026-05-10' AND '2026-06-08';

-- ── WEIGHT (25 days, slight downward trend 185 → 182) ───────
INSERT INTO weight_log (user_id, logged_date, weight, unit, weighed_at) VALUES
(uid, '2026-05-10', 185.2, 'lbs', '07:45:00'),
(uid, '2026-05-11', 184.8, 'lbs', '08:00:00'),
(uid, '2026-05-13', 185.0, 'lbs', '07:30:00'),
(uid, '2026-05-14', 184.6, 'lbs', '07:40:00'),
(uid, '2026-05-15', 184.2, 'lbs', '07:35:00'),
(uid, '2026-05-17', 184.8, 'lbs', '08:15:00'),
(uid, '2026-05-18', 184.4, 'lbs', '08:00:00'),
(uid, '2026-05-19', 184.0, 'lbs', '07:30:00'),
(uid, '2026-05-20', 183.8, 'lbs', '07:45:00'),
(uid, '2026-05-21', 184.2, 'lbs', '07:30:00'),
(uid, '2026-05-23', 183.6, 'lbs', '07:40:00'),
(uid, '2026-05-24', 183.4, 'lbs', '08:05:00'),
(uid, '2026-05-25', 183.8, 'lbs', '07:50:00'),
(uid, '2026-05-26', 183.2, 'lbs', '07:30:00'),
(uid, '2026-05-27', 183.6, 'lbs', '07:45:00'),
(uid, '2026-05-29', 183.0, 'lbs', '07:35:00'),
(uid, '2026-05-30', 182.8, 'lbs', '07:40:00'),
(uid, '2026-05-31', 183.2, 'lbs', '08:10:00'),
(uid, '2026-06-01', 182.6, 'lbs', '07:30:00'),
(uid, '2026-06-02', 182.4, 'lbs', '07:45:00'),
(uid, '2026-06-04', 182.8, 'lbs', '07:35:00'),
(uid, '2026-06-05', 182.4, 'lbs', '07:30:00'),
(uid, '2026-06-06', 182.0, 'lbs', '07:40:00'),
(uid, '2026-06-07', 182.4, 'lbs', '07:32:00'),
(uid, '2026-06-08', 182.4, 'lbs', '07:30:00');

-- ── NUTRITION ───────────────────────────────────────────────
-- food | cal | protein | carbs | fat | serving_size | serving_unit
INSERT INTO nutrition_log (user_id, logged_date, food, calories, protein, carbs, fat, serving_size, serving_unit) VALUES
-- May 10
(uid,'2026-05-10','Greek Yogurt, Plain',130,23,9,0,1,'cup'),
(uid,'2026-05-10','Chicken Breast',280,52,0,6,6,'oz'),
(uid,'2026-05-10','Brown Rice',220,5,45,2,1,'cup'),
(uid,'2026-05-10','Almonds',160,6,6,14,1,'oz'),
-- May 11
(uid,'2026-05-11','Scrambled Eggs',210,18,2,14,3,'oz'),
(uid,'2026-05-11','Avocado Toast',290,8,32,15,2,'oz'),
(uid,'2026-05-11','Salmon',350,40,0,20,6,'oz'),
(uid,'2026-05-11','Sweet Potato',130,3,30,0,1,'oz'),
-- May 12
(uid,'2026-05-12','Protein Shake',200,30,10,3,1,'oz'),
(uid,'2026-05-12','Turkey Sandwich',380,28,42,10,1,'oz'),
(uid,'2026-05-12','Chicken Breast',280,52,0,6,6,'oz'),
(uid,'2026-05-12','Broccoli',55,4,11,1,1,'cup'),
-- May 13
(uid,'2026-05-13','Oatmeal with Berries',320,8,58,6,1,'cup'),
(uid,'2026-05-13','Tuna Salad',250,32,5,12,6,'oz'),
(uid,'2026-05-13','Pasta with Ground Beef',520,30,65,15,2,'cup'),
(uid,'2026-05-13','Apple',95,0,25,0,1,'oz'),
-- May 14
(uid,'2026-05-14','Greek Yogurt, Plain',130,23,9,0,1,'cup'),
(uid,'2026-05-14','Protein Bar',210,20,22,7,1,'oz'),
(uid,'2026-05-14','Chicken Breast',280,52,0,6,6,'oz'),
(uid,'2026-05-14','Mixed Greens Salad',60,2,10,1,2,'cup'),
(uid,'2026-05-14','Brown Rice',220,5,45,2,1,'cup'),
-- May 15
(uid,'2026-05-15','Scrambled Eggs',210,18,2,14,3,'oz'),
(uid,'2026-05-15','Turkey Sandwich',380,28,42,10,1,'oz'),
(uid,'2026-05-15','Steak',450,55,0,22,8,'oz'),
(uid,'2026-05-15','Banana',105,1,27,0,1,'oz'),
-- May 16
(uid,'2026-05-16','Protein Shake',200,30,10,3,1,'oz'),
(uid,'2026-05-16','Chicken Breast',280,52,0,6,6,'oz'),
(uid,'2026-05-16','White Rice',200,4,44,0,1,'cup'),
(uid,'2026-05-16','Mixed Vegetables',80,4,16,1,1,'cup'),
-- May 17
(uid,'2026-05-17','Oatmeal with Berries',320,8,58,6,1,'cup'),
(uid,'2026-05-17','Cottage Cheese',220,25,8,5,1,'cup'),
(uid,'2026-05-17','Salmon',350,40,0,20,6,'oz'),
(uid,'2026-05-17','Sweet Potato',130,3,30,0,1,'oz'),
-- May 18
(uid,'2026-05-18','Avocado Toast',290,8,32,15,2,'oz'),
(uid,'2026-05-18','Scrambled Eggs',210,18,2,14,3,'oz'),
(uid,'2026-05-18','Tuna Salad',250,32,5,12,6,'oz'),
(uid,'2026-05-18','Apple',95,0,25,0,1,'oz'),
-- May 19
(uid,'2026-05-19','Greek Yogurt, Plain',130,23,9,0,1,'cup'),
(uid,'2026-05-19','Protein Bar',210,20,22,7,1,'oz'),
(uid,'2026-05-19','Chicken Breast',280,52,0,6,6,'oz'),
(uid,'2026-05-19','Brown Rice',220,5,45,2,1,'cup'),
(uid,'2026-05-19','Broccoli',55,4,11,1,1,'cup'),
-- May 20
(uid,'2026-05-20','Protein Shake',200,30,10,3,1,'oz'),
(uid,'2026-05-20','Turkey Sandwich',380,28,42,10,1,'oz'),
(uid,'2026-05-20','Pasta with Ground Beef',520,30,65,15,2,'cup'),
(uid,'2026-05-20','Almonds',160,6,6,14,1,'oz'),
-- May 21
(uid,'2026-05-21','Scrambled Eggs',210,18,2,14,3,'oz'),
(uid,'2026-05-21','Whole Wheat Toast',140,6,26,2,2,'oz'),
(uid,'2026-05-21','Chicken Breast',280,52,0,6,6,'oz'),
(uid,'2026-05-21','Mixed Greens Salad',60,2,10,1,2,'cup'),
(uid,'2026-05-21','White Rice',200,4,44,0,1,'cup'),
-- May 22
(uid,'2026-05-22','Oatmeal with Berries',320,8,58,6,1,'cup'),
(uid,'2026-05-22','Tuna Salad',250,32,5,12,6,'oz'),
(uid,'2026-05-22','Salmon',350,40,0,20,6,'oz'),
(uid,'2026-05-22','Banana',105,1,27,0,1,'oz'),
-- May 23
(uid,'2026-05-23','Greek Yogurt, Plain',130,23,9,0,1,'cup'),
(uid,'2026-05-23','Protein Shake',200,30,10,3,1,'oz'),
(uid,'2026-05-23','Chicken Breast',280,52,0,6,6,'oz'),
(uid,'2026-05-23','Mixed Vegetables',80,4,16,1,1,'cup'),
(uid,'2026-05-23','Steak',450,55,0,22,8,'oz'),
-- May 24
(uid,'2026-05-24','Avocado Toast',290,8,32,15,2,'oz'),
(uid,'2026-05-24','Scrambled Eggs',210,18,2,14,3,'oz'),
(uid,'2026-05-24','Turkey Sandwich',380,28,42,10,1,'oz'),
(uid,'2026-05-24','Protein Bar',210,20,22,7,1,'oz'),
-- May 25
(uid,'2026-05-25','Oatmeal with Berries',320,8,58,6,1,'cup'),
(uid,'2026-05-25','Cottage Cheese',220,25,8,5,1,'cup'),
(uid,'2026-05-25','Pasta with Ground Beef',520,30,65,15,2,'cup'),
(uid,'2026-05-25','Apple',95,0,25,0,1,'oz'),
-- May 26
(uid,'2026-05-26','Protein Shake',200,30,10,3,1,'oz'),
(uid,'2026-05-26','Chicken Breast',280,52,0,6,6,'oz'),
(uid,'2026-05-26','Brown Rice',220,5,45,2,1,'cup'),
(uid,'2026-05-26','Broccoli',55,4,11,1,1,'cup'),
(uid,'2026-05-26','Almonds',160,6,6,14,1,'oz'),
-- May 27
(uid,'2026-05-27','Greek Yogurt, Plain',130,23,9,0,1,'cup'),
(uid,'2026-05-27','Turkey Sandwich',380,28,42,10,1,'oz'),
(uid,'2026-05-27','Salmon',350,40,0,20,6,'oz'),
(uid,'2026-05-27','Sweet Potato',130,3,30,0,1,'oz'),
-- May 28
(uid,'2026-05-28','Scrambled Eggs',210,18,2,14,3,'oz'),
(uid,'2026-05-28','Protein Bar',210,20,22,7,1,'oz'),
(uid,'2026-05-28','Chicken Breast',280,52,0,6,6,'oz'),
(uid,'2026-05-28','Mixed Greens Salad',60,2,10,1,2,'cup'),
(uid,'2026-05-28','White Rice',200,4,44,0,1,'cup'),
-- May 29
(uid,'2026-05-29','Protein Shake',200,30,10,3,1,'oz'),
(uid,'2026-05-29','Oatmeal with Berries',320,8,58,6,1,'cup'),
(uid,'2026-05-29','Tuna Salad',250,32,5,12,6,'oz'),
(uid,'2026-05-29','Banana',105,1,27,0,1,'oz'),
-- May 30
(uid,'2026-05-30','Greek Yogurt, Plain',130,23,9,0,1,'cup'),
(uid,'2026-05-30','Chicken Breast',280,52,0,6,6,'oz'),
(uid,'2026-05-30','Brown Rice',220,5,45,2,1,'cup'),
(uid,'2026-05-30','Steak',450,55,0,22,8,'oz'),
(uid,'2026-05-30','Mixed Vegetables',80,4,16,1,1,'cup'),
-- May 31
(uid,'2026-05-31','Avocado Toast',290,8,32,15,2,'oz'),
(uid,'2026-05-31','Cottage Cheese',220,25,8,5,1,'cup'),
(uid,'2026-05-31','Salmon',350,40,0,20,6,'oz'),
(uid,'2026-05-31','Sweet Potato',130,3,30,0,1,'oz'),
-- June 1
(uid,'2026-06-01','Oatmeal with Berries',320,8,58,6,1,'cup'),
(uid,'2026-06-01','Turkey Sandwich',380,28,42,10,1,'oz'),
(uid,'2026-06-01','Pasta with Ground Beef',520,30,65,15,2,'cup'),
(uid,'2026-06-01','Apple',95,0,25,0,1,'oz'),
-- June 2
(uid,'2026-06-02','Protein Shake',200,30,10,3,1,'oz'),
(uid,'2026-06-02','Chicken Breast',280,52,0,6,6,'oz'),
(uid,'2026-06-02','Brown Rice',220,5,45,2,1,'cup'),
(uid,'2026-06-02','Broccoli',55,4,11,1,1,'cup'),
(uid,'2026-06-02','Protein Bar',210,20,22,7,1,'oz'),
-- June 3
(uid,'2026-06-03','Greek Yogurt, Plain',130,23,9,0,1,'cup'),
(uid,'2026-06-03','Tuna Salad',250,32,5,12,6,'oz'),
(uid,'2026-06-03','Steak',450,55,0,22,8,'oz'),
(uid,'2026-06-03','Almonds',160,6,6,14,1,'oz'),
-- June 4
(uid,'2026-06-04','Scrambled Eggs',210,18,2,14,3,'oz'),
(uid,'2026-06-04','Protein Shake',200,30,10,3,1,'oz'),
(uid,'2026-06-04','Chicken Breast',280,52,0,6,6,'oz'),
(uid,'2026-06-04','Mixed Greens Salad',60,2,10,1,2,'cup'),
(uid,'2026-06-04','White Rice',200,4,44,0,1,'cup'),
-- June 5
(uid,'2026-06-05','Oatmeal with Berries',320,8,58,6,1,'cup'),
(uid,'2026-06-05','Turkey Sandwich',380,28,42,10,1,'oz'),
(uid,'2026-06-05','Salmon',350,40,0,20,6,'oz'),
(uid,'2026-06-05','Sweet Potato',130,3,30,0,1,'oz'),
(uid,'2026-06-05','Banana',105,1,27,0,1,'oz'),
-- June 6
(uid,'2026-06-06','Greek Yogurt, Plain',130,23,9,0,1,'cup'),
(uid,'2026-06-06','Chicken Breast',280,52,0,6,6,'oz'),
(uid,'2026-06-06','Brown Rice',220,5,45,2,1,'cup'),
(uid,'2026-06-06','Broccoli',55,4,11,1,1,'cup'),
(uid,'2026-06-06','Protein Bar',210,20,22,7,1,'oz'),
-- June 7 (matches mockup layout)
(uid,'2026-06-07','Greek Yogurt, Plain',130,23,9,0,1,'cup'),
(uid,'2026-06-07','Chicken Breast',280,52,0,6,6,'oz'),
(uid,'2026-06-07','Brown Rice',220,5,45,2,1,'cup'),
(uid,'2026-06-07','Scrambled Eggs',210,18,2,14,3,'oz'),
(uid,'2026-06-07','Oatmeal with Berries',320,8,58,6,1,'cup'),
(uid,'2026-06-07','Salmon',350,40,0,20,6,'oz'),
(uid,'2026-06-07','Sweet Potato',130,3,30,0,1,'oz'),
(uid,'2026-06-07','Almonds',160,6,6,14,1,'oz'),
-- June 8 (today — partial day)
(uid,'2026-06-08','Greek Yogurt, Plain',130,23,9,0,1,'cup'),
(uid,'2026-06-08','Protein Shake',200,30,10,3,1,'oz'),
(uid,'2026-06-08','Chicken Breast',280,52,0,6,6,'oz');

-- ── CARDIO (18 sessions, ~4-5x/week) ────────────────────────
INSERT INTO cardio_log (user_id, logged_date, exercise_type, duration, calories_burned, avg_heart_rate) VALUES
(uid,'2026-05-10','Running',35,340,148),
(uid,'2026-05-12','Running',40,385,152),
(uid,'2026-05-14','HIIT',30,350,162),
(uid,'2026-05-16','Cycling',45,420,138),
(uid,'2026-05-17','Walking',40,175,102),
(uid,'2026-05-19','Running',38,365,150),
(uid,'2026-05-21','HIIT',28,320,165),
(uid,'2026-05-23','Running',42,400,153),
(uid,'2026-05-24','Cycling',50,460,135),
(uid,'2026-05-26','Running',35,340,148),
(uid,'2026-05-28','Elliptical',45,390,132),
(uid,'2026-05-30','Running',40,385,150),
(uid,'2026-05-31','Walking',35,155,98),
(uid,'2026-06-02','Running',38,365,149),
(uid,'2026-06-04','HIIT',32,370,163),
(uid,'2026-06-05','Cycling',45,420,136),
(uid,'2026-06-06','Running',35,335,147),
(uid,'2026-06-07','Running',32,298,142),
(uid,'2026-06-08','Walking',40,178,105);

-- ── STEPS (28 days) ──────────────────────────────────────────
INSERT INTO steps_log (user_id, logged_date, steps, distance) VALUES
(uid,'2026-05-10',8420,3.9),
(uid,'2026-05-11',6850,3.2),
(uid,'2026-05-12',9100,4.3),
(uid,'2026-05-13',7230,3.4),
(uid,'2026-05-14',8900,4.2),
(uid,'2026-05-15',6540,3.1),
(uid,'2026-05-16',10200,4.8),
(uid,'2026-05-17',7800,3.7),
(uid,'2026-05-18',5900,2.8),
(uid,'2026-05-19',9400,4.4),
(uid,'2026-05-20',7650,3.6),
(uid,'2026-05-21',8800,4.1),
(uid,'2026-05-22',6300,3.0),
(uid,'2026-05-23',10500,4.9),
(uid,'2026-05-24',9200,4.3),
(uid,'2026-05-25',5400,2.5),
(uid,'2026-05-26',9800,4.6),
(uid,'2026-05-27',7400,3.5),
(uid,'2026-05-28',8600,4.0),
(uid,'2026-05-29',6800,3.2),
(uid,'2026-05-30',11200,5.3),
(uid,'2026-05-31',7600,3.6),
(uid,'2026-06-01',5800,2.7),
(uid,'2026-06-02',9600,4.5),
(uid,'2026-06-03',7200,3.4),
(uid,'2026-06-04',8400,3.9),
(uid,'2026-06-05',9000,4.2),
(uid,'2026-06-06',10800,5.1),
(uid,'2026-06-07',7420,3.4),
(uid,'2026-06-08',6200,2.9);

END $$;

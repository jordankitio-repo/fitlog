


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_email_status"("p_email" "text") RETURNS TABLE("id" "uuid", "role" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.id, p.role
  from public.profiles p
  where p.email = lower(p_email)
  limit 1;
$$;


ALTER FUNCTION "public"."invite_email_status"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_profile_related"("target" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    target = auth.uid()
    or exists (
      select 1
      from public.coach_clients cc
      where cc.status = 'active'
        and (
          (cc.coach_id = auth.uid() and cc.client_id = target)
          or (cc.client_id = auth.uid() and cc.coach_id = target)
        )
    );
$$;


ALTER FUNCTION "public"."is_profile_related"("target" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."cardio_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "exercise_type" "text" NOT NULL,
    "duration" integer NOT NULL,
    "calories_burned" integer,
    "avg_heart_rate" integer,
    "logged_date" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cardio_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."check_ins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "week_of" "date" NOT NULL,
    "adherence_rating" integer,
    "energy_level" integer,
    "obstacles" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."check_ins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid",
    "client_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "lock_cleared_at" timestamp with time zone,
    "offboarded_at" timestamp with time zone,
    "hide_calories" boolean DEFAULT false NOT NULL,
    "last_nudged_at" timestamp with time zone,
    CONSTRAINT "coach_clients_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'offboarded'::"text"])))
);


ALTER TABLE "public"."coach_clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid",
    "client_id" "uuid",
    "content" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."coach_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid",
    "client_email" "text" NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"(),
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "account_exists" boolean DEFAULT false NOT NULL,
    CONSTRAINT "invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text"])))
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid",
    "client_id" "uuid",
    "sender_id" "uuid",
    "content" "text" NOT NULL,
    "reaction" "text",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "href" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutrition_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "food" "text" NOT NULL,
    "calories" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    "protein" integer DEFAULT 0,
    "carbs" integer DEFAULT 0,
    "fat" integer DEFAULT 0,
    "serving_size" integer DEFAULT 100,
    "serving_unit" "text" DEFAULT 'g'::"text",
    "logged_date" "date" DEFAULT CURRENT_DATE
);


ALTER TABLE "public"."nutrition_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "role" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_milestone_streak" integer DEFAULT 0,
    "offboarded_at" timestamp with time zone,
    "offboard_reason" "text",
    "layout" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['solo'::"text", 'coach'::"text", 'client'::"text"])))
);

ALTER TABLE ONLY "public"."profiles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid",
    "client_id" "uuid",
    "content" "text" NOT NULL,
    "week_of" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "read_at" timestamp with time zone,
    "archived" boolean DEFAULT false
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."steps_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "steps" integer NOT NULL,
    "distance" numeric(5,2),
    "logged_date" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."steps_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid",
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "stripe_price_id" "text",
    "status" "text",
    "trial_end" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "solo_id" "uuid",
    "paused_for_coaching" boolean DEFAULT false NOT NULL,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "paused_trial_days_remaining" integer
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "calories" integer,
    "protein" integer,
    "carbs" integer,
    "fat" integer,
    "weight_goal" numeric(5,2),
    "weight_goal_unit" "text" DEFAULT 'lbs'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "cardio_minutes" integer,
    "steps" integer
);


ALTER TABLE "public"."targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trial_ledger" (
    "email_hash" "text" NOT NULL,
    "coach_trial_used" boolean DEFAULT false NOT NULL,
    "solo_trial_used" boolean DEFAULT false NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."trial_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weight_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "weight" numeric(5,2) NOT NULL,
    "unit" "text" DEFAULT 'lbs'::"text",
    "logged_date" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "weighed_at" time without time zone
);


ALTER TABLE "public"."weight_log" OWNER TO "postgres";


ALTER TABLE ONLY "public"."cardio_log"
    ADD CONSTRAINT "cardio_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."check_ins"
    ADD CONSTRAINT "check_ins_client_id_week_of_key" UNIQUE ("client_id", "week_of");



ALTER TABLE ONLY "public"."check_ins"
    ADD CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_clients"
    ADD CONSTRAINT "coach_clients_coach_id_client_id_key" UNIQUE ("coach_id", "client_id");



ALTER TABLE ONLY "public"."coach_clients"
    ADD CONSTRAINT "coach_clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_notes"
    ADD CONSTRAINT "coach_notes_coach_id_client_id_key" UNIQUE ("coach_id", "client_id");



ALTER TABLE ONLY "public"."coach_notes"
    ADD CONSTRAINT "coach_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_log"
    ADD CONSTRAINT "nutrition_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."steps_log"
    ADD CONSTRAINT "steps_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."steps_log"
    ADD CONSTRAINT "steps_log_user_date_key" UNIQUE ("user_id", "logged_date");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_coach_id_unique" UNIQUE ("coach_id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."targets"
    ADD CONSTRAINT "targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."targets"
    ADD CONSTRAINT "targets_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."trial_ledger"
    ADD CONSTRAINT "trial_ledger_pkey" PRIMARY KEY ("email_hash");



ALTER TABLE ONLY "public"."weight_log"
    ADD CONSTRAINT "weight_log_pkey" PRIMARY KEY ("id");



CREATE INDEX "notifications_user_created_idx" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "trial_ledger_email_hash_key" ON "public"."trial_ledger" USING "btree" ("email_hash");



ALTER TABLE ONLY "public"."check_ins"
    ADD CONSTRAINT "check_ins_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_clients"
    ADD CONSTRAINT "coach_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_clients"
    ADD CONSTRAINT "coach_clients_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_notes"
    ADD CONSTRAINT "coach_notes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_notes"
    ADD CONSTRAINT "coach_notes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_solo_id_fkey" FOREIGN KEY ("solo_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."targets"
    ADD CONSTRAINT "targets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can read invitation by token" ON "public"."invitations" FOR SELECT USING (true);



CREATE POLICY "Clients can manage their own check-ins" ON "public"."check_ins" USING (("auth"."uid"() = "client_id"));



CREATE POLICY "Clients can read their relationships" ON "public"."coach_clients" FOR SELECT USING (("auth"."uid"() = "client_id"));



CREATE POLICY "Clients can read their reports" ON "public"."reports" FOR SELECT USING (("auth"."uid"() = "client_id"));



CREATE POLICY "Clients can update their report read status" ON "public"."reports" FOR UPDATE USING (("auth"."uid"() = "client_id")) WITH CHECK (("auth"."uid"() = "client_id"));



CREATE POLICY "Coaches can manage their invitations" ON "public"."invitations" USING (("auth"."uid"() = "coach_id"));



CREATE POLICY "Coaches can manage their own notes" ON "public"."coach_notes" USING (("auth"."uid"() = "coach_id"));



CREATE POLICY "Coaches can manage their reports" ON "public"."reports" USING (("auth"."uid"() = "coach_id"));



CREATE POLICY "Coaches can read client cardio" ON "public"."cardio_log" FOR SELECT USING (("auth"."uid"() IN ( SELECT "coach_clients"."coach_id"
   FROM "public"."coach_clients"
  WHERE ("coach_clients"."client_id" = "cardio_log"."user_id"))));



CREATE POLICY "Coaches can read client check-ins" ON "public"."check_ins" FOR SELECT USING (("auth"."uid"() IN ( SELECT "coach_clients"."coach_id"
   FROM "public"."coach_clients"
  WHERE ("coach_clients"."client_id" = "check_ins"."client_id"))));



CREATE POLICY "Coaches can read client steps" ON "public"."steps_log" FOR SELECT USING (("auth"."uid"() IN ( SELECT "coach_clients"."coach_id"
   FROM "public"."coach_clients"
  WHERE ("coach_clients"."client_id" = "steps_log"."user_id"))));



CREATE POLICY "Coaches can read clients nutrition logs" ON "public"."nutrition_log" FOR SELECT USING (("auth"."uid"() IN ( SELECT "coach_clients"."coach_id"
   FROM "public"."coach_clients"
  WHERE ("coach_clients"."client_id" = "nutrition_log"."user_id"))));



CREATE POLICY "Coaches can read clients weight logs" ON "public"."weight_log" FOR SELECT USING (("auth"."uid"() IN ( SELECT "coach_clients"."coach_id"
   FROM "public"."coach_clients"
  WHERE ("coach_clients"."client_id" = "weight_log"."user_id"))));



CREATE POLICY "Coaches can read their relationships" ON "public"."coach_clients" FOR SELECT USING (("auth"."uid"() = "coach_id"));



CREATE POLICY "Coaches can set targets for their clients" ON "public"."targets" USING (("auth"."uid"() IN ( SELECT "coach_clients"."coach_id"
   FROM "public"."coach_clients"
  WHERE ("coach_clients"."client_id" = "targets"."user_id"))));



CREATE POLICY "Coaches can update relationships" ON "public"."coach_clients" FOR UPDATE USING (("auth"."uid"() = "coach_id"));



CREATE POLICY "Coaches can view own subscription" ON "public"."subscriptions" FOR SELECT TO "authenticated" USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "Solo users can view own subscription" ON "public"."subscriptions" FOR SELECT TO "authenticated" USING (("solo_id" = "auth"."uid"()));



CREATE POLICY "Users can create their relationships" ON "public"."coach_clients" FOR INSERT WITH CHECK ((("auth"."uid"() = "coach_id") OR ("auth"."uid"() = "client_id")));



CREATE POLICY "Users can delete own entries" ON "public"."nutrition_log" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own weight" ON "public"."weight_log" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own entries" ON "public"."nutrition_log" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own weight" ON "public"."weight_log" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own cardio" ON "public"."cardio_log" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own steps" ON "public"."steps_log" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own targets" ON "public"."targets" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own entries" ON "public"."nutrition_log" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own weight" ON "public"."weight_log" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own entries" ON "public"."nutrition_log" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own weight" ON "public"."weight_log" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."cardio_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."check_ins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_clients_insert_by_client" ON "public"."coach_clients" FOR INSERT TO "authenticated" WITH CHECK (("client_id" = "auth"."uid"()));



CREATE POLICY "coach_clients_update_by_client" ON "public"."coach_clients" FOR UPDATE TO "authenticated" USING (("client_id" = "auth"."uid"())) WITH CHECK (("client_id" = "auth"."uid"()));



CREATE POLICY "coach_clients_update_by_coach" ON "public"."coach_clients" FOR UPDATE USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



ALTER TABLE "public"."coach_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."nutrition_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_self" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_select_self_or_related" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."is_profile_related"("id"));



CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."steps_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."targets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trial_ledger" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_access_own_messages" ON "public"."messages" USING ((("coach_id" = "auth"."uid"()) OR ("client_id" = "auth"."uid"()))) WITH CHECK ((("coach_id" = "auth"."uid"()) OR ("client_id" = "auth"."uid"())));



ALTER TABLE "public"."weight_log" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."invite_email_status"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invite_email_status"("p_email" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_profile_related"("target" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_profile_related"("target" "uuid") TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cardio_log" TO "anon";
GRANT ALL ON TABLE "public"."cardio_log" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cardio_log" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."check_ins" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."check_ins" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."check_ins" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."coach_clients" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."coach_clients" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."coach_clients" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."coach_notes" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."coach_notes" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."coach_notes" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."invitations" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."invitations" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."invitations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."messages" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notifications" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."nutrition_log" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_log" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."nutrition_log" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."profiles" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reports" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."steps_log" TO "anon";
GRANT ALL ON TABLE "public"."steps_log" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."steps_log" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."subscriptions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."targets" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."targets" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."targets" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."trial_ledger" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."weight_log" TO "anon";
GRANT ALL ON TABLE "public"."weight_log" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."weight_log" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";








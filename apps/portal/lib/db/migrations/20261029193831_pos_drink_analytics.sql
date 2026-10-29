CREATE TABLE "pos_drink_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"menu_version" integer NOT NULL,
	"drink_name" text NOT NULL,
	"configuration" jsonb NOT NULL,
	"espresso_shots" integer DEFAULT 2 NOT NULL,
	"quantity" integer NOT NULL,
	"submission_id" uuid NOT NULL,
	"line_index" integer NOT NULL,
	"request_hash" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" text NOT NULL,
	"kerb" text,
	"voided_at" timestamp with time zone,
	"voided_by" text,
	"void_reason" text,
	"replaces_log_id" uuid,
	"mutation_id" uuid,
	"mutation_hash" text,
	CONSTRAINT "pos_log_quantity" CHECK ("pos_drink_logs"."quantity" > 0),
	CONSTRAINT "pos_log_double" CHECK ("pos_drink_logs"."espresso_shots" = 2),
	CONSTRAINT "pos_log_line" CHECK ("pos_drink_logs"."line_index" >= 0),
	CONSTRAINT "pos_log_void_metadata" CHECK (("pos_drink_logs"."voided_at" IS NULL AND "pos_drink_logs"."voided_by" IS NULL AND "pos_drink_logs"."void_reason" IS NULL) OR ("pos_drink_logs"."voided_at" IS NOT NULL AND "pos_drink_logs"."voided_by" IS NOT NULL AND "pos_drink_logs"."void_reason" IS NOT NULL AND length(trim("pos_drink_logs"."void_reason")) > 0))
);

ALTER TABLE "pos_drink_logs" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "pos_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pos_event_window" CHECK ("pos_events"."ends_at" > "pos_events"."starts_at"),
	CONSTRAINT "pos_event_name" CHECK (length(trim("pos_events"."name")) > 0)
);

ALTER TABLE "pos_events" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "pos_event_menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"options" jsonb NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "pos_menu_event_id" UNIQUE("event_id","id"),
	CONSTRAINT "pos_menu_version" CHECK ("pos_event_menu_items"."version" > 0)
);

ALTER TABLE "pos_event_menu_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "pos_drink_logs" ADD CONSTRAINT "pos_drink_logs_event_id_pos_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."pos_events"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "pos_drink_logs" ADD CONSTRAINT "pos_drink_logs_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "pos_drink_logs" ADD CONSTRAINT "pos_drink_logs_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "pos_drink_logs" ADD CONSTRAINT "pos_drink_logs_replaces_log_id_pos_drink_logs_id_fk" FOREIGN KEY ("replaces_log_id") REFERENCES "public"."pos_drink_logs"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "pos_drink_logs" ADD CONSTRAINT "pos_log_menu_event" FOREIGN KEY ("event_id","menu_item_id") REFERENCES "public"."pos_event_menu_items"("event_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "pos_events" ADD CONSTRAINT "pos_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "pos_event_menu_items" ADD CONSTRAINT "pos_event_menu_items_event_id_pos_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."pos_events"("id") ON DELETE no action ON UPDATE no action;

CREATE UNIQUE INDEX "pos_original_submission_line" ON "pos_drink_logs" USING btree ("event_id","submission_id","line_index") WHERE "pos_drink_logs"."replaces_log_id" IS NULL;

CREATE UNIQUE INDEX "pos_log_replacement" ON "pos_drink_logs" USING btree ("replaces_log_id") WHERE "pos_drink_logs"."replaces_log_id" IS NOT NULL;

CREATE UNIQUE INDEX "pos_log_mutation" ON "pos_drink_logs" USING btree ("mutation_id") WHERE "pos_drink_logs"."mutation_id" IS NOT NULL;

CREATE INDEX "pos_valid_logs_time" ON "pos_drink_logs" USING btree ("event_id","recorded_at") WHERE "pos_drink_logs"."voided_at" IS NULL;

CREATE INDEX "pos_menu_sort" ON "pos_event_menu_items" USING btree ("event_id","sort_order");

REVOKE ALL ON TABLE pos_events, pos_event_menu_items, pos_drink_logs FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE pos_events, pos_event_menu_items, pos_drink_logs FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE pos_events, pos_event_menu_items, pos_drink_logs FROM authenticated;
  END IF;
END $$;

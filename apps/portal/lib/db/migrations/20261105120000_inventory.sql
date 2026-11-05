-- Inventory tab: additive tables only. No POS table is altered.
-- inventory_menu_links cascades with pos_event_menu_items, so the existing POS event deletion keeps working.

CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"unit" text NOT NULL,
	"bag_size" double precision DEFAULT 0 NOT NULL,
	"sealed_bags" double precision DEFAULT 0 NOT NULL,
	"open_bag" double precision DEFAULT 0 NOT NULL,
	"counted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"par" double precision DEFAULT 0 NOT NULL,
	"cost_per_unit" double precision DEFAULT 0 NOT NULL,
	"supplier" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "inventory_item_name" UNIQUE("name"),
	CONSTRAINT "inventory_item_unit" CHECK ("inventory_items"."unit" IN ('ml', 'g', 'each')),
	CONSTRAINT "inventory_item_name_present" CHECK (length(trim("inventory_items"."name")) > 0),
	CONSTRAINT "inventory_item_amounts" CHECK ("inventory_items"."bag_size" >= 0 AND "inventory_items"."sealed_bags" >= 0 AND "inventory_items"."open_bag" >= 0 AND "inventory_items"."par" >= 0 AND "inventory_items"."cost_per_unit" >= 0),
	CONSTRAINT "inventory_item_version" CHECK ("inventory_items"."version" > 0)
);

ALTER TABLE "inventory_items" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "inventory_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"published" jsonb,
	"draft" jsonb,
	"published_version" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "inventory_recipe_slug" UNIQUE("slug"),
	CONSTRAINT "inventory_recipe_body" CHECK ("inventory_recipes"."published" IS NOT NULL OR "inventory_recipes"."draft" IS NOT NULL),
	CONSTRAINT "inventory_recipe_version" CHECK ("inventory_recipes"."version" > 0 AND "inventory_recipes"."published_version" >= 0)
);

ALTER TABLE "inventory_recipes" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "inventory_equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"custodian" text DEFAULT '' NOT NULL,
	"serial" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"last_checked_at" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "inventory_equipment_name" UNIQUE("name"),
	CONSTRAINT "inventory_equipment_status" CHECK ("inventory_equipment"."status" IN ('ok', 'repair', 'loaned', 'missing', 'retired')),
	CONSTRAINT "inventory_equipment_quantity" CHECK ("inventory_equipment"."quantity" >= 0),
	CONSTRAINT "inventory_equipment_name_present" CHECK (length(trim("inventory_equipment"."name")) > 0),
	CONSTRAINT "inventory_equipment_version" CHECK ("inventory_equipment"."version" > 0)
);

ALTER TABLE "inventory_equipment" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "inventory_menu_links" (
	"menu_item_id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"recipe_id" uuid,
	"planned_servings" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "inventory_link_planned" CHECK ("inventory_menu_links"."planned_servings" >= 0)
);

ALTER TABLE "inventory_menu_links" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "inventory_recipes" ADD CONSTRAINT "inventory_recipes_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "inventory_recipes" ADD CONSTRAINT "inventory_recipes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "inventory_equipment" ADD CONSTRAINT "inventory_equipment_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "inventory_menu_links" ADD CONSTRAINT "inventory_menu_links_recipe_id_inventory_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."inventory_recipes"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "inventory_menu_links" ADD CONSTRAINT "inventory_menu_links_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "inventory_menu_links" ADD CONSTRAINT "inventory_link_menu_item" FOREIGN KEY ("event_id","menu_item_id") REFERENCES "public"."pos_event_menu_items"("event_id","id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "inventory_link_event" ON "inventory_menu_links" USING btree ("event_id");

CREATE INDEX "inventory_link_recipe" ON "inventory_menu_links" USING btree ("recipe_id");

REVOKE ALL ON TABLE inventory_items, inventory_recipes, inventory_equipment, inventory_menu_links FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE inventory_items, inventory_recipes, inventory_equipment, inventory_menu_links FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE inventory_items, inventory_recipes, inventory_equipment, inventory_menu_links FROM authenticated;
  END IF;
END $$;

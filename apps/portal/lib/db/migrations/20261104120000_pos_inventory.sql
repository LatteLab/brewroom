CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"on_hand" numeric DEFAULT 0 NOT NULL,
	"low_at" numeric DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "inventory_item_name" UNIQUE("name"),
	CONSTRAINT "inventory_item_name_present" CHECK (length(trim("inventory_items"."name")) > 0),
	CONSTRAINT "inventory_item_unit" CHECK ("inventory_items"."unit" IN ('ml', 'g', 'each')),
	CONSTRAINT "inventory_item_on_hand" CHECK ("inventory_items"."on_hand" >= 0),
	CONSTRAINT "inventory_item_low_at" CHECK ("inventory_items"."low_at" >= 0)
);

ALTER TABLE "inventory_items" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "pos_menu_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric NOT NULL,
	"applies_when" text DEFAULT 'always' NOT NULL,
	"scales_with_syrup" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pos_ingredient_quantity" CHECK ("pos_menu_ingredients"."quantity" > 0),
	CONSTRAINT "pos_ingredient_condition" CHECK ("pos_menu_ingredients"."applies_when" IN ('always', 'hot', 'iced', 'whole', 'oat'))
);

ALTER TABLE "pos_menu_ingredients" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "pos_menu_ingredients" ADD CONSTRAINT "pos_menu_ingredients_menu_item_id_pos_event_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."pos_event_menu_items"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "pos_menu_ingredients" ADD CONSTRAINT "pos_menu_ingredients_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "pos_ingredient_menu_item" ON "pos_menu_ingredients" USING btree ("menu_item_id","sort_order");

CREATE INDEX "pos_ingredient_item" ON "pos_menu_ingredients" USING btree ("item_id");

REVOKE ALL ON TABLE inventory_items, pos_menu_ingredients FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE inventory_items, pos_menu_ingredients FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE inventory_items, pos_menu_ingredients FROM authenticated;
  END IF;
END $$;

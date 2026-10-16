CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'cancelled', 'expired', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('valid', 'used', 'cancelled');--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"quantity" smallint NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"fee_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'eur' NOT NULL,
	"test_mode" boolean DEFAULT false NOT NULL,
	"stripe_account_id" text,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_quantity_check" CHECK ("orders"."quantity" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text DEFAULT 'Entrée' NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"capacity" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_types_price_check" CHECK ("ticket_types"."price_cents" >= 0),
	CONSTRAINT "ticket_types_capacity_check" CHECK ("ticket_types"."capacity" is null or "ticket_types"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"status" "ticket_status" DEFAULT 'valid' NOT NULL,
	"kid" smallint NOT NULL,
	"signature" "bytea" NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "tickets_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_kid_signing_keys_kid_fk" FOREIGN KEY ("kid") REFERENCES "public"."signing_keys"("kid") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_used_by_user_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_stripe_session_key" ON "orders" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE INDEX "orders_event_idx" ON "orders" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_types_event_key" ON "ticket_types" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "tickets_event_idx" ON "tickets" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "tickets_user_idx" ON "tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tickets_order_idx" ON "tickets" USING btree ("order_id");
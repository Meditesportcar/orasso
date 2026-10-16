ALTER TYPE "public"."notification_family" ADD VALUE 'account';--> statement-breakpoint
CREATE TABLE "known_logins" (
	"user_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"label" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "known_logins_pkey" PRIMARY KEY("user_id","fingerprint")
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp with time zone,
	"aaguid" text
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "in_journal" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "point_entries" ADD COLUMN "subject_user_id" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "muted_types" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "home_widgets" jsonb;--> statement-breakpoint
ALTER TABLE "known_logins" ADD CONSTRAINT "known_logins_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "known_logins_last_seen_idx" ON "known_logins" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "passkey_user_id_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_credential_id_idx" ON "passkey" USING btree ("credential_id");--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_subject_user_id_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_once_per_event_key" ON "notifications" USING btree ("user_id","type","event_id") WHERE "notifications"."type" in ('event_nearby_interest');--> statement-breakpoint
CREATE UNIQUE INDEX "point_entries_referral_subject_key" ON "point_entries" USING btree ("kind","subject_user_id") WHERE "point_entries"."kind" = 'referral';
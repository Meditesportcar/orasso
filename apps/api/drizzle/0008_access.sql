CREATE TYPE "public"."pass_revoked_reason" AS ENUM('withdrawn', 'refused', 'cancelled', 'banned', 'replaced');--> statement-breakpoint
CREATE TABLE "access_passes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"kid" smallint NOT NULL,
	"signature" "bytea" NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" "pass_revoked_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_passes_revocation_check" CHECK (("access_passes"."revoked_at" is null) = ("access_passes"."revoked_reason" is null))
);
--> statement-breakpoint
CREATE TABLE "signing_keys" (
	"kid" smallint PRIMARY KEY NOT NULL,
	"algorithm" text DEFAULT 'ed25519' NOT NULL,
	"public_key" "bytea" NOT NULL,
	"active_from" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_passes" ADD CONSTRAINT "access_passes_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_passes" ADD CONSTRAINT "access_passes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_passes" ADD CONSTRAINT "access_passes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_passes" ADD CONSTRAINT "access_passes_kid_signing_keys_kid_fk" FOREIGN KEY ("kid") REFERENCES "public"."signing_keys"("kid") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_passes_valid_application_key" ON "access_passes" USING btree ("application_id") WHERE "access_passes"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "access_passes_event_idx" ON "access_passes" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "access_passes_application_idx" ON "access_passes" USING btree ("application_id");
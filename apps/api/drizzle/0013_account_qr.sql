CREATE TABLE "account_qr_uses" (
	"user_id" text NOT NULL,
	"counter" integer NOT NULL,
	"used_at" timestamp with time zone NOT NULL,
	CONSTRAINT "account_qr_uses_pkey" PRIMARY KEY("user_id","counter")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "account_qr_short_id" "bytea";--> statement-breakpoint
UPDATE "profiles" SET "account_qr_short_id" = substring(sha256(convert_to("user_id", 'UTF8')) from 1 for 8);--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "account_qr_short_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "account_qr_uses" ADD CONSTRAINT "account_qr_uses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_qr_uses_used_at_idx" ON "account_qr_uses" USING btree ("used_at");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_account_qr_short_id_key" ON "profiles" USING btree ("account_qr_short_id");
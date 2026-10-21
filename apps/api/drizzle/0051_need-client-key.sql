ALTER TABLE "event_needs" ADD COLUMN "client_key" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "event_needs_client_key_unique" ON "event_needs" USING btree ("event_id","client_key");
ALTER TABLE "vehicle_models" ADD COLUMN "offroad" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "client_key" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_owner_client_key_unique" ON "vehicles" USING btree ("owner_id","client_key");
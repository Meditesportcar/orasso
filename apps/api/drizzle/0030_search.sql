CREATE INDEX "events_title_trgm_idx" ON "events" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "events_city_trgm_idx" ON "events" USING gin ("city" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "pro_profiles_lat_lng_idx" ON "pro_profiles" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "pro_profiles_name_trgm_idx" ON "pro_profiles" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "pro_profiles_city_trgm_idx" ON "pro_profiles" USING gin ("city" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "vehicle_generations_name_trgm_idx" ON "vehicle_generations" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "vehicle_makes_name_trgm_idx" ON "vehicle_makes" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "vehicle_models_name_trgm_idx" ON "vehicle_models" USING gin ("name" gin_trgm_ops);
ALTER TABLE "vehicle_models" ADD COLUMN "offroad" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "client_key" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_owner_client_key_unique" ON "vehicles" USING btree ("owner_id","client_key");--> statement-breakpoint
-- Lot M1, tour 2 : les vrais tout-terrain du référentiel (marque et modèle tels qu'ils sont dans `vehicle-reference.ts`,
-- donc dans une base déjà déployée) reçoivent « 4x4 » sans repasser par le seed. Les modèles absents sont ignorés.
UPDATE "vehicle_models" AS m SET "offroad" = true
FROM "vehicle_makes" AS mk
WHERE m."make_id" = mk."id" AND (mk."name", m."name") IN (
  ('Jeep', 'Wrangler'),
  ('Jeep', 'Cherokee'),
  ('Jeep', 'CJ'),
  ('Land Rover', 'Defender'),
  ('Land Rover', 'Série'),
  ('Land Rover', 'Discovery'),
  ('Land Rover', 'Range Rover'),
  ('Mercedes-Benz', 'Classe G'),
  ('Mitsubishi', 'Pajero'),
  ('Suzuki', 'Jimny'),
  ('Toyota', 'Land Cruiser')
);--> statement-breakpoint
-- Même règle que le seed (`CATEGORY_RULES` de `scripts/seed/garage.ts`) : « 4x4 » pour les camions et les tout-terrain.
UPDATE "categories" SET "allowed_vehicle_types" = ARRAY['truck', 'offroad']::text[] WHERE "slug" = '4x4';

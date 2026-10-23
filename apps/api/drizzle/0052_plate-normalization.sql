CREATE TABLE "plate_normalization_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"kept_normalized" text NOT NULL,
	"wanted_normalized" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plate_normalization_conflicts" ADD CONSTRAINT "plate_normalization_conflicts_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Lot M2, tour 2 : forme unique des plaques déjà enregistrées, recalculée comme `normalizePlate` (packages/shared,
-- rules/plateNumber.ts) : lettres et chiffres sans accents, bande « F » et département retirés autour d'une plaque
-- récente (SIV, W garage, WW), « F » retiré devant une FNI. Les fonctions vivent dans pg_temp, le temps de la migration.
CREATE FUNCTION pg_temp.m2_chars(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    upper(translate(t, 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝŸ', 'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUYY')),
    '[^A-Z0-9]', '', 'g')
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.m2_recent(c text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT c ~ '^(?!SS|WW)[A-HJ-NP-TV-Z]{2}(?!000)[0-9]{3}[A-HJ-NP-TV-Z]{2}$' OR c ~ '^WW?[0-9]{3}[A-Z]{2}$'
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.m2_french(c text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT pg_temp.m2_recent(c)
    OR c ~ '^(?!0+[A-Z])[0-9]{1,4}[A-Z]{1,3}([0-9]{2,3}|2[AB])$'
    OR c ~ '^[0-9]{1,3}(CMD|CD|C|K)[0-9]{1,4}$'
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.m2_strip(c text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN c ~ '([0-9]{2,3}|2[AB])$' THEN regexp_replace(c, '([0-9]{2,3}|2[AB])$', '') END
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.m2_plate(t text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  n text := pg_temp.m2_chars(t);
  no_f text := CASE WHEN n LIKE 'F%' THEN substr(n, 2) END;
BEGIN
  IF pg_temp.m2_french(n) THEN RETURN n; END IF;
  IF pg_temp.m2_recent(pg_temp.m2_strip(no_f)) THEN RETURN pg_temp.m2_strip(no_f); END IF;
  IF pg_temp.m2_french(no_f) THEN RETURN no_f; END IF;
  IF pg_temp.m2_recent(pg_temp.m2_strip(n)) THEN RETURN pg_temp.m2_strip(n); END IF;
  RETURN n;
END
$$;
--> statement-breakpoint
CREATE TEMP TABLE m2_plates ON COMMIT DROP AS
  SELECT id, status, plate_normalized AS old, pg_temp.m2_plate(plate) AS new
  FROM vehicles
  WHERE plate_normalized IS NOT NULL AND plate IS NOT NULL AND pg_temp.m2_plate(plate) <> '';
--> statement-breakpoint
-- Collisions entre véhicules actifs : aucune fusion, l'ancienne forme est gardée et la collision listée.
INSERT INTO plate_normalization_conflicts (vehicle_id, kept_normalized, wanted_normalized)
  SELECT m.id, m.old, m.new FROM m2_plates m
  WHERE m.old <> m.new AND m.status = 'active'
    AND EXISTS (
      SELECT 1 FROM m2_plates o
      WHERE o.id <> m.id AND o.status = 'active' AND (o.new = m.new OR o.old = m.new)
    );
--> statement-breakpoint
DELETE FROM m2_plates m USING plate_normalization_conflicts c WHERE c.vehicle_id = m.id;
--> statement-breakpoint
-- Demandes de transfert : même forme que la plaque du véhicule qui la détient (une demande ouverte en double reste).
UPDATE plate_transfer_requests r SET plate_normalized = m.new, updated_at = now()
  FROM m2_plates m
  WHERE r.from_vehicle_id = m.id AND r.plate_normalized = m.old AND m.old <> m.new
    AND NOT EXISTS (
      SELECT 1 FROM plate_transfer_requests o
      WHERE o.id <> r.id AND o.plate_normalized = m.new AND o.to_user_id = r.to_user_id
        AND o.status IN ('pending', 'arbitrated') AND r.status IN ('pending', 'arbitrated')
    );
--> statement-breakpoint
UPDATE vehicles v SET plate_normalized = m.new
  FROM m2_plates m WHERE v.id = m.id AND m.old <> m.new;
--> statement-breakpoint
-- Listes du staff (accueil drive, recherche par plaque) : les entrées de ces véhicules repartent à la prochaine
-- synchro différentielle (l'heure d'une entrée suit celle de son pass).
UPDATE access_passes p SET updated_at = now()
  FROM applications a, m2_plates m
  WHERE p.application_id = a.id AND a.vehicle_id = m.id AND m.old <> m.new;
--> statement-breakpoint
DROP FUNCTION pg_temp.m2_plate(text), pg_temp.m2_strip(text), pg_temp.m2_french(text), pg_temp.m2_recent(text), pg_temp.m2_chars(text);

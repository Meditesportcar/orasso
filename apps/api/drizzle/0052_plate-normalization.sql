CREATE TABLE "plate_normalization_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid,
	"transfer_id" uuid,
	"kept_normalized" text NOT NULL,
	"wanted_normalized" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plate_normalization_conflicts_vehicle_key" UNIQUE("vehicle_id"),
	CONSTRAINT "plate_normalization_conflicts_transfer_key" UNIQUE("transfer_id"),
	CONSTRAINT "plate_normalization_conflicts_one_row" CHECK (num_nonnulls("plate_normalization_conflicts"."vehicle_id", "plate_normalization_conflicts"."transfer_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "plate_normalization_conflicts" ADD CONSTRAINT "plate_normalization_conflicts_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plate_normalization_conflicts" ADD CONSTRAINT "plate_normalization_conflicts_transfer_id_plate_transfer_requests_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."plate_transfer_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plate_normalization_conflicts_wanted_idx" ON "plate_normalization_conflicts" USING btree ("wanted_normalized");
--> statement-breakpoint
-- Lot M2 : forme unique des plaques déjà enregistrées, recalculée comme `normalizePlate` (packages/shared,
-- rules/plateNumber.ts ; parité testée par `plate-migration.test.ts`) : lettres et chiffres sans accents ; un « F » de
-- tête suivi d'un séparateur est une bande ; bande et département retirés autour d'une plaque récente (SIV, W garage,
-- WW), « F » retiré devant une FNI. Rejouable : rien n'est listé deux fois, rien ne fait échouer la migration (toute
-- forme qui heurterait une contrainte unique est listée et laissée telle quelle). Fonctions dans pg_temp, supprimées.
CREATE FUNCTION pg_temp.m2_chars(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    upper(translate(t, 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝŸ', 'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUYY')),
    '[^A-Z0-9]', '', 'g')
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.m2_recent(c text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(c ~ '^(?!SS|WW)[A-HJ-NP-TV-Z]{2}(?!000)[0-9]{3}[A-HJ-NP-TV-Z]{2}$' OR c ~ '^WW?[0-9]{3}[A-Z]{2}$', false)
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.m2_french(c text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(pg_temp.m2_recent(c)
    OR c ~ '^(?!0+[A-Z])[0-9]{1,4}[A-Z]{1,3}([0-9]{2,3}|2[AB])$'
    OR c ~ '^[0-9]{1,3}(CMD|CD|C|K)[0-9]{1,4}$', false)
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
  IF no_f IS NOT NULL AND t ~* '^\s*F[\s\-.·]+' THEN
    IF pg_temp.m2_recent(pg_temp.m2_strip(no_f)) THEN RETURN pg_temp.m2_strip(no_f); END IF;
    IF pg_temp.m2_french(no_f) THEN RETURN no_f; END IF;
  END IF;
  IF pg_temp.m2_french(n) THEN RETURN n; END IF;
  IF pg_temp.m2_recent(pg_temp.m2_strip(n)) THEN RETURN pg_temp.m2_strip(n); END IF;
  IF pg_temp.m2_recent(pg_temp.m2_strip(no_f)) THEN RETURN pg_temp.m2_strip(no_f); END IF;
  IF pg_temp.m2_french(no_f) THEN RETURN no_f; END IF;
  RETURN n;
END
$$;
--> statement-breakpoint
-- Forme d'avant le lot M2 (majuscules, puis lettres et chiffres) : pour reconnaître la plaque d'origine d'une demande.
CREATE FUNCTION pg_temp.m2_before(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(upper(t), '[^A-Z0-9]', '', 'g')
$$;
--> statement-breakpoint
CREATE TEMP TABLE m2_plates ON COMMIT DROP AS
  SELECT id, status, plate_normalized AS old, pg_temp.m2_plate(plate) AS new
  FROM vehicles
  WHERE plate_normalized IS NOT NULL AND plate IS NOT NULL AND pg_temp.m2_plate(plate) <> '';
--> statement-breakpoint
-- Collisions entre véhicules actifs (avec un autre recalcul ou une clé déjà en place) : aucune fusion, l'ancienne
-- forme reste et la collision est listée.
INSERT INTO plate_normalization_conflicts (vehicle_id, kept_normalized, wanted_normalized)
  SELECT m.id, m.old, m.new FROM m2_plates m
  WHERE m.old <> m.new AND m.status = 'active'
    AND (
      EXISTS (SELECT 1 FROM m2_plates o WHERE o.id <> m.id AND o.status = 'active' AND o.new = m.new)
      OR EXISTS (SELECT 1 FROM vehicles v WHERE v.id <> m.id AND v.status = 'active' AND v.plate_normalized = m.new)
    )
  ON CONFLICT (vehicle_id) DO NOTHING;
--> statement-breakpoint
DELETE FROM m2_plates m USING plate_normalization_conflicts c WHERE c.vehicle_id = m.id;
--> statement-breakpoint
UPDATE vehicles v SET plate_normalized = m.new FROM m2_plates m WHERE v.id = m.id AND m.old <> m.new;
--> statement-breakpoint
-- Toutes les demandes ouvertes, même quand le véhicule d'origine a été vendu, transféré ou n'a plus de clé : la forme
-- vient de la plaque lisible du véhicule d'origine si c'est bien elle (même forme d'avant M2), sinon de la clé de la
-- demande. Une demande dont le véhicule d'origine est en conflit garde sa clé (elle doit rester égale à la sienne).
CREATE TEMP TABLE m2_transfers ON COMMIT DROP AS
  SELECT r.id, r.to_user_id, r.plate_normalized AS old,
    pg_temp.m2_plate(CASE WHEN v.plate IS NOT NULL AND pg_temp.m2_before(v.plate) = r.plate_normalized
      THEN v.plate ELSE r.plate_normalized END) AS new
  FROM plate_transfer_requests r
  LEFT JOIN vehicles v ON v.id = r.from_vehicle_id
  WHERE r.status IN ('pending', 'arbitrated')
    AND NOT EXISTS (SELECT 1 FROM plate_normalization_conflicts c WHERE c.vehicle_id = r.from_vehicle_id);
--> statement-breakpoint
INSERT INTO plate_normalization_conflicts (transfer_id, kept_normalized, wanted_normalized)
  SELECT t.id, t.old, t.new FROM m2_transfers t
  WHERE t.old <> t.new AND t.new <> ''
    AND (
      EXISTS (SELECT 1 FROM m2_transfers o WHERE o.id <> t.id AND o.to_user_id = t.to_user_id AND o.new = t.new)
      OR EXISTS (
        SELECT 1 FROM plate_transfer_requests o
        WHERE o.id <> t.id AND o.to_user_id = t.to_user_id AND o.plate_normalized = t.new
          AND o.status IN ('pending', 'arbitrated')
      )
    )
  ON CONFLICT (transfer_id) DO NOTHING;
--> statement-breakpoint
UPDATE plate_transfer_requests r SET plate_normalized = t.new, updated_at = now()
  FROM m2_transfers t
  WHERE r.id = t.id AND t.old <> t.new AND t.new <> ''
    AND NOT EXISTS (SELECT 1 FROM plate_normalization_conflicts c WHERE c.transfer_id = t.id);
--> statement-breakpoint
-- Listes du staff (accueil drive, recherche par plaque) : les entrées de ces véhicules repartent à la prochaine
-- synchro différentielle (l'heure d'une entrée suit celle de son pass), conflits compris (hachage de la forme voulue).
UPDATE access_passes p SET updated_at = now()
  FROM applications a
  WHERE p.application_id = a.id
    AND (
      EXISTS (SELECT 1 FROM m2_plates m WHERE m.id = a.vehicle_id AND m.old <> m.new)
      OR EXISTS (SELECT 1 FROM plate_normalization_conflicts c WHERE c.vehicle_id = a.vehicle_id)
    );
--> statement-breakpoint
DROP FUNCTION pg_temp.m2_plate(text), pg_temp.m2_before(text), pg_temp.m2_strip(text), pg_temp.m2_french(text),
  pg_temp.m2_recent(text), pg_temp.m2_chars(text);

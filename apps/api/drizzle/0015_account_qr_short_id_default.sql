-- Identifiant court du QR de compte rempli par la base quand l'insertion ne le donne pas : l'image du lot 05 (retour
-- arrière automatique du déploiement après ces migrations) crée encore des profils sans cette colonne NOT NULL.
CREATE OR REPLACE FUNCTION "profiles_fill_account_qr_short_id"() RETURNS trigger AS $$
BEGIN
  IF NEW."account_qr_short_id" IS NULL THEN
    NEW."account_qr_short_id" := substring(sha256(convert_to(NEW."user_id", 'UTF8')) from 1 for 8);
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "profiles_fill_account_qr_short_id"
  BEFORE INSERT ON "profiles"
  FOR EACH ROW EXECUTE FUNCTION "profiles_fill_account_qr_short_id"();

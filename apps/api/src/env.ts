import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// En local, les variables viennent du .env à la racine du dépôt. En production, de l'environnement.
const rootEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.url(),
  PUBLIC_URL: z.url().default("http://localhost:5173"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET : au moins 32 caractères"),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  APPLE_CLIENT_ID: optional,
  APPLE_CLIENT_SECRET: optional,
  /** Contournement de la double authentification obligatoire, en développement seulement (refusé en production). */
  DEV_SKIP_2FA: z
    .enum(["true", "false", ""])
    .optional()
    .transform((v) => v === "true"),
  /** E-mails : « journal » écrit dans DATA_DIR/mail et affiche en console ; « brevo » envoie (clé requise). */
  MAIL_TRANSPORT: z.enum(["journal", "brevo"]).default("journal"),
  MAIL_FROM: z.string().default("Orasso <contact@orasso.fr>"),
  BREVO_API_KEY: optional,
  /** Photos : disque local (dev, dev.orasso.fr) ; S3 OVH quand les clés existeront. */
  STORAGE_DRIVER: z.enum(["disk"]).default("disk"),
  /** Dossier des fichiers locaux (photos, e-mails du journal), relatif à la racine du dépôt. */
  DATA_DIR: z.string().default(".data"),
  /** Dossier des photos (pilote disque). Défaut : DATA_DIR/storage. Sur le VPS : /data/uploads (volume orasso_uploads). */
  UPLOADS_DIR: optional,
  EXPO_ACCESS_TOKEN: optional,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Configuration invalide :");
  for (const issue of parsed.error.issues) console.error(`- ${issue.path.join(".")} : ${issue.message}`);
  process.exit(1);
}
if (parsed.data.NODE_ENV === "production" && parsed.data.DEV_SKIP_2FA) {
  console.error("Configuration invalide : DEV_SKIP_2FA est interdit en production.");
  process.exit(1);
}
if (parsed.data.MAIL_TRANSPORT === "brevo" && !parsed.data.BREVO_API_KEY) {
  console.error("Configuration invalide : MAIL_TRANSPORT=brevo exige BREVO_API_KEY.");
  process.exit(1);
}

/** Racine du dépôt (pour les chemins relatifs de DATA_DIR). */
export const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

export const env = parsed.data;
export type Env = typeof env;

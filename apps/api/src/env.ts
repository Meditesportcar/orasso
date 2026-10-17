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
  /**
   * Budget d'e-mails envoyés par Brevo par jour (heure de Paris), relecture du lot 20 : offre gratuite = 300. Les 50
   * derniers sont réservés au compte et à la sécurité (réinitialisation, vérification, alertes).
   */
  MAIL_DAILY_BUDGET: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(1).default(300)),
  /** Adresse de réponse des e-mails (« contact@orasso.fr » ou « Orasso <contact@orasso.fr> ») ; vide = pas d'en-tête. */
  MAIL_REPLY_TO: optional,
  /** Photos : disque local (dev, dev.orasso.fr) ; S3 OVH quand les clés existeront. */
  STORAGE_DRIVER: z.enum(["disk"]).default("disk"),
  /** Dossier des fichiers locaux (photos, e-mails du journal), relatif à la racine du dépôt. */
  DATA_DIR: z.string().default(".data"),
  /** Dossier des photos (pilote disque). Défaut : DATA_DIR/storage. Sur le VPS : /data/uploads (volume orasso_uploads). */
  UPLOADS_DIR: optional,
  EXPO_ACCESS_TOKEN: optional,
  /**
   * Origines web autorisées à appeler l'API depuis un autre hôte (CORS) : liste séparée par des virgules. Vide en
   * production (site et API sur le même hôte). Sert à la recette de l'appli dans un navigateur (`expo start --web`).
   */
  CORS_ORIGINS: optional,
  /**
   * Clés privées Ed25519 des QR d'inscription : JSON `[{"kid":1,"privateKey":"<graine de 32 octets en base64>"}]`
   * (`pnpm --filter @orasso/api keys:generate`). Obligatoire en production ; en développement, une clé de
   * démonstration publique (kid 0) est utilisée à défaut.
   */
  QR_SIGNING_KEYS: optional,
  /** Clé qui signe les nouveaux pass (les autres restent en vérification, rotation § 3.1). */
  QR_SIGNING_ACTIVE_KID: optional,
  /** Registre public des entreprises et associations (SIRET, RNA) : API Recherche d'entreprises de l'État, sans clé. */
  REGISTRY_API_URL: z.url().default("https://recherche-entreprises.api.gouv.fr"),
  /** Géocodage des adresses (Géoplateforme de l'IGN, sans clé). `off` le désactive (les tests le désactivent). */
  GEOCODER_URL: z.string().default("https://data.geopf.fr/geocodage"),
  /**
   * Billetterie payante en mode présentation (Stripe Connect, compte Orasso en **mode test** uniquement). Les trois
   * variables vides = billetterie payante affichée « bientôt », sans erreur. Une clé `sk_live_` est refusée : l'API
   * ne démarre pas (aucun encaissement réel avant le 21 juin 2027, et pas dans cette version).
   */
  STRIPE_SECRET_KEY: optional,
  /** Secret de signature des webhooks (`whsec_…`). */
  STRIPE_WEBHOOK_SECRET: optional,
  /** Identifiant d'application Connect (`ca_…`) : parcours de connexion du compte de l'organisateur. */
  STRIPE_CONNECT_CLIENT_ID: optional,
  /** Erreurs vers GlitchTip / Sentry (lot 15) : vide = rien n'est envoyé. */
  SENTRY_DSN: optional,
  SENTRY_ENVIRONMENT: optional,
  /** Version déployée (étiquette de l'image, posée par compose.yml). */
  SENTRY_RELEASE: optional,
  /**
   * Météo (lot 28) : fournisseur des prévisions. `open-meteo` (défaut, gratuit pour l'usage NON commercial seulement,
   * à quitter avant le 21/06/2027), `met-norway` (usage commercial permis), `off` (désactivée). Changer la valeur et
   * redémarrer l'API suffit : aucun changement de code ni de l'appli.
   */
  WEATHER_PROVIDER: z.enum(["open-meteo", "met-norway", "off"]).default("open-meteo"),
  /** `User-Agent` envoyé aux fournisseurs : obligatoire et identifiant pour MET Norway (nom de l'appli + contact). */
  WEATHER_USER_AGENT: z.string().default("Orasso/0.1 contact@orasso.fr"),
  /**
   * Sources de l'Accueil (lot 30) : lavage (Overpass / OpenStreetMap, service bénévole à usage raisonnable : un appel par
   * département et par semaine) et prix des carburants (données ouvertes de l'État). `off` désactive la source ; le widget
   * disparaît alors sans erreur. Instance propre ou autre URL : changer la valeur et redémarrer l'API.
   */
  OVERPASS_URL: z.string().default("https://overpass-api.de/api/interpreter"),
  FUEL_API_URL: z
    .string()
    .default(
      "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records",
    ),
  /** `User-Agent` envoyé à ces sources (nom de l'appli + contact, exigé par la politique d'usage d'Overpass). */
  EXTERNAL_USER_AGENT: z.string().default("Orasso/0.1 contact@orasso.fr"),
  /**
   * Newsletter (lot 33) : expéditeur propre (« Orasso <newsletter@mail.orasso.fr> ») ; vide = `MAIL_FROM`.
   */
  NEWSLETTER_FROM: optional,
  /**
   * Secret des liens de désinscription de la newsletter (HMAC de l'identifiant du compte), 32 caractères au moins.
   * Obligatoire en production (l'API refuse de démarrer sans) ; en développement, dérivé de BETTER_AUTH_SECRET.
   */
  UNSUBSCRIBE_SECRET: optional.pipe(z.string().min(32, "UNSUBSCRIBE_SECRET : au moins 32 caractères").optional()),
});

/**
 * Garde Stripe : seules les clés de **test** sont acceptées. Une clé live (`sk_live_`, `rk_live_`) empêche le démarrage,
 * en production comme ailleurs (aucun encaissement réel dans cette version).
 */
export function stripeKeyError(key: string | undefined): string | null {
  if (!key) return null;
  if (/^(sk|rk)_live_/.test(key)) {
    return "STRIPE_SECRET_KEY est une clé de production (sk_live_) : refusée. Orasso n'encaisse rien en réel ; utiliser la clé de test (sk_test_…).";
  }
  if (!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key)) {
    return "STRIPE_SECRET_KEY doit être une clé de test Stripe (sk_test_…).";
  }
  return null;
}

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
if (parsed.data.NODE_ENV === "production" && (!parsed.data.QR_SIGNING_KEYS || !parsed.data.QR_SIGNING_ACTIVE_KID)) {
  console.error("Configuration invalide : QR_SIGNING_KEYS et QR_SIGNING_ACTIVE_KID sont obligatoires en production.");
  process.exit(1);
}
const stripeKeyProblem = stripeKeyError(parsed.data.STRIPE_SECRET_KEY);
if (stripeKeyProblem) {
  console.error(`Configuration invalide : ${stripeKeyProblem}`);
  process.exit(1);
}
if (parsed.data.NODE_ENV === "production" && !parsed.data.UNSUBSCRIBE_SECRET) {
  console.error("Configuration invalide : UNSUBSCRIBE_SECRET est obligatoire en production (liens de désinscription).");
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

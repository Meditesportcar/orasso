// Sécurité du compte (lot 15, ARCHITECTURE-SUITE § 1.1) : connexions connues (alerte « nouvel appareil ») et clés
// d'accès (passkeys) du plugin `@better-auth/passkey`. Table `passkey` recopiée du schéma du plugin (mêmes champs
// que `@better-auth/passkey` 1.7 : `schema.passkey.fields`), au singulier comme les autres tables de Better Auth.
import { boolean, index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { tstz } from "./common";

/**
 * Empreintes d'appareil déjà vues pour un compte : `sha256(navigateur + système + préfixe IP /24)`. Une empreinte
 * inconnue déclenche `security_new_login` (compte de plus de 10 minutes). Purgées après un an sans connexion.
 */
export const knownLogins = pgTable(
  "known_logins",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    fingerprint: text("fingerprint").notNull(),
    /** Libellé lisible (« Chrome · Windows ») repris dans l'alerte ; jamais l'adresse IP. */
    label: text("label").notNull(),
    firstSeenAt: tstz("first_seen_at").notNull().defaultNow(),
    lastSeenAt: tstz("last_seen_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "known_logins_pkey", columns: [t.userId, t.fingerprint] }),
    index("known_logins_last_seen_idx").on(t.lastSeenAt),
  ],
);

/** Clés d'accès WebAuthn (Face ID, empreinte, clé de sécurité) : double authentification sur le site (S2). */
export const passkey = pgTable(
  "passkey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    createdAt: timestamp("created_at", { withTimezone: true }),
    aaguid: text("aaguid"),
  },
  (t) => [index("passkey_user_id_idx").on(t.userId), index("passkey_credential_id_idx").on(t.credentialID)],
);

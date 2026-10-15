// Clés Ed25519 des QR d'inscription et de la liste d'accès (ARCHITECTURE.md § 3.1, § 3.2).
// Les clés privées viennent de QR_SIGNING_KEYS (jamais en base) ; leurs clés publiques sont recopiées dans
// `signing_keys` (ajoutées, jamais retirées) pour l'appli du staff et pour vérifier les anciens pass après rotation.
import { createHash, createPrivateKey, createPublicKey, type KeyObject, sign, verify } from "node:crypto";
import type { Ed25519Verify } from "@orasso/shared";
import { asc, sql } from "drizzle-orm";

import { db } from "../db/client";
import { signingKeys } from "../db/schema";
import { env } from "../env";

/** En-tête DER PKCS#8 d'une clé privée Ed25519 dont la graine (32 octets) suit. */
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export type SigningKey = { kid: number; privateKey: KeyObject; publicKey: Buffer };

export function keyFromSeed(kid: number, seed: Buffer): SigningKey {
  if (!Number.isInteger(kid) || kid < 0 || kid > 255) throw new Error(`QR_SIGNING_KEYS : kid ${kid} hors de 0–255`);
  if (seed.length !== 32) throw new Error(`QR_SIGNING_KEYS : la clé ${kid} doit faire 32 octets`);
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: "der", type: "pkcs8" });
  const publicKey = createPublicKey(privateKey).export({ format: "der", type: "spki" }).subarray(-32);
  return { kid, privateKey, publicKey: Buffer.from(publicKey) };
}

/**
 * Clé de démonstration (kid 0), dérivée d'un texte public : seulement hors production, quand QR_SIGNING_KEYS
 * est absent (worktrees, tests). Des pass signés avec elle ne prouvent rien.
 */
const DEV_KEY_SEED = createHash("sha256").update("orasso-dev-qr-key-not-secret").digest();

export function parseKeys(json: string | undefined, activeKid: string | undefined) {
  if (!json) return { keys: [keyFromSeed(0, DEV_KEY_SEED)], activeKid: 0, demo: true };
  let list: unknown;
  try {
    list = JSON.parse(json);
  } catch {
    throw new Error("QR_SIGNING_KEYS : JSON invalide");
  }
  if (!Array.isArray(list) || list.length === 0) throw new Error("QR_SIGNING_KEYS : liste de clés attendue");
  const keys = list.map((k: { kid?: unknown; privateKey?: unknown }) => {
    if (typeof k.kid !== "number" || typeof k.privateKey !== "string") {
      throw new Error('QR_SIGNING_KEYS : éléments {"kid": nombre, "privateKey": base64} attendus');
    }
    return keyFromSeed(k.kid, Buffer.from(k.privateKey, "base64"));
  });
  if (new Set(keys.map((k) => k.kid)).size !== keys.length) throw new Error("QR_SIGNING_KEYS : kid en double");
  const active = Number(activeKid ?? keys[0]?.kid);
  if (!keys.some((k) => k.kid === active)) throw new Error(`QR_SIGNING_ACTIVE_KID : ${activeKid} absent des clés`);
  return { keys, activeKid: active, demo: false };
}

let config = parseKeys(env.QR_SIGNING_KEYS, env.QR_SIGNING_ACTIVE_KID);
if (config.demo && env.NODE_ENV === "development") {
  console.warn("QR_SIGNING_KEYS absent : clé de démonstration (kid 0). `pnpm --filter @orasso/api keys:generate`.");
}
let synced: Promise<void> | null = null;

/** Vérification Ed25519 avec node:crypto (adaptateur des fonctions partagées). */
export const ed25519Verify: Ed25519Verify = (message, signature, publicKey) => {
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, publicKey]), format: "der", type: "spki" });
    return verify(null, message, key, signature);
  } catch {
    return false;
  }
};

export const signing = {
  get activeKid() {
    return config.activeKid;
  },

  /** Signe avec la clé active. */
  sign(message: Uint8Array): { kid: number; signature: Buffer } {
    const key = config.keys.find((k) => k.kid === config.activeKid);
    if (!key) throw new Error("Clé de signature active introuvable");
    return { kid: key.kid, signature: sign(null, message, key.privateKey) };
  },

  /**
   * Recopie les clés publiques dans `signing_keys` (une fois par processus). Une clé déjà connue sous le même kid
   * mais différente est une erreur de configuration : on refuse plutôt que d'invalider tous les pass émis.
   */
  ensureSynced(): Promise<void> {
    synced ??= (async () => {
      for (const k of config.keys) {
        await db.insert(signingKeys).values({ kid: k.kid, publicKey: k.publicKey }).onConflictDoNothing();
        const row = await db.query.signingKeys.findFirst({ where: sql`${signingKeys.kid} = ${k.kid}` });
        if (!row?.publicKey.equals(k.publicKey)) {
          throw new Error(`signing_keys : la clé ${k.kid} en base ne correspond pas à QR_SIGNING_KEYS`);
        }
      }
    })().catch((error) => {
      synced = null;
      throw error;
    });
    return synced;
  },

  /** Clés publiques connues (actives et retirées), pour l'appli et les vérifications. */
  async publicKeys() {
    await this.ensureSynced();
    const rows = await db.query.signingKeys.findMany({ orderBy: [asc(signingKeys.kid)] });
    return rows.map((r) => ({
      kid: r.kid,
      algorithm: r.algorithm,
      publicKey: r.publicKey.toString("base64url"),
      activeFrom: r.activeFrom.toISOString(),
      retiredAt: r.retiredAt?.toISOString() ?? null,
    }));
  },

  /** Remplace le trousseau (tests de rotation). */
  configureForTests(json: string, activeKid: string) {
    config = parseKeys(json, activeKid);
    synced = null;
  },
};

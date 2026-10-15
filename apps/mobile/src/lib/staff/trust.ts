// Clés de confiance du mode staff (relecture du lot 06, point M9). La signature de la liste synchronisée n'est jamais
// vérifiée avec les clés livrées dans la même réponse : elle l'est avec les clés de confiance de l'appareil, qui
// viennent de `GET /api/keys` (appel séparé, en ligne, avec la session du staff) et, si le build en embarque, de la
// liste épinglée `EXPO_PUBLIC_QR_TRUSTED_KEYS` (seules ces clés sont alors acceptées). La clé de démonstration
// `kid 0` n'est acceptée que par un build qui parle à une API locale (http://localhost, réseau privé) : jamais par
// un build qui pointe vers https://dev.orasso.fr ou la production. Fonctions pures, testées dans staff.test.ts.
import { accessListSigningText, base64UrlDecode, type StaffSync } from "@orasso/shared";

import { DEMO_PUBLIC_KEY, ed25519Verify, sha256Text } from "./crypto";

/** Clé publique Ed25519 de confiance (32 octets en base64url). */
export type TrustedKey = { kid: number; publicKey: string; retiredAt: string | null };

export type TrustPolicy = {
  /** La clé de démonstration (kid 0) est acceptable : API locale seulement. */
  allowDemo: boolean;
  /** Clés épinglées au build ; `null` = pas d'épinglage (confiance dans `/api/keys` de l'API configurée). */
  pins: { kid: number; publicKey: string }[] | null;
};

/** API de développement : http sur la machine, l'émulateur Android ou le réseau privé (Expo Go au bureau). */
export function isLocalApi(apiUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "10.0.2.2") return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a = -1, b = -1] = parts;
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

/**
 * Lit la liste épinglée du build (`[{"kid":1,"publicKey":"<base64url>"}]`). Une liste illisible n'ouvre rien :
 * elle devient une liste vide (aucune clé acceptée, la synchro le dit).
 */
export function parsePins(json: string | undefined): TrustPolicy["pins"] {
  if (!json?.trim()) return null;
  try {
    const list = JSON.parse(json) as unknown;
    if (!Array.isArray(list)) return [];
    return list.flatMap((k: { kid?: unknown; publicKey?: unknown }) =>
      typeof k?.kid === "number" && typeof k.publicKey === "string" && validKey(k.kid, k.publicKey)
        ? [{ kid: k.kid, publicKey: k.publicKey }]
        : [],
    );
  } catch {
    return [];
  }
}

export function trustPolicy(apiUrl: string, pinsJson: string | undefined): TrustPolicy {
  return { allowDemo: isLocalApi(apiUrl), pins: parsePins(pinsJson) };
}

function validKey(kid: number, publicKey: string): boolean {
  return Number.isInteger(kid) && kid >= 0 && kid <= 255 && base64UrlDecode(publicKey)?.length === 32;
}

export const isDemoKey = (k: { kid: number; publicKey: string }) => k.kid === 0 || k.publicKey === DEMO_PUBLIC_KEY;

export type TrustUpdate = { ok: true; keys: TrustedKey[] } | { ok: false; reason: "key_changed"; kid: number };

/**
 * Nouvel ensemble de clés de confiance à partir de `GET /api/keys` : clés valides, sans la clé de démonstration
 * (sauf API locale), limitées aux clés épinglées s'il y en a. Il remplace l'ancien (une clé révoquée par l'API, donc
 * absente de `/api/keys`, cesse d'être acceptée). Une clé connue dont le `kid` changerait de valeur fait tout
 * refuser (l'API elle-même refuse de démarrer dans ce cas : c'est une attaque ou une erreur de configuration).
 */
export function nextTrustedKeys(
  current: readonly TrustedKey[],
  served: readonly { kid: number; publicKey: string; retiredAt?: string | null }[],
  policy: TrustPolicy,
): TrustUpdate {
  const keys: TrustedKey[] = [];
  for (const k of served) {
    if (!validKey(k.kid, k.publicKey)) continue;
    if (isDemoKey(k) && !policy.allowDemo) continue;
    if (policy.pins && !policy.pins.some((p) => p.kid === k.kid && p.publicKey === k.publicKey)) continue;
    const known = current.find((c) => c.kid === k.kid);
    if (known && known.publicKey !== k.publicKey) return { ok: false, reason: "key_changed", kid: k.kid };
    if (keys.some((x) => x.kid === k.kid)) continue;
    keys.push({ kid: k.kid, publicKey: k.publicKey, retiredAt: k.retiredAt ?? null });
  }
  return { ok: true, keys };
}

/** kid → clé de 32 octets, pour `decideScan` et la vérification de la liste. */
export function keyMap(keys: readonly TrustedKey[], policy: TrustPolicy): Map<number, Uint8Array> {
  const map = new Map<number, Uint8Array>();
  for (const k of keys) {
    // Défense en profondeur : même stockée, la clé de démonstration ne sert jamais hors API locale.
    if (isDemoKey(k) && !policy.allowDemo) continue;
    if (policy.pins && !policy.pins.some((p) => p.kid === k.kid && p.publicKey === k.publicKey)) continue;
    const bytes = base64UrlDecode(k.publicKey);
    if (bytes?.length === 32) map.set(k.kid, bytes);
  }
  return map;
}

export type SyncCheck = { ok: true } | { ok: false; reason: "wrong_event" | "unknown_key" | "bad_signature" };

/**
 * Vérifie une réponse de synchro : bon événement, clé de signature de confiance, signature Ed25519 du SHA-256 de
 * `accessListSigningText(corps)` (tout le corps sauf `signature` et `signatureKid`). Les `keys` de la réponse ne
 * servent jamais à la vérifier.
 */
export function verifyStaffSync(sync: StaffSync, eventId: string, trusted: ReadonlyMap<number, Uint8Array>): SyncCheck {
  if (sync.event?.id !== eventId) return { ok: false, reason: "wrong_event" };
  const key = trusted.get(sync.signatureKid);
  if (!key) return { ok: false, reason: "unknown_key" };
  const signature = base64UrlDecode(sync.signature ?? "");
  if (signature?.length !== 64) return { ok: false, reason: "bad_signature" };
  const digest = sha256Text(accessListSigningText(sync as unknown as Record<string, unknown>));
  return ed25519Verify(digest, signature, key) ? { ok: true } : { ok: false, reason: "bad_signature" };
}

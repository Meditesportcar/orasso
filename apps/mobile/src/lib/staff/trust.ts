// Clés de confiance du mode staff (relecture du lot 06, point M9, et du lot 10). La signature de la liste synchronisée
// n'est jamais vérifiée avec les clés livrées dans la même réponse. Build vers une API en ligne : seules les clés
// épinglées au build (`EXPO_PUBLIC_QR_TRUSTED_KEYS`) comptent, `GET /api/keys` peut seulement en retirer une révoquée ;
// sans clé épinglée, rien n'est accepté. Build vers une API locale (développement) : clés apprises de `/api/keys`,
// clé de démonstration `kid 0` comprise. Fonctions pures, testées dans staff.test.ts.
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

type PublicKeyRef = { kid: number; publicKey: string };

export type TrustUpdate =
  | { ok: true; keys: TrustedKey[]; revoked: PublicKeyRef[] }
  | { ok: false; reason: "key_changed"; kid: number };

const samePair = (a: PublicKeyRef, b: PublicKeyRef) => a.kid === b.kid && a.publicKey === b.publicKey;

/**
 * Le build peut-il faire confiance à une clé ? API locale (développement) : oui, apprise de `/api/keys`. API en ligne :
 * seulement avec des clés épinglées au build (relecture du lot 10 : un build vers dev.orasso.fr ou la production sans
 * `EXPO_PUBLIC_QR_TRUSTED_KEYS` refuse tout, le mode staff le dit).
 */
export const hasTrustAnchor = (policy: TrustPolicy) => policy.allowDemo || (policy.pins?.length ?? 0) > 0;

/** Clés épinglées encore valables (celles que `/api/keys` a cessé de servir sont révoquées pour de bon). */
export function pinnedKeys(policy: TrustPolicy, revoked: readonly PublicKeyRef[]): TrustedKey[] {
  return (policy.pins ?? [])
    .filter((p) => !revoked.some((r) => samePair(r, p)) && (policy.allowDemo || !isDemoKey(p)))
    .map((p) => ({ kid: p.kid, publicKey: p.publicKey, retiredAt: null }));
}

/**
 * Nouvel ensemble de clés de confiance après `GET /api/keys`.
 * - Clés épinglées : `/api/keys` ne peut qu'en retirer (une clé épinglée qu'il ne sert plus est révoquée, et le reste),
 *   jamais en ajouter.
 * - Sans épinglage, API locale : les clés servies (démonstration comprise) remplacent l'ensemble ; une clé connue dont
 *   le `kid` changerait de valeur fait tout refuser (l'API elle-même refuse de démarrer dans ce cas).
 * - Sans épinglage, API en ligne : aucune clé.
 */
export function nextTrustedKeys(
  current: readonly TrustedKey[],
  served: readonly { kid: number; publicKey: string; retiredAt?: string | null }[],
  policy: TrustPolicy,
  alreadyRevoked: readonly PublicKeyRef[] = [],
): TrustUpdate {
  const valid = served.filter((k) => validKey(k.kid, k.publicKey));
  if (policy.pins?.length) {
    const pins = pinnedKeys(policy, alreadyRevoked);
    for (const p of pins) {
      const other = valid.find((k) => k.kid === p.kid && k.publicKey !== p.publicKey);
      if (other) return { ok: false, reason: "key_changed", kid: p.kid };
    }
    const keys = pins.filter((p) => valid.some((k) => samePair(k, p)));
    const revoked = pins
      .filter((p) => !keys.some((k) => samePair(k, p)))
      .map(({ kid, publicKey }) => ({ kid, publicKey }));
    return { ok: true, keys, revoked };
  }
  if (!policy.allowDemo) return { ok: true, keys: [], revoked: [] };
  const keys: TrustedKey[] = [];
  for (const k of valid) {
    const known = current.find((c) => c.kid === k.kid);
    if (known && known.publicKey !== k.publicKey) return { ok: false, reason: "key_changed", kid: k.kid };
    if (keys.some((x) => x.kid === k.kid)) continue;
    keys.push({ kid: k.kid, publicKey: k.publicKey, retiredAt: k.retiredAt ?? null });
  }
  return { ok: true, keys, revoked: [] };
}
/** kid → clé de 32 octets, pour `decideScan` et la vérification de la liste. */
export function keyMap(keys: readonly TrustedKey[], policy: TrustPolicy): Map<number, Uint8Array> {
  const map = new Map<number, Uint8Array>();
  // Build en ligne sans clé épinglée : aucune clé, quoi qu'il y ait en base.
  if (!hasTrustAnchor(policy)) return map;
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

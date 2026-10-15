// Cryptographie du mode staff hors ligne, en JS pur (ARCHITECTURE.md § 3) : Ed25519 (@noble/ed25519, vérification
// stricte RFC 8032 comme node:crypto côté API), SHA-256 de la liste d'accès, HMAC-SHA256 de la plaque saisie.
import * as ed from "@noble/ed25519";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { base64UrlDecode, bytesToHex, type Ed25519Verify, normalizePlate } from "@orasso/shared";

// Vérification synchrone : le hachage SHA-512 de la bibliothèque est fourni par @noble/hashes.
ed.hashes.sha512 = sha512;

/**
 * Vérification Ed25519 pour `decideScan` et la liste synchronisée. `zip215: false` : encodages non canoniques et
 * clés de petit ordre refusés, comme OpenSSL dans l'API (une signature acceptée ici l'est aussi par le serveur).
 */
export const ed25519Verify: Ed25519Verify = (message, signature, publicKey) => {
  try {
    return ed.verify(signature, message, publicKey, { zip215: false });
  } catch {
    return false;
  }
};

const encoder = new TextEncoder();

/** SHA-256 d'un texte UTF-8 (message signé de la liste d'accès). */
export const sha256Text = (text: string): Uint8Array => sha256(encoder.encode(text));

/**
 * Hachage d'une plaque saisie par le staff, identique à l'API (`plateHash` du module staff) :
 * HMAC-SHA256(sel de l'événement, plaque normalisée), hexadécimal tronqué à 16 caractères.
 */
export function plateHashOf(saltBase64Url: string, plate: string): string | null {
  const salt = base64UrlDecode(saltBase64Url);
  const normalized = normalizePlate(plate);
  if (!salt || !normalized) return null;
  return bytesToHex(hmac(sha256, salt, encoder.encode(normalized))).slice(0, 16);
}

/**
 * Clé publique de la clé de démonstration `kid 0` de l'API (graine publique « orasso-dev-qr-key-not-secret »,
 * `apps/api/src/lib/signing.ts`) : des QR signés avec elle ne prouvent rien. Vérifiée par test.
 */
export const DEMO_PUBLIC_KEY = "OafwKbHLN1rAcusnvEcN66m73w088K-gvyMw0Qy4oOM";

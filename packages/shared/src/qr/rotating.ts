// QR d'accès tournant (lot 48, ARCHITECTURE-DA-V2 § 5.4, prototype `s-qr`) : un nouveau code toutes les 20 s, signé
// HMAC-SHA256 avec un secret propre au pass, vérifiable hors ligne par le téléphone du staff (qui reçoit le secret dans
// la liste synchronisée). Une capture ou une photo du code est périmée en 20 à 60 s.
// « OR2 » + base32 majuscules sans remplissage de (message 25 octets ‖ MAC 16 octets) = 69 caractères alphanumériques.
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

import { base32Decode, base32Encode, bytesToUuid, concatBytes, equalBytes, uuidToBytes } from "./bytes";

export const ROTATING_PREFIX = "OR2";
export const ROTATING_VERSION = 2;
export const ROTATING_STEP_SECONDS = 20;
/** Créneaux acceptés de part et d'autre du créneau courant (dérive d'horloge, temps de lecture). */
export const ROTATING_TOLERANCE = 1;
export const ROTATING_MESSAGE_LENGTH = 25;
export const ROTATING_MAC_LENGTH = 16;
/** Longueur du secret d'un pass (octets). */
export const ROTATING_SECRET_LENGTH = 32;
/** Longueur exacte d'une charge utile valide. */
export const ROTATING_PAYLOAD_LENGTH =
  ROTATING_PREFIX.length + Math.ceil(((ROTATING_MESSAGE_LENGTH + ROTATING_MAC_LENGTH) * 8) / 5);

export type RotatingFields = { eventNo: number; passId: string; slot: number };

/** Créneau de 20 s d'un instant (secondes Unix / 20, arrondi inférieur). */
export function rotatingSlot(now: Date): number {
  return Math.floor(now.getTime() / 1000 / ROTATING_STEP_SECONDS);
}

/** Secondes avant le prochain code (1 à 20). */
export function secondsLeft(now: Date): number {
  const elapsed = Math.floor(now.getTime() / 1000) % ROTATING_STEP_SECONDS;
  return ROTATING_STEP_SECONDS - elapsed;
}

/** Numéro affiché sous le code (« n° 4 821 ») : le créneau modulo 10 000. */
export const rotatingNumber = (slot: number) => slot % 10_000;

/** Message signé (grand-boutiste) : version u8 · event_no u32 · pass_id 16 octets · slot u32. */
export function encodeRotatingMessage({ eventNo, passId, slot }: RotatingFields): Uint8Array {
  if (!Number.isInteger(eventNo) || eventNo < 0 || eventNo > 0xffffffff) throw new Error("event_no hors u32");
  if (!Number.isInteger(slot) || slot < 0 || slot > 0xffffffff) throw new Error("slot hors u32");
  const id = uuidToBytes(passId);
  if (!id) throw new Error("pass_id invalide");
  const head = new Uint8Array(5);
  head[0] = ROTATING_VERSION;
  new DataView(head.buffer).setUint32(1, eventNo, false);
  const tail = new Uint8Array(4);
  new DataView(tail.buffer).setUint32(0, slot, false);
  return concatBytes(head, id, tail);
}

function macOf(secret: Uint8Array, message: Uint8Array): Uint8Array {
  return hmac(sha256, secret, message).slice(0, ROTATING_MAC_LENGTH);
}

/** Code d'un créneau donné. */
export function rotatingCodeForSlot(secret: Uint8Array, fields: RotatingFields): string {
  const message = encodeRotatingMessage(fields);
  return ROTATING_PREFIX + base32Encode(concatBytes(message, macOf(secret, message)));
}

/** Code affiché à l'instant `now` (appli du participant, hors ligne). */
export function rotatingCodeAt(secret: Uint8Array, eventNo: number, passId: string, now: Date): string {
  return rotatingCodeForSlot(secret, { eventNo, passId, slot: rotatingSlot(now) });
}

export type DecodedRotating = RotatingFields & { version: number; message: Uint8Array; mac: Uint8Array };

/** Décode sans vérifier le MAC ; `null` si ce n'est pas un code tournant Orasso bien formé. */
export function decodeRotatingPayload(payload: string): DecodedRotating | null {
  const text = payload.trim();
  if (!text.startsWith(ROTATING_PREFIX) || text.length !== ROTATING_PAYLOAD_LENGTH) return null;
  const raw = base32Decode(text.slice(ROTATING_PREFIX.length));
  if (raw?.length !== ROTATING_MESSAGE_LENGTH + ROTATING_MAC_LENGTH) return null;
  const message = raw.slice(0, ROTATING_MESSAGE_LENGTH);
  const view = new DataView(message.buffer, message.byteOffset, message.byteLength);
  const version = view.getUint8(0);
  if (version !== ROTATING_VERSION) return null;
  return {
    version,
    eventNo: view.getUint32(1, false),
    passId: bytesToUuid(message.slice(5, 21)),
    slot: view.getUint32(21, false),
    message,
    mac: raw.slice(ROTATING_MESSAGE_LENGTH),
  };
}

export type RotatingCheck =
  | { ok: true; slotOffset: number; code: DecodedRotating }
  | { ok: false; reason: "expired" | "bad_mac" | "malformed"; code?: DecodedRotating };

/**
 * Vérifie un code tournant avec le secret du pass et l'heure du téléphone du staff. MAC d'abord (un code faux reste
 * « faux » même hors délai), puis le créneau : au plus `tolerance` créneaux d'écart (fenêtre de 60 s par défaut).
 */
export function verifyRotatingCode(
  payload: string,
  secret: Uint8Array,
  now: Date,
  tolerance = ROTATING_TOLERANCE,
): RotatingCheck {
  const code = decodeRotatingPayload(payload);
  if (!code) return { ok: false, reason: "malformed" };
  if (!equalBytes(macOf(secret, code.message), code.mac)) return { ok: false, reason: "bad_mac", code };
  const slotOffset = code.slot - rotatingSlot(now);
  if (Math.abs(slotOffset) > tolerance) return { ok: false, reason: "expired", code };
  return { ok: true, slotOffset, code };
}

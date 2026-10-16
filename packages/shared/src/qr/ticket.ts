// QR de billet de visiteur (lot 14) : même construction que le QR d'inscription (message de 22 octets signé Ed25519,
// base32 majuscules, version 6-M) mais **format distinct** : préfixe « OB1 » et version de message 2. Un billet n'est
// donc jamais lu comme une inscription (le scanner véhicules le refuse comme QR inconnu) et une inscription n'est
// jamais lue comme un billet ; la version fait partie du message signé, un préfixe changé à la main ne valide rien.
import { base32Decode, base32Encode, bytesToUuid, concatBytes, uuidToBytes } from "./bytes";
import { type Ed25519Verify, PASS_MESSAGE_LENGTH, PASS_SIGNATURE_LENGTH, type PassFields } from "./pass";

export const TICKET_PREFIX = "OB1";
export const TICKET_VERSION = 2;
export const TICKET_PAYLOAD_LENGTH = TICKET_PREFIX.length + Math.ceil(((22 + 64) * 8) / 5);

/** Message signé : version u8 (2) · kid u8 · event_no u32 · ticket_id 16 octets. */
export function encodeTicketMessage({ kid, eventNo, passId }: PassFields): Uint8Array {
  if (!Number.isInteger(kid) || kid < 0 || kid > 255) throw new Error("kid hors de 0–255");
  if (!Number.isInteger(eventNo) || eventNo < 0 || eventNo > 0xffffffff) throw new Error("event_no hors u32");
  const id = uuidToBytes(passId);
  if (!id) throw new Error("ticket_id invalide");
  const head = new Uint8Array(6);
  head[0] = TICKET_VERSION;
  head[1] = kid;
  new DataView(head.buffer).setUint32(2, eventNo, false);
  return concatBytes(head, id);
}

export function encodeTicketPayload(message: Uint8Array, signature: Uint8Array): string {
  if (message.length !== PASS_MESSAGE_LENGTH || signature.length !== PASS_SIGNATURE_LENGTH) {
    throw new Error("Message ou signature de taille inattendue");
  }
  return TICKET_PREFIX + base32Encode(concatBytes(message, signature));
}

export type DecodedTicket = PassFields & { message: Uint8Array; signature: Uint8Array };

/** Décode sans vérifier la signature ; `null` si ce n'est pas un QR de billet Orasso bien formé. */
export function decodeTicketPayload(payload: string): DecodedTicket | null {
  const text = payload.trim();
  if (!text.startsWith(TICKET_PREFIX) || text.length !== TICKET_PAYLOAD_LENGTH) return null;
  const raw = base32Decode(text.slice(TICKET_PREFIX.length));
  if (raw?.length !== PASS_MESSAGE_LENGTH + PASS_SIGNATURE_LENGTH) return null;
  const message = raw.slice(0, PASS_MESSAGE_LENGTH);
  const signature = raw.slice(PASS_MESSAGE_LENGTH);
  const view = new DataView(message.buffer, message.byteOffset, message.byteLength);
  if (view.getUint8(0) !== TICKET_VERSION) return null;
  return {
    kid: view.getUint8(1),
    eventNo: view.getUint32(2, false),
    passId: bytesToUuid(message.slice(6)),
    message,
    signature,
  };
}

export type TicketCheck =
  | { ok: true; ticket: DecodedTicket }
  | { ok: false; reason: "malformed" | "unknown_key" | "bad_signature" };

/** Décodage + signature, avec les clés publiques connues (kid → clé de 32 octets). */
export function verifyTicketPayload(
  payload: string,
  keys: ReadonlyMap<number, Uint8Array>,
  verify: Ed25519Verify,
): TicketCheck {
  const ticket = decodeTicketPayload(payload);
  if (!ticket) return { ok: false, reason: "malformed" };
  const key = keys.get(ticket.kid);
  if (!key) return { ok: false, reason: "unknown_key" };
  let valid = false;
  try {
    valid = verify(ticket.message, ticket.signature, key);
  } catch {
    valid = false;
  }
  return valid ? { ok: true, ticket } : { ok: false, reason: "bad_signature" };
}

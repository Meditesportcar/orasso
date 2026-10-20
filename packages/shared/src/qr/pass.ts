// QR d'inscription signé, vérifiable hors ligne (ARCHITECTURE.md § 3.1, correction du coordinateur du 15/10) :
// « OR1 » + base32 majuscules sans remplissage de (message 22 octets ‖ signature Ed25519 64 octets) = 141 caractères,
// tous dans le jeu alphanumérique du QR (version 6, correction M).
import { localDate } from "../rules/eventDays";
import { base32Decode, base32Encode, base64UrlDecode, bytesToUuid, concatBytes, uuidToBytes } from "./bytes";
import {
  decodeRotatingPayload,
  ROTATING_PREFIX,
  ROTATING_STEP_SECONDS,
  rotatingSlot,
  verifyRotatingCode,
} from "./rotating";

export const PASS_PREFIX = "OR1";
export const PASS_VERSION = 1;
export const PASS_MESSAGE_LENGTH = 22;
export const PASS_SIGNATURE_LENGTH = 64;
/** Longueur exacte d'une charge utile valide. */
export const PASS_PAYLOAD_LENGTH = PASS_PREFIX.length + Math.ceil(((22 + 64) * 8) / 5);

export type PassFields = { kid: number; eventNo: number; passId: string };

/** Message signé (grand-boutiste) : version u8 · kid u8 · event_no u32 · pass_id 16 octets. */
export function encodePassMessage({ kid, eventNo, passId }: PassFields): Uint8Array {
  if (!Number.isInteger(kid) || kid < 0 || kid > 255) throw new Error("kid hors de 0–255");
  if (!Number.isInteger(eventNo) || eventNo < 0 || eventNo > 0xffffffff) throw new Error("event_no hors u32");
  const id = uuidToBytes(passId);
  if (!id) throw new Error("pass_id invalide");
  const head = new Uint8Array(6);
  head[0] = PASS_VERSION;
  head[1] = kid;
  new DataView(head.buffer).setUint32(2, eventNo, false);
  return concatBytes(head, id);
}

export function encodePassPayload(message: Uint8Array, signature: Uint8Array): string {
  if (message.length !== PASS_MESSAGE_LENGTH || signature.length !== PASS_SIGNATURE_LENGTH) {
    throw new Error("Message ou signature de taille inattendue");
  }
  return PASS_PREFIX + base32Encode(concatBytes(message, signature));
}

export type DecodedPass = PassFields & { version: number; message: Uint8Array; signature: Uint8Array };

/** Décode sans vérifier la signature ; `null` si ce n'est pas un QR d'inscription Orasso bien formé. */
export function decodePassPayload(payload: string): DecodedPass | null {
  const text = payload.trim();
  if (!text.startsWith(PASS_PREFIX) || text.length !== PASS_PAYLOAD_LENGTH) return null;
  const raw = base32Decode(text.slice(PASS_PREFIX.length));
  if (raw?.length !== PASS_MESSAGE_LENGTH + PASS_SIGNATURE_LENGTH) return null;
  const message = raw.slice(0, PASS_MESSAGE_LENGTH);
  const signature = raw.slice(PASS_MESSAGE_LENGTH);
  const view = new DataView(message.buffer, message.byteOffset, message.byteLength);
  const version = view.getUint8(0);
  if (version !== PASS_VERSION) return null;
  return {
    version,
    kid: view.getUint8(1),
    eventNo: view.getUint32(2, false),
    passId: bytesToUuid(message.slice(6)),
    message,
    signature,
  };
}

/**
 * Vérification Ed25519 fournie par chaque plateforme (API : node:crypto ; appli : @noble/ed25519).
 * Doit renvoyer `false` (pas d'exception) pour une signature ou une clé invalide.
 */
export type Ed25519Verify = (message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array) => boolean;

export type PassCheck =
  | { ok: true; pass: DecodedPass }
  | { ok: false; reason: "malformed" | "unknown_key" | "bad_signature"; pass?: DecodedPass };

/** Décodage + signature, avec les clés publiques connues (kid → clé de 32 octets). */
export function verifyPassPayload(
  payload: string,
  keys: ReadonlyMap<number, Uint8Array>,
  verify: Ed25519Verify,
): PassCheck {
  const pass = decodePassPayload(payload);
  if (!pass) return { ok: false, reason: "malformed" };
  const key = keys.get(pass.kid);
  if (!key) return { ok: false, reason: "unknown_key", pass };
  let valid = false;
  try {
    valid = verify(pass.message, pass.signature, key);
  } catch {
    valid = false;
  }
  return valid ? { ok: true, pass } : { ok: false, reason: "bad_signature", pass };
}

// --- Décision de scan hors ligne (§ 3.1, appli du staff, lot 10) ----------------------------------------------

export const passRevokedReasons = ["withdrawn", "refused", "cancelled", "banned", "replaced"] as const;
export type PassRevokedReason = (typeof passRevokedReasons)[number];

/** Entrée de la liste d'accès locale nécessaire à la décision. */
export type LocalAccessEntry = {
  passId: string;
  status: "valid" | "revoked";
  revokedReason: PassRevokedReason | null;
  checkedInAt: string | null;
  zoneCode: string | null;
  zoneName: string | null;
  pseudo: string;
  vehicleLabel: string | null;
  /** Prestataire (lot 21) : « Prestataire · Food truck » à l'écran de scan. Absent = véhicule. */
  kind?: "vehicle" | "provider" | "media";
  providerType?: string | null;
  providerName?: string | null;
  /**
   * Événement sur plusieurs jours (lot 26) : date locale `AAAA-MM-JJ` du jour choisi à la candidature ; `null` ou
   * absent = tout l'événement (valable chaque jour).
   */
  dayDate?: string | null;
  /**
   * Lot 48 : secret du code tournant `OR2` de ce pass (32 octets, base64url), reçu dans la liste synchronisée ; absent
   * d'une liste synchronisée avant le lot 48 (le code tournant est alors refusé « Clé inconnue : synchronise »).
   */
  otpSecret?: string | null;
};

export const localScanDecisions = ["ok", "already", "refused", "override", "unknown_pass"] as const;
export type LocalScanDecision = (typeof localScanDecisions)[number];

/** `expired` (lot 48) : code tournant `OR2` hors de sa fenêtre (capture ou photo du code). */
export type ScanRefusal =
  | "unknown_qr"
  | "unknown_key"
  | "forged"
  | "expired"
  | "legacy_qr"
  | "other_event"
  | "other_day"
  | PassRevokedReason;

export type ScanDecision =
  | {
      decision: "refused";
      reason: ScanRefusal;
      passId: string | null;
      /** « Autre jour » (lot 26) : l'entrée et son jour, pour « Accepter quand même ». */
      entry?: LocalAccessEntry;
      dayDate?: string;
      /**
       * Code tournant périmé au MAC valide (relecture du lot 48) : écart du code avec l'heure du staff, en secondes
       * (positif : le téléphone du participant est en avance). Sert à dire « téléphone en avance de 2 min ».
       */
      offsetSeconds?: number;
    }
  | {
      decision: "unknown_pass";
      passId: string;
      /**
       * Relecture du lot 48 : code tournant d'un pass absent de la liste (ou d'une liste sans secret) : impossible à
       * vérifier hors ligne. « Accepter quand même » est réservé au super staff et enregistré comme entrée non vérifiée.
       */
      unverified?: true;
    }
  | { decision: "already"; passId: string; entry: LocalAccessEntry; checkedInAt: string }
  | { decision: "ok"; passId: string; entry: LocalAccessEntry };

/**
 * Décision locale d'un scan (fonction pure) : préfixe, clé, signature, événement, liste locale, déjà entré.
 * « Accepter quand même » (`override`) sur `unknown_pass` est un geste du staff, enregistré à part.
 * Lot 48 : le code tournant `OR2` est vérifié avec le secret du pass de la liste locale et l'heure `now` (obligatoire
 * pour lui) ; l'ancien QR `OR1` (signature Ed25519) reste accepté jusqu'au lot 58.
 */
export function decideScan(
  payload: string,
  ctx: {
    eventNo: number;
    keys: ReadonlyMap<number, Uint8Array>;
    verify: Ed25519Verify;
    findEntry: (passId: string) => LocalAccessEntry | undefined;
    /**
     * Heure du scan (lot 26, règle 6 bis) : une entrée d'un jour précis (`dayDate`) lue un autre jour (date locale de
     * Paris) est refusée « Autre jour » ; le staff peut l'accepter quand même. Absente : pas de contrôle du jour.
     * Lot 48 : heure de vérification du code tournant `OR2` (sans elle, un `OR2` est refusé « QR inconnu »).
     */
    now?: Date;
    /**
     * Ancien QR statique `OR1` accepté (relecture du lot 48). Activé par l'appli du staff jusqu'au lot 58 (19/10/2026 :
     * le lot 58 le coupe, avec le retrait de l'`OR1` du kit) ; absent ou faux : `OR1` refusé « Ancien QR ».
     */
    acceptLegacy?: boolean;
  },
): ScanDecision {
  if (payload.trim().startsWith(ROTATING_PREFIX)) return decideRotating(payload, ctx);
  if (!ctx.acceptLegacy && payload.trim().startsWith(PASS_PREFIX)) {
    return { decision: "refused", reason: "legacy_qr", passId: null };
  }
  const check = verifyPassPayload(payload, ctx.keys, ctx.verify);
  if (!check.ok) {
    const reason = ({ malformed: "unknown_qr", unknown_key: "unknown_key", bad_signature: "forged" } as const)[
      check.reason
    ];
    return { decision: "refused", reason, passId: null };
  }
  const { pass } = check;
  if (pass.eventNo !== ctx.eventNo) return { decision: "refused", reason: "other_event", passId: pass.passId };
  const entry = ctx.findEntry(pass.passId);
  if (!entry) return { decision: "unknown_pass", passId: pass.passId };
  return decideEntry(pass.passId, entry, ctx.now);
}

/**
 * Code tournant `OR2` : pass cherché dans la liste par son identifiant, MAC vérifié avec son secret, créneau à ±1.
 * Un pass absent de la liste (ou sans secret) ne peut pas être vérifié : `unknown_pass` non vérifié (le super staff
 * peut l'accepter quand même, entrée rapprochée par le serveur à la synchro). Périmé : l'écart est rendu.
 */
function decideRotating(
  payload: string,
  ctx: { eventNo: number; findEntry: (passId: string) => LocalAccessEntry | undefined; now?: Date },
): ScanDecision {
  const code = decodeRotatingPayload(payload);
  if (!code || !ctx.now) return { decision: "refused", reason: "unknown_qr", passId: null };
  if (code.eventNo !== ctx.eventNo) return { decision: "refused", reason: "other_event", passId: code.passId };
  const entry = ctx.findEntry(code.passId);
  // Pass révoqué : refusé quoi qu'il en soit, avec son motif (« Désisté »…), même sans pouvoir vérifier le code.
  if (entry?.status === "revoked") {
    return { decision: "refused", reason: entry.revokedReason ?? "cancelled", passId: code.passId };
  }
  const secret = entry?.otpSecret ? base64UrlDecode(entry.otpSecret) : null;
  if (!entry || !secret) return { decision: "unknown_pass", passId: code.passId, unverified: true };
  const check = verifyRotatingCode(payload, secret, ctx.now);
  if (!check.ok) {
    if (check.reason === "expired") {
      const offsetSeconds = (code.slot - rotatingSlot(ctx.now)) * ROTATING_STEP_SECONDS;
      return { decision: "refused", reason: "expired", passId: code.passId, offsetSeconds };
    }
    return { decision: "refused", reason: check.reason === "bad_mac" ? "forged" : "unknown_qr", passId: code.passId };
  }
  return decideEntry(code.passId, entry, ctx.now);
}

/** Règles communes une fois le QR authentifié : révoqué, autre jour, déjà entré, OK. */
function decideEntry(passId: string, entry: LocalAccessEntry, now: Date | undefined): ScanDecision {
  if (entry.status === "revoked") {
    return { decision: "refused", reason: entry.revokedReason ?? "cancelled", passId };
  }
  if (entry.dayDate && now && localDate(now) !== entry.dayDate) {
    // Déjà accepté quand même aujourd'hui : « déjà entré », le panneau ne se rouvre pas à chaque lecture.
    if (entry.checkedInAt && localDate(new Date(entry.checkedInAt)) === localDate(now)) {
      return { decision: "already", passId, entry, checkedInAt: entry.checkedInAt };
    }
    return { decision: "refused", reason: "other_day", passId, entry, dayDate: entry.dayDate };
  }
  if (entry.checkedInAt) return { decision: "already", passId, entry, checkedInAt: entry.checkedInAt };
  return { decision: "ok", passId, entry };
}

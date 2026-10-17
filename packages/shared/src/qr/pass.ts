// QR d'inscription signé, vérifiable hors ligne (ARCHITECTURE.md § 3.1, correction du coordinateur du 15/10) :
// « OR1 » + base32 majuscules sans remplissage de (message 22 octets ‖ signature Ed25519 64 octets) = 141 caractères,
// tous dans le jeu alphanumérique du QR (version 6, correction M).
import { localDate } from "../rules/eventDays";
import { base32Decode, base32Encode, bytesToUuid, concatBytes, uuidToBytes } from "./bytes";

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
  kind?: "vehicle" | "provider";
  providerType?: string | null;
  providerName?: string | null;
  /**
   * Événement sur plusieurs jours (lot 26) : date locale `AAAA-MM-JJ` du jour choisi à la candidature ; `null` ou
   * absent = tout l'événement (valable chaque jour).
   */
  dayDate?: string | null;
};

export const localScanDecisions = ["ok", "already", "refused", "override", "unknown_pass"] as const;
export type LocalScanDecision = (typeof localScanDecisions)[number];

export type ScanRefusal = "unknown_qr" | "unknown_key" | "forged" | "other_event" | "other_day" | PassRevokedReason;

export type ScanDecision =
  | {
      decision: "refused";
      reason: ScanRefusal;
      passId: string | null;
      /** « Autre jour » (lot 26) : l'entrée et son jour, pour « Accepter quand même ». */
      entry?: LocalAccessEntry;
      dayDate?: string;
    }
  | { decision: "unknown_pass"; passId: string }
  | { decision: "already"; passId: string; entry: LocalAccessEntry; checkedInAt: string }
  | { decision: "ok"; passId: string; entry: LocalAccessEntry };

/**
 * Décision locale d'un scan (fonction pure) : préfixe, clé, signature, événement, liste locale, déjà entré.
 * « Accepter quand même » (`override`) sur `unknown_pass` est un geste du staff, enregistré à part.
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
     */
    now?: Date;
  },
): ScanDecision {
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
  if (entry.status === "revoked") {
    return { decision: "refused", reason: entry.revokedReason ?? "cancelled", passId: pass.passId };
  }
  if (entry.dayDate && ctx.now && localDate(ctx.now) !== entry.dayDate) {
    // Déjà accepté quand même aujourd'hui : « déjà entré », le panneau ne se rouvre pas à chaque lecture.
    if (entry.checkedInAt && localDate(new Date(entry.checkedInAt)) === localDate(ctx.now)) {
      return { decision: "already", passId: pass.passId, entry, checkedInAt: entry.checkedInAt };
    }
    return { decision: "refused", reason: "other_day", passId: pass.passId, entry, dayDate: entry.dayDate };
  }
  if (entry.checkedInAt) return { decision: "already", passId: pass.passId, entry, checkedInAt: entry.checkedInAt };
  return { decision: "ok", passId: pass.passId, entry };
}

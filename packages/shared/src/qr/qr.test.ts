/// <reference types="node" />
// QR d'inscription signé et QR de compte (ARCHITECTURE.md § 3, tests de `qr.test.ts`).
import { createHmac, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";

import { accountQrCounter, accountQrPayload, decodeAccountQrPayload, hotp, matchAccountQrCounter } from "./account";
import { base32Decode, base32Encode, base64UrlDecode, base64UrlEncode, uuidToBytes } from "./bytes";
import { accessListSigningText, canonicalJson } from "./canonical";
import {
  decideScan,
  decodePassPayload,
  type Ed25519Verify,
  encodePassMessage,
  encodePassPayload,
  type LocalAccessEntry,
  PASS_PAYLOAD_LENGTH,
  verifyPassPayload,
} from "./pass";

// --- Ed25519 avec node:crypto (l'appli utilisera @noble/ed25519 derrière la même signature) -----------------
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return { privateKey, publicKey: new Uint8Array(raw) };
}

const nodeVerify: Ed25519Verify = (message, signature, publicKey) =>
  verify(
    null,
    message,
    createPublicKey({ key: Buffer.concat([SPKI_PREFIX, publicKey]), format: "der", type: "spki" }),
    signature,
  );

const PASS_ID = "3f2c8a1e-9b4d-4c7a-8e21-5d6f7a8b9c0d";
const main = keyPair();
const other = keyPair();

function makePayload(fields = { kid: 1, eventNo: 4242, passId: PASS_ID }, key = main.privateKey) {
  const message = encodePassMessage(fields);
  return encodePassPayload(message, new Uint8Array(sign(null, message, key)));
}

const keys = new Map([[1, main.publicKey]]);

describe("base32 et base64url", () => {
  it("aller-retour sur des tailles variées", () => {
    for (const n of [0, 1, 2, 5, 16, 22, 86]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);
      expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
      expect(base64UrlDecode(base64UrlEncode(bytes))).toEqual(bytes);
    }
  });
  it("vecteurs de la RFC 4648 (sans remplissage)", () => {
    const enc = (s: string) => base32Encode(Uint8Array.from(s, (c) => c.charCodeAt(0)));
    expect(enc("f")).toBe("MY");
    expect(enc("foobar")).toBe("MZXW6YTBOI");
  });
  it("refuse les minuscules, les caractères étrangers et les bits de remplissage non nuls", () => {
    expect(base32Decode("mzxw6ytboi")).toBeNull();
    expect(base32Decode("MZXW6YTBO1")).toBeNull();
    expect(base32Decode("MZ")).toBeNull(); // « f » s'écrit MY : bits de fin non nuls
  });
});

describe("QR d'inscription signé", () => {
  it("encode 22 + 64 octets en 141 caractères alphanumériques", () => {
    const payload = makePayload();
    expect(payload).toHaveLength(141);
    expect(PASS_PAYLOAD_LENGTH).toBe(141);
    expect(payload).toMatch(/^OR1[A-Z2-7]+$/);
  });

  it("décode les champs", () => {
    const decoded = decodePassPayload(makePayload());
    expect(decoded).toMatchObject({ version: 1, kid: 1, eventNo: 4242, passId: PASS_ID });
    expect(decoded?.message).toHaveLength(22);
    expect(decoded?.signature).toHaveLength(64);
  });

  it("tient en QR version 6, correction M, mode alphanumérique", () => {
    const qr = QRCode.create(makePayload(), { errorCorrectionLevel: "M" });
    expect(qr.version).toBe(6);
    expect(qr.modules.size).toBe(41);
    expect(qr.segments.map((s) => s.mode.id)).toEqual(["Alphanumeric"]);
  });

  it("signature valide avec la seule clé publique", () => {
    expect(verifyPassPayload(makePayload(), keys, nodeVerify)).toMatchObject({ ok: true });
  });

  it("charge utile altérée d'un seul bit : refusée", () => {
    const payload = makePayload();
    const raw = base32Decode(payload.slice(3)) as Uint8Array;
    // Un bit du message (numéro d'événement), puis un bit de la signature.
    for (const index of [3, 40]) {
      const tampered = raw.slice();
      tampered[index] = (tampered[index] ?? 0) ^ 1;
      const check = verifyPassPayload(`OR1${base32Encode(tampered)}`, keys, nodeVerify);
      expect(check).toMatchObject({ ok: false, reason: "bad_signature" });
    }
    // Un caractère du texte remplacé.
    const swapped = payload.slice(0, 50) + (payload[50] === "A" ? "B" : "A") + payload.slice(51);
    expect(verifyPassPayload(swapped, keys, nodeVerify).ok).toBe(false);
  });

  it("signé par une autre clé : refusé", () => {
    const forged = makePayload(undefined, other.privateKey);
    expect(verifyPassPayload(forged, keys, nodeVerify)).toMatchObject({ ok: false, reason: "bad_signature" });
  });

  it("clé inconnue (kid absent) : refusé", () => {
    const payload = makePayload({ kid: 7, eventNo: 4242, passId: PASS_ID });
    expect(verifyPassPayload(payload, keys, nodeVerify)).toMatchObject({ ok: false, reason: "unknown_key" });
  });

  it("QR étranger, tronqué ou d'une autre version : malformé", () => {
    for (const p of ["https://exemple.fr", "OR1", makePayload().slice(0, 140), `OR2${makePayload().slice(3)}`]) {
      expect(verifyPassPayload(p, keys, nodeVerify)).toMatchObject({ ok: false, reason: "malformed" });
    }
    // Version 2 dans le message, correctement signée : refusée aussi.
    const message = encodePassMessage({ kid: 1, eventNo: 1, passId: PASS_ID });
    message[0] = 2;
    const v2 = encodePassPayload(message, new Uint8Array(sign(null, message, main.privateKey)));
    expect(decodePassPayload(v2)).toBeNull();
  });

  it("refuse un pass_id ou un kid invalide à l'encodage", () => {
    expect(() => encodePassMessage({ kid: 256, eventNo: 1, passId: PASS_ID })).toThrow();
    expect(() => encodePassMessage({ kid: 1, eventNo: 1, passId: "pas-un-uuid" })).toThrow();
    expect(uuidToBytes(PASS_ID)).toHaveLength(16);
  });
});

describe("décision de scan hors ligne (decideScan)", () => {
  const entry = (over: Partial<LocalAccessEntry> = {}): LocalAccessEntry => ({
    passId: PASS_ID,
    status: "valid",
    revokedReason: null,
    checkedInAt: null,
    zoneCode: "JDM",
    zoneName: "JDM",
    pseudo: "Kenji_66",
    vehicleLabel: "Toyota Supra Mk4",
    ...over,
  });
  const ctx = (found?: LocalAccessEntry) => ({
    eventNo: 4242,
    keys,
    verify: nodeVerify,
    findEntry: (id: string) => (found && id === found.passId ? found : undefined),
    acceptLegacy: true,
  });

  it("OK avec la zone", () => {
    const d = decideScan(makePayload(), ctx(entry()));
    expect(d).toMatchObject({ decision: "ok", passId: PASS_ID, entry: { zoneCode: "JDM" } });
  });
  it("déjà entré", () => {
    const d = decideScan(makePayload(), ctx(entry({ checkedInAt: "2026-10-15T17:02:00.000Z" })));
    expect(d).toMatchObject({ decision: "already", checkedInAt: "2026-10-15T17:02:00.000Z" });
  });
  it("désisté", () => {
    const d = decideScan(makePayload(), ctx(entry({ status: "revoked", revokedReason: "withdrawn" })));
    expect(d).toMatchObject({ decision: "refused", reason: "withdrawn" });
  });
  it("absent de la liste locale : « synchronise », acceptable quand même", () => {
    expect(decideScan(makePayload(), ctx())).toMatchObject({ decision: "unknown_pass", passId: PASS_ID });
  });
  it("autre événement", () => {
    const d = decideScan(makePayload({ kid: 1, eventNo: 99, passId: PASS_ID }), ctx(entry()));
    expect(d).toMatchObject({ decision: "refused", reason: "other_event" });
  });
  it("falsifié, clé inconnue, QR inconnu", () => {
    expect(decideScan(makePayload(undefined, other.privateKey), ctx(entry()))).toMatchObject({ reason: "forged" });
    expect(decideScan(makePayload({ kid: 9, eventNo: 4242, passId: PASS_ID }), ctx(entry()))).toMatchObject({
      reason: "unknown_key",
    });
    expect(decideScan("bonjour", ctx(entry()))).toMatchObject({ decision: "refused", reason: "unknown_qr" });
  });

  describe("plusieurs jours (lot 26, règle 6 bis)", () => {
    // 14/03/2027 10:00 et 15/03/2027 10:00, heure de Paris (UTC+1).
    const day1 = new Date("2027-03-14T09:00:00.000Z");
    const day2 = new Date("2027-03-15T09:00:00.000Z");
    const at = (found: LocalAccessEntry, now: Date) => ({ ...ctx(found), now });

    it("candidature d'un jour lue ce jour-là : OK", () => {
      const d = decideScan(makePayload(), at(entry({ dayDate: "2027-03-15" }), day2));
      expect(d).toMatchObject({ decision: "ok" });
    });
    it("candidature d'un jour lue un autre jour : « Autre jour », avec l'entrée pour accepter quand même", () => {
      const d = decideScan(makePayload(), at(entry({ dayDate: "2027-03-15" }), day1));
      expect(d).toMatchObject({
        decision: "refused",
        reason: "other_day",
        dayDate: "2027-03-15",
        entry: { pseudo: "Kenji_66" },
      });
    });
    it("le jour se lit en heure de Paris (23:30 UTC le 14 = 00:30 le 15 à Paris)", () => {
      const d = decideScan(makePayload(), at(entry({ dayDate: "2027-03-15" }), new Date("2027-03-14T23:30:00.000Z")));
      expect(d).toMatchObject({ decision: "ok" });
    });
    it("tout l'événement : OK chaque jour, puis « déjà entré » les jours suivants (S29)", () => {
      expect(decideScan(makePayload(), at(entry({ dayDate: null }), day1))).toMatchObject({ decision: "ok" });
      const later = entry({ dayDate: null, checkedInAt: day1.toISOString() });
      expect(decideScan(makePayload(), at(later, day2))).toMatchObject({ decision: "already" });
    });
    it("un pass révoqué reste « Désisté » avant le contrôle du jour", () => {
      const d = decideScan(
        makePayload(),
        at(entry({ dayDate: "2027-03-15", status: "revoked", revokedReason: "withdrawn" }), day1),
      );
      expect(d).toMatchObject({ decision: "refused", reason: "withdrawn" });
    });
    it("accepté quand même aujourd'hui (entrée du jour) : « déjà entré », pas de nouveau panneau", () => {
      const accepted = entry({ dayDate: "2027-03-15", checkedInAt: "2027-03-14T08:30:00.000Z" });
      expect(decideScan(makePayload(), at(accepted, day1))).toMatchObject({ decision: "already" });
      // Une entrée d'un autre jour que celui du scan ne compte pas : « autre jour ».
      const earlier = entry({ dayDate: "2027-03-15", checkedInAt: "2027-03-13T08:30:00.000Z" });
      expect(decideScan(makePayload(), at(earlier, day1))).toMatchObject({ reason: "other_day" });
    });
    it("sans heure fournie (ancien appel), aucun contrôle du jour", () => {
      expect(decideScan(makePayload(), ctx(entry({ dayDate: "2027-03-15" })))).toMatchObject({ decision: "ok" });
    });
  });
});

describe("JSON canonique (signature de la liste d'accès)", () => {
  it("indépendant de l'ordre des clés, sans la signature", () => {
    const a = { eventNo: 1, entries: [{ b: 2, a: 1 }], generatedAt: new Date(0), signature: "x" };
    const b = { signature: "y", generatedAt: "1970-01-01T00:00:00.000Z", entries: [{ a: 1, b: 2 }], eventNo: 1 };
    expect(accessListSigningText(a)).toBe(accessListSigningText(b));
    expect(canonicalJson({ z: null, a: [1, "é"], m: { y: true, x: undefined } })).toBe(
      '{"a":[1,"é"],"m":{"y":true},"z":null}',
    );
  });
});

describe("QR de compte dynamique (HOTP 60 s, 8 chiffres)", () => {
  const hmac = (key: Uint8Array, message: Uint8Array) =>
    new Uint8Array(createHmac("sha1", key).update(message).digest());
  const rfcSecret = Uint8Array.from("12345678901234567890", (c) => c.charCodeAt(0));

  it("vecteurs de la RFC 4226 (tronqués à 8 chiffres)", () => {
    expect(hotp(rfcSecret, 0, hmac)).toBe("84755224");
    expect(hotp(rfcSecret, 1, hmac)).toBe("94287082");
    expect(hotp(rfcSecret, 2, hmac)).toBe("37359152");
  });

  const secret = Uint8Array.from({ length: 32 }, (_, i) => i * 7);
  const shortId = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
  const t = new Date("2026-10-17T15:00:30Z");

  it("charge utile courte, décodable", () => {
    const payload = accountQrPayload(secret, shortId, t, hmac);
    expect(payload).toMatch(/^OA1[A-Za-z0-9_-]{11}\.\d{8}$/);
    expect(payload.length).toBe(23);
    // Version 2-M en mode octets : 26 caractères au plus.
    expect(QRCode.create(payload, { errorCorrectionLevel: "M" }).version).toBeLessThanOrEqual(2);
    expect(decodeAccountQrPayload(payload)?.shortId).toEqual(shortId);
    expect(decodeAccountQrPayload("OA1abc.123")).toBeNull();
  });

  it("fenêtres c−1, c, c+1 acceptées ; c−2 et c+2 refusées", () => {
    const c = accountQrCounter(t);
    for (const d of [-1, 0, 1]) expect(matchAccountQrCounter(secret, hotp(secret, c + d, hmac), t, hmac)).toBe(c + d);
    for (const d of [-2, 2]) expect(matchAccountQrCounter(secret, hotp(secret, c + d, hmac), t, hmac)).toBeNull();
  });

  it("un secret régénéré invalide les anciens codes", () => {
    const code = hotp(secret, accountQrCounter(t), hmac);
    const fresh = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);
    expect(matchAccountQrCounter(fresh, code, t, hmac)).toBeNull();
  });
});

// Garde-fou : la dérivation de la clé publique depuis la graine (utilisée par l'API) est cohérente.
describe("clé Ed25519 depuis une graine de 32 octets", () => {
  it("PKCS#8 → même clé publique que la paire générée", () => {
    const seed = Buffer.alloc(32, 9);
    const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
    const priv = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
    const pub = new Uint8Array(createPublicKey(priv).export({ format: "der", type: "spki" }).subarray(-32));
    const message = encodePassMessage({ kid: 1, eventNo: 1, passId: PASS_ID });
    expect(nodeVerify(message, new Uint8Array(sign(null, message, priv)), pub)).toBe(true);
  });
});

/// <reference types="node" />
// Code tournant OR2 (lot 48) : format, vecteurs fixes, fenêtre de ±1 créneau, MAC faux, longueur ; `decideScan` sur
// un OR2 (ok, déjà entré, périmé, pass inconnu, révoqué, sans secret).
import { createHmac, generateKeyPairSync, sign } from "node:crypto";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";

import { base32Encode, base64UrlEncode, concatBytes } from "./bytes";
import { decideScan, encodePassMessage, encodePassPayload, type LocalAccessEntry } from "./pass";
import {
  decodeRotatingPayload,
  encodeRotatingMessage,
  ROTATING_PAYLOAD_LENGTH,
  rotatingCodeAt,
  rotatingCodeForSlot,
  rotatingNumber,
  rotatingSlot,
  secondsLeft,
  verifyRotatingCode,
} from "./rotating";

const PASS_ID = "3f2c8a1e-9b4d-4c7a-8e21-5d6f7a8b9c0d";
const SECRET = Uint8Array.from({ length: 32 }, (_, i) => i);
const T0 = new Date("2026-11-07T08:12:05Z"); // créneau 89 701 956, 15 s avant le suivant
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

describe("code tournant OR2", () => {
  it("créneau de 20 s, secondes restantes, numéro affiché", () => {
    expect(rotatingSlot(T0)).toBe(Math.floor(T0.getTime() / 20_000));
    expect(secondsLeft(new Date("2026-11-07T08:12:00Z"))).toBe(20);
    expect(secondsLeft(T0)).toBe(15);
    expect(secondsLeft(new Date("2026-11-07T08:12:19.900Z"))).toBe(1);
    expect(rotatingNumber(89_140_006)).toBe(6);
    expect(rotatingNumber(12_344_821)).toBe(4821);
  });

  it("message de 25 octets, HMAC-SHA256 tronqué à 16 octets (vérifié avec node:crypto)", () => {
    const fields = { eventNo: 4242, passId: PASS_ID, slot: rotatingSlot(T0) };
    const message = encodeRotatingMessage(fields);
    expect(message).toHaveLength(25);
    expect(message[0]).toBe(2);
    const mac = createHmac("sha256", SECRET).update(message).digest().subarray(0, 16);
    expect(rotatingCodeForSlot(SECRET, fields)).toBe(`OR2${base32Encode(concatBytes(message, mac))}`);
  });

  it("vecteur fixe (secret 00…1f, événement 4242, créneau 89 140 006)", () => {
    expect(rotatingCodeForSlot(SECRET, { eventNo: 4242, passId: PASS_ID, slot: 89_140_006 })).toBe(
      "OR2AIAAAEESH4WIUHU3JVGHVDRBLVXXVC44BUCVAKZG2UW3SL4RXXT2ELMXBBO24WUC2A",
    );
  });

  it("69 caractères alphanumériques, plus petit que l'OR1 (QR version 4 au plus, correction M)", () => {
    const code = rotatingCodeAt(SECRET, 4242, PASS_ID, T0);
    expect(code).toHaveLength(69);
    expect(ROTATING_PAYLOAD_LENGTH).toBe(69);
    expect(code).toMatch(/^OR2[A-Z2-7]{66}$/);
    expect(QRCode.create(code, { errorCorrectionLevel: "M" }).version).toBeLessThanOrEqual(4);
  });

  it("décode les champs", () => {
    const code = rotatingCodeAt(SECRET, 4242, PASS_ID, T0);
    expect(decodeRotatingPayload(code)).toMatchObject({ version: 2, eventNo: 4242, passId: PASS_ID });
    expect(decodeRotatingPayload(code)?.slot).toBe(rotatingSlot(T0));
  });

  it("valide au créneau courant et à ±20 s", () => {
    const code = rotatingCodeAt(SECRET, 4242, PASS_ID, T0);
    expect(verifyRotatingCode(code, SECRET, T0)).toMatchObject({ ok: true, slotOffset: 0 });
    expect(verifyRotatingCode(code, SECRET, at(20))).toMatchObject({ ok: true, slotOffset: -1 });
    expect(verifyRotatingCode(code, SECRET, at(-20))).toMatchObject({ ok: true, slotOffset: 1 });
  });

  it("périmé à +61 s (et à −41 s : téléphone du participant très en avance)", () => {
    const code = rotatingCodeAt(SECRET, 4242, PASS_ID, T0);
    expect(verifyRotatingCode(code, SECRET, at(61))).toMatchObject({ ok: false, reason: "expired" });
    expect(verifyRotatingCode(code, SECRET, at(-41))).toMatchObject({ ok: false, reason: "expired" });
  });

  it("MAC faux : autre secret, octet modifié", () => {
    const code = rotatingCodeAt(SECRET, 4242, PASS_ID, T0);
    const other = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);
    expect(verifyRotatingCode(code, other, T0)).toMatchObject({ ok: false, reason: "bad_mac" });
    // Créneau réécrit (rejeu « rajeuni ») : le MAC ne correspond plus.
    const decoded = decodeRotatingPayload(code);
    if (!decoded) throw new Error("décodage");
    const message = encodeRotatingMessage({ eventNo: 4242, passId: PASS_ID, slot: decoded.slot + 3 });
    const forged = `OR2${base32Encode(concatBytes(message, decoded.mac))}`;
    expect(verifyRotatingCode(forged, SECRET, at(60))).toMatchObject({ ok: false, reason: "bad_mac" });
  });

  it("longueur, préfixe, alphabet et version", () => {
    const code = rotatingCodeAt(SECRET, 4242, PASS_ID, T0);
    expect(verifyRotatingCode(code.slice(0, -1), SECRET, T0)).toMatchObject({ ok: false, reason: "malformed" });
    expect(verifyRotatingCode(`${code}A`, SECRET, T0)).toMatchObject({ ok: false, reason: "malformed" });
    expect(verifyRotatingCode(`OR1${code.slice(3)}`, SECRET, T0)).toMatchObject({ ok: false, reason: "malformed" });
    expect(verifyRotatingCode(code.toLowerCase(), SECRET, T0)).toMatchObject({ ok: false, reason: "malformed" });
    const v3 = encodeRotatingMessage({ eventNo: 1, passId: PASS_ID, slot: 1 });
    v3[0] = 3;
    expect(decodeRotatingPayload(`OR2${base32Encode(concatBytes(v3, new Uint8Array(16)))}`)).toBeNull();
    expect(() => encodeRotatingMessage({ eventNo: -1, passId: PASS_ID, slot: 1 })).toThrow();
    expect(() => encodeRotatingMessage({ eventNo: 1, passId: "pas-un-uuid", slot: 1 })).toThrow();
  });
});

describe("decideScan avec un code tournant OR2", () => {
  const entry = (over: Partial<LocalAccessEntry> = {}): LocalAccessEntry => ({
    passId: PASS_ID,
    status: "valid",
    revokedReason: null,
    checkedInAt: null,
    zoneCode: "JDM",
    zoneName: "Japonaises",
    pseudo: "Kenji_66",
    vehicleLabel: "Toyota GR Supra",
    otpSecret: base64UrlEncode(SECRET),
    ...over,
  });
  const ctx = (e: LocalAccessEntry | undefined, now = T0) => ({
    eventNo: 4242,
    keys: new Map<number, Uint8Array>(),
    verify: () => false,
    findEntry: (id: string) => (e && id === e.passId ? e : undefined),
    now,
  });
  const code = rotatingCodeAt(SECRET, 4242, PASS_ID, T0);

  it("OK, puis déjà entré", () => {
    expect(decideScan(code, ctx(entry()))).toMatchObject({ decision: "ok", passId: PASS_ID });
    const inside = entry({ checkedInAt: T0.toISOString() });
    expect(decideScan(code, ctx(inside, at(5)))).toMatchObject({ decision: "already", checkedInAt: T0.toISOString() });
  });

  it("périmé après 61 s : refusé « Code périmé »", () => {
    expect(decideScan(code, ctx(entry(), at(61)))).toEqual({ decision: "refused", reason: "expired", passId: PASS_ID });
  });

  it("pass inconnu ou liste sans secret : refusé « Clé inconnue », jamais « accepter quand même »", () => {
    expect(decideScan(code, ctx(undefined))).toEqual({ decision: "refused", reason: "unknown_key", passId: PASS_ID });
    expect(decideScan(code, ctx(entry({ otpSecret: null })))).toMatchObject({ reason: "unknown_key" });
  });

  it("pass révoqué : refusé avec son motif", () => {
    const revoked = entry({ status: "revoked", revokedReason: "withdrawn", otpSecret: null });
    expect(decideScan(code, ctx(revoked))).toMatchObject({ decision: "refused", reason: "withdrawn" });
  });

  it("autre événement, MAC faux, sans heure", () => {
    const other = rotatingCodeAt(SECRET, 4243, PASS_ID, T0);
    expect(decideScan(other, ctx(entry()))).toMatchObject({ decision: "refused", reason: "other_event" });
    const wrong = entry({ otpSecret: base64UrlEncode(new Uint8Array(32).fill(7)) });
    expect(decideScan(code, ctx(wrong))).toMatchObject({ decision: "refused", reason: "forged" });
    expect(decideScan(code, { ...ctx(entry()), now: undefined })).toMatchObject({ reason: "unknown_qr" });
  });

  it("l'OR1 reste accepté à côté de l'OR2", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const raw = new Uint8Array(publicKey.export({ format: "der", type: "spki" }).subarray(-32));
    const message = encodePassMessage({ kid: 1, eventNo: 4242, passId: PASS_ID });
    const or1 = encodePassPayload(message, new Uint8Array(sign(null, message, privateKey)));
    const decision = decideScan(or1, { ...ctx(entry()), keys: new Map([[1, raw]]), verify: () => true });
    expect(decision).toMatchObject({ decision: "ok", passId: PASS_ID });
  });
});

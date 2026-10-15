/// <reference types="node" />
// Logique pure de l'appli (sans React Native) : QR de compte, dessin du QR d'inscription, fenêtre du mode jour J,
// formats de date.
import { createHmac } from "node:crypto";
import {
  type AccountQrSecret,
  accountQrPayload,
  decodeAccountQrPayload,
  encodePassPayload,
  encodePassMessage,
  type HmacSha1,
  matchAccountQrCounter,
  PASS_PAYLOAD_LENGTH,
} from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { accountQrAt, hmacSha1, secondsLeft } from "./accountQr";
import { breakTitle, dayCountdown, formatDay, formatDayHour, formatDuration, formatHour } from "./format";
import { jourJClosesAt, jourJOpensAt, jourJState, weatherLabel } from "./jourj";
import { qrMatrix, qrPath, qrViewBox } from "./qr";

const nodeHmac: HmacSha1 = (key, message) => new Uint8Array(createHmac("sha1", key).update(message).digest());

describe("QR de compte hors ligne", () => {
  const secretBytes = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 3) % 256);
  const shortId = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
  const secret: AccountQrSecret = {
    secret: Buffer.from(secretBytes).toString("base64url"),
    shortId: Buffer.from(shortId).toString("base64url"),
    stepSeconds: 60,
    digits: 8,
  };
  const at = new Date("2026-10-17T15:00:20Z");

  it("donne le même code que l'API (HMAC-SHA1 de node:crypto)", () => {
    expect(accountQrAt(secret, at)).toBe(accountQrPayload(secretBytes, shortId, at, nodeHmac));
  });

  it("est reconnu par la vérification de l'API, et expire après la fenêtre de tolérance", () => {
    const payload = accountQrAt(secret, at);
    const decoded = decodeAccountQrPayload(payload);
    expect(decoded).not.toBeNull();
    expect(matchAccountQrCounter(secretBytes, decoded?.code ?? "", at, nodeHmac)).not.toBeNull();
    const later = new Date(at.getTime() + 5 * 60_000);
    expect(matchAccountQrCounter(secretBytes, decoded?.code ?? "", later, nodeHmac)).toBeNull();
  });

  it("se redessine toutes les 60 s", () => {
    expect(accountQrAt(secret, new Date("2026-10-17T15:00:01Z"))).toBe(accountQrAt(secret, new Date("2026-10-17T15:00:59Z")));
    expect(accountQrAt(secret, new Date("2026-10-17T15:00:59Z"))).not.toBe(accountQrAt(secret, new Date("2026-10-17T15:01:00Z")));
    expect(secondsLeft(new Date("2026-10-17T15:00:20Z"))).toBe(40);
    expect(hmacSha1(secretBytes, shortId)).toEqual(nodeHmac(secretBytes, shortId));
  });
});

describe("QR d'inscription", () => {
  it("une charge utile OR1 tient en version 6, correction M (41 × 41)", () => {
    const message = encodePassMessage({ kid: 1, eventNo: 7, passId: "11111111-2222-4333-8444-555555555555" });
    const payload = encodePassPayload(message, new Uint8Array(64).fill(170));
    expect(payload).toHaveLength(PASS_PAYLOAD_LENGTH);
    const matrix = qrMatrix(payload);
    expect(matrix.version).toBe(6);
    expect(matrix.size).toBe(41);
    expect(qrViewBox(matrix)).toBe(49);
    // Motif de repérage en haut à gauche : un carré sombre de 7 × 7 modules.
    expect([0, 6].every((x) => matrix.dark(x, 0) && matrix.dark(x, 6))).toBe(true);
    expect(qrPath(matrix).startsWith("M4 4h7")).toBe(true);
  });
});

describe("Mode jour J : fenêtre d'ouverture", () => {
  // Nocturne de Canet : samedi 17 octobre 2026, 19 h – 23 h (heure de Paris, UTC+2).
  const event = { startsAt: "2026-10-17T17:00:00Z", endsAt: "2026-10-17T21:00:00Z" };

  it("s'ouvre la veille à 00 h et se ferme à J+1 00 h", () => {
    expect(jourJOpensAt(event).toISOString()).toBe("2026-10-15T22:00:00.000Z");
    expect(jourJClosesAt(event).toISOString()).toBe("2026-10-17T22:00:00.000Z");
  });

  it("trois états : pas encore, ouvert, fermé (par l'heure ou par le scan)", () => {
    expect(jourJState(event, new Date("2026-10-15T21:59:00Z"), false)).toBe("early");
    expect(jourJState(event, new Date("2026-10-15T22:00:00Z"), false)).toBe("open");
    expect(jourJState(event, new Date("2026-10-17T16:00:00Z"), false)).toBe("open");
    expect(jourJState(event, new Date("2026-10-17T16:00:00Z"), true)).toBe("closed");
    expect(jourJState(event, new Date("2026-10-17T22:00:00Z"), false)).toBe("closed");
  });

  it("gère le changement d'heure (fin octobre)", () => {
    const winter = { startsAt: "2026-10-25T10:00:00Z", endsAt: "2026-10-25T14:00:00Z" };
    // La veille 24 oct 00 h = UTC+2 → 23 oct 22:00Z ; J+1 26 oct 00 h = UTC+1 → 25 oct 23:00Z.
    expect(jourJOpensAt(winter).toISOString()).toBe("2026-10-23T22:00:00.000Z");
    expect(jourJClosesAt(winter).toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });

  it("météo en français", () => {
    expect(weatherLabel(0)).toBe("dégagé");
    expect(weatherLabel(63)).toBe("pluie");
    expect(weatherLabel(95)).toBe("orage");
  });
});

describe("Formats", () => {
  it("dates et heures de l'événement en heure de Paris", () => {
    expect(formatDay("2026-10-17T17:00:00Z")).toBe("Sam 17 oct");
    expect(formatHour("2026-10-17T17:00:00Z")).toBe("19 h");
    expect(formatHour("2026-10-17T17:30:00Z")).toBe("19 h 30");
    expect(formatDayHour("2026-10-17T17:00:00Z")).toBe("Sam 17 oct · 19 h");
  });
  it("durées et compte à rebours", () => {
    expect(formatDuration(102 * 60_000)).toBe("1 h 42");
    expect(formatDuration(12 * 60_000)).toBe("12 min");
    expect(formatDuration(45_000)).toBe("45 s");
    expect(dayCountdown("2026-10-17T17:00:00Z", new Date("2026-10-15T10:00:00Z"))).toBe("J-2");
    expect(dayCountdown("2026-10-17T17:00:00Z", new Date("2026-10-17T05:00:00Z"))).toBe("Aujourd'hui");
  });
  it("titre d'affiche sur deux lignes", () => {
    expect(breakTitle("Nocturne de Canet")).toBe("Nocturne\nde Canet");
    expect(breakTitle("Salon")).toBe("Salon");
  });
});

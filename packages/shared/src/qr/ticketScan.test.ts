/// <reference types="node" />
// Décision de scan hors ligne d'un billet de visiteur (rôle boutique, lot 24).
import { createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { describe, expect, it } from "vitest";

import { type Ed25519Verify, encodePassMessage, encodePassPayload } from "./pass";
import { decideTicketScan, encodeTicketMessage, encodeTicketPayload, type LocalTicket } from "./ticket";

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

const main = keyPair();
const other = keyPair();
const keys = new Map([[1, main.publicKey]]);
const TICKET_ID = "3f2c8a1e-9b4d-4c7a-8e21-5d6f7a8b9c0d";
const EVENT_NO = 4242;

function ticketQr(fields = { kid: 1, eventNo: EVENT_NO, passId: TICKET_ID }, key = main.privateKey) {
  const message = encodeTicketMessage(fields);
  return encodeTicketPayload(message, new Uint8Array(sign(null, message, key)));
}

const listed: LocalTicket = {
  ticketId: TICKET_ID,
  status: "valid",
  holderLabel: "Kenji",
  typeLabel: "Entrée",
  usedAt: null,
};
const ctx = (tickets: LocalTicket[] = [listed], usedLocally?: Map<string, string>) => ({
  eventNo: EVENT_NO,
  keys,
  verify: nodeVerify,
  findTicket: (id: string) => tickets.find((t) => t.ticketId === id),
  usedLocally: usedLocally ? (id: string) => usedLocally.get(id) : undefined,
});

describe("décision de scan d'un billet (decideTicketScan)", () => {
  it("billet de la liste, valide : ok", () => {
    expect(decideTicketScan(ticketQr(), ctx())).toMatchObject({ decision: "ok", ticketId: TICKET_ID, listed: true });
  });

  it("billet déjà utilisé selon la liste du serveur : already, avec l'heure", () => {
    const used: LocalTicket = { ...listed, status: "used", usedAt: "2026-10-17T09:48:00.000Z" };
    expect(decideTicketScan(ticketQr(), ctx([used]))).toMatchObject({
      decision: "already",
      usedAt: "2026-10-17T09:48:00.000Z",
    });
  });

  it("billet déjà accepté sur cet appareil (pas encore envoyé) : already (anti-rejeu local)", () => {
    const usedHere = new Map([[TICKET_ID, "2026-10-17T10:00:00.000Z"]]);
    expect(decideTicketScan(ticketQr(), ctx([listed], usedHere))).toMatchObject({
      decision: "already",
      usedAt: "2026-10-17T10:00:00.000Z",
    });
    // Même sans entrée dans la liste.
    expect(decideTicketScan(ticketQr(), ctx([], usedHere))).toMatchObject({ decision: "already" });
  });

  it("billet annulé : refusé", () => {
    expect(decideTicketScan(ticketQr(), ctx([{ ...listed, status: "cancelled" }]))).toEqual({
      decision: "refused",
      reason: "cancelled",
      ticketId: TICKET_ID,
    });
  });

  it("billet falsifié (autre clé) : refusé forged ; clé inconnue ; forme illisible", () => {
    expect(decideTicketScan(ticketQr(undefined, other.privateKey), ctx())).toMatchObject({
      decision: "refused",
      reason: "forged",
    });
    expect(decideTicketScan(ticketQr({ kid: 9, eventNo: EVENT_NO, passId: TICKET_ID }), ctx())).toMatchObject({
      decision: "refused",
      reason: "unknown_key",
    });
    expect(decideTicketScan("OB1NIMPORTEQUOI", ctx())).toMatchObject({ decision: "refused", reason: "malformed" });
    expect(decideTicketScan("https://exemple.fr/qr", ctx())).toMatchObject({
      decision: "refused",
      reason: "malformed",
    });
  });

  it("billet d'un autre événement : refusé other_event", () => {
    expect(decideTicketScan(ticketQr({ kid: 1, eventNo: 77, passId: TICKET_ID }), ctx())).toMatchObject({
      decision: "refused",
      reason: "other_event",
    });
  });

  it("un QR d'inscription (OR1) n'est jamais lu comme un billet", () => {
    const message = encodePassMessage({ kid: 1, eventNo: EVENT_NO, passId: TICKET_ID });
    const pass = encodePassPayload(message, new Uint8Array(sign(null, message, main.privateKey)));
    expect(decideTicketScan(pass, ctx())).toMatchObject({ decision: "refused", reason: "malformed" });
  });

  it("billet signé mais absent de la liste : ok avec listed=false (réservé après la synchro)", () => {
    expect(decideTicketScan(ticketQr(), ctx([]))).toMatchObject({ decision: "ok", ticket: null, listed: false });
  });
});

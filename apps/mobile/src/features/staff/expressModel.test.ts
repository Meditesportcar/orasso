import { describe, expect, it } from "vitest";

import { type PendingAction, sendOtherActions } from "../../lib/staff/model";
import { expressIdFor, isUncertainSend } from "./expressModel";

describe("identifiant d'idempotence de l'inscription express", () => {
  it("réseau et 5xx (502, 504…) sont incertains ; une réponse du serveur ne l'est pas", () => {
    expect(isUncertainSend({ status: 0 })).toBe(true);
    expect(isUncertainSend({ status: 502 })).toBe(true);
    expect(isUncertainSend({ status: 504 })).toBe(true);
    expect(isUncertainSend({ status: 429 })).toBe(false);
    expect(isUncertainSend({ status: 423 })).toBe(false);
    expect(isUncertainSend(null)).toBe(false);
  });
  it("après un 502, le nouvel essai de la même adresse garde le même identifiant", () => {
    let n = 0;
    const fresh = () => `id-${++n}`;
    const first = expressIdFor(null, "a@b.fr", fresh);
    expect(first.id).toBe("id-1");
    const retry = expressIdFor(first, "a@b.fr", fresh);
    expect(retry.id).toBe("id-1");
    // Une autre adresse est un autre envoi.
    expect(expressIdFor(first, "autre@b.fr", fresh).id).toBe("id-2");
  });
});

describe("file du staff : une invitation express non définitive ne retarde pas l'alerte derrière elle", () => {
  const action = (id: string, kind: PendingAction["kind"]): PendingAction => ({
    id,
    eventId: "e1",
    eventTitle: "Salon",
    userId: "u1",
    kind,
    payload: kind === "express" ? { email: "a@b.fr" } : {},
    createdAt: "2026-11-12T10:00:00.000Z",
    attempts: 0,
    lastError: null,
    nextAttemptAt: "2026-11-12T10:00:00.000Z",
    sentAt: null,
    result: null,
  });
  const now = new Date("2026-11-12T10:05:00.000Z");

  it("[invitation 503 mail_pending, alerte] : l'alerte part sans attendre, l'invitation reste en file", async () => {
    const sentIds: string[] = [];
    const keptIds: string[] = [];
    // Comme `sendOther` : 503 non définitif = `false` (reste en file, essai repoussé), succès = `true`.
    await sendOtherActions([action("inv", "express"), action("al", "alert")], now, async (a) => {
      if (a.kind === "express") {
        keptIds.push(a.id);
        return false;
      }
      sentIds.push(a.id);
      return true;
    });
    expect(keptIds).toEqual(["inv"]);
    expect(sentIds).toEqual(["al"]);
  });
  it("une invitation dont l'essai est repoussé n'est pas renvoyée, l'alerte part", async () => {
    const waiting = { ...action("inv", "express"), nextAttemptAt: "2026-11-12T10:10:00.000Z" };
    const asked: string[] = [];
    await sendOtherActions([waiting, action("al", "alert")], now, async (a) => {
      asked.push(a.id);
      return true;
    });
    expect(asked).toEqual(["al"]);
  });
});

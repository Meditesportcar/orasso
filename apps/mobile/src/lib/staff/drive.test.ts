/// <reference types="node" />
// Lot 48 : code tournant OR2 décidé avec la liste du téléphone (secret de la synchro, horloge corrigée) et accueil drive
// (plaques lues → hachage → liste, confirmation des lectures, pointage `drive` dans la file).
import { createHmac } from "node:crypto";
import { type AccessListEntry, base64UrlEncode, rotatingCodeAt, type StaffSync } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { extractPlates } from "../plates/recognize";
import { DriveGate, driveLookup, driveOutcome } from "./drive";
import { BATCH_KINDS, buildState, checkinAction, decideLocal, mergeSync, type StaffState } from "./model";

const EVENT_NO = 7;
const SALT = Buffer.from("0123456789abcdef").toString("base64url");
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SECRET = Uint8Array.from({ length: 32 }, (_, i) => (i * 7) & 255);
const T = new Date("2026-10-15T09:30:05Z");

const hash = (normalized: string) =>
  createHmac("sha256", Buffer.from(SALT, "base64url")).update(normalized, "utf8").digest("hex").slice(0, 16);

function entry(n: number, plate: string | null, over: Partial<AccessListEntry> = {}): AccessListEntry {
  return {
    passId: uuid(n),
    applicationId: uuid(1000 + n),
    status: "valid",
    revokedReason: null,
    pseudo: `Pilote_${n}`,
    vehicleLabel: "Toyota GR Supra",
    vehicleType: "car",
    kind: "vehicle",
    providerType: null,
    providerName: null,
    categories: [],
    plateHint: plate ? plate.slice(0, 3) : null,
    plateHash: plate ? hash(plate) : null,
    zoneCode: "JDM",
    zoneName: "JDM",
    checkedInAt: null,
    checkinMethod: null,
    dayDate: null,
    otpSecret: base64UrlEncode(SECRET),
    updatedAt: "2026-10-15T08:00:00.000Z",
    ...over,
  };
}

function stateWith(entries: AccessListEntry[]): StaffState {
  const body = {
    event: {
      id: uuid(1),
      eventNo: EVENT_NO,
      title: "Salon Argelès",
      startsAt: "2026-10-15T09:00:00.000Z",
      endsAt: "2026-10-15T17:00:00.000Z",
      lockAt: "2026-10-15T07:00:00.000Z",
      isLocked: true,
      plateSalt: SALT,
      zones: [{ id: uuid(9001), code: "JDM", name: "JDM", capacity: 30 }],
      days: [],
    },
    keys: [],
    myRoles: ["scan"],
    full: true,
    entries,
    removedPassIds: [],
    cursor: "2026-10-15T08:00:00.000Z",
    generatedAt: "2026-10-15T08:00:05.000Z",
    signatureKid: 0,
    signature: "",
  } as StaffSync;
  const merged = mergeSync(null, body, "user-theo", new Date("2026-10-15T08:01:00Z"));
  if (!merged.ok) throw new Error("fusion");
  return buildState(merged.meta, merged.entries, []);
}

describe("code tournant OR2 sur le téléphone du staff", () => {
  const code = rotatingCodeAt(SECRET, EVENT_NO, uuid(1), T);

  it("OK, puis déjà entré après le pointage local, puis périmé 61 s plus tard", () => {
    const state = stateWith([entry(1, "GA662KS")]);
    const first = decideLocal(state, code, new Map(), () => false, T);
    expect(first).toMatchObject({ decision: "ok", passId: uuid(1) });
    state.local.set(uuid(1), {
      passId: uuid(1),
      applicationId: uuid(1001),
      checkedInAt: T.toISOString(),
      method: "scan",
      actionId: "a",
    });
    expect(decideLocal(state, code, new Map(), () => false, new Date(T.getTime() + 5000))).toMatchObject({
      decision: "already",
    });
    expect(
      decideLocal(stateWith([entry(1, null)]), code, new Map(), () => false, new Date(T.getTime() + 61_000)),
    ).toMatchObject({ decision: "refused", reason: "expired" });
  });

  it("liste d'avant le lot 48 (sans secret) : « Clé inconnue : synchronise »", () => {
    const state = stateWith([entry(1, null, { otpSecret: undefined })]);
    expect(decideLocal(state, code, new Map(), () => false, T)).toMatchObject({ reason: "unknown_key" });
  });
});

describe("accueil drive", () => {
  const state = () =>
    stateWith([
      entry(1, "GA662KS"),
      entry(2, "BX120QT", { checkedInAt: "2026-10-15T09:10:00.000Z" }),
      entry(3, "AB123CD", { status: "revoked", revokedReason: "withdrawn" }),
    ]);

  it("retrouve la voiture par le hachage de la plaque lue (jamais la plaque en clair)", () => {
    const s = state();
    expect(driveLookup(s, extractPlates("F GA-662-KS 66")).map((m) => m.entry.pseudo)).toEqual(["Pilote_1"]);
    expect(driveLookup(s, ["ZZ999ZZ"])).toEqual([]);
    expect(JSON.stringify([...s.entries.values()])).not.toContain("GA662KS");
  });

  it("OK moutarde, déjà entré crème, refusé rouge", () => {
    const s = state();
    expect(driveOutcome(s, s.entries.get(uuid(1)) as AccessListEntry, T)).toMatchObject({ kind: "ok" });
    expect(driveOutcome(s, s.entries.get(uuid(2)) as AccessListEntry, T)).toMatchObject({ kind: "already" });
    expect(driveOutcome(s, s.entries.get(uuid(3)) as AccessListEntry, T)).toMatchObject({
      kind: "refused",
      reason: "revoked",
    });
  });

  it("confirmation : correspondance unique tout de suite ; plaque inconnue lue deux fois de suite", () => {
    const s = state();
    const gate = new DriveGate();
    expect(gate.feed(s, extractPlates("GA-662-KS"), T)).toMatchObject({ kind: "ok" });
    expect(gate.feed(s, ["ZZ999ZZ"], T)).toBeNull();
    expect(gate.feed(s, ["YY888YY"], T)).toBeNull();
    expect(gate.feed(s, ["YY888YY"], T)).toEqual({ kind: "unknown" });
    expect(gate.feed(s, [], T)).toBeNull();
    // Saisie au clavier (recette web) : une seule lecture suffit.
    expect(new DriveGate().feed(s, ["QQ111QQ"], T, true)).toEqual({ kind: "unknown" });
  });

  it("pointage `drive` dans la file, envoyé avec les lectures", () => {
    const s = state();
    const { item, checkin } = checkinAction(s.entries.get(uuid(1)) as AccessListEntry, "drive", "id-1", T);
    expect(item).toMatchObject({ kind: "drive", applicationId: uuid(1001) });
    expect(checkin.method).toBe("drive");
    expect(BATCH_KINDS).toContain("drive");
  });
});

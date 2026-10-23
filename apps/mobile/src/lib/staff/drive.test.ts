/// <reference types="node" />
// Lot 48 : code tournant OR2 décidé avec la liste du téléphone (secret de la synchro, horloge corrigée) et accueil drive
// (plaques lues → hachage → liste, confirmation des lectures, pointage `drive` dans la file).
import { createHmac } from "node:crypto";
import {
  type AccessListEntry,
  base64UrlEncode,
  expiredScanLabel,
  normalizePlate,
  rotatingCodeAt,
  type StaffSync,
} from "@orasso/shared";
import { afterEach, describe, expect, it } from "vitest";

import { applyDateHeader, resetServerSkewForTests, serverSkewMs } from "../clock";

import { extractPlates, type LineFrame, plateGroups } from "../plates/recognize";
import { DriveGate, driveLookup, driveOutcome } from "./drive";
import { BATCH_KINDS, buildState, checkinAction, decideLocal, mergeSync, type StaffState, scanAction } from "./model";

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

  it("liste sans secret ou pass absent : « absent de la liste » non vérifié (recours du super staff, rapport)", () => {
    const state = stateWith([entry(1, null, { otpSecret: undefined })]);
    const d = decideLocal(state, code, new Map(), () => false, T);
    expect(d).toMatchObject({ decision: "unknown_pass", unverified: true });
    // Refusé par un staff simple : la lecture part au rapport marquée non vérifiable.
    const refused = scanAction(d as { decision: "unknown_pass"; passId: string }, code, "id", T);
    expect(refused.item).toMatchObject({ decision: "unknown_pass", reason: "unverified_otp", passId: uuid(1) });
    // Accepté par le super staff : entrée non vérifiée, rapprochée par le serveur à la synchro.
    const accepted = scanAction({ decision: "override", passId: uuid(1), reason: "unverified_otp" }, code, "id2", T);
    expect(accepted.item).toMatchObject({ decision: "override", reason: "unverified_otp" });
    expect(accepted.checkin?.method).toBe("override");
  });

  it("l'ancien QR OR1 reste accepté par l'appli du staff (acceptLegacy jusqu'au lot 58)", () => {
    // Sans clé connue, l'OR1 est lu (refus « clé inconnue ») : il n'est pas rejeté comme « ancien QR ».
    const or1 = `OR1${"A".repeat(138)}`;
    expect(decideLocal(stateWith([]), or1, new Map(), () => false, T)).not.toMatchObject({ reason: "legacy_qr" });
  });
});

describe("décalage avec l'heure du serveur (en-tête Date)", () => {
  afterEach(() => resetServerSkewForTests());

  it("téléphone du staff en retard de 2 min : corrigé, le code passe ; sans correction, refus avec l'écart", () => {
    // Le téléphone du staff affiche T − 2 min ; le serveur (et le participant) sont à T.
    const device = T.getTime() - 120_000;
    const at = (ms: number) => new Date(ms).toUTCString();
    for (let i = 0; i < 3; i++) expect(applyDateHeader(at(T.getTime()), device, device + 200)).toBe(true);
    expect(Math.abs(serverSkewMs() - 120_000)).toBeLessThan(1_500);
    const state = stateWith([entry(1, null)]);
    const code = rotatingCodeAt(SECRET, EVENT_NO, uuid(1), T);
    const corrected = new Date(device + serverSkewMs());
    expect(decideLocal(state, code, new Map(), () => false, corrected)).toMatchObject({ decision: "ok" });
    const raw = decideLocal(state, code, new Map(), () => false, new Date(device));
    expect(raw).toMatchObject({ reason: "expired", offsetSeconds: 120 });
    expect(expiredScanLabel(120)).toBe("Téléphone en avance de 2 min : pointe à la main (plaque ou pseudo)");
  });

  it("téléphone en avance de 2 min : décalage négatif ; mesure à l'aller-retour trop long ignorée", () => {
    const device = T.getTime() + 120_000;
    applyDateHeader(new Date(T.getTime()).toUTCString(), device, device + 100);
    expect(Math.abs(serverSkewMs() + 120_000)).toBeLessThan(1_500);
    expect(applyDateHeader(new Date(T.getTime()).toUTCString(), device, device + 9_000)).toBe(false);
    expect(expiredScanLabel(-120)).toMatch(/^Code ancien de 2 min/);
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

  it("lot M2 : W garage et WW provisoire, saisis n'importe comment, retrouvés par la plaque lue", () => {
    // Hachage du serveur : forme unique de la saisie (`normalizePlate`, comme l'API).
    const s = stateWith([entry(1, normalizePlate("f w 623 ax 66")), entry(2, normalizePlate("ww-123 ab"))]);
    expect(driveLookup(s, extractPlates("F W-623-AX 66")).map((m) => m.entry.pseudo)).toEqual(["Pilote_1"]);
    expect(driveLookup(s, extractPlates("F WW-123-AB 66")).map((m) => m.entry.pseudo)).toEqual(["Pilote_2"]);
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

  const read = (...lines: { text: string; frame?: LineFrame }[]) => plateGroups(lines);
  const box = (top: number, height: number): LineFrame => ({ left: 100, top, width: 4 * height, height });

  it("rien sur une seule photo : deux lectures identiques de suite ; plaque inconnue lue deux fois", () => {
    const s = state();
    const gate = new DriveGate();
    expect(gate.feed(s, read({ text: "GA-662-KS" }), T)).toBeNull();
    expect(gate.feed(s, read({ text: "GA 662 KS" }), T)).toMatchObject({ kind: "ok" });
    expect(gate.feed(s, read({ text: "ZZ-999-ZZ" }), T)).toBeNull();
    expect(gate.feed(s, read({ text: "YY-888-YY" }), T)).toBeNull();
    expect(gate.feed(s, read({ text: "YY-888-YY" }), T)).toEqual({ kind: "unknown" });
    expect(gate.feed(s, [], T)).toBeNull();
    // Une lecture différente entre deux : on recommence.
    expect(gate.feed(s, read({ text: "GA-662-KS" }), T)).toBeNull();
    expect(gate.feed(s, read({ text: "YY-888-YY" }), T)).toBeNull();
    expect(gate.feed(s, read({ text: "GA-662-KS" }), T)).toBeNull();
    // Saisie au clavier (recette web) : une seule lecture suffit.
    expect(new DriveGate().feed(s, read({ text: "QQ111QQ" }), T, true)).toEqual({ kind: "unknown" });
  });

  it("la plaque la plus proche (cadre le plus grand, puis le plus bas) passe devant", () => {
    const groups = read(
      { text: "ZZ-999-ZZ", frame: box(100, 20) },
      { text: "GA-662-KS", frame: box(600, 60) },
      { text: "YY-888-YY", frame: box(300, 60) },
    );
    expect(groups.map((g) => g.plates[0])).toEqual(["GA662KS", "YY888YY", "ZZ999ZZ"]);
    // Une voiture inconnue devant, un participant au fond : c'est le participant qui est retenu (deux lectures).
    const s = state();
    const gate = new DriveGate();
    expect(gate.feed(s, groups, T)).toBeNull();
    expect(gate.feed(s, groups, T)).toMatchObject({ kind: "ok", entry: { pseudo: "Pilote_1" } });
  });

  it("deux plaques de participants sur la même photo : le staff choisit", () => {
    const s = state();
    const both = read({ text: "GA-662-KS", frame: box(600, 60) }, { text: "BX-120-QT", frame: box(200, 30) });
    const out = new DriveGate().feed(s, both, T);
    expect(out?.kind).toBe("choose");
    expect(out && "entries" in out ? out.entries.map((e) => e.pseudo) : []).toEqual(["Pilote_1", "Pilote_2"]);
  });

  it("pointage `drive` dans la file, envoyé avec les lectures", () => {
    const s = state();
    const { item, checkin } = checkinAction(s.entries.get(uuid(1)) as AccessListEntry, "drive", "id-1", T);
    expect(item).toMatchObject({ kind: "drive", applicationId: uuid(1001) });
    expect(checkin.method).toBe("drive");
    expect(BATCH_KINDS).toContain("drive");
  });
});

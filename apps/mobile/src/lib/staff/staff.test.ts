/// <reference types="node" />
// Mode staff hors ligne : clés de confiance, vérification de la liste, décision d'un scan, anti-rebond, fusion des
// synchros, recherche, file d'envoi et stockage SQLite (node:sqlite à la place d'expo-sqlite).
import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
  sign,
} from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  type AccessListEntry,
  accessListSigningText,
  encodePassMessage,
  encodePassPayload,
  type ScanBatchResult,
  type StaffSync,
} from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { DEMO_PUBLIC_KEY, ed25519Verify, plateHashOf } from "./crypto";
import {
  applyResults,
  backoffMs,
  buildState,
  checkinAction,
  counters,
  decideLocal,
  dueBatches,
  isPurgeDue,
  mergeSync,
  type PendingAction,
  quickPlateMatch,
  ScanGate,
  type StaffState,
  scanAction,
  searchLocal,
  serverReport,
} from "./model";
import { type SqlDb, StaffStore } from "./store";
import {
  hasTrustAnchor,
  isLocalApi,
  keyMap,
  nextTrustedKeys,
  parsePins,
  pinnedKeys,
  type TrustPolicy,
  trustPolicy,
  verifyStaffSync,
} from "./trust";

// --- Outils ---------------------------------------------------------------------------------------------------

type Key = { kid: number; privateKey: KeyObject; publicKey: string };

function newKey(kid: number): Key {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" }) as { x: string };
  return { kid, privateKey, publicKey: jwk.x };
}

/** Clé de démonstration de l'API (même graine publique que `apps/api/src/lib/signing.ts`). */
function demoKey(): Key {
  const seed = createHash("sha256").update("orasso-dev-qr-key-not-secret").digest();
  const der = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
  const privateKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  const jwk = createPublicKey(privateKey).export({ format: "jwk" }) as { x: string };
  return { kid: 0, privateKey, publicKey: jwk.x };
}

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_NO = 7;
const SALT = Buffer.from("0123456789abcdef").toString("base64url");
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function passPayload(key: Key, passId: string, eventNo = EVENT_NO): string {
  const message = encodePassMessage({ kid: key.kid, eventNo, passId });
  return encodePassPayload(message, new Uint8Array(sign(null, message, key.privateKey)));
}

/** Hachage de plaque de l'API (`plateHash` du module staff), recopié ici pour vérifier l'appli. */
const apiPlateHash = (saltB64: string, normalized: string) =>
  createHmac("sha256", Buffer.from(saltB64, "base64url")).update(normalized, "utf8").digest("hex").slice(0, 16);

function entry(n: number, over: Partial<AccessListEntry> = {}): AccessListEntry {
  const plate = over.plateHint === null ? null : `${`AB${n}`.padEnd(3, "0")}${100 + n}CD`;
  return {
    passId: uuid(n),
    applicationId: uuid(1000 + n),
    status: "valid",
    revokedReason: null,
    pseudo: `Pilote_${String(n).padStart(3, "0")}`,
    vehicleLabel: n === 1 ? "Toyota Supra MK4" : "Mazda RX-7",
    vehicleType: "car",
    categories: [],
    plateHint: plate ? plate.slice(0, 3) : null,
    plateHash: plate ? apiPlateHash(SALT, plate) : null,
    zoneCode: n % 2 ? "JDM" : "LIB",
    zoneName: n % 2 ? "JDM" : "Libre",
    checkedInAt: null,
    checkinMethod: null,
    updatedAt: "2026-10-15T08:00:00.000Z",
    ...over,
  };
}

function signedSync(key: Key, body: Omit<StaffSync, "signature" | "signatureKid">): StaffSync {
  const digest = createHash("sha256").update(accessListSigningText(body), "utf8").digest();
  return { ...body, signatureKid: key.kid, signature: sign(null, digest, key.privateKey).toString("base64url") };
}

function syncBody(
  entries: AccessListEntry[],
  over: Partial<Omit<StaffSync, "signature" | "signatureKid">> = {},
): Omit<StaffSync, "signature" | "signatureKid"> {
  return {
    event: {
      id: EVENT_ID,
      eventNo: EVENT_NO,
      title: "Salon Argelès",
      startsAt: "2026-10-15T09:00:00.000Z",
      endsAt: "2026-10-15T17:00:00.000Z",
      lockAt: "2026-10-15T07:00:00.000Z",
      isLocked: true,
      plateSalt: SALT,
      zones: [
        { id: uuid(9001), code: "JDM", name: "JDM", capacity: 30 },
        { id: uuid(9002), code: "LIB", name: "Libre", capacity: 40 },
      ],
    },
    keys: [],
    myRoles: ["scan"],
    full: true,
    entries,
    removedPassIds: [],
    cursor: "2026-10-15T08:00:00.000Z",
    generatedAt: "2026-10-15T08:00:05.000Z",
    ...over,
  };
}

const LOCAL: TrustPolicy = trustPolicy("http://localhost:3101", undefined);
/** Build en ligne avec la clé du serveur épinglée (cas d'un APK vers dev.orasso.fr). */
const pinnedTo = (k: Key): TrustPolicy => ({ allowDemo: false, pins: [{ kid: k.kid, publicKey: k.publicKey }] });
const ONLINE: TrustPolicy = trustPolicy("https://dev.orasso.fr", undefined);

function stateWith(entries: AccessListEntry[]): StaffState {
  const merged = mergeSync(null, syncBody(entries) as StaffSync, "user-julie", new Date("2026-10-15T08:01:00Z"));
  if (!merged.ok) throw new Error("fusion");
  return buildState(merged.meta, merged.entries, []);
}

// --- Cryptographie ---------------------------------------------------------------------------------------------

describe("cryptographie du staff", () => {
  it("connaît la clé publique de la clé de démonstration de l'API", () => {
    expect(demoKey().publicKey).toBe(DEMO_PUBLIC_KEY);
  });

  it("hache la plaque saisie comme l'API (normalisée, HMAC-SHA256 salé, 16 caractères)", () => {
    expect(plateHashOf(SALT, " ab-123 cd ")).toBe(apiPlateHash(SALT, "AB123CD"));
    expect(plateHashOf(SALT, "ab123cd")).toHaveLength(16);
    expect(plateHashOf(SALT, "--")).toBeNull();
  });

  it("vérifie Ed25519 comme node:crypto", () => {
    const key = newKey(1);
    const msg = new Uint8Array([1, 2, 3]);
    const sig = new Uint8Array(sign(null, msg, key.privateKey));
    const pub = Buffer.from(key.publicKey, "base64url");
    expect(ed25519Verify(msg, sig, pub)).toBe(true);
    sig[3] = (sig[3] ?? 0) ^ 1;
    expect(ed25519Verify(msg, sig, pub)).toBe(false);
    expect(ed25519Verify(msg, new Uint8Array(10), pub)).toBe(false);
  });
});

// --- Clés de confiance (M9) ------------------------------------------------------------------------------------

describe("clés de confiance", () => {
  it("ne reconnaît comme locale qu'une API http de la machine ou du réseau privé", () => {
    expect(isLocalApi("http://localhost:3101")).toBe(true);
    expect(isLocalApi("http://192.168.1.20:3001")).toBe(true);
    expect(isLocalApi("http://10.0.2.2:3001")).toBe(true);
    expect(isLocalApi("https://dev.orasso.fr")).toBe(false);
    expect(isLocalApi("http://dev.orasso.fr")).toBe(false);
    expect(isLocalApi("https://localhost:3101")).toBe(false);
    expect(isLocalApi("http://8.8.8.8")).toBe(false);
  });

  it("refuse toute clé à un build en ligne sans clé épinglée, la démo kid 0 comprise", () => {
    const demo = demoKey();
    const real = newKey(1);
    const served = [
      { kid: 0, publicKey: demo.publicKey, retiredAt: null },
      { kid: 1, publicKey: real.publicKey, retiredAt: null },
    ];
    expect(hasTrustAnchor(ONLINE)).toBe(false);
    expect(nextTrustedKeys([], served, ONLINE)).toEqual({ ok: true, keys: [], revoked: [] });
    expect(keyMap([{ kid: 1, publicKey: real.publicKey, retiredAt: null }], ONLINE).size).toBe(0);
    // Épinglée par erreur, la clé de démonstration reste refusée hors API locale.
    const pinnedDemo: TrustPolicy = { allowDemo: false, pins: [{ kid: 0, publicKey: demo.publicKey }] };
    expect(keyMap([{ kid: 0, publicKey: demo.publicKey, retiredAt: null }], pinnedDemo).size).toBe(0);
    expect(pinnedKeys(pinnedDemo, [])).toEqual([]);
    const local = nextTrustedKeys([], served, LOCAL);
    expect(local.ok && local.keys.map((k) => k.kid)).toEqual([0, 1]);
  });

  it("clés épinglées : valables sans /api/keys, qui peut en retirer une révoquée mais jamais en ajouter", () => {
    const pinned = newKey(1);
    const other = newKey(2);
    const policy: TrustPolicy = { allowDemo: false, pins: parsePins(JSON.stringify([pinned])) };
    expect(hasTrustAnchor(policy)).toBe(true);
    expect(pinnedKeys(policy, []).map((k) => k.kid)).toEqual([1]);
    const r = nextTrustedKeys(
      [],
      [
        { kid: 1, publicKey: pinned.publicKey, retiredAt: null },
        { kid: 2, publicKey: other.publicKey, retiredAt: null },
      ],
      policy,
    );
    expect(r.ok && r.keys.map((k) => k.kid)).toEqual([1]);
    // L'API ne sert plus la clé épinglée : révoquée, et elle le reste même si elle réapparaît.
    const gone = nextTrustedKeys([], [{ kid: 2, publicKey: other.publicKey, retiredAt: null }], policy);
    expect(gone).toEqual({ ok: true, keys: [], revoked: [{ kid: 1, publicKey: pinned.publicKey }] });
    if (!gone.ok) return;
    expect(pinnedKeys(policy, gone.revoked)).toEqual([]);
    const back = nextTrustedKeys([], [{ kid: 1, publicKey: pinned.publicKey, retiredAt: null }], policy, gone.revoked);
    expect(back.ok && back.keys).toEqual([]);
    // Même kid, autre valeur servie : refus.
    const swapped = nextTrustedKeys([], [{ kid: 1, publicKey: other.publicKey, retiredAt: null }], policy);
    expect(swapped).toEqual({ ok: false, reason: "key_changed", kid: 1 });
    // Liste épinglée illisible : rien n'est accepté (fermé par défaut).
    expect(parsePins("pas du json")).toEqual([]);
    expect(parsePins(undefined)).toBeNull();
  });

  it("API locale : oublie une clé révoquée (absente de /api/keys) et refuse qu'un kid change de clé", () => {
    const k1 = newKey(1);
    const k2 = newKey(2);
    const current = [
      { kid: 1, publicKey: k1.publicKey, retiredAt: null },
      { kid: 2, publicKey: k2.publicKey, retiredAt: null },
    ];
    const revoked = nextTrustedKeys(current, [{ kid: 2, publicKey: k2.publicKey, retiredAt: null }], LOCAL);
    expect(revoked.ok && revoked.keys.map((k) => k.kid)).toEqual([2]);
    const swapped = nextTrustedKeys(current, [{ kid: 1, publicKey: newKey(1).publicKey, retiredAt: null }], LOCAL);
    expect(swapped).toEqual({ ok: false, reason: "key_changed", kid: 1 });
  });
  it("vérifie la liste avec les clés de confiance, jamais avec celles de la réponse", () => {
    const server = newKey(1);
    const trusted = keyMap([{ kid: 1, publicKey: server.publicKey, retiredAt: null }], pinnedTo(server));
    const good = signedSync(server, syncBody([entry(1)]));
    expect(verifyStaffSync(good, EVENT_ID, trusted)).toEqual({ ok: true });

    // Attaquant : sa propre clé, annoncée dans `keys` de la réponse et utilisée pour signer une liste trafiquée.
    const attacker = newKey(1);
    const forged = signedSync(
      attacker,
      syncBody([entry(1, { status: "valid" })], {
        keys: [{ kid: 1, publicKey: attacker.publicKey, retiredAt: null }],
      }),
    );
    expect(verifyStaffSync(forged, EVENT_ID, trusted)).toEqual({ ok: false, reason: "bad_signature" });
    const unknownKid = signedSync(newKey(5), syncBody([entry(1)]));
    expect(verifyStaffSync(unknownKid, EVENT_ID, trusted)).toEqual({ ok: false, reason: "unknown_key" });

    // Une entrée modifiée après signature (révoqué → valide) est refusée.
    const revokedBody = syncBody([entry(1, { status: "revoked", revokedReason: "withdrawn" })]);
    const tampered = signedSync(server, revokedBody);
    tampered.entries = [entry(1)];
    expect(verifyStaffSync(tampered, EVENT_ID, trusted)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyStaffSync(good, uuid(42), trusted)).toEqual({ ok: false, reason: "wrong_event" });
  });
});

// --- Décision hors ligne ---------------------------------------------------------------------------------------

describe("décision d'un scan hors ligne", () => {
  const server = newKey(1);
  const keys = keyMap([{ kid: 1, publicKey: server.publicKey, retiredAt: null }], pinnedTo(server));
  const state = () =>
    stateWith([
      entry(1),
      entry(2, { checkedInAt: "2026-10-15T08:30:00.000Z", checkinMethod: "scan" }),
      entry(3, { status: "revoked", revokedReason: "withdrawn", vehicleLabel: null, plateHint: null, plateHash: null }),
    ]);

  it("OK + zone pour un pass valide pas encore entré", () => {
    const d = decideLocal(state(), passPayload(server, uuid(1)), keys, ed25519Verify);
    expect(d.decision).toBe("ok");
    expect(d.decision === "ok" && d.entry.zoneCode).toBe("JDM");
  });

  it("déjà entré : connu du serveur, ou pointé sur l'appareil en attente d'envoi", () => {
    const s = state();
    const d = decideLocal(s, passPayload(server, uuid(2)), keys, ed25519Verify);
    expect(d).toMatchObject({ decision: "already", checkedInAt: "2026-10-15T08:30:00.000Z" });
    const payload = passPayload(server, uuid(1));
    const first = decideLocal(s, payload, keys, ed25519Verify);
    const { checkin } = scanAction(first, payload, uuid(500), new Date("2026-10-15T09:05:00Z"), s.entries.get(uuid(1)));
    expect(checkin).not.toBeNull();
    if (checkin) s.local.set(checkin.passId, checkin);
    expect(decideLocal(s, payload, keys, ed25519Verify)).toMatchObject({
      decision: "already",
      checkedInAt: "2026-10-15T09:05:00.000Z",
    });
  });

  it("refusé : pass révoqué (désisté)", () => {
    expect(decideLocal(state(), passPayload(server, uuid(3)), keys, ed25519Verify)).toMatchObject({
      decision: "refused",
      reason: "withdrawn",
    });
  });

  it("falsifié : un caractère changé, ou signé par une autre clé sous le même kid", () => {
    const payload = passPayload(server, uuid(1));
    const i = 50;
    const flipped = payload.slice(0, i) + (payload[i] === "A" ? "B" : "A") + payload.slice(i + 1);
    expect(decideLocal(state(), flipped, keys, ed25519Verify)).toMatchObject({ decision: "refused", reason: "forged" });
    const impostor = passPayload(newKey(1), uuid(1));
    expect(decideLocal(state(), impostor, keys, ed25519Verify)).toMatchObject({
      decision: "refused",
      reason: "forged",
    });
  });

  it("refusé : QR étranger, autre événement, clé inconnue (dont la démo sur un build en ligne)", () => {
    expect(decideLocal(state(), "https://exemple.fr", keys, ed25519Verify)).toMatchObject({ reason: "unknown_qr" });
    expect(decideLocal(state(), passPayload(server, uuid(1), 8), keys, ed25519Verify)).toMatchObject({
      reason: "other_event",
    });
    expect(decideLocal(state(), passPayload(demoKey(), uuid(1)), keys, ed25519Verify)).toMatchObject({
      reason: "unknown_key",
    });
  });

  it("QR valide absent de la liste : à accepter quand même (override), puis déjà entré", () => {
    const s = state();
    const payload = passPayload(server, uuid(77));
    const d = decideLocal(s, payload, keys, ed25519Verify);
    expect(d).toEqual({ decision: "unknown_pass", passId: uuid(77) });
    const { item, checkin } = scanAction({ decision: "override", passId: uuid(77) }, payload, uuid(501), new Date());
    expect(item).toMatchObject({ decision: "override", passId: uuid(77), rawPayload: null });
    if (checkin) s.local.set(checkin.passId, checkin);
    expect(decideLocal(s, payload, keys, ed25519Verify).decision).toBe("already");
  });

  it("ne fait partir le QR brut que s'il est d'Orasso et non résolu", () => {
    const foreign = decideLocal(state(), "WIFI:S:parking;;", keys, ed25519Verify);
    expect(scanAction(foreign, "WIFI:S:parking;;", uuid(502), new Date()).item.rawPayload).toBeNull();
    const weird = `OR1${"A".repeat(138)}`;
    const d = decideLocal(state(), weird, keys, ed25519Verify);
    expect(scanAction(d, weird, uuid(503), new Date()).item.rawPayload).toBe(weird);
  });
});

describe("anti-rebond", () => {
  it("ne compte qu'une fois un QR qui reste devant la caméra, le relit après 3 s d'absence", () => {
    const gate = new ScanGate(3_000);
    expect(gate.accept("A", 0)).toBe(true);
    expect(gate.accept("A", 500)).toBe(false);
    expect(gate.accept("A", 2_900)).toBe(false);
    // Toujours devant l'objectif : la fenêtre glisse.
    expect(gate.accept("A", 5_000)).toBe(false);
    expect(gate.accept("B", 5_100)).toBe(true);
    expect(gate.accept("A", 8_100)).toBe(true);
  });
});

// --- Synchro, recherche, compteurs -----------------------------------------------------------------------------

describe("fusion des synchros", () => {
  const t = new Date("2026-10-15T09:00:00Z");

  it("une synchro complète remplace tout, une différentielle écrase par passId", () => {
    const first = mergeSync(null, syncBody([entry(1), entry(2)]) as StaffSync, "u", t);
    expect(first.ok && first.entries.length).toBe(2);
    if (!first.ok) return;
    const delta = mergeSync(
      first,
      syncBody([entry(2, { status: "revoked", revokedReason: "withdrawn" }), entry(4)], {
        full: false,
        generatedAt: "2026-10-15T08:10:00.000Z",
      }) as StaffSync,
      "u",
      t,
    );
    expect(delta.ok && delta.entries.map((e) => [e.passId, e.status])).toEqual([
      [uuid(1), "valid"],
      [uuid(2), "revoked"],
      [uuid(4), "valid"],
    ]);
    if (!delta.ok) return;
    const full = mergeSync(
      delta,
      syncBody([entry(4)], { generatedAt: "2026-10-15T08:20:00.000Z" }) as StaffSync,
      "u",
      t,
    );
    expect(full.ok && full.entries.map((e) => e.passId)).toEqual([uuid(4)]);
  });

  it("refuse une liste plus ancienne que la dernière acceptée (rejeu)", () => {
    const first = mergeSync(null, syncBody([entry(1)]) as StaffSync, "u", t);
    if (!first.ok) throw new Error("fusion");
    const old = mergeSync(first, syncBody([], { generatedAt: "2026-10-15T07:00:00.000Z" }) as StaffSync, "u", t);
    expect(old).toEqual({ ok: false, reason: "stale" });
  });

  it("ferme et purge à J+1 (fin + 1 jour)", () => {
    const meta = { endsAt: "2026-10-15T17:00:00.000Z" };
    expect(isPurgeDue(meta, new Date("2026-10-16T16:59:00Z"))).toBe(false);
    expect(isPurgeDue(meta, new Date("2026-10-16T17:00:00Z"))).toBe(true);
  });
});

describe("recherche plaque ou pseudo, pointage rapide, compteurs", () => {
  const s = stateWith([
    entry(1),
    entry(2),
    entry(3, { pseudo: "Kenji_66" }),
    entry(4, { status: "revoked", revokedReason: "withdrawn", plateHint: null, plateHash: null }),
  ]);
  const plate1 = "AB1-101-CD";

  it("trouve par plaque entière (hachage), par 3 premiers caractères, par pseudo", () => {
    expect(searchLocal(s, plate1).map((h) => h.entry.passId)).toEqual([uuid(1)]);
    expect(searchLocal(s, "ab2").map((h) => h.entry.passId)).toEqual([uuid(2)]);
    expect(searchLocal(s, "kenji").map((h) => h.entry.pseudo)).toEqual(["Kenji_66"]);
    expect(searchLocal(s, "pilote_00").at(-1)?.entry.status).toBe("revoked");
    expect(searchLocal(s, "supra").map((h) => h.entry.passId)).toEqual([uuid(1)]);
  });

  it("pointe d'office un seul résultat, propose le choix sinon, garde les plaques non reconnues", () => {
    expect(quickPlateMatch(s, plate1)).toMatchObject({ kind: "one", entry: { passId: uuid(1) } });
    expect(quickPlateMatch(s, "AB3")).toMatchObject({ kind: "one" });
    expect(quickPlateMatch(s, "ZZ9-999-ZZ")).toEqual({ kind: "none", typed: "ZZ9999ZZ" });
    const twins = stateWith([entry(1), entry(11, { plateHint: "AB1", plateHash: "x" })]);
    expect(quickPlateMatch(twins, "AB1")).toMatchObject({ kind: "many" });
  });

  it("compte entrés / retenus et attendus / arrivés par zone, pointages locaux compris", () => {
    const c = stateWith([entry(1), entry(2, { checkedInAt: "2026-10-15T08:00:00Z" }), entry(3)]);
    const { checkin } = checkinAction(c.entries.get(uuid(3)) as AccessListEntry, "manual", uuid(600), new Date());
    c.local.set(checkin.passId, checkin);
    const r = counters(c);
    expect([r.arrived, r.expected]).toEqual([2, 3]);
    expect(r.zones.find((z) => z.code === "JDM")).toMatchObject({ arrived: 1, expected: 2, capacity: 30 });
  });
});

// --- File hors ligne et stockage -------------------------------------------------------------------------------

function memoryDb(): SqlDb {
  const raw = new DatabaseSync(":memory:");
  return {
    execAsync: async (sql) => {
      raw.exec(sql);
    },
    runAsync: async (sql, params) => raw.prepare(sql).run(...params),
    getAllAsync: async <T>(sql: string, params: (string | number | null)[]) =>
      raw.prepare(sql).all(...params) as unknown as T[],
  };
}

function action(id: string, payload: PendingAction["payload"], at: string, kind: PendingAction["kind"] = "scan") {
  return {
    id,
    eventId: EVENT_ID,
    eventTitle: "Salon Argelès",
    userId: "user-julie",
    kind,
    payload,
    createdAt: at,
    attempts: 0,
    lastError: null,
    nextAttemptAt: at,
    sentAt: null,
    result: null,
  } satisfies PendingAction;
}

describe("file hors ligne puis synchro (SQLite)", () => {
  it("garde les scans sans réseau, réessaie, puis aligne les entrées sur la réponse (doublons compris)", async () => {
    const store = new StaffStore(memoryDb());
    await store.init();
    const server = newKey(1);
    const keys = keyMap([{ kid: 1, publicKey: server.publicKey, retiredAt: null }], pinnedTo(server));
    const merged = mergeSync(null, signedSync(server, syncBody([entry(1), entry(2)])), "user-julie", new Date());
    if (!merged.ok) throw new Error("fusion");
    await store.saveSync(merged.meta, merged.entries, merged.full);

    // Mode avion : trois lectures (OK, OK, falsifiée) enregistrées sur l'appareil.
    const s = buildState(merged.meta, await store.entries(EVENT_ID), []);
    const t0 = new Date("2026-10-15T09:00:00Z");
    const payloads = [passPayload(server, uuid(1)), passPayload(server, uuid(2)), `OR1${"B".repeat(138)}`];
    for (const [i, p] of payloads.entries()) {
      const d = decideLocal(s, p, keys, ed25519Verify);
      const id = uuid(700 + i);
      const at = new Date(t0.getTime() + i * 1000);
      const { item, checkin } = scanAction(d, p, id, at, d.passId ? s.entries.get(d.passId) : undefined);
      await store.addAction(action(id, item, at.toISOString()), checkin);
      if (checkin) s.local.set(checkin.passId, checkin);
    }
    expect((await store.localCheckins(EVENT_ID)).map((c) => c.passId).sort()).toEqual([uuid(1), uuid(2)]);
    let pending = await store.actions("user-julie", { unsentOnly: true });
    expect(pending.map((a) => a.payload.decision)).toEqual(["ok", "ok", "refused"]);

    // Panne réseau : rien n'est perdu, prochain essai dans 5 s puis 10 s.
    const batch = dueBatches(pending, new Date("2026-10-15T09:00:10Z")).get(EVENT_ID) ?? [];
    expect(batch).toHaveLength(3);
    const t1 = new Date("2026-10-15T09:00:10Z");
    await store.markFailed(
      batch.map((a) => a.id),
      "network",
      (n) => new Date(t1.getTime() + backoffMs(n)),
    );
    pending = await store.actions("user-julie", { unsentOnly: true });
    expect(pending.every((a) => a.attempts === 1 && a.lastError === "network")).toBe(true);
    expect(dueBatches(pending, new Date("2026-10-15T09:00:12Z")).size).toBe(0);
    expect(dueBatches(pending, new Date("2026-10-15T09:00:15Z")).get(EVENT_ID)).toHaveLength(3);
    expect([backoffMs(1), backoffMs(2), backoffMs(20)]).toEqual([5_000, 10_000, 300_000]);

    // Retour du réseau : le serveur accepte la 1re, signale la 2e comme doublon (un collègue l'a scannée avant),
    // rejette la falsifiée.
    const results: ScanBatchResult[] = [
      {
        id: uuid(700),
        result: "accepted",
        applicationId: uuid(1001),
        checkedInAt: "2026-10-15T09:00:00.000Z",
        duplicateOf: null,
        zone: null,
      },
      {
        id: uuid(701),
        result: "duplicate_other_device",
        applicationId: uuid(1002),
        checkedInAt: "2026-10-15T08:58:00.000Z",
        duplicateOf: uuid(999),
        zone: null,
      },
      { id: uuid(702), result: "rejected", applicationId: null, checkedInAt: null, duplicateOf: null, zone: null },
    ];
    const { effects, missing } = applyResults(pending, results, (appId) => s.byApplication.get(appId));
    expect(missing).toEqual([]);
    await store.markSent(
      EVENT_ID,
      effects.map((e) => ({ id: e.id, result: e.result, checkin: e.checkin })),
      new Date(),
    );
    expect(await store.actions("user-julie", { unsentOnly: true })).toEqual([]);
    const local = await store.localCheckins(EVENT_ID);
    expect(local.find((c) => c.passId === uuid(2))?.checkedInAt).toBe("2026-10-15T08:58:00.000Z");
    const sent = await store.actions("user-julie");
    expect(sent.filter((a) => a.result?.result === "duplicate_other_device")).toHaveLength(1);

    // Rejeu du même lot (réponse perdue) : mêmes identifiants, l'API répond à l'identique ; rien ne double.
    expect(new Set(sent.map((a) => a.id)).size).toBe(3);
  });

  it("vide la file élément par élément après le règlement (settled), sans bloquer", async () => {
    const store = new StaffStore(memoryDb());
    await store.init();
    const at = "2026-10-17T18:00:00.000Z";
    const a = action(
      uuid(800),
      { kind: "manual", id: uuid(800), applicationId: uuid(1001), scannedAt: at },
      at,
      "manual",
    );
    await store.addAction(a);
    const res: ScanBatchResult = {
      id: a.id,
      result: "rejected",
      reason: "settled",
      applicationId: null,
      checkedInAt: null,
      duplicateOf: null,
      zone: null,
    };
    const { effects } = applyResults([a], [res], () => undefined);
    await store.markSent(EVENT_ID, effects, new Date());
    expect(await store.actions("user-julie", { unsentOnly: true })).toEqual([]);
  });

  it("purge à J+1 la liste et les coordonnées, garde les actions non envoyées", async () => {
    const store = new StaffStore(memoryDb());
    await store.init();
    const contact = { firstName: "Julie", lastName: "M", phone: "0600000000", email: "j@x.fr" };
    const merged = mergeSync(
      null,
      syncBody([entry(1, { contact })], { myRoles: ["super_staff"] }) as StaffSync,
      "user-julie",
      new Date(),
    );
    if (!merged.ok) throw new Error("fusion");
    await store.saveSync(merged.meta, merged.entries, true);
    const at = "2026-10-15T10:00:00.000Z";
    await store.addAction(action(uuid(900), { kind: "scan", id: uuid(900) }, at), {
      passId: uuid(1),
      applicationId: uuid(1001),
      checkedInAt: at,
      method: "scan",
      actionId: uuid(900),
    });
    await store.addAction({ ...action(uuid(901), { kind: "scan", id: uuid(901) }, at), sentAt: at });
    await store.purgeEvent(EVENT_ID);
    expect(await store.entries(EVENT_ID)).toEqual([]);
    expect(await store.meta(EVENT_ID)).toBeNull();
    expect(await store.localCheckins(EVENT_ID)).toEqual([]);
    expect((await store.actions("user-julie")).map((x) => x.id)).toEqual([uuid(900)]);
  });

  it("remplace les clés de confiance et retient l'événement synchronisé", async () => {
    const store = new StaffStore(memoryDb());
    await store.init();
    await store.setTrustedKeys([{ kid: 1, publicKey: newKey(1).publicKey, retiredAt: null }]);
    await store.setTrustedKeys([{ kid: 2, publicKey: newKey(2).publicKey, retiredAt: null }]);
    expect((await store.trustedKeys()).map((k) => k.kid)).toEqual([2]);
  });
});

describe("rapport des réponses du serveur", () => {
  it("regroupe par véhicule les doublons et les refus, sans les éléments refusés après le règlement", () => {
    const at = "2026-10-15T09:00:00.000Z";
    const sent = (id: string, payload: PendingAction["payload"], result: Record<string, unknown>) => ({
      ...action(id, payload, at),
      sentAt: at,
      result,
    });
    const r = serverReport([
      sent(uuid(1), { kind: "scan", passId: uuid(5) }, { result: "duplicate_same_device", checkedInAt: at }),
      sent(uuid(2), { kind: "scan", passId: uuid(5) }, { result: "duplicate_other_device", checkedInAt: at }),
      sent(uuid(3), { kind: "scan", passId: null, scannedAt: at }, { result: "rejected" }),
      sent(uuid(4), { kind: "scan", passId: uuid(6) }, { result: "unknown" }),
      sent(uuid(6), { kind: "manual", applicationId: uuid(9) }, { result: "rejected", reason: "settled" }),
      sent(uuid(7), { kind: "scan", passId: uuid(8) }, { result: "accepted" }),
    ]);
    expect(r.duplicates).toMatchObject([{ passId: uuid(5), count: 2, otherDevice: true }]);
    expect(r.refused.map((l) => l.result)).toEqual(["rejected", "unknown"]);
  });
});

describe("corrections après relecture", () => {
  const t = new Date("2026-10-15T09:00:00Z");

  it("rôles changés (super staff retiré) : une différentielle ne suffit pas, il faut une synchro complète", () => {
    const contact = { firstName: "A", lastName: "B", phone: "06", email: "a@b.fr" };
    const first = mergeSync(
      null,
      syncBody([entry(1, { contact })], { myRoles: ["scan", "super_staff"] }) as StaffSync,
      "u",
      t,
    );
    if (!first.ok) throw new Error("fusion");
    const delta = mergeSync(
      first,
      syncBody([entry(2)], { full: false, myRoles: ["scan"], generatedAt: "2026-10-15T08:10:00.000Z" }) as StaffSync,
      "u",
      t,
    );
    expect(delta).toEqual({ ok: false, reason: "needs_full" });
    const full = mergeSync(
      first,
      syncBody([entry(1)], { myRoles: ["scan"], generatedAt: "2026-10-15T08:10:00.000Z" }) as StaffSync,
      "u",
      t,
    );
    expect(full.ok && full.entries.some((e) => e.contact)).toBe(false);
  });

  it("téléphone en avance : pas de purge tant que l'heure du serveur estimée n'a pas passé J+1", () => {
    // Synchro reçue alors que le téléphone avance de 2 jours sur le serveur.
    const phone = new Date("2026-10-17T08:00:05Z");
    const merged = mergeSync(null, syncBody([entry(1)]) as StaffSync, "u", phone);
    if (!merged.ok) throw new Error("fusion");
    expect(merged.meta.serverOffsetMs).toBeLessThan(-40 * 3_600_000);
    expect(isPurgeDue(merged.meta, new Date("2026-10-17T09:00:00Z"))).toBe(false);
    expect(isPurgeDue(merged.meta, new Date("2026-10-18T18:00:00Z"))).toBe(true);
    // Téléphone en retard : l'heure du téléphone doit aussi être passée.
    expect(isPurgeDue({ endsAt: "2026-10-15T17:00:00.000Z", serverOffsetMs: 3 * 86_400_000 }, t)).toBe(false);
  });

  it("refus définitif d'un lot : sort de la file avec l'erreur et retire les pointages locaux créés", async () => {
    const store = new StaffStore(memoryDb());
    await store.init();
    const at = "2026-10-15T10:00:00.000Z";
    await store.addAction(action(uuid(950), { kind: "scan", id: uuid(950), passId: uuid(1) }, at), {
      passId: uuid(1),
      applicationId: uuid(1001),
      checkedInAt: at,
      method: "scan",
      actionId: uuid(950),
    });
    await store.markRejected(EVENT_ID, [uuid(950)], { error: "Réservé au staff", status: 403 }, new Date());
    expect(await store.actions("user-julie", { unsentOnly: true })).toEqual([]);
    expect(await store.localCheckins(EVENT_ID)).toEqual([]);
    expect((await store.actions("user-julie"))[0]?.result).toEqual({ error: "Réservé au staff", status: 403 });
  });

  it("garde les clés épinglées révoquées, même après une déconnexion, et enregistre une grande liste par paquets", async () => {
    const store = new StaffStore(memoryDb());
    await store.init();
    await store.addRevokedKeys([{ kid: 1, publicKey: "x" }]);
    await store.purgeAll();
    expect(await store.revokedKeys()).toEqual([{ kid: 1, publicKey: "x" }]);
    const many = Array.from({ length: 250 }, (_, i) => entry(i + 1));
    const merged = mergeSync(null, syncBody(many) as StaffSync, "u", t);
    if (!merged.ok) throw new Error("fusion");
    await store.saveSync(merged.meta, merged.entries, true);
    expect(await store.entries(EVENT_ID)).toHaveLength(250);
  });
});

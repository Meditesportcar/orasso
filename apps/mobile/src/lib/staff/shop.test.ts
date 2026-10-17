/// <reference types="node" />
// Rôle boutique hors ligne (lot 24) : liste de billets dans la synchro, décision d'un QR de billet, anti-rejeu local,
// file (billets et compteur d'entrées), réponses du serveur sans double comptage, purge, rapports.
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  accessListSigningText,
  encodePassMessage,
  encodePassPayload,
  encodeTicketMessage,
  encodeTicketPayload,
  type StaffSync,
  type TicketListEntry,
  type TicketScanResultView,
} from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { ed25519Verify } from "./crypto";
import {
  applyTicketResults,
  buildState,
  carryOver,
  decideTicketLocal,
  dueOfKind,
  type LocalTicketUse,
  mergeSync,
  type PendingAction,
  shopAccess,
  ticketDuplicates,
  ticketScanAction,
  visitorTotals,
} from "./model";
import { type SqlDb, StaffStore } from "./store";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_NO = 7;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const rawPublic = new Uint8Array(publicKey.export({ format: "der", type: "spki" }).subarray(-32));
const keys = new Map([[1, rawPublic]]);

function ticketQr(ticketId: string, eventNo = EVENT_NO): string {
  const message = encodeTicketMessage({ kid: 1, eventNo, passId: ticketId });
  return encodeTicketPayload(message, new Uint8Array(sign(null, message, privateKey)));
}

const ticket = (n: number, over: Partial<TicketListEntry> = {}): TicketListEntry => ({
  ticketId: uuid(n),
  status: "valid",
  holderLabel: `Visiteur_${n}`,
  typeLabel: "Entrée",
  usedAt: null,
  updatedAt: "2026-10-16T08:00:00.000Z",
  ...over,
});

function syncBody(over: Partial<Omit<StaffSync, "signature" | "signatureKid">> = {}) {
  return {
    event: {
      id: EVENT_ID,
      eventNo: EVENT_NO,
      title: "Salon Argelès",
      startsAt: "2026-10-17T09:00:00.000Z",
      endsAt: "2026-10-17T17:00:00.000Z",
      lockAt: "2026-10-17T07:00:00.000Z",
      isLocked: true,
      plateSalt: Buffer.from("0123456789abcdef").toString("base64url"),
      zones: [],
      days: [],
    },
    keys: [],
    myRoles: ["shop" as const],
    full: true,
    entries: [],
    tickets: [ticket(1), ticket(2), ticket(3, { status: "cancelled" })],
    shopEnabled: true,
    removedPassIds: [],
    cursor: "2026-10-16T08:00:00.000Z",
    generatedAt: "2026-10-17T08:00:05.000Z",
    ...over,
  };
}
const asSync = (b: ReturnType<typeof syncBody>): StaffSync => {
  const digest = createHash("sha256").update(accessListSigningText(b), "utf8").digest();
  return { ...b, signatureKid: 1, signature: sign(null, digest, privateKey).toString("base64url") };
};

function shopState(over: Partial<ReturnType<typeof syncBody>> = {}) {
  const merged = mergeSync(null, asSync(syncBody(over)), "user-lea", new Date("2026-10-17T08:01:00Z"));
  if (!merged.ok) throw new Error("fusion");
  return { merged, state: buildState(merged.meta, merged.entries, [], merged.tickets, []) };
}

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

function action(id: string, kind: PendingAction["kind"], payload: PendingAction["payload"], at: string): PendingAction {
  return {
    id,
    eventId: EVENT_ID,
    eventTitle: "Salon Argelès",
    userId: "user-lea",
    kind,
    payload,
    createdAt: at,
    attempts: 0,
    lastError: null,
    nextAttemptAt: at,
    sentAt: null,
    result: null,
  };
}

describe("synchro du rôle boutique", () => {
  it("garde les billets et l'état de la boutique dans la liste du téléphone", () => {
    const { merged, state } = shopState();
    expect(merged.meta.shopEnabled).toBe(true);
    expect(state.tickets.size).toBe(3);
    expect(shopAccess(merged.meta)).toBe("ok");
    expect(shopAccess({ myRoles: ["scan"], shopEnabled: true })).toBe("no_role");
    expect(shopAccess({ myRoles: ["shop"], shopEnabled: false })).toBe("disabled");
    expect(shopAccess(null)).toBe("no_role");
  });

  it("différentielle : les billets reçus écrasent les anciens ; boutique coupée ou rôle perdu : synchro complète exigée", () => {
    const { merged } = shopState();
    if (!merged.ok) throw new Error("fusion");
    const delta = mergeSync(
      { meta: merged.meta, entries: merged.entries, tickets: merged.tickets },
      asSync(
        syncBody({
          full: false,
          tickets: [
            ticket(1, { status: "used", usedAt: "2026-10-17T09:05:00.000Z", updatedAt: "2026-10-17T09:05:00.000Z" }),
          ],
          generatedAt: "2026-10-17T09:06:00.000Z",
        }),
      ),
      "user-lea",
      new Date("2026-10-17T09:06:30Z"),
    );
    if (!delta.ok) throw new Error("fusion");
    expect(delta.tickets).toHaveLength(3);
    expect(delta.tickets.find((t) => t.ticketId === uuid(1))?.status).toBe("used");
    expect(delta.tickets.find((t) => t.ticketId === uuid(2))?.status).toBe("valid");
    // Boutique désactivée depuis : la différentielle ne suffit pas.
    const off = mergeSync(
      { meta: merged.meta, entries: merged.entries, tickets: merged.tickets },
      asSync(
        syncBody({ full: false, tickets: undefined, shopEnabled: undefined, generatedAt: "2026-10-17T09:07:00.000Z" }),
      ),
      "user-lea",
      new Date(),
    );
    expect(off).toEqual({ ok: false, reason: "needs_full" });
    // Synchro complète sans billets (plus de rôle boutique) : le téléphone n'en garde aucun.
    const wiped = mergeSync(
      { meta: merged.meta, entries: merged.entries, tickets: merged.tickets },
      asSync(
        syncBody({
          tickets: undefined,
          shopEnabled: undefined,
          myRoles: ["scan"],
          generatedAt: "2026-10-17T09:08:00.000Z",
        }),
      ),
      "user-lea",
      new Date(),
    );
    if (!wiped.ok) throw new Error("fusion");
    expect(wiped.tickets).toEqual([]);
    expect(wiped.meta.shopEnabled).toBe(false);
  });

  it("une synchro sans corps `tickets` reste vérifiable : la signature couvre ce qui est présent", () => {
    const b = syncBody({ tickets: undefined, shopEnabled: undefined, myRoles: ["scan"] });
    const text = accessListSigningText(b);
    expect(text).not.toContain("tickets");
    expect(accessListSigningText(syncBody())).toContain('"tickets"');
  });
});

describe("décision locale d'un billet, anti-rejeu", () => {
  it("OK puis déjà utilisé sur ce téléphone, sans réseau", () => {
    const { state } = shopState();
    const qr = ticketQr(uuid(1));
    const first = decideTicketLocal(state, qr, keys, ed25519Verify);
    expect(first).toMatchObject({ decision: "ok", listed: true });
    const { item, use } = ticketScanAction(first, qr, uuid(900), new Date("2026-10-17T09:10:00Z"));
    expect(item).toMatchObject({ id: uuid(900), decision: "ok", rawPayload: qr });
    expect(use).toEqual({ ticketId: uuid(1), usedAt: "2026-10-17T09:10:00.000Z", actionId: uuid(900) });
    if (use) state.ticketUses.set(use.ticketId, use);
    const second = decideTicketLocal(state, qr, keys, ed25519Verify);
    expect(second).toMatchObject({ decision: "already", usedAt: "2026-10-17T09:10:00.000Z" });
    expect(ticketScanAction(second, qr, uuid(901), new Date()).use).toBeNull();
  });

  it("refus : annulé, autre événement, falsifié ; un QR qui n'est pas d'Orasso ne part jamais au serveur", () => {
    const { state } = shopState();
    expect(decideTicketLocal(state, ticketQr(uuid(3)), keys, ed25519Verify)).toMatchObject({
      decision: "refused",
      reason: "cancelled",
    });
    expect(decideTicketLocal(state, ticketQr(uuid(1), 99), keys, ed25519Verify)).toMatchObject({
      decision: "refused",
      reason: "other_event",
    });
    expect(decideTicketLocal(state, `${ticketQr(uuid(1)).slice(0, -3)}AAA`, keys, ed25519Verify)).toMatchObject({
      decision: "refused",
      reason: "forged",
    });
    const foreign = "https://exemple.fr/promo";
    const d = decideTicketLocal(state, foreign, keys, ed25519Verify);
    expect(d).toMatchObject({ decision: "refused", reason: "malformed" });
    expect(ticketScanAction(d, foreign, uuid(902), new Date()).item).toBeNull();
    // Un QR d'inscription n'est pas un billet.
    const message = encodePassMessage({ kid: 1, eventNo: EVENT_NO, passId: uuid(1) });
    const pass = encodePassPayload(message, new Uint8Array(sign(null, message, privateKey)));
    expect(decideTicketLocal(state, pass, keys, ed25519Verify)).toMatchObject({
      decision: "refused",
      reason: "malformed",
    });
  });

  it("billet signé absent de la liste (réservé après la synchro) : OK à resynchroniser, puis déjà utilisé", () => {
    const { state } = shopState();
    const qr = ticketQr(uuid(77));
    const d = decideTicketLocal(state, qr, keys, ed25519Verify);
    expect(d).toMatchObject({ decision: "ok", listed: false, ticket: null });
    const { use } = ticketScanAction(d, qr, uuid(903), new Date("2026-10-17T09:20:00Z"));
    if (use) state.ticketUses.set(use.ticketId, use);
    expect(decideTicketLocal(state, qr, keys, ed25519Verify)).toMatchObject({ decision: "already" });
  });
});

describe("file hors ligne : billets et compteur (SQLite)", () => {
  it("garde tout sans réseau, rejoue sans double comptage, aligne sur les réponses du serveur", async () => {
    const store = new StaffStore(memoryDb());
    await store.init();
    const { merged, state } = shopState();
    await store.saveSync(merged.meta, merged.entries, merged.full, { list: merged.tickets, replace: merged.full });
    expect(await store.tickets(EVENT_ID)).toHaveLength(3);

    // Mode avion : deux billets lus (le même billet deux fois côté 2e téléphone plus tard), trois touchers de compteur.
    const t0 = new Date("2026-10-17T09:00:00Z");
    const uses: LocalTicketUse[] = [];
    for (const [i, n] of [1, 2].entries()) {
      const qr = ticketQr(uuid(n));
      const d = decideTicketLocal(state, qr, keys, ed25519Verify);
      const id = uuid(950 + i);
      const at = new Date(t0.getTime() + i * 1000);
      const { item, use } = ticketScanAction(d, qr, id, at);
      if (!item || !use) throw new Error("lecture");
      state.ticketUses.set(use.ticketId, use);
      uses.push(use);
      await store.addAction(action(id, "ticket_scan", { ...item, ticketId: d.ticketId }, at.toISOString()), null, use);
    }
    const visitorIds = [uuid(960), uuid(961), uuid(962)];
    const deltas = [10, 1, 1];
    for (const [i, id] of visitorIds.entries()) {
      const at = new Date(t0.getTime() + 5000 + i);
      await store.addAction(action(id, "visitor", { id, delta: deltas[i], at: at.toISOString() }, at.toISOString()));
    }
    expect((await store.ticketUses(EVENT_ID)).map((u) => u.ticketId).sort()).toEqual([uuid(1), uuid(2)]);
    let pending = await store.actions("user-lea", { unsentOnly: true });
    expect(visitorTotals(pending)).toEqual({ local: 12, pending: 12, server: null });
    const due = new Date("2026-10-17T09:01:00Z");
    expect(dueOfKind(pending, "ticket_scan", due).get(EVENT_ID)).toHaveLength(2);
    expect(dueOfKind(pending, "visitor", due).get(EVENT_ID)).toHaveLength(3);
    expect(dueOfKind(pending, "scan", due).size).toBe(0);

    // Retour du réseau : le 1er billet est accepté ; le 2e avait déjà été passé par un autre téléphone ; compteur ajouté.
    const tickets = pending.filter((a) => a.kind === "ticket_scan");
    const results: TicketScanResultView[] = [
      { id: uuid(950), result: "accepted", usedAt: "2026-10-17T09:00:00.000Z", ticketName: "Entrée" },
      { id: uuid(951), result: "already", usedAt: "2026-10-17T08:55:00.000Z", ticketName: "Entrée" },
    ];
    const { effects, missing } = applyTicketResults(tickets, results);
    expect(missing).toEqual([]);
    await store.markSent(
      EVENT_ID,
      effects.map((e) => ({ id: e.id, result: { ...e.result }, use: e.use })),
      new Date("2026-10-17T09:02:00Z"),
    );
    await store.markSent(
      EVENT_ID,
      visitorIds.map((id) => ({ id, result: { applied: true, total: 12 } })),
      new Date("2026-10-17T09:02:01Z"),
    );
    pending = await store.actions("user-lea", { unsentOnly: true });
    expect(pending).toEqual([]);
    // L'usage local du 2e billet prend l'heure du serveur (un autre téléphone était passé avant).
    const localUses = await store.ticketUses(EVENT_ID);
    expect(localUses.find((u) => u.ticketId === uuid(2))?.usedAt).toBe("2026-10-17T08:55:00.000Z");
    const all = await store.actions("user-lea");
    expect(ticketDuplicates(all)).toEqual([{ ticketId: uuid(2), usedAt: "2026-10-17T08:55:00.000Z", count: 1 }]);
    expect(visitorTotals(all)).toEqual({ local: 12, pending: 0, server: 12 });
    // Rejeu du même lot (réponse perdue) : mêmes identifiants ; rien n'est compté deux fois côté appareil.
    expect(new Set(all.map((a) => a.id)).size).toBe(5);
  });

  it("billet refusé par le serveur (falsifié) ou lot rejeté : l'usage local disparaît ; le compteur ignore les touchers refusés", async () => {
    const store = new StaffStore(memoryDb());
    await store.init();
    const { merged, state } = shopState();
    await store.saveSync(merged.meta, merged.entries, merged.full, { list: merged.tickets, replace: true });
    const qr = ticketQr(uuid(1));
    const d = decideTicketLocal(state, qr, keys, ed25519Verify);
    const at = new Date("2026-10-17T09:00:00Z");
    const { item, use } = ticketScanAction(d, qr, uuid(970), at);
    if (!item || !use) throw new Error("lecture");
    await store.addAction(
      action(uuid(970), "ticket_scan", { ...item, ticketId: uuid(1) }, at.toISOString()),
      null,
      use,
    );
    const [sent] = await store.actions("user-lea", { unsentOnly: true });
    if (!sent) throw new Error("file vide");
    const { effects } = applyTicketResults(
      [sent],
      [{ id: uuid(970), result: "refused", reason: "forged", usedAt: null, ticketName: null }],
    );
    await store.markSent(
      EVENT_ID,
      effects.map((e) => ({ id: e.id, result: { ...e.result }, use: e.use })),
      new Date(),
    );
    expect(await store.ticketUses(EVENT_ID)).toEqual([]);

    // Compteur : un toucher rejeté (boutique fermée) ne compte plus.
    await store.addAction(
      action(uuid(971), "visitor", { id: uuid(971), delta: 10, at: at.toISOString() }, at.toISOString()),
    );
    await store.markRejected(
      EVENT_ID,
      [uuid(971)],
      { error: "La boutique n'est pas activée", status: 409 },
      new Date(),
    );
    expect(visitorTotals(await store.actions("user-lea"))).toEqual({ local: 0, pending: 0, server: null });
  });

  it("purge à J+1 : billets et usages disparaissent avec la liste, les actions non envoyées restent", async () => {
    const store = new StaffStore(memoryDb());
    await store.init();
    const { merged } = shopState();
    await store.saveSync(merged.meta, merged.entries, merged.full, { list: merged.tickets, replace: true });
    const at = "2026-10-17T09:00:00.000Z";
    await store.addAction(action(uuid(980), "ticket_scan", { id: uuid(980), ticketId: uuid(1) }, at), null, {
      ticketId: uuid(1),
      usedAt: at,
      actionId: uuid(980),
    });
    await store.purgeEvent(EVENT_ID);
    expect(await store.tickets(EVENT_ID)).toEqual([]);
    expect(await store.ticketUses(EVENT_ID)).toEqual([]);
    expect(await store.actions("user-lea", { unsentOnly: true })).toHaveLength(1);
    await store.saveSync(merged.meta, merged.entries, merged.full, { list: merged.tickets, replace: true });
    await store.purgeAll();
    expect(await store.tickets(EVENT_ID)).toEqual([]);
  });

  it("position d'une alerte : effacée du téléphone dès l'alerte partie", async () => {
    const store = new StaffStore(memoryDb());
    await store.init();
    const at = "2026-10-17T09:00:00.000Z";
    await store.addAction(action(uuid(990), "alert", { message: "Besoin d'aide", lat: 42.5465, lng: 3.0245 }, at));
    expect((await store.actions("user-lea"))[0]?.payload).toMatchObject({ lat: 42.5465, lng: 3.0245 });
    await store.scrubPosition(uuid(990));
    const [after] = await store.actions("user-lea");
    expect(after?.payload).toEqual({ message: "Besoin d'aide" });
  });
});

describe("relecture de l'événement pendant une lecture (openEvent)", () => {
  it("reprend l'usage de billet et le pointage de véhicule pas encore écrits en base", () => {
    const { merged, state: previous } = shopState();
    // Lecture faite pendant la relecture du disque : en mémoire, pas encore en base.
    previous.ticketUses.set(uuid(1), { ticketId: uuid(1), usedAt: "2026-10-17T09:10:00.000Z", actionId: uuid(900) });
    previous.local.set(uuid(50), {
      passId: uuid(50),
      applicationId: uuid(1050),
      checkedInAt: "2026-10-17T09:11:00.000Z",
      method: "scan",
      actionId: uuid(901),
    });
    const fresh = buildState(merged.meta, merged.entries, [], merged.tickets, []);
    carryOver(fresh, previous, "user-lea");
    expect(fresh.ticketUses.get(uuid(1))?.usedAt).toBe("2026-10-17T09:10:00.000Z");
    expect(fresh.local.get(uuid(50))?.checkedInAt).toBe("2026-10-17T09:11:00.000Z");
    // Le billet est donc bien « déjà utilisé » à la lecture suivante (et non relu « OK »).
    expect(decideTicketLocal(fresh, ticketQr(uuid(1)), keys, ed25519Verify)).toMatchObject({ decision: "already" });
    // Ce que le disque a déjà n'est pas écrasé ; un autre compte ne reprend rien.
    const disk = buildState(merged.meta, merged.entries, [], merged.tickets, [
      { ticketId: uuid(1), usedAt: "2026-10-17T08:00:00.000Z", actionId: uuid(902) },
    ]);
    carryOver(disk, previous, "user-lea");
    expect(disk.ticketUses.get(uuid(1))?.usedAt).toBe("2026-10-17T08:00:00.000Z");
    const other = buildState(merged.meta, merged.entries, [], merged.tickets, []);
    carryOver(other, previous, "user-autre");
    expect(other.ticketUses.size).toBe(0);
    expect(other.local.size).toBe(0);
  });

  it("un toucher du compteur refusé pour boutique fermée ne compte pas", () => {
    const a = action(
      uuid(995),
      "visitor",
      { id: uuid(995), delta: 10, at: "2026-10-17T09:00:00.000Z" },
      "2026-10-17T09:00:00.000Z",
    );
    a.sentAt = "2026-10-17T09:01:00.000Z";
    a.result = { applied: false, total: 0, reason: "shop_disabled" };
    expect(visitorTotals([a])).toEqual({ local: 0, pending: 0, server: null });
  });
});

// Logique pure du mode staff hors ligne (ARCHITECTURE.md § 4) : fusion des synchros, décision d'un scan avec la liste
// locale, anti-rebond, recherche par plaque ou pseudo, compteurs, file d'envoi et lecture des réponses du serveur.
// Sans React Native ni stockage : testée par Vitest (staff.test.ts) ; le stockage est dans store.ts.

import {
  type AccessListEntry,
  decideScan,
  decideTicketScan,
  type Ed25519Verify,
  type LocalScanDecision,
  type LocalTicket,
  localDate,
  normalizePlate,
  type ScanBatchResult,
  type ScanDecision,
  type StaffRole,
  type StaffSync,
  staffModeClosesAt,
  type TicketListEntry,
  type TicketScanDecision,
  type TicketScanResultView,
  type VisitorDelta,
} from "@orasso/shared";
import { now as clockNow, serverNow } from "../clock";

import { plateHashOf } from "./crypto";

// --- Données locales -------------------------------------------------------------------------------------------

/** Ce que l'appareil garde d'un événement synchronisé (table `staff_events`). */
export type StaffEventMeta = {
  eventId: string;
  /** Compte du staff qui a synchronisé (les données d'un autre compte ne sont jamais montrées). */
  userId: string;
  eventNo: number;
  title: string;
  startsAt: string;
  endsAt: string;
  lockAt: string;
  isLocked: boolean;
  plateSalt: string;
  zones: StaffSync["event"]["zones"];
  /** Lot 26 : jours d'un événement sur plusieurs jours (vide ou absent = un jour). */
  days?: StaffSync["event"]["days"];
  myRoles: StaffRole[];
  /** Lot 24 : la boutique est activée pour cet événement (tuile « Boutique », billets dans la synchro). */
  shopEnabled?: boolean;
  /** À renvoyer en `since` (synchro différentielle). */
  cursor: string | null;
  /** Heure du serveur de la dernière liste acceptée : une liste plus ancienne est refusée (rejeu). */
  generatedAt: string;
  /** Heure de l'appareil à la dernière synchro réussie (« Liste à jour 09:48 »). */
  syncedAt: string;
  /**
   * Écart estimé heure du serveur − heure du téléphone à la dernière synchro (`generatedAt` − réception), en ms :
   * un téléphone en avance ne purge pas la liste le jour J (relecture du lot 10).
   */
  serverOffsetMs?: number;
};

export type LocalCheckinMethod = "scan" | "override" | "manual" | "plate" | "drive";

/** Entrée enregistrée sur l'appareil avant (ou en attendant) la confirmation du serveur (table `local_checkins`). */
export type LocalCheckin = {
  passId: string;
  applicationId: string | null;
  checkedInAt: string;
  method: LocalCheckinMethod;
  actionId: string;
};

/** Élément d'un lot `POST /events/:id/scans` tel qu'il part (dates en texte ISO, `scanBatchSchema` en entrée). */
export type ScanItemWire = {
  kind: "scan";
  id: string;
  passId: string | null;
  rawPayload: string | null;
  decision: LocalScanDecision;
  reason: string | null;
  zoneCode: string | null;
  scannedAt: string;
};
export type CheckinItemWire = {
  kind: "manual" | "plate" | "drive";
  id: string;
  applicationId: string;
  note: string | null;
  scannedAt: string;
};
export type BatchItemWire = ScanItemWire | CheckinItemWire;

/**
 * Ce qui part au serveur : lectures et pointages (`POST /events/:id/scans`) et le reste du terrain. Lot 24 :
 * `ticket_scan` (billets du public, `POST /events/:id/ticket-scans`), `visitor` (compteur d'entrées,
 * `POST /events/:id/visitor-entries`), `incident_photo` (photo envoyée après l'incident, à son tour).
 */
export type ActionKind =
  | "scan"
  | "manual"
  | "plate"
  | "drive"
  | "presence"
  | "express"
  | "incident"
  | "alert"
  | "ticket_scan"
  | "visitor"
  | "incident_photo";
export const BATCH_KINDS: readonly ActionKind[] = ["scan", "manual", "plate", "drive"];
/** Les actions dont l'identifiant (clé d'idempotence côté serveur) voyage aussi dans le corps. */
export const ID_IN_PAYLOAD: readonly ActionKind[] = [...BATCH_KINDS, "ticket_scan", "visitor"];

export type PendingAction = {
  id: string;
  eventId: string;
  /** Titre de l'événement : « 3 scans à envoyer · Salon Argelès », même après la purge de J+1. */
  eventTitle: string;
  userId: string;
  kind: ActionKind;
  /** Élément du lot (`ScanBatchItem`) ou corps de la route (présence, express, incident, alerte). */
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  sentAt: string | null;
  /** Réponse du serveur (résultat d'un lot, lien express…). */
  result: Record<string, unknown> | null;
};

/** La liste en mémoire pendant le scan : la décision ne lit jamais le disque (< 300 ms visé, docs « une seconde »). */
export type StaffState = {
  meta: StaffEventMeta;
  entries: Map<string, AccessListEntry>;
  byApplication: Map<string, string>;
  local: Map<string, LocalCheckin>;
  /** Lot 24 : billets du public (rôle boutique seulement) et ceux que cet appareil a déjà acceptés. */
  tickets: Map<string, TicketListEntry>;
  ticketUses: Map<string, LocalTicketUse>;
  /**
   * Lot 26 : dernière lecture de chaque QR sur cet appareil (OK, déjà entré, accepté quand même), en mémoire : un
   * « tout l'événement » lu aujourd'hui est arrivé aujourd'hui, même si son entrée date d'un jour précédent.
   */
  seen?: Map<string, string>;
};

/** Billet accepté sur cet appareil avant (ou en attendant) la confirmation du serveur (table `local_ticket_uses`). */
export type LocalTicketUse = { ticketId: string; usedAt: string; actionId: string };

export function buildState(
  meta: StaffEventMeta,
  entries: Iterable<AccessListEntry>,
  local: Iterable<LocalCheckin>,
  tickets: Iterable<TicketListEntry> = [],
  ticketUses: Iterable<LocalTicketUse> = [],
): StaffState {
  const map = new Map<string, AccessListEntry>();
  const byApplication = new Map<string, string>();
  for (const e of entries) {
    map.set(e.passId, e);
    // Un pass valide l'emporte sur l'ancien pass révoqué (`replaced`) de la même candidature.
    if (e.status === "valid" || !byApplication.has(e.applicationId)) byApplication.set(e.applicationId, e.passId);
  }
  return {
    meta,
    entries: map,
    byApplication,
    local: new Map([...local].map((l) => [l.passId, l])),
    tickets: new Map([...tickets].map((t) => [t.ticketId, t])),
    ticketUses: new Map([...ticketUses].map((u) => [u.ticketId, u])),
  };
}

/**
 * Reprend dans `fresh` (état reconstruit depuis le disque) les pointages et usages de billets que `previous` (état en
 * mémoire du même compte) a déjà et que le disque n'a pas encore : écritures de la file pas terminées au moment de la
 * lecture. Sans effet pour un autre compte.
 */
export function carryOver(fresh: StaffState, previous: StaffState | undefined, userId: string): void {
  if (!previous || previous.meta.userId !== userId || previous.meta.eventId !== fresh.meta.eventId) return;
  for (const [passId, local] of previous.local) if (!fresh.local.has(passId)) fresh.local.set(passId, local);
  for (const [ticketId, use] of previous.ticketUses) {
    if (!fresh.ticketUses.has(ticketId)) fresh.ticketUses.set(ticketId, use);
  }
  if (previous.seen) fresh.seen = new Map([...(fresh.seen ?? []), ...previous.seen]);
}

/** Lot 26 : note qu'un QR a été lu (présence du jour d'un « tout l'événement »). */
export function markSeen(state: StaffState, passId: string, at: Date): void {
  if (!state.seen) state.seen = new Map();
  state.seen.set(passId, at.toISOString());
}

/**
 * Arrivé ce jour-là (même règle que le direct de l'API) : événement d'un jour ou candidature d'un jour = entrée
 * enregistrée ; « tout l'événement » sur plusieurs jours = entrée, lecture reçue par le serveur (`lastSeenAt`) ou
 * lecture sur cet appareil datées d'aujourd'hui (Paris).
 */
export function arrivedOn(state: StaffState, entry: AccessListEntry, now: Date): boolean {
  const at = checkedInAt(state, entry);
  if ((state.meta.days?.length ?? 0) < 2 || entry.dayDate) return Boolean(at);
  const today = localDate(now);
  return [at, entry.lastSeenAt ?? null, state.seen?.get(entry.passId) ?? null].some(
    (x) => x !== null && localDate(new Date(x)) === today,
  );
}

// --- Synchro ---------------------------------------------------------------------------------------------------

export type SyncMerge =
  | { ok: true; meta: StaffEventMeta; entries: AccessListEntry[]; tickets: TicketListEntry[]; full: boolean }
  | { ok: false; reason: "stale" | "needs_full" };

/**
 * Fusion d'une synchro (déjà vérifiée) avec la liste locale. Complète (`full`) : remplace tout. Différentielle :
 * remplace les entrées par `passId` (`removedPassIds` est toujours vide côté API, relecture du lot 06 M10 : un pass
 * n'est jamais supprimé, il revient `revoked`). Une liste générée avant celle qu'on a déjà est refusée.
 */
export function mergeSync(
  previous: { meta: StaffEventMeta; entries: Iterable<AccessListEntry>; tickets?: Iterable<TicketListEntry> } | null,
  sync: StaffSync,
  userId: string,
  now: Date,
): SyncMerge {
  if (
    previous &&
    previous.meta.userId === userId &&
    Date.parse(sync.generatedAt) < Date.parse(previous.meta.generatedAt)
  ) {
    return { ok: false, reason: "stale" };
  }
  // Rôles changés (super staff retiré : coordonnées à effacer) : une différentielle ne suffit pas, il faut tout remplacer.
  const sameRoles =
    previous !== null && [...previous.meta.myRoles].sort().join(",") === [...sync.myRoles].sort().join(",");
  // Boutique activée ou coupée depuis la dernière liste : les billets ne se complètent pas par différence.
  const sameShop = previous !== null && Boolean(previous.meta.shopEnabled) === Boolean(sync.shopEnabled);
  if (previous && previous.meta.userId === userId && !sync.full && (!sameRoles || !sameShop))
    return { ok: false, reason: "needs_full" };
  const keepPrevious = previous && previous.meta.userId === userId && !sync.full;
  const map = new Map<string, AccessListEntry>();
  if (keepPrevious) for (const e of previous.entries) map.set(e.passId, e);
  for (const e of sync.entries) map.set(e.passId, e);
  // Billets du public (rôle boutique) : sans `tickets` dans la synchro, le téléphone n'en garde aucun.
  const ticketMap = new Map<string, TicketListEntry>();
  if (keepPrevious && sync.tickets) for (const t of previous.tickets ?? []) ticketMap.set(t.ticketId, t);
  for (const t of sync.tickets ?? []) ticketMap.set(t.ticketId, t);
  const meta: StaffEventMeta = {
    eventId: sync.event.id,
    userId,
    eventNo: sync.event.eventNo,
    title: sync.event.title,
    startsAt: sync.event.startsAt,
    endsAt: sync.event.endsAt,
    lockAt: sync.event.lockAt,
    isLocked: sync.event.isLocked,
    plateSalt: sync.event.plateSalt,
    zones: sync.event.zones,
    days: sync.event.days ?? [],
    myRoles: sync.myRoles,
    shopEnabled: sync.shopEnabled === true,
    // Une synchro différentielle sans base locale ne peut pas servir de point de départ : on repartira de zéro.
    cursor: keepPrevious || sync.full ? sync.cursor : null,
    generatedAt: sync.generatedAt,
    syncedAt: now.toISOString(),
    serverOffsetMs: Date.parse(sync.generatedAt) - now.getTime(),
  };
  return {
    ok: true,
    meta,
    entries: [...map.values()],
    tickets: [...ticketMap.values()],
    full: sync.full || !keepPrevious,
  };
}

/**
 * Mode staff refermé à J+1 (fin + 1 jour, comme l'API) : tout est purgé sauf les actions non envoyées. Il faut que
 * l'heure du téléphone **et** l'heure du serveur estimée (`serverOffsetMs`) soient toutes deux passées : un téléphone
 * en avance ne vide pas la liste le jour J.
 */
export function isPurgeDue(meta: Pick<StaffEventMeta, "endsAt" | "serverOffsetMs">, now: Date): boolean {
  const closes = staffModeClosesAt({ endsAt: new Date(meta.endsAt) }).getTime();
  return now.getTime() >= closes && now.getTime() + (meta.serverOffsetMs ?? 0) >= closes;
}

// --- Scan ------------------------------------------------------------------------------------------------------

/** Heure d'entrée connue : serveur, sinon pointage local en attente. */
export function checkedInAt(state: StaffState, entry: AccessListEntry): string | null {
  return entry.checkedInAt ?? state.local.get(entry.passId)?.checkedInAt ?? null;
}

/**
 * Décision locale d'un QR (§ 3.1) : `decideScan` du paquet partagé (préfixe, clé de confiance, signature, événement,
 * liste, révocation, déjà entré), avec les entrées enregistrées sur l'appareil et pas encore confirmées.
 */
export function decideLocal(
  state: StaffState,
  payload: string,
  keys: ReadonlyMap<number, Uint8Array>,
  verify: Ed25519Verify,
  /** Lot 26 : heure du scan (règle « Autre jour » d'un événement sur plusieurs jours). */
  now: Date = serverNow(),
): ScanDecision {
  return decideScan(payload, {
    eventNo: state.meta.eventNo,
    keys,
    verify,
    now,
    // Ancien QR statique `OR1` accepté jusqu'au lot 58 (relecture du lot 48, 19/10/2026) : le lot 58 met `false`.
    acceptLegacy: true,
    findEntry: (passId) => {
      const entry = state.entries.get(passId);
      if (entry) return { ...entry, checkedInAt: checkedInAt(state, entry) };
      // QR accepté « quand même » plus tôt sur cet appareil : la deuxième lecture est « déjà entré ».
      const local = state.local.get(passId);
      return local
        ? {
            passId,
            status: "valid",
            revokedReason: null,
            checkedInAt: local.checkedInAt,
            zoneCode: null,
            zoneName: null,
            pseudo: "",
            vehicleLabel: null,
          }
        : undefined;
    },
  });
}

/** Ce que la lecture devient dans la file (`kind: scan`) et, si le véhicule entre, le pointage local. */
export function scanAction(
  decision: ScanDecision | { decision: "override" | "unknown_pass"; passId: string; reason?: string },
  payload: string,
  id: string,
  now: Date,
  entry?: AccessListEntry,
): { item: ScanItemWire; checkin: LocalCheckin | null } {
  const passId = decision.passId;
  // Lot 26 : « Accepter quand même » un QR d'un autre jour garde la raison (`other_day`) pour le rapport.
  // Relecture du lot 48 : code tournant non vérifiable (pass absent de la liste) → `unverified_otp` au rapport.
  const reason =
    decision.decision === "refused"
      ? decision.reason
      : "reason" in decision
        ? (decision.reason ?? null)
        : "unverified" in decision && decision.unverified
          ? "unverified_otp"
          : null;
  const zoneCode = entry?.zoneCode ?? null;
  const item: ScanItemWire = {
    kind: "scan",
    id,
    passId,
    // Le QR brut ne part que s'il est d'Orasso et que l'appareil n'a pas su le lire : le serveur le vérifie lui-même.
    // Un QR étranger (adresse web, autre billet) ne quitte pas le téléphone.
    rawPayload: !passId && payload.startsWith("OR1") ? payload.slice(0, 512) : null,
    decision: decision.decision,
    reason,
    zoneCode,
    scannedAt: now.toISOString(),
  };
  const enters = decision.decision === "ok" || decision.decision === "override";
  const checkin: LocalCheckin | null =
    enters && passId
      ? {
          passId,
          applicationId: entry?.applicationId ?? null,
          checkedInAt: now.toISOString(),
          method: decision.decision === "ok" ? "scan" : "override",
          actionId: id,
        }
      : null;
  return { item, checkin };
}

/** Pointage « Pointer » (liste, recherche), rapide par plaque ou par l'accueil drive (lot 48), fait sur l'appareil. */
export function checkinAction(
  entry: AccessListEntry,
  kind: "manual" | "plate" | "drive",
  id: string,
  now: Date,
  note?: string,
): { item: CheckinItemWire; checkin: LocalCheckin } {
  return {
    item: { kind, id, applicationId: entry.applicationId, note: note?.trim() || null, scannedAt: now.toISOString() },
    checkin: {
      passId: entry.passId,
      applicationId: entry.applicationId,
      checkedInAt: now.toISOString(),
      method: kind,
      actionId: id,
    },
  };
}

/**
 * Anti-rebond : la caméra relit le même QR à chaque image tant qu'il est devant elle. Une charge utile n'est comptée
 * qu'une fois tant qu'elle a été vue il y a moins de `windowMs` (3 s) : un QR laissé devant l'objectif ne compte
 * qu'une fois ; retiré 3 s puis représenté, il est relu (et sera « déjà entré »).
 */
export class ScanGate {
  private seen = new Map<string, number>();
  constructor(private readonly windowMs = 3_000) {}

  /** Vrai si la lecture est nouvelle et doit être décidée. */
  accept(payload: string, nowMs: number): boolean {
    const last = this.seen.get(payload);
    this.seen.set(payload, nowMs);
    if (this.seen.size > 64) {
      for (const [k, t] of this.seen) if (nowMs - t >= this.windowMs) this.seen.delete(k);
    }
    return last === undefined || nowMs - last >= this.windowMs;
  }
}

// --- Rôle boutique : billets du public et compteur de visiteurs (lot 24) -----------------------------------------

/** Élément d'un lot `POST /events/:id/ticket-scans` tel qu'il part. */
export type TicketScanWire = {
  id: string;
  rawPayload: string;
  decision: "ok" | "already" | "refused";
  reason: string | null;
  scannedAt: string;
};

/** Billet de la liste locale tel que `decideTicketScan` le lit (sans la date de modification). */
const asLocalTicket = (t: TicketListEntry | undefined): LocalTicket | undefined =>
  t && {
    ticketId: t.ticketId,
    status: t.status,
    holderLabel: t.holderLabel,
    typeLabel: t.typeLabel,
    usedAt: t.usedAt,
  };

/** Décision locale d'un QR de billet (liste du téléphone + billets déjà acceptés ici, sans réseau). */
export function decideTicketLocal(
  state: StaffState,
  payload: string,
  keys: ReadonlyMap<number, Uint8Array>,
  verify: Ed25519Verify,
): TicketScanDecision {
  return decideTicketScan(payload, {
    eventNo: state.meta.eventNo,
    keys,
    verify,
    findTicket: (id) => asLocalTicket(state.tickets.get(id)),
    usedLocally: (id) => state.ticketUses.get(id)?.usedAt,
  });
}

/**
 * Ce que la lecture d'un billet devient dans la file (`kind: ticket_scan`) et, si le billet passe, l'usage local qui
 * le rend « déjà utilisé » pour la lecture suivante. Un QR qui n'est pas d'Orasso (préfixe `OB1`) reste sur le
 * téléphone : rien à envoyer.
 */
export function ticketScanAction(
  decision: TicketScanDecision,
  payload: string,
  id: string,
  now: Date,
): { item: TicketScanWire | null; use: LocalTicketUse | null } {
  const text = payload.trim();
  const item: TicketScanWire | null = text.startsWith("OB1")
    ? {
        id,
        rawPayload: text.slice(0, 512),
        decision: decision.decision,
        reason: decision.decision === "refused" ? decision.reason : null,
        scannedAt: now.toISOString(),
      }
    : null;
  const use: LocalTicketUse | null =
    decision.decision === "ok" ? { ticketId: decision.ticketId, usedAt: now.toISOString(), actionId: id } : null;
  return { item, use };
}

export type TicketResultEffect = {
  id: string;
  result: TicketScanResultView;
  /** Usage local à aligner sur le serveur (heure retenue), ou à retirer (`usedAt: null`) si le serveur a refusé. */
  use: { ticketId: string; usedAt: string | null; actionId: string } | null;
};

/**
 * Réponse du serveur à un lot de billets : `accepted` aligne l'heure d'usage sur celle du serveur ; `already` (un
 * autre téléphone a passé le billet avant) garde le billet « utilisé » avec l'heure du serveur ; `refused` et `rejected`
 * retirent l'usage local que cette lecture avait créé.
 */
export function applyTicketResults(
  sent: readonly PendingAction[],
  results: readonly TicketScanResultView[],
): { effects: TicketResultEffect[]; missing: string[] } {
  const byId = new Map(results.map((r) => [r.id, r]));
  const effects: TicketResultEffect[] = [];
  const missing: string[] = [];
  for (const action of sent) {
    const r = byId.get(action.id);
    if (!r) {
      missing.push(action.id);
      continue;
    }
    const ticketId = typeof action.payload.ticketId === "string" ? action.payload.ticketId : null;
    let use: TicketResultEffect["use"] = null;
    if (ticketId) {
      if ((r.result === "accepted" || r.result === "already") && r.usedAt) {
        use = { ticketId, usedAt: r.usedAt, actionId: action.id };
      } else if (r.result === "refused" || r.result === "rejected") {
        use = { ticketId, usedAt: null, actionId: action.id };
      }
    }
    effects.push({ id: action.id, result: r, use });
  }
  return { effects, missing };
}

/** Billets lus ici qu'un autre téléphone avait déjà passés (rapport du serveur) : une ligne par billet. */
export function ticketDuplicates(
  actions: readonly PendingAction[],
): { ticketId: string; usedAt: string | null; count: number }[] {
  const lines = new Map<string, { ticketId: string; usedAt: string | null; count: number }>();
  for (const a of actions) {
    if (a.kind !== "ticket_scan" || !a.sentAt || a.result?.result !== "already") continue;
    if (a.payload.decision !== "ok") continue;
    const ticketId = typeof a.payload.ticketId === "string" ? a.payload.ticketId : a.id;
    const line = lines.get(ticketId);
    if (line) line.count++;
    else
      lines.set(ticketId, {
        ticketId,
        usedAt: typeof a.result?.usedAt === "string" ? a.result.usedAt : null,
        count: 1,
      });
  }
  return [...lines.values()];
}

/** Élément d'un lot `POST /events/:id/visitor-entries`. */
export type VisitorItemWire = { id: string; delta: VisitorDelta; at: string };

/** Compteur d'entrées : ce que cet appareil a compté, ce qui reste à envoyer, et le dernier total connu du serveur. */
export function visitorTotals(actions: readonly PendingAction[]): {
  local: number;
  pending: number;
  server: number | null;
} {
  let local = 0;
  let pending = 0;
  let server: number | null = null;
  let serverAt = "";
  for (const a of actions) {
    if (a.kind !== "visitor") continue;
    // Refusé pour de bon par le serveur (boutique fermée, plus de rôle) : le toucher ne compte pas.
    if (typeof a.result?.error === "string" || typeof a.result?.reason === "string") continue;
    const delta = typeof a.payload.delta === "number" ? a.payload.delta : 0;
    local += delta;
    if (!a.sentAt) pending += delta;
    else if (typeof a.result?.total === "number" && a.sentAt >= serverAt) {
      server = a.result.total;
      serverAt = a.sentAt;
    }
  }
  return { local: Math.max(0, local), pending, server };
}

/** Les actions d'un genre à envoyer maintenant, par événement, en lots de 200 au plus, les plus anciennes d'abord. */
export function dueOfKind(
  actions: readonly PendingAction[],
  kind: ActionKind,
  now: Date,
  max = 200,
): Map<string, PendingAction[]> {
  const due = actions
    .filter((a) => !a.sentAt && a.kind === kind && Date.parse(a.nextAttemptAt) <= now.getTime())
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const byEvent = new Map<string, PendingAction[]>();
  for (const a of due) {
    const list = byEvent.get(a.eventId) ?? [];
    if (list.length < max) list.push(a);
    byEvent.set(a.eventId, list);
  }
  return byEvent;
}

/** Rôle boutique de cet appareil sur cet événement : rôle donné, boutique activée, liste de billets reçue. */
export function shopAccess(
  meta: Pick<StaffEventMeta, "myRoles" | "shopEnabled"> | null | undefined,
): "ok" | "no_role" | "disabled" {
  if (!meta?.myRoles.includes("shop")) return "no_role";
  return meta.shopEnabled ? "ok" : "disabled";
}

// --- Recherche et pointage rapide ------------------------------------------------------------------------------

export type SearchHit = { entry: AccessListEntry; checkedInAt: string | null; by: "plate" | "pseudo" | "vehicle" };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * « Plaque ou pseudo » (hors ligne) : plaque entière → hachage salé (correspondance exacte) ; 3 premiers caractères →
 * `plateHint` ; pseudo → préfixe sans casse ; véhicule → contient. Les pass révoqués sont rendus (le staff voit
 * « Désisté ») mais ne se pointent pas.
 */
export function searchLocal(state: StaffState, text: string, limit = 30): SearchHit[] {
  const query = text.trim();
  if (query.length < 2) return [];
  const plate = normalizePlate(query);
  const hash = plate.length > 3 ? plateHashOf(state.meta.plateSalt, plate) : null;
  const q = fold(query);
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const push = (entry: AccessListEntry, by: SearchHit["by"]) => {
    if (seen.has(entry.passId)) return;
    seen.add(entry.passId);
    hits.push({ entry, checkedInAt: checkedInAt(state, entry), by });
  };
  const all = [...state.entries.values()];
  if (hash) for (const e of all) if (e.plateHash === hash) push(e, "plate");
  if (plate.length >= 2) {
    for (const e of all) {
      if (!e.plateHint) continue;
      const head = plate.slice(0, 3);
      if (plate.length >= 3 ? e.plateHint === head : e.plateHint.startsWith(plate)) {
        // Plaque entière tapée : seulement la correspondance exacte (déjà ajoutée) ; préfixe : les mêmes 3 caractères.
        if (!hash) push(e, "plate");
      }
    }
  }
  for (const e of all) if (fold(e.pseudo).startsWith(q)) push(e, "pseudo");
  if (q.length >= 3) for (const e of all) if (e.vehicleLabel && fold(e.vehicleLabel).includes(q)) push(e, "vehicle");
  // Valides d'abord, puis attendus avant arrivés, puis pseudo.
  hits.sort(
    (a, b) =>
      Number(a.entry.status !== "valid") - Number(b.entry.status !== "valid") ||
      Number(Boolean(a.checkedInAt)) - Number(Boolean(b.checkedInAt)) ||
      a.entry.pseudo.localeCompare(b.entry.pseudo, "fr"),
  );
  return hits.slice(0, limit);
}

export type QuickMatch =
  | { kind: "one"; entry: AccessListEntry }
  | { kind: "many"; entries: AccessListEntry[] }
  | { kind: "none"; typed: string };

/**
 * Pointage rapide par plaque (« Tape les 3 premiers caractères de la plaque, valide, suivant ») : plaque entière →
 * hachage ; sinon les 3 premiers caractères. Un seul pass valide → pointé directement ; plusieurs → choix ; aucun →
 * « Non reconnues ».
 */
export function quickPlateMatch(state: StaffState, text: string, now: Date = clockNow()): QuickMatch {
  const plate = normalizePlate(text);
  if (plate.length < 3) return { kind: "none", typed: plate };
  // Lot 26 : sur plusieurs jours, seulement les attendus du jour (même véhicule inscrit un autre jour : pas pointé ici).
  const valid = [...state.entries.values()].filter((e) => e.status === "valid" && expectedOn(state.meta, e, now));
  if (plate.length > 3) {
    const hash = plateHashOf(state.meta.plateSalt, plate);
    const exact = valid.filter((e) => e.plateHash === hash);
    if (exact.length === 1 && exact[0]) return { kind: "one", entry: exact[0] };
    if (exact.length > 1) return { kind: "many", entries: exact };
  }
  const head = plate.slice(0, 3);
  const byHint = valid.filter((e) => e.plateHint === head);
  // Plaque entière sans correspondance exacte : on montre les mêmes 3 caractères, sans pointer d'office.
  if (byHint.length === 1 && byHint[0] && plate.length === 3) return { kind: "one", entry: byHint[0] };
  if (byHint.length > 0) return { kind: "many", entries: byHint };
  return { kind: "none", typed: plate };
}

// --- Compteurs -------------------------------------------------------------------------------------------------

export type ZoneCount = {
  code: string | null;
  name: string;
  arrived: number;
  expected: number;
  capacity: number | null;
};

/**
 * Lot 26 : une entrée est attendue ce jour-là — toujours pour un événement d'un jour ; sinon tout l'événement, ou le
 * jour de sa candidature (date locale de Paris).
 */
export function expectedOn(
  meta: Pick<StaffEventMeta, "days">,
  entry: Pick<AccessListEntry, "dayDate">,
  now: Date,
): boolean {
  if ((meta.days?.length ?? 0) < 2) return true;
  return !entry.dayDate || entry.dayDate === localDate(now);
}

/**
 * « 62 / 116 » (entrés / retenus) et attendus / arrivés par zone, d'après la liste locale. Plusieurs jours (lot 26) :
 * les attendus du jour (tout l'événement et le jour de `now`).
 */
export function counters(
  state: StaffState,
  now: Date = clockNow(),
): { arrived: number; expected: number; zones: ZoneCount[] } {
  const zones = new Map<string | null, ZoneCount>();
  for (const z of state.meta.zones) {
    zones.set(z.code, { code: z.code, name: z.name, arrived: 0, expected: 0, capacity: z.capacity });
  }
  let arrived = 0;
  let expected = 0;
  for (const e of state.entries.values()) {
    if (e.status !== "valid" || !expectedOn(state.meta, e, now)) continue;
    expected++;
    const inside = arrivedOn(state, e, now);
    if (inside) arrived++;
    const z = zones.get(e.zoneCode) ?? {
      code: e.zoneCode,
      name: e.zoneName ?? "Sans zone",
      arrived: 0,
      expected: 0,
      capacity: null,
    };
    z.expected++;
    if (inside) z.arrived++;
    zones.set(e.zoneCode, z);
  }
  return { arrived, expected, zones: [...zones.values()] };
}

// --- File d'envoi ----------------------------------------------------------------------------------------------

/** Nouvel essai exponentiel après une panne réseau : 5 s, 10 s, 20 s… jusqu'à 5 min (§ 4.4). */
export function backoffMs(attempts: number): number {
  return Math.min(5 * 60_000, 5_000 * 2 ** Math.max(0, attempts - 1));
}

/** Les lectures et pointages à envoyer maintenant, par événement, en lots de 200 au plus, les plus anciens d'abord. */
export function dueBatches(actions: readonly PendingAction[], now: Date, max = 200): Map<string, PendingAction[]> {
  const due = actions
    .filter((a) => !a.sentAt && BATCH_KINDS.includes(a.kind) && Date.parse(a.nextAttemptAt) <= now.getTime())
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const byEvent = new Map<string, PendingAction[]>();
  for (const a of due) {
    const list = byEvent.get(a.eventId) ?? [];
    if (list.length < max) list.push(a);
    byEvent.set(a.eventId, list);
  }
  return byEvent;
}

export type ResultEffect = {
  id: string;
  result: ScanBatchResult;
  /**
   * Pointage local à aligner sur le serveur (heure d'entrée retenue), ou à retirer (`checkedInAt: null`) s'il a été
   * créé par l'action `actionId` que le serveur a refusée.
   */
  checkin: { passId: string; checkedInAt: string | null; actionId: string | null } | null;
};

/**
 * Lecture de la réponse d'un lot : chaque élément reçu est marqué envoyé (y compris `rejected` avec `settled` :
 * points réglés, la file se vide au lieu de bloquer). L'entrée locale prend l'heure retenue par le serveur (première
 * lecture) ; une lecture refusée par le serveur retire le pointage local.
 */
export function applyResults(
  sent: readonly PendingAction[],
  results: readonly ScanBatchResult[],
  passOf: (applicationId: string) => string | undefined,
): { effects: ResultEffect[]; missing: string[] } {
  const byId = new Map(results.map((r) => [r.id, r]));
  const effects: ResultEffect[] = [];
  const missing: string[] = [];
  for (const action of sent) {
    const r = byId.get(action.id);
    if (!r) {
      missing.push(action.id);
      continue;
    }
    const item = action.payload as BatchItemWire;
    const passId = item.kind === "scan" ? (item.passId ?? null) : (passOf(item.applicationId) ?? null);
    let checkin: ResultEffect["checkin"] = null;
    if (passId) {
      const entered =
        r.result === "accepted" || r.result === "duplicate_same_device" || r.result === "duplicate_other_device";
      if (entered && r.checkedInAt) checkin = { passId, checkedInAt: r.checkedInAt, actionId: null };
      // Refus du serveur : seul le pointage local créé par cette action est retiré (pas celui d'une autre lecture).
      else if (r.result === "rejected" || r.result === "unknown")
        checkin = { passId, checkedInAt: null, actionId: action.id };
    }
    effects.push({ id: action.id, result: r, checkin });
  }
  return { effects, missing };
}

export const isDuplicate = (r: { result?: unknown } | null | undefined) =>
  r?.result === "duplicate_same_device" || r?.result === "duplicate_other_device";

/**
 * Lignes de l'écran de résultat d'un scan (ScanResult) : véhicule, pseudo, zone. Un prestataire (lot 21) s'affiche
 * « Prestataire · Food truck » à la place du véhicule, avec le nom de son activité à la place du pseudo.
 */
export function scanLines(
  entry:
    | (Pick<AccessListEntry, "vehicleLabel" | "pseudo" | "zoneCode"> &
        Partial<Pick<AccessListEntry, "kind" | "providerType" | "providerName">>)
    | null
    | undefined,
): { vehicle: string | undefined; pseudo: string | undefined; zone: string | undefined } {
  const provider = entry?.kind === "provider";
  return {
    vehicle: provider ? `Prestataire · ${entry?.providerType ?? "Stand"}` : (entry?.vehicleLabel ?? undefined),
    pseudo: (provider ? entry?.providerName : null) || entry?.pseudo || undefined,
    zone: entry?.zoneCode ?? undefined,
  };
}

export type ReportLine = {
  key: string;
  passId: string | null;
  applicationId: string | null;
  /** Doublon : heure d'entrée retenue par le serveur ; refus : heure de la lecture. */
  at: string | null;
  otherDevice: boolean;
  result: string;
  count: number;
};

/**
 * Rapport des réponses du serveur, une ligne par véhicule (un QR relu dix fois n'occupe qu'une ligne « ×10 ») :
 * doublons (déjà entré, ici ou sur un autre téléphone) et lectures refusées ou inconnues du serveur (hors `settled`).
 */
export function serverReport(actions: readonly PendingAction[]): { duplicates: ReportLine[]; refused: ReportLine[] } {
  const group = (list: PendingAction[], at: (a: PendingAction) => string | null) => {
    const lines = new Map<string, ReportLine>();
    for (const a of list) {
      const passId = typeof a.payload.passId === "string" ? a.payload.passId : null;
      const applicationId =
        typeof a.payload.applicationId === "string"
          ? a.payload.applicationId
          : typeof a.result?.applicationId === "string"
            ? a.result.applicationId
            : null;
      const key = passId ?? applicationId ?? a.id;
      const line = lines.get(key);
      if (line) {
        line.count++;
        line.otherDevice ||= a.result?.result === "duplicate_other_device";
        continue;
      }
      lines.set(key, {
        key,
        passId,
        applicationId,
        at: at(a),
        otherDevice: a.result?.result === "duplicate_other_device",
        result: String(a.result?.result ?? ""),
        count: 1,
      });
    }
    return [...lines.values()];
  };
  const sent = actions.filter((a) => a.sentAt && a.result);
  return {
    duplicates: group(
      sent.filter((a) => isDuplicate(a.result)),
      (a) => (typeof a.result?.checkedInAt === "string" ? a.result.checkedInAt : null),
    ),
    refused: group(
      sent.filter(
        (a) => (a.result?.result === "rejected" && a.result?.reason !== "settled") || a.result?.result === "unknown",
      ),
      (a) => (typeof a.payload.scannedAt === "string" ? a.payload.scannedAt : a.createdAt),
    ),
  };
}

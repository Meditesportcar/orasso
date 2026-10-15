// Logique pure du mode staff hors ligne (ARCHITECTURE.md § 4) : fusion des synchros, décision d'un scan avec la liste
// locale, anti-rebond, recherche par plaque ou pseudo, compteurs, file d'envoi et lecture des réponses du serveur.
// Sans React Native ni stockage : testée par Vitest (staff.test.ts) ; le stockage est dans store.ts.
import {
  type AccessListEntry,
  decideScan,
  type Ed25519Verify,
  type LocalScanDecision,
  normalizePlate,
  type ScanBatchResult,
  type ScanDecision,
  type StaffRole,
  type StaffSync,
  staffModeClosesAt,
} from "@orasso/shared";

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
  myRoles: StaffRole[];
  /** À renvoyer en `since` (synchro différentielle). */
  cursor: string | null;
  /** Heure du serveur de la dernière liste acceptée : une liste plus ancienne est refusée (rejeu). */
  generatedAt: string;
  /** Heure de l'appareil à la dernière synchro réussie (« Liste à jour 09:48 »). */
  syncedAt: string;
};

export type LocalCheckinMethod = "scan" | "override" | "manual" | "plate";

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
  kind: "manual" | "plate";
  id: string;
  applicationId: string;
  note: string | null;
  scannedAt: string;
};
export type BatchItemWire = ScanItemWire | CheckinItemWire;

/** Ce qui part au serveur : lectures et pointages (`POST /events/:id/scans`) et le reste du terrain. */
export type ActionKind = "scan" | "manual" | "plate" | "presence" | "express" | "incident" | "alert";
export const BATCH_KINDS: readonly ActionKind[] = ["scan", "manual", "plate"];

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
};

export function buildState(
  meta: StaffEventMeta,
  entries: Iterable<AccessListEntry>,
  local: Iterable<LocalCheckin>,
): StaffState {
  const map = new Map<string, AccessListEntry>();
  const byApplication = new Map<string, string>();
  for (const e of entries) {
    map.set(e.passId, e);
    // Un pass valide l'emporte sur l'ancien pass révoqué (`replaced`) de la même candidature.
    if (e.status === "valid" || !byApplication.has(e.applicationId)) byApplication.set(e.applicationId, e.passId);
  }
  return { meta, entries: map, byApplication, local: new Map([...local].map((l) => [l.passId, l])) };
}

// --- Synchro ---------------------------------------------------------------------------------------------------

export type SyncMerge =
  | { ok: true; meta: StaffEventMeta; entries: AccessListEntry[]; full: boolean }
  | { ok: false; reason: "stale" };

/**
 * Fusion d'une synchro (déjà vérifiée) avec la liste locale. Complète (`full`) : remplace tout. Différentielle :
 * remplace les entrées par `passId` (`removedPassIds` est toujours vide côté API, relecture du lot 06 M10 : un pass
 * n'est jamais supprimé, il revient `revoked`). Une liste générée avant celle qu'on a déjà est refusée.
 */
export function mergeSync(
  previous: { meta: StaffEventMeta; entries: Iterable<AccessListEntry> } | null,
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
  const keepPrevious = previous && previous.meta.userId === userId && !sync.full;
  const map = new Map<string, AccessListEntry>();
  if (keepPrevious) for (const e of previous.entries) map.set(e.passId, e);
  for (const e of sync.entries) map.set(e.passId, e);
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
    myRoles: sync.myRoles,
    // Une synchro différentielle sans base locale ne peut pas servir de point de départ : on repartira de zéro.
    cursor: keepPrevious || sync.full ? sync.cursor : null,
    generatedAt: sync.generatedAt,
    syncedAt: now.toISOString(),
  };
  return { ok: true, meta, entries: [...map.values()], full: sync.full || !keepPrevious };
}

/** Mode staff refermé à J+1 (fin + 1 jour, comme l'API) : tout est purgé sauf les actions non envoyées. */
export function isPurgeDue(meta: Pick<StaffEventMeta, "endsAt">, now: Date): boolean {
  return now >= staffModeClosesAt({ endsAt: new Date(meta.endsAt) });
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
): ScanDecision {
  return decideScan(payload, {
    eventNo: state.meta.eventNo,
    keys,
    verify,
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
  decision: ScanDecision | { decision: "override" | "unknown_pass"; passId: string },
  payload: string,
  id: string,
  now: Date,
  entry?: AccessListEntry,
): { item: ScanItemWire; checkin: LocalCheckin | null } {
  const passId = decision.passId;
  const reason = decision.decision === "refused" ? decision.reason : null;
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

/** Pointage « Pointer » (liste, recherche) ou rapide par plaque, fait sur l'appareil. */
export function checkinAction(
  entry: AccessListEntry,
  kind: "manual" | "plate",
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
export function quickPlateMatch(state: StaffState, text: string): QuickMatch {
  const plate = normalizePlate(text);
  if (plate.length < 3) return { kind: "none", typed: plate };
  const valid = [...state.entries.values()].filter((e) => e.status === "valid");
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

/** « 62 / 116 » (entrés / retenus) et attendus / arrivés par zone, d'après la liste locale. */
export function counters(state: StaffState): { arrived: number; expected: number; zones: ZoneCount[] } {
  const zones = new Map<string | null, ZoneCount>();
  for (const z of state.meta.zones) {
    zones.set(z.code, { code: z.code, name: z.name, arrived: 0, expected: 0, capacity: z.capacity });
  }
  let arrived = 0;
  let expected = 0;
  for (const e of state.entries.values()) {
    if (e.status !== "valid") continue;
    expected++;
    const inside = Boolean(checkedInAt(state, e));
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

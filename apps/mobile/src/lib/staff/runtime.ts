// Le mode staff en marche : liste en mémoire par événement, synchro vérifiée, enregistrement des lectures et
// pointages, envoi de la file au retour du réseau, purge à J+1. Un seul exemplaire pour toute l'appli (les écrans du
// mode staff et l'envoi en arrière-plan partagent la même liste et la même file).
import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import * as Device from "expo-device";
import { Platform } from "react-native";

import { apiUrl } from "@/api";
import { api } from "../api";
import { ApiRequestError, errorMessage, getSessionToken } from "../http";
import { kvDel, kvGet, kvSet } from "../kv";
import { staffStore } from "./db";
import {
  type ActionKind,
  applyResults,
  applyTicketResults,
  BATCH_KINDS,
  type BatchItemWire,
  backoffMs,
  buildState,
  carryOver,
  dueBatches,
  dueOfKind,
  ID_IN_PAYLOAD,
  isPurgeDue,
  type LocalCheckin,
  type LocalTicketUse,
  mergeSync,
  type PendingAction,
  type StaffState,
  type TicketScanWire,
  type VisitorItemWire,
} from "./model";
import { deleteLocalPhoto, incidentPhotoForm } from "./photo";
import {
  hasTrustAnchor,
  keyMap,
  nextTrustedKeys,
  pinnedKeys,
  type TrustedKey,
  trustPolicy,
  verifyStaffSync,
} from "./trust";

/** Politique de confiance du build : API configurée et clés épinglées éventuelles (voir trust.ts). */
export const policy = trustPolicy(apiUrl(""), process.env.EXPO_PUBLIC_QR_TRUSTED_KEYS);

export const newId = () => randomUUID();

/** Build vers une API en ligne sans clé épinglée : aucune liste ni aucun QR ne peut être vérifié. */
export const TRUST_MISSING = hasTrustAnchor(policy)
  ? null
  : "Build sans clé de confiance (EXPO_PUBLIC_QR_TRUSTED_KEYS) : le mode staff ne peut vérifier ni la liste ni les QR.";

// --- Abonnement des écrans -------------------------------------------------------------------------------------

const listeners = new Set<() => void>();
let version = 0;
function emit() {
  version++;
  for (const l of listeners) l();
}
export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getVersion = () => version;

// --- Liste et clés en mémoire ----------------------------------------------------------------------------------

const states = new Map<string, StaffState>();
let keys: { list: TrustedKey[]; map: Map<number, Uint8Array> } | null = null;

export const stateOf = (eventId: string) => states.get(eventId) ?? null;

/**
 * Clés de confiance (kid → clé), lues une fois puis gardées en mémoire : les clés épinglées au build, moins celles que
 * `/api/keys` a révoquées ; sans épinglage (API locale), celles apprises de `/api/keys`.
 */
export async function trustedKeys(): Promise<Map<number, Uint8Array>> {
  if (!keys) {
    const store = await staffStore();
    const list = policy.pins?.length ? pinnedKeys(policy, await store.revokedKeys()) : await store.trustedKeys();
    keys = { list, map: keyMap(list, policy) };
  }
  return keys.map;
}
export const trustedKeysNow = () => keys?.map ?? null;

/** Charge la liste locale d'un événement (celle de ce compte seulement), après la purge éventuelle de J+1. */
export async function openEvent(eventId: string, userId: string): Promise<StaffState | null> {
  const store = await staffStore();
  await trustedKeys();
  const meta = await store.meta(eventId);
  if (!meta || meta.userId !== userId) {
    states.delete(eventId);
    return null;
  }
  if (isPurgeDue(meta, new Date())) {
    await store.purgeEvent(eventId);
    states.delete(eventId);
    emit();
    return null;
  }
  const state = buildState(
    meta,
    await store.entries(eventId),
    await store.localCheckins(eventId),
    await store.tickets(eventId),
    await store.ticketUses(eventId),
  );
  // Un pointage ou un billet lu pendant cette relecture (écriture encore en file) n'est pas encore en base : on le
  // reprend de l'état en mémoire (même compte), comme `doSync`, sinon il serait relu « OK » quelques secondes après.
  // Fait en une seule passe synchrone juste avant de remplacer l'état.
  carryOver(state, states.get(eventId), userId);
  states.set(eventId, state);
  emit();
  return state;
}

// --- Synchro ---------------------------------------------------------------------------------------------------

export type SyncOutcome = { ok: true; count: number } | { ok: false; message: string; offline?: boolean };

/**
 * Synchronise la liste d'un événement : clés de confiance d'abord (`GET /api/keys`, appel séparé), puis la liste
 * (différentielle si on en a une, complète sinon ou sur demande), vérifiée avant d'écraser quoi que ce soit.
 */
const syncing = new Map<string, Promise<SyncOutcome>>();

/** Une seule synchro à la fois par événement : une deuxième demande attend la première. */
export function syncEvent(eventId: string, userId: string, full = false): Promise<SyncOutcome> {
  const running = syncing.get(eventId);
  if (running) return running;
  const next = doSync(eventId, userId, full).finally(() => syncing.delete(eventId));
  syncing.set(eventId, next);
  return next;
}

/** Clés de confiance mises à jour par `/api/keys` (qui ne peut que retirer une clé épinglée). */
async function refreshKeys(store: Store): Promise<SyncOutcome | null> {
  let served: Awaited<ReturnType<typeof api.signingKeys>>;
  try {
    served = await api.signingKeys();
  } catch (error) {
    // Avec des clés épinglées, on s'en passe : elles valent sans `/api/keys`.
    if (policy.pins?.length && !(error instanceof ApiRequestError && error.isNetwork)) return null;
    throw error;
  }
  const update = nextTrustedKeys(await store.trustedKeys(), served.keys, policy, await store.revokedKeys());
  if (!update.ok) {
    return {
      ok: false,
      message: `La clé de signature ${update.kid} a changé côté serveur : synchro refusée. Préviens l'organisateur.`,
    };
  }
  if (update.revoked.length) await store.addRevokedKeys(update.revoked);
  await store.setTrustedKeys(update.keys);
  keys = { list: update.keys, map: keyMap(update.keys, policy) };
  return null;
}

async function doSync(eventId: string, userId: string, full: boolean): Promise<SyncOutcome> {
  if (TRUST_MISSING) return { ok: false, message: TRUST_MISSING };
  const store = await staffStore();
  try {
    const refused = await refreshKeys(store);
    if (refused) return refused;
    await trustedKeys();
    if (!keys) return { ok: false, message: "Clés de confiance indisponibles." };

    const previousMeta = await store.meta(eventId);
    const previous = previousMeta && previousMeta.userId === userId ? previousMeta : null;
    const since = full || !previous ? null : previous.cursor;
    let sync: Awaited<ReturnType<typeof api.staffSync>>;
    try {
      sync = await api.staffSync(eventId, since);
    } catch (error) {
      // Plus staff de l'événement, ou événement retiré : la liste et les coordonnées quittent le téléphone.
      if (error instanceof ApiRequestError && (error.status === 403 || error.status === 404)) {
        await store.purgeEvent(eventId);
        states.delete(eventId);
        emit();
      }
      throw error;
    }
    const check = verifyStaffSync(sync, eventId, keys.map);
    if (!check.ok) {
      return {
        ok: false,
        message:
          check.reason === "unknown_key"
            ? "Liste signée par une clé inconnue de ce téléphone : synchro refusée."
            : "Signature de la liste invalide : synchro refusée, la liste du téléphone reste en place.",
      };
    }
    // Fermé à J+1 : l'API sert encore la liste jusqu'au règlement (J+2), le téléphone ne la garde plus.
    const serverNow = { endsAt: sync.event.endsAt, serverOffsetMs: Date.parse(sync.generatedAt) - Date.now() };
    if (isPurgeDue(serverNow, new Date())) {
      await store.purgeEvent(eventId);
      states.delete(eventId);
      emit();
      return { ok: false, message: "Mode staff fermé depuis J+1 : la liste n'est plus gardée sur le téléphone." };
    }
    const merged = mergeSync(
      previous
        ? { meta: previous, entries: await store.entries(eventId), tickets: await store.tickets(eventId) }
        : null,
      sync,
      userId,
      new Date(),
    );
    if (!merged.ok && merged.reason === "needs_full") return doSync(eventId, userId, true);
    if (!merged.ok) return { ok: false, message: "Liste plus ancienne que celle du téléphone : ignorée." };
    await store.saveSync(merged.meta, merged.full ? merged.entries : sync.entries, merged.full, {
      list: merged.full ? merged.tickets : (sync.tickets ?? []),
      replace: merged.full,
    });
    const fresh = buildState(
      merged.meta,
      merged.entries,
      await store.localCheckins(eventId),
      merged.tickets,
      await store.ticketUses(eventId),
    );
    // Une lecture faite pendant la synchro (écriture encore en file) reste « déjà entré » en mémoire.
    carryOver(fresh, states.get(eventId), userId);
    states.set(eventId, fresh);
    emit();
    return { ok: true, count: sync.entries.length };
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return error.isNetwork
        ? { ok: false, offline: true, message: "Pas de réseau : la liste du téléphone reste valable." }
        : { ok: false, message: errorMessage(error) };
    }
    return { ok: false, message: "Synchro impossible. Réessaie." };
  }
}

/**
 * Synchro différentielle de tous les événements synchronisés par ce compte et encore ouverts (pas de WebSocket dans
 * l'appli en V1 : les ré-acceptations, révocations et entrées des collègues arrivent ainsi toutes les minutes).
 */
export async function refreshOpenEvents(userId: string): Promise<void> {
  if (!getSessionToken()) return;
  const store = await staffStore();
  for (const meta of await store.metas()) {
    if (meta.userId !== userId || isPurgeDue(meta, new Date())) continue;
    const r = await syncEvent(meta.eventId, userId);
    if (!r.ok && r.offline) return;
  }
}

// --- Actions ---------------------------------------------------------------------------------------------------

/** Dernière écriture ratée sur le téléphone (lecture affichée mais pas enregistrée) : montrée au staff. */
let writeError: string | null = null;
export const getWriteError = () => writeError;
export function reportWriteError(eventId: string, passId: string | null): void {
  // Le pointage local de cette lecture n'existe pas sur le disque : il ne doit pas faire croire « déjà entré ».
  if (passId) states.get(eventId)?.local.delete(passId);
  writeError = "Une lecture n'a pas pu être enregistrée sur le téléphone : refais-la ou pointe-la à la main.";
  emit();
}
export function clearWriteError(): void {
  writeError = null;
  emit();
}

/**
 * Enregistre une action (lecture, pointage, présence, express, incident, alerte) dans la file, avec le pointage
 * local qu'elle produit ; l'envoi part tout de suite s'il y a du réseau, sinon au retour du réseau.
 */
export async function record(
  eventId: string,
  userId: string,
  kind: ActionKind,
  payload: Record<string, unknown> & { id?: string },
  checkin?: LocalCheckin | null,
  use?: LocalTicketUse | null,
): Promise<string> {
  const store = await staffStore();
  const id = payload.id ?? newId();
  const now = new Date().toISOString();
  const state = states.get(eventId);
  const action: PendingAction = {
    id,
    eventId,
    eventTitle: state?.meta.title ?? "",
    userId,
    kind,
    payload: { ...payload, ...(ID_IN_PAYLOAD.includes(kind) ? { id } : {}) },
    createdAt: now,
    attempts: 0,
    lastError: null,
    nextAttemptAt: now,
    sentAt: null,
    result: null,
  };
  if (checkin && state && !state.local.has(checkin.passId)) state.local.set(checkin.passId, checkin);
  if (use && state && !state.ticketUses.has(use.ticketId)) state.ticketUses.set(use.ticketId, use);
  await store.addAction(action, checkin, use);
  emit();
  // Billets et compteur : touchers en rafale à l'entrée, regroupés en un envoi toutes les 2 s ; le reste part tout de suite.
  if (kind === "ticket_scan" || kind === "visitor") scheduleShopFlush(userId);
  else void flush(userId);
  return id;
}

const SHOP_FLUSH_DELAY_MS = 2_000;
let shopFlushTimer: ReturnType<typeof setTimeout> | null = null;

/** Un seul envoi groupé, 2 s après le premier geste de la rafale (les gestes suivants rejoignent le même lot). */
function scheduleShopFlush(userId: string): void {
  if (shopFlushTimer) return;
  shopFlushTimer = setTimeout(() => {
    shopFlushTimer = null;
    void flush(userId).catch(() => undefined);
  }, SHOP_FLUSH_DELAY_MS);
}

// --- Appareil du staff -----------------------------------------------------------------------------------------

const deviceKey = (userId: string) => `staff-device.${userId}`;

/** Appareil enregistré auprès de l'API (les lots de scans l'exigent) ; gardé dans le trousseau. */
async function deviceId(userId: string): Promise<string> {
  const known = await kvGet(deviceKey(userId));
  if (known) return known;
  const row = await api.registerDevice({
    platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web",
    name: Device.deviceName ?? Device.modelName ?? (Platform.OS === "web" ? "Navigateur" : null),
    appVersion: Constants.expoConfig?.version ?? null,
  });
  await kvSet(deviceKey(userId), row.id);
  return row.id;
}

// --- Envoi -----------------------------------------------------------------------------------------------------

let flushing: Promise<void> | null = null;

/** Envoie ce qui est dû dans la file (un seul envoi à la fois). */
export function flush(userId: string): Promise<void> {
  flushing ??= doFlush(userId).finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Retour du réseau ou « Envoyer maintenant » : tout repart sans attendre le délai. */
export async function flushNow(userId: string): Promise<void> {
  await (await staffStore()).retryNow(userId, new Date());
  await flush(userId);
}

const later = (attempts: number) => new Date(Date.now() + backoffMs(attempts));

async function doFlush(userId: string) {
  if (!getSessionToken()) return;
  const store = await staffStore();
  const unsent = await store.actions(userId, { unsentOnly: true });
  if (!unsent.length) return;
  const now = new Date();

  for (const [eventId, batch] of dueBatches(unsent, now)) {
    let device: string;
    try {
      device = await deviceId(userId);
    } catch (error) {
      await store.markFailed(
        batch.map((a) => a.id),
        error instanceof ApiRequestError ? error.message : "Appareil non enregistré",
        later,
      );
      continue;
    }
    try {
      await sendBatch(store, eventId, device, batch);
    } catch (error) {
      const e = error instanceof ApiRequestError ? error : null;
      if (e?.status === 401) return; // Session expirée : la file attend la reconnexion.
      // Appareil inconnu (révoqué, autre base) : réenregistré au prochain essai.
      if (e?.status === 400 && /appareil/i.test(e.message)) {
        await kvDel(deviceKey(userId));
      } else if (e?.status === 400) {
        // Lot refusé en bloc (un élément illisible) : chaque élément part seul ; celui que l'API refuse sort de la
        // file avec son erreur, visible au rapport, sans bloquer les autres.
        await sendOneByOne(store, userId, eventId, device, batch);
        continue;
      } else if (e && DEFINITIVE.has(e.status)) {
        // Plus staff, événement retiré, annulé ou fermé : rejouer ne changera rien. Les éléments sortent de la file,
        // l'erreur reste au rapport, les pointages locaux qu'ils avaient créés disparaissent.
        await reject(store, eventId, batch, e);
        continue;
      }
      await store.markFailed(
        batch.map((a) => a.id),
        e?.isNetwork ? "Pas de réseau" : (e?.message ?? "Erreur d'envoi"),
        later,
      );
    }
  }
  // Rôle boutique (lot 24) : billets du public lus et touchers du compteur, un lot par événement.
  for (const kind of ["ticket_scan", "visitor"] as const) {
    for (const [eventId, batch] of dueOfKind(unsent, kind, now)) {
      await sendShopBatch(store, userId, kind, eventId, batch);
    }
  }
  const waitingIncidents = new Set(unsent.filter((a) => a.kind === "incident").map((a) => a.id));
  for (const action of unsent) {
    if (BATCH_KINDS.includes(action.kind) || SHOP_KINDS.includes(action.kind)) continue;
    if (Date.parse(action.nextAttemptAt) > now.getTime()) continue;
    // La photo suit son incident : tant que l'incident n'est pas parti, elle attend.
    if (action.kind === "incident_photo" && waitingIncidents.has(String(action.payload.incidentId))) continue;
    const sent = await sendOther(store, action);
    if (sent && action.kind === "incident") waitingIncidents.delete(action.id);
  }
  emit();
}

const SHOP_KINDS: readonly ActionKind[] = ["ticket_scan", "visitor"];

/** Lot de billets ou de touchers du compteur : mêmes règles d'erreur que les lots de scans (jamais perdus). */
async function sendShopBatch(
  store: Store,
  userId: string,
  kind: "ticket_scan" | "visitor",
  eventId: string,
  batch: PendingAction[],
) {
  let device: string;
  try {
    device = await deviceId(userId);
  } catch (error) {
    await store.markFailed(
      batch.map((a) => a.id),
      error instanceof ApiRequestError ? error.message : "Appareil non enregistré",
      later,
    );
    return;
  }
  try {
    if (kind === "ticket_scan") {
      const items: TicketScanWire[] = batch.map((a) => ({
        id: a.id,
        rawPayload: String(a.payload.rawPayload),
        decision: a.payload.decision as TicketScanWire["decision"],
        reason: (a.payload.reason as string | null) ?? null,
        scannedAt: String(a.payload.scannedAt),
      }));
      const { results } = await api.sendTicketScans(eventId, { deviceId: device, items });
      const { effects, missing } = applyTicketResults(batch, results);
      await store.markSent(
        eventId,
        effects.map((e) => ({ id: e.id, result: { ...e.result }, use: e.use })),
        new Date(),
      );
      if (missing.length) await store.markFailed(missing, "Sans réponse du serveur", later);
      const current = states.get(eventId);
      for (const { use } of effects) {
        if (!use || !current) continue;
        const local = current.ticketUses.get(use.ticketId);
        // Accepté ou déjà utilisé selon le serveur : le billet est utilisé, même si l'usage local manquait en mémoire.
        if (use.usedAt) current.ticketUses.set(use.ticketId, { ...(local ?? use), usedAt: use.usedAt });
        else if (local && local.actionId === use.actionId) current.ticketUses.delete(use.ticketId);
      }
    } else {
      const items: VisitorItemWire[] = batch.map((a) => ({
        id: a.id,
        delta: a.payload.delta as VisitorItemWire["delta"],
        at: String(a.payload.at),
      }));
      const res = await api.sendVisitorEntries(eventId, { deviceId: device, items });
      const known = new Set(res.results.map((r) => r.id));
      await store.markSent(
        eventId,
        res.results.map((r) => ({
          id: r.id,
          result: { applied: r.applied, total: res.total, ...(r.reason ? { reason: r.reason } : {}) },
        })),
        new Date(),
      );
      const missing = batch.filter((a) => !known.has(a.id)).map((a) => a.id);
      if (missing.length) await store.markFailed(missing, "Sans réponse du serveur", later);
    }
  } catch (error) {
    const e = error instanceof ApiRequestError ? error : null;
    if (e?.status === 401) return;
    if (e?.status === 400 && /appareil/i.test(e.message)) {
      await kvDel(deviceKey(userId));
    } else if (e?.status === 400) {
      // Un élément illisible ne doit pas condamner les autres : lot refusé en bloc → chacun repart seul ; l'élément
      // que l'API refuse seul sort de la file avec son erreur, SANS effacer l'usage local (dans le doute, le billet
      // reste « déjà utilisé » sur ce téléphone).
      if (batch.length > 1) {
        for (const one of batch) await sendShopBatch(store, userId, kind, eventId, [one]);
      } else {
        const [only] = batch;
        if (only) {
          await store.markSent(eventId, [{ id: only.id, result: { error: e.message, status: e.status } }], new Date());
        }
      }
      return;
    } else if (e && DEFINITIVE.has(e.status)) {
      // Boutique fermée ou retirée, plus de rôle, événement fermé : rejouer ne changera rien. Les éléments sortent
      // de la file avec l'erreur (visible au rapport) ; les usages locaux qu'ils avaient créés disparaissent.
      await reject(store, eventId, batch, e);
      return;
    }
    await store.markFailed(
      batch.map((a) => a.id),
      e?.isNetwork ? "Pas de réseau" : (e?.message ?? "Erreur d'envoi"),
      later,
    );
  }
}

/** Un lot `POST /events/:id/scans` (idempotent) et sa réponse : file et pointages locaux alignés sur le serveur. */
async function sendBatch(store: Store, eventId: string, device: string, batch: PendingAction[]) {
  const { results } = await api.sendScans(eventId, {
    deviceId: device,
    items: batch.map((a) => a.payload as BatchItemWire),
  });
  const state = states.get(eventId);
  const { effects, missing } = applyResults(batch, results, (appId) => state?.byApplication.get(appId));
  await store.markSent(eventId, effects, new Date());
  if (missing.length) await store.markFailed(missing, "Sans réponse du serveur", later);
  // Mémoire alignée comme la base (sans la relire : une lecture faite entre-temps y reste).
  const current = states.get(eventId);
  for (const { checkin } of effects) {
    const local = checkin ? current?.local.get(checkin.passId) : undefined;
    if (!checkin || !local || !current) continue;
    if (checkin.checkedInAt) current.local.set(checkin.passId, { ...local, checkedInAt: checkin.checkedInAt });
    else if (local.actionId === checkin.actionId) current.local.delete(checkin.passId);
  }
}

/** Lot refusé définitivement : 403, 404, 409, 423 (et 400 élément par élément). */
const DEFINITIVE = new Set([403, 404, 409, 423]);

async function reject(store: Store, eventId: string, actions: PendingAction[], e: ApiRequestError) {
  const ids = actions.map((a) => a.id);
  await store.markRejected(eventId, ids, { error: e.message, status: e.status }, new Date());
  const state = states.get(eventId);
  if (state) {
    for (const [passId, local] of state.local) if (ids.includes(local.actionId)) state.local.delete(passId);
    for (const [ticketId, use] of state.ticketUses) if (ids.includes(use.actionId)) state.ticketUses.delete(ticketId);
  }
}

async function sendOneByOne(store: Store, userId: string, eventId: string, device: string, batch: PendingAction[]) {
  for (const action of batch) {
    try {
      await sendBatch(store, eventId, device, [action]);
    } catch (error) {
      const e = error instanceof ApiRequestError ? error : null;
      if (e?.status === 401) return;
      if (e?.status === 400 && /appareil/i.test(e.message)) {
        // Même traitement que pour le lot entier : réenregistré au prochain essai.
        await kvDel(deviceKey(userId));
        await store.markFailed([action.id], e.message, later);
        return;
      }
      if (e && (e.status === 400 || DEFINITIVE.has(e.status))) {
        await reject(store, eventId, [action], e);
      } else {
        await store.markFailed([action.id], e?.isNetwork ? "Pas de réseau" : (e?.message ?? "Erreur d'envoi"), later);
      }
    }
  }
}

/** Présence, inscription express, incident, alerte : une requête chacune (incident et alerte idempotents). */
type Store = Awaited<ReturnType<typeof staffStore>>;

async function sendOther(store: Store, action: PendingAction): Promise<boolean> {
  const p = action.payload;
  try {
    let result: Record<string, unknown> = { ok: true };
    if (action.kind === "presence") await api.setPresence(action.eventId, Boolean(p.present));
    else if (action.kind === "express") result = await api.expressInvite(action.eventId, String(p.email), 15_000);
    else if (action.kind === "incident") {
      await api.incident(action.eventId, {
        clientId: action.id,
        occurredAt: String(p.occurredAt),
        location: (p.location as string | null) ?? null,
        description: String(p.description),
      });
    } else if (action.kind === "alert") {
      // La position (lue au toucher du bouton) part avec l'alerte ; l'API la gère le temps de l'alerte seulement.
      await api.staffAlert(action.eventId, {
        clientId: action.id,
        message: (p.message as string | null) ?? null,
        lat: typeof p.lat === "number" ? p.lat : null,
        lng: typeof p.lng === "number" ? p.lng : null,
      });
    } else if (action.kind === "incident_photo") {
      // Photo prise sur le terrain, gardée sur le téléphone jusqu'ici : envoyée, rattachée à l'incident, puis effacée.
      const uploaded = await api.uploadIncidentPhoto(await incidentPhotoForm(String(p.fileUri)));
      await api.attachIncidentPhoto(action.eventId, String(p.incidentId), uploaded.key);
      await deleteLocalPhoto(String(p.fileUri));
    }
    await store.markSent(action.eventId, [{ id: action.id, result }], new Date());
    if (action.kind === "alert") await store.scrubPosition(action.id);
    return true;
  } catch (error) {
    const e = error instanceof ApiRequestError ? error : null;
    if (e?.status === 401) return false;
    const definitive = e && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429;
    if (definitive) {
      // Refus définitif (e-mail invalide, fenêtre fermée, photo déjà posée…) : l'action sort de la file, l'erreur
      // reste visible.
      if (action.kind === "incident_photo") await deleteLocalPhoto(String(p.fileUri));
      await store.markSent(
        action.eventId,
        [{ id: action.id, result: { error: e.message, status: e.status } }],
        new Date(),
      );
      if (action.kind === "alert") await store.scrubPosition(action.id);
      return true;
    }
    await store.markFailed([action.id], e?.isNetwork ? "Pas de réseau" : (e?.message ?? "Erreur d'envoi"), later);
    return false;
  }
}

// --- Purge et file vue par les écrans --------------------------------------------------------------------------

/** Fermeture à J+1 : tout ce qui concerne l'événement disparaît du téléphone, sauf les actions pas encore envoyées. */
export async function purgeExpired(): Promise<void> {
  const store = await staffStore();
  let changed = false;
  for (const meta of await store.metas()) {
    if (!isPurgeDue(meta, new Date())) continue;
    await store.purgeEvent(meta.eventId);
    states.delete(meta.eventId);
    changed = true;
  }
  if (changed) emit();
}

/** Déconnexion : listes, coordonnées et clés effacées ; actions non envoyées gardées pour ce compte. */
export async function purgeAllStaff(): Promise<void> {
  try {
    const store = await staffStore();
    await store.purgeAll();
  } catch {
    // Base absente : rien à effacer.
  }
  states.clear();
  keys = null;
  emit();
}

export async function actionsOf(userId: string, eventId?: string): Promise<PendingAction[]> {
  return (await staffStore()).actions(userId, { eventId });
}

// Gestes du staff (lecture, « accepter quand même », pointage) traduits en actions de la file. La décision est
// prise en mémoire, sans attendre le disque : l'écran s'affiche d'abord, l'écriture suit.

import type { AccessListEntry, ScanDecision, TicketScanDecision, VisitorDelta } from "@orasso/shared";
import { now as clockNow } from "@/lib/clock";

import { checkedInAt, checkinAction, markSeen, type StaffState, scanAction, ticketScanAction } from "@/lib/staff/model";
import type { AlertPosition } from "@/lib/staff/position";
import { newId, record, reportWriteError } from "@/lib/staff/runtime";
import type { IncidentDraft } from "./IncidentSheet";

/** Enregistre une lecture décidée (y compris refusée : elle compte au rapport). */
export function recordScan(
  state: StaffState,
  userId: string,
  decision: ScanDecision | { decision: "override" | "unknown_pass"; passId: string; reason?: string },
  payload: string,
): void {
  const entry = decision.passId ? state.entries.get(decision.passId) : undefined;
  const { item, checkin } = scanAction(decision, payload, newId(), clockNow(), entry);
  // Pointage local tout de suite : une deuxième lecture du même QR, même sur un autre écran, est « déjà entré ».
  if (checkin && !state.local.has(checkin.passId)) state.local.set(checkin.passId, checkin);
  // Lot 26 : présence du jour (« tout l'événement » déjà entré un jour précédent, lu aujourd'hui).
  if (decision.passId && ["ok", "already", "override"].includes(decision.decision))
    markSeen(state, decision.passId, clockNow());
  void record(state.meta.eventId, userId, "scan", item, checkin).catch(() =>
    reportWriteError(state.meta.eventId, checkin?.passId ?? null),
  );
}

/**
 * Enregistre la lecture d'un billet du public (rôle boutique) : l'usage local rend la lecture suivante « déjà utilisé »
 * tout de suite, sur cet appareil, sans réseau ; le serveur arbitre à l'envoi.
 */
export function recordTicketScan(
  state: StaffState,
  userId: string,
  decision: TicketScanDecision,
  payload: string,
): void {
  const id = newId();
  const { item, use } = ticketScanAction(decision, payload, id, clockNow());
  if (use && !state.ticketUses.has(use.ticketId)) state.ticketUses.set(use.ticketId, use);
  // Rien à envoyer pour un QR qui n'est pas d'Orasso : il reste sur le téléphone.
  if (!item) return;
  const ticketId = decision.ticketId;
  void record(state.meta.eventId, userId, "ticket_scan", { ...item, ticketId }, null, use).catch(() => {
    if (use) state.ticketUses.delete(use.ticketId);
    reportWriteError(state.meta.eventId, null);
  });
}

/**
 * Nouvel incident de la main courante : l'incident part en premier, sa photo (gardée sur le téléphone) en suit, rattachée
 * par l'identifiant de l'incident. Sans réseau, les deux attendent et repartent dans cet ordre.
 */
export async function recordIncident(eventId: string, userId: string, draft: IncidentDraft): Promise<void> {
  const incidentId = await record(eventId, userId, "incident", {
    location: draft.location,
    description: draft.description,
    occurredAt: clockNow().toISOString(),
  });
  if (draft.photoUri) await record(eventId, userId, "incident_photo", { incidentId, fileUri: draft.photoUri });
}

/** Alerte du staff, avec la position lue au toucher (ou rien si la permission est refusée). */
export function recordAlert(eventId: string, userId: string, message: string, position: AlertPosition | null): void {
  void record(eventId, userId, "alert", {
    message: message || null,
    ...(position ? { lat: position.lat, lng: position.lng } : {}),
  });
}

/** Un toucher du compteur d'entrées des visiteurs (+1, +10, −1, −10) : enregistré tout de suite, envoyé au réseau. */
export function recordVisitor(state: StaffState, userId: string, delta: VisitorDelta): void {
  void record(state.meta.eventId, userId, "visitor", { delta, at: clockNow().toISOString() }).catch(() =>
    reportWriteError(state.meta.eventId, null),
  );
}

/**
 * « Pointer » depuis la liste ou la recherche, ou pointage rapide par plaque. Renvoie l'heure d'entrée déjà connue si
 * le véhicule était entré (rien n'est envoyé), sinon `null`.
 */
export function pointEntry(
  state: StaffState,
  userId: string,
  entry: AccessListEntry,
  kind: "manual" | "plate",
  note?: string,
): string | null {
  const already = checkedInAt(state, entry);
  if (already || entry.status !== "valid") return already;
  const { item, checkin } = checkinAction(entry, kind, newId(), clockNow(), note);
  state.local.set(checkin.passId, checkin);
  void record(state.meta.eventId, userId, kind, item, checkin).catch(() =>
    reportWriteError(state.meta.eventId, checkin.passId),
  );
  return null;
}

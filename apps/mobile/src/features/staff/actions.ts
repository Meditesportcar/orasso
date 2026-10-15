// Gestes du staff (lecture, « accepter quand même », pointage) traduits en actions de la file. La décision est
// prise en mémoire, sans attendre le disque : l'écran s'affiche d'abord, l'écriture suit.
import type { AccessListEntry, ScanDecision } from "@orasso/shared";

import { checkedInAt, checkinAction, type StaffState, scanAction } from "@/lib/staff/model";
import { newId, record, reportWriteError } from "@/lib/staff/runtime";

/** Enregistre une lecture décidée (y compris refusée : elle compte au rapport). */
export function recordScan(
  state: StaffState,
  userId: string,
  decision: ScanDecision | { decision: "override" | "unknown_pass"; passId: string },
  payload: string,
): void {
  const entry = decision.passId ? state.entries.get(decision.passId) : undefined;
  const { item, checkin } = scanAction(decision, payload, newId(), new Date(), entry);
  // Pointage local tout de suite : une deuxième lecture du même QR, même sur un autre écran, est « déjà entré ».
  if (checkin && !state.local.has(checkin.passId)) state.local.set(checkin.passId, checkin);
  void record(state.meta.eventId, userId, "scan", item, checkin).catch(() =>
    reportWriteError(state.meta.eventId, checkin?.passId ?? null),
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
  const { item, checkin } = checkinAction(entry, kind, newId(), new Date(), note);
  state.local.set(checkin.passId, checkin);
  void record(state.meta.eventId, userId, kind, item, checkin).catch(() =>
    reportWriteError(state.meta.eventId, checkin.passId),
  );
  return null;
}

// Accueil drive (lot 48, prototype `s-drive`) : les plaques candidates d'une photo (lib/plates/recognize.ts) sont
// hachées avec le sel de l'événement et cherchées dans la liste du téléphone, sans réseau ; aucune plaque en clair ne
// sort de la mémoire. Une lecture n'est retenue que si elle désigne une seule voiture, ou si la même plaque est lue deux
// fois de suite. Pur : testé par Vitest (drive.test.ts).
import type { AccessListEntry } from "@orasso/shared";

import { now as clockNow } from "../clock";
import { plateHashOf } from "./crypto";
import { checkedInAt, expectedOn, type StaffState } from "./model";

export type DriveMatch = { plate: string; entry: AccessListEntry };

/** Entrées de la liste dont la plaque correspond à l'une des candidates (une entrée par pass, ordre des candidates). */
export function driveLookup(state: StaffState, plates: readonly string[]): DriveMatch[] {
  const byHash = new Map<string, AccessListEntry[]>();
  for (const e of state.entries.values()) {
    if (!e.plateHash) continue;
    byHash.set(e.plateHash, [...(byHash.get(e.plateHash) ?? []), e]);
  }
  const out: DriveMatch[] = [];
  const seen = new Set<string>();
  for (const plate of plates) {
    const hash = plateHashOf(state.meta.plateSalt, plate);
    for (const entry of (hash && byHash.get(hash)) || []) {
      if (seen.has(entry.passId)) continue;
      seen.add(entry.passId);
      out.push({ plate, entry });
    }
  }
  return out;
}

export type DriveOutcome =
  | { kind: "ok"; entry: AccessListEntry }
  | { kind: "already"; entry: AccessListEntry; checkedInAt: string }
  | { kind: "refused"; entry: AccessListEntry; reason: "revoked" | "other_day" }
  | { kind: "unknown" };

/** Ce que devient une voiture reconnue : entre, déjà entrée, ou refusée (désistée, autre jour). */
export function driveOutcome(state: StaffState, entry: AccessListEntry, now: Date = clockNow()): DriveOutcome {
  if (entry.status !== "valid") return { kind: "refused", entry, reason: "revoked" };
  if (!expectedOn(state.meta, entry, now)) return { kind: "refused", entry, reason: "other_day" };
  const at = checkedInAt(state, entry);
  return at ? { kind: "already", entry, checkedInAt: at } : { kind: "ok", entry };
}

/**
 * Confirmation des lectures successives de la caméra : une lecture qui désigne une seule voiture est retenue tout de
 * suite ; sinon il faut lire deux fois de suite la même plaque de tête (une plaque absente de la liste → `unknown`).
 * Plusieurs voitures pour la même plaque (même véhicule inscrit deux fois) : la première attendue aujourd'hui.
 */
export class DriveGate {
  private last: string | null = null;

  reset() {
    this.last = null;
  }

  /** `confirmed` : saisie au clavier (recette web, « Plaque ou pseudo ») : une seule lecture suffit. */
  feed(state: StaffState, plates: readonly string[], now: Date = clockNow(), confirmed = false): DriveOutcome | null {
    if (!plates.length) return null;
    const head = plates[0] as string;
    const matches = driveLookup(state, plates);
    const repeated = this.last === head;
    this.last = head;
    if (matches.length === 1 || (matches.length > 1 && (repeated || confirmed))) {
      this.last = null;
      const today = matches.find((m) => expectedOn(state.meta, m.entry, now) && m.entry.status === "valid");
      return driveOutcome(state, (today ?? matches[0])?.entry as AccessListEntry, now);
    }
    if (matches.length === 0 && (repeated || confirmed)) {
      this.last = null;
      return { kind: "unknown" };
    }
    return null;
  }
}

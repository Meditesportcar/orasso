// Accueil drive (lot 48, prototype `s-drive`) : les plaques candidates d'une photo (lib/plates/recognize.ts) sont
// hachées avec le sel de l'événement et cherchées dans la liste du téléphone, sans réseau ; aucune plaque en clair ne
// sort de la mémoire. Deux lectures identiques de suite, la plaque la plus proche, le choix du staff si deux plaques de
// participants sont lisibles (relecture du lot 48). Pur : testé par Vitest (drive.test.ts).
import type { AccessListEntry } from "@orasso/shared";

import { now as clockNow } from "../clock";
import type { PlateGroup } from "../plates/recognize";
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
  | { kind: "unknown" }
  /** Deux plaques de participants lisibles sur la même photo : le staff choisit, rien n'est pointé d'office. */
  | { kind: "choose"; entries: AccessListEntry[] };

/** Ce que devient une voiture reconnue : entre, déjà entrée, ou refusée (désistée, autre jour). */
export function driveOutcome(state: StaffState, entry: AccessListEntry, now: Date = clockNow()): DriveOutcome {
  if (entry.status !== "valid") return { kind: "refused", entry, reason: "revoked" };
  if (!expectedOn(state.meta, entry, now)) return { kind: "refused", entry, reason: "other_day" };
  const at = checkedInAt(state, entry);
  return at ? { kind: "already", entry, checkedInAt: at } : { kind: "ok", entry };
}

/** Plusieurs entrées pour la même plaque (même véhicule inscrit deux jours) : celle attendue aujourd'hui. */
function preferred(state: StaffState, matches: DriveMatch[], now: Date): AccessListEntry | undefined {
  return (matches.find((m) => m.entry.status === "valid" && expectedOn(state.meta, m.entry, now)) ?? matches[0])?.entry;
}

/**
 * Confirmation des lectures successives de la caméra (relecture du lot 48) : rien n'est pointé sur une seule photo.
 * - Les plaques arrivent de la plus proche à la plus lointaine (`plateGroups`) : on retient la plus proche qui désigne
 *   un participant (sinon la plus proche tout court).
 * - Il faut **deux lectures identiques de suite** (même voiture, ou même plaque inconnue) pour conclure.
 * - Deux plaques de participants différents sur la même photo : le staff choisit (`choose`).
 * Une saisie au clavier (`confirmed`) suffit seule. Cadence : une photo toutes les 900 ms, donc 2 s par voiture.
 */
export class DriveGate {
  private last: string | null = null;

  reset() {
    this.last = null;
  }

  feed(
    state: StaffState,
    groups: readonly PlateGroup[],
    now: Date = clockNow(),
    confirmed = false,
  ): DriveOutcome | null {
    if (!groups.length) return null;
    const matched = groups.map((g) => ({ group: g, matches: driveLookup(state, g.plates) }));
    const participants = matched.filter((m) => m.matches.length > 0);
    const distinct = new Map<string, AccessListEntry>();
    for (const p of participants) {
      const entry = preferred(state, p.matches, now);
      if (entry) distinct.set(entry.passId, entry);
    }
    if (distinct.size > 1) {
      this.last = null;
      return { kind: "choose", entries: [...distinct.values()] };
    }
    const target = participants[0];
    const entry = target ? preferred(state, target.matches, now) : undefined;
    const key = entry ? `pass:${entry.passId}` : `plate:${groups[0]?.plates[0] ?? ""}`;
    if (!confirmed && this.last !== key) {
      this.last = key;
      return null;
    }
    this.last = null;
    return entry ? driveOutcome(state, entry, now) : { kind: "unknown" };
  }
}

// Lot R4c (maquette R4.5 et R4.5b) : le véhicule principal et la présélection de la candidature. Règles pures, pour
// l'API, l'appli et le site.

type GarageVehicle = { id: string; status: string };

/**
 * Le principal effectif : celui choisi (`profiles.main_vehicle_id`) s'il est encore actif dans le garage, sinon le plus
 * ancien véhicule actif (`vehicles` dans l'ordre d'ajout). Un principal archivé ou supprimé cède donc sa place au plus
 * ancien suivant, sans question. `null` : aucun véhicule actif.
 */
export function effectiveMainVehicleId(vehicles: readonly GarageVehicle[], chosenId: string | null): string | null {
  const active = vehicles.filter((v) => v.status === "active");
  if (chosenId && active.some((v) => v.id === chosenId)) return chosenId;
  return active[0]?.id ?? null;
}

/** Garage trié : le principal d'abord, puis l'ordre d'ajout (celui de `vehicles`, déjà trié par date). */
export function garageOrder<T extends { id: string }>(vehicles: readonly T[], mainId: string | null): T[] {
  const main = vehicles.find((v) => v.id === mainId);
  return main ? [main, ...vehicles.filter((v) => v !== main)] : [...vehicles];
}

export type PreselectCandidate = {
  id: string;
  /** L'API exige une photo pour candidater. */
  hasPhoto: boolean;
  /** Dans une des catégories recherchées par l'événement (vrai quand l'événement n'en cherche aucune). */
  matches: boolean;
  /** Tour 2 : son type (voiture, moto, camion) est admis par l'événement ; un véhicule non admis n'est jamais proposé. */
  admitted: boolean;
};

export type Preselection = { id: string; reason: "main" | "last" | "first" } | null;

/**
 * Véhicule présélectionné dans la feuille de candidature (validation de Damien, R4.5b) : le principal s'il convient
 * (une photo et les catégories recherchées), sinon le dernier utilisé s'il convient, sinon le premier qui convient, et
 * à défaut le premier qui a une photo (hors des catégories : la candidature reste possible). `candidates` : les
 * véhicules actifs, dans l'ordre affiché ; ceux dont le type n'est pas admis par l'événement sont écartés d'abord.
 */
export function preselectVehicle(
  candidates: readonly PreselectCandidate[],
  mainId: string | null,
  lastUsedId: string | null,
): Preselection {
  const usable = candidates.filter((c) => c.admitted && c.hasPhoto);
  const fits = (c: PreselectCandidate | undefined) => Boolean(c?.matches);
  const main = usable.find((c) => c.id === mainId);
  if (main && fits(main)) return { id: main.id, reason: "main" };
  const last = usable.find((c) => c.id === lastUsedId);
  if (last && fits(last)) return { id: last.id, reason: "last" };
  const first = usable.find(fits) ?? usable[0];
  return first ? { id: first.id, reason: "first" } : null;
}

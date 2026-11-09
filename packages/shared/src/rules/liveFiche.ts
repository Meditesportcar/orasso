// La fiche d'un événement pendant qu'il a lieu (lot R7d2, maquette R7.13) : ce que l'écran montre du bloc `live` que
// l'API renvoie. L'écran ne calcule jamais un nombre : il affiche ce que l'API donne, et rien quand elle ne donne rien
// (règle des absents : après la fin, ni retenues ni présents). Même règle pour l'appli et le site.
import { presenceLabels } from "../labels/presence.fr";
import type { EventLive } from "../schemas/presence";

/** La fiche d'un événement en cours (`phase = running`) : les lignes du direct existent seulement alors. */
export function liveRunning(live: Pick<EventLive, "phase"> | null | undefined): boolean {
  return live?.phase === "running";
}

/**
 * « 11 sur place, sur 14 retenues » : seulement pendant l'événement et seulement si l'API renvoie les deux nombres
 * (jamais calculé côté écran, jamais gardé d'une lecture précédente : la phase est lue avec les nombres).
 */
export function liveOnSiteLine(
  live: Pick<EventLive, "phase" | "onSiteCount" | "acceptedCount"> | null | undefined,
): string | null {
  if (!live || live.phase !== "running") return null;
  if (live.onSiteCount === null || live.acceptedCount === null) return null;
  return presenceLabels.onSite(live.onSiteCount, live.acceptedCount);
}

/**
 * Le bouton « Votes · N ouverts » : une fois entré (`myPresence` non nul) et au moins un vote ouvert, pendant
 * l'événement. Sinon `null` (la fiche garde son bouton, « Mon accès » pour qui a une place).
 */
export function liveVotesLabel(
  live: Pick<EventLive, "phase" | "myPresence" | "votesOpen"> | null | undefined,
): string | null {
  if (!live || live.phase !== "running" || live.myPresence === null || live.votesOpen <= 0) return null;
  return presenceLabels.votesOpen(live.votesOpen);
}

/**
 * « Je suis sur place » est proposé pendant l'événement à qui n'est pas encore présent et n'a pas de place de véhicule
 * retenue (un exposant se fait scanner : l'API répond `use_qr`). Les autres refus (billet payant, entrée fermée, hors
 * zone, hors heures) sont dits par l'API après la mesure : l'écran n'a pas à les deviner.
 */
export function canOfferPresence(
  live: Pick<EventLive, "phase" | "myPresence"> | null | undefined,
  who: { signedIn: boolean; eligibleProfile: boolean; holdsVehicleSlot: boolean },
): boolean {
  if (!live || live.phase !== "running" || live.myPresence !== null) return false;
  return who.signedIn && who.eligibleProfile && !who.holdsVehicleSlot;
}

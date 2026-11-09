// La fiche d'un événement pendant qu'il a lieu (lot R7d2, maquette R7.13) : ce que l'écran montre du bloc `live` que
// l'API renvoie. L'écran ne calcule jamais un nombre : il affiche ce que l'API donne, et rien quand elle ne donne rien
// (règle des absents : après la fin, ni retenues ni présents). Même règle pour l'appli et le site.
import { presenceLabels } from "../labels/presence.fr";
import type { EventLive } from "../schemas/presence";

/**
 * Garde d'heure à l'écran : un écran resté ouvert au-delà de la fin garde le bloc `live` lu avant. À l'heure de fin
 * (fin exclue) ou après, il passe en phase « after » sans retenues, présents, votes ni bouton GPS (règle des absents),
 * sans attendre une relecture. Les autres phases ne changent pas ; ne sert qu'à retirer, jamais à ouvrir.
 */
export function liveAt(live: EventLive | null | undefined, endsAt: string | Date, nowMs: number): EventLive | null {
  if (!live) return null;
  if (live.phase !== "running" || nowMs < new Date(endsAt).getTime()) return live;
  return {
    ...live,
    phase: "after",
    onSiteCount: null,
    acceptedCount: null,
    canValidatePresence: false,
    votesOpen: 0,
  };
}

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
 * « Je suis sur place » est proposé pendant l'événement à qui n'est pas encore présent, quand l'API l'accepterait avant
 * même de mesurer (`live.canValidatePresence` : ouvert à cette heure, pas de place de véhicule retenue, accès et billet
 * compatibles : une seule règle, côté API, `presenceGate`). Le profil reste du ressort de l'écran (exposant et visiteur
 * connectés). Les refus qui dépendent de la mesure (hors zone, position imprécise) sont dits par l'API.
 */
export function canOfferPresence(
  live: Pick<EventLive, "phase" | "myPresence" | "canValidatePresence"> | null | undefined,
  who: { signedIn: boolean; eligibleProfile: boolean; holdsVehicleSlot: boolean },
): boolean {
  if (!live || live.phase !== "running" || live.myPresence !== null || !live.canValidatePresence) return false;
  return who.signedIn && who.eligibleProfile && !who.holdsVehicleSlot;
}

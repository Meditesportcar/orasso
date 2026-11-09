// La fiche d'un événement pendant qu'il a lieu (lot R7d2, maquette R7.13) : ce que l'écran montre du bloc `live` que
// l'API renvoie. L'écran ne calcule jamais un nombre : il affiche ce que l'API donne, et rien quand elle ne donne rien
// (règle des absents : après la fin, ni retenues ni présents). Même règle pour l'appli et le site.
import { presenceLabels } from "../labels/presence.fr";
import type { EventLive } from "../schemas/presence";
import { inPresenceWindow, PRESENCE_OPENS_BEFORE_MS } from "./presence";

export type LiveSpan = {
  endsAt: string | Date;
  startsAt?: string | Date;
  /** Jours déclarés (`days`) : la présence ne se valide que dans la plage d'UN jour. */
  days?: readonly { startsAt: string | Date; endsAt: string | Date }[];
};

const asDates = (event: LiveSpan) => ({
  startsAt: new Date(event.startsAt ?? event.endsAt),
  endsAt: new Date(event.endsAt),
  days: event.days?.map((d) => ({ startsAt: new Date(d.startsAt), endsAt: new Date(d.endsAt) })),
});

/**
 * Garde d'heure à l'écran : un écran resté ouvert garde le bloc `live` lu avant. À l'heure de fin de l'événement (fin
 * exclue) il passe en phase « after » sans retenues, présents, votes ni bouton GPS (règle des absents) ; à la fermeture
 * d'un jour déclaré (entre deux jours), le bouton GPS seul disparaît, sans attendre une relecture. Ne sert qu'à retirer,
 * jamais à ouvrir.
 */
export function liveAt(
  live: EventLive | null | undefined,
  event: LiveSpan | string | Date,
  nowMs: number,
): EventLive | null {
  if (!live) return null;
  const span: LiveSpan = typeof event === "string" || event instanceof Date ? { endsAt: event } : event;
  if (live.phase !== "running") return live;
  if (nowMs >= new Date(span.endsAt).getTime()) {
    return {
      ...live,
      phase: "after",
      onSiteCount: null,
      acceptedCount: null,
      canValidatePresence: false,
      votesOpen: 0,
    };
  }
  if (live.canValidatePresence && span.days?.length && !inPresenceWindow(asDates(span), new Date(nowMs))) {
    return { ...live, canValidatePresence: false };
  }
  return live;
}

/**
 * Prochaine heure où l'autorisation GPS change (fermeture d'une journée, ouverture de la suivante 30 minutes avant son
 * début, fin de l'événement) après `nowMs` : l'écran se relit alors. `null` si plus rien ne change.
 */
export function nextPresenceBoundary(event: LiveSpan, nowMs: number): number | null {
  const e = asDates(event);
  const edges: number[] = [e.endsAt.getTime()];
  for (const d of e.days ?? []) edges.push(d.endsAt.getTime(), d.startsAt.getTime() - PRESENCE_OPENS_BEFORE_MS);
  const next = edges.filter((t) => t > nowMs).sort((x, y) => x - y)[0];
  return next ?? null;
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

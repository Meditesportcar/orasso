// La confirmation d'une voix qui réussit reste affichée même si la relecture qui suit échoue (lot R7l3, tour 2) : la relecture
// du vote, mais aussi celle de `/me` ou de l'événement (le chargeur renvoie alors `event: null`). Pur, testé seul.
import type { VoteView } from "@orasso/shared";

type EventRef = { id: string; slug: string; title: string };

/**
 * L'événement à afficher : celui du chargeur, sinon (voix réussie) celui que l'action a rendu avec la voix. Son titre n'est
 * alors pas connu (`""`) : jamais celui du vote, qui s'afficherait deux fois.
 */
export function eventAfterVote(
  loaded: EventRef | null,
  action: { ok?: boolean; eventId?: string } | null | undefined,
  slug: string,
  justVoted: VoteView | null,
): EventRef | null {
  if (loaded) return loaded;
  if (justVoted && action?.ok && action.eventId) return { id: action.eventId, slug, title: "" };
  return null;
}

/** La relecture n'a pas abouti (vote ou événement) alors qu'une voix vient d'être confirmée : « Réessayer ». */
export function confirmationIsStale(loaded: { vote: unknown; event: unknown }, justVoted: unknown): boolean {
  return (!loaded.vote || !loaded.event) && Boolean(justVoted);
}

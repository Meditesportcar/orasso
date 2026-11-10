// Lot R8e1, tour 2 : quelles cartes « Prochaine sortie » montre l'Accueil, et dans quel ordre. Une seule règle, lue par l'API
// (pour savoir de quels événements envoyer la météo) et par l'appli (pour dessiner les cartes) : la carte principale d'abord,
// puis les autres par date, six au plus. Le site ne montre que la carte principale (la même, en tête de cette liste).
import { ticketIsUpcoming } from "./sorties";

/** Cartes dans le glissement, au plus. */
export const MAX_NEXT_OUTINGS = 6;

/** Candidatures encore vivantes : refusées, retirées, expirées ou annulées ne sont plus des sorties. */
export const LIVE_APPLICATION_STATUSES = ["pending", "waitlisted", "offered", "accepted", "awaiting_member"] as const;

export type OutingCardApplication = {
  id: string;
  status: string;
  event: { id: string; slug: string; startsAt: string };
};
export type OutingCardTicket = {
  id: string;
  status: string;
  event: { id: string; slug: string; startsAt: string; endsAt: string };
};
export type OutingCard = {
  kind: "application" | "ticket";
  id: string;
  eventId: string;
  status: string;
};

const startOf = (x: { event: { startsAt: string } }) => Date.parse(x.event.startsAt);

function ofApplication(a: OutingCardApplication): OutingCard {
  return { kind: "application", id: a.id, eventId: a.event.id, status: a.status };
}
function ofTicket(x: OutingCardTicket): OutingCard {
  return { kind: "ticket", id: x.id, eventId: x.event.id, status: x.status };
}

/**
 * Les cartes de « Prochaine sortie » (même règle que l'Accueil de l'appli) :
 * - exposant : la place retenue d'abord, sinon la première candidature en cours, en tête ; visiteur : son premier billet ;
 * - puis les autres candidatures et les billets (valables ou contrôlés tant que l'événement n'est pas fini, sans celui qui
 *   est déjà en tête ni ceux d'un événement où une place retenue donne l'accès) par date de début ;
 * - six cartes au plus.
 * `applications` : mes candidatures à venir (dans l'ordre de l'API) ; `tickets` : mes billets.
 */
export function pickNextOutings(input: {
  applications: readonly OutingCardApplication[];
  tickets: readonly OutingCardTicket[];
  exhibitor: boolean;
  now: Date;
}): OutingCard[] {
  const live = input.applications.filter((a) => (LIVE_APPLICATION_STATUSES as readonly string[]).includes(a.status));
  const next = input.exhibitor
    ? (live.find((a) => a.status === "accepted") ??
      live.find((a) => a.status === "pending" || a.status === "waitlisted" || a.status === "offered") ??
      null)
    : null;
  const upcomingTickets = input.tickets
    .filter((x) => ticketIsUpcoming({ status: x.status, event: x.event }, input.now.getTime()))
    .sort((a, b) => startOf(a) - startOf(b));
  // Visiteur : son premier billet valable (comme `nextTicket` de l'API).
  const first = input.exhibitor ? null : (upcomingTickets.find((x) => x.status === "valid") ?? null);
  const apps = next ? [next, ...live.filter((a) => a.id !== next.id)] : live;
  const accessSlugs = new Set(apps.filter((a) => a.status === "accepted").map((a) => a.event.slug));
  const tickets = upcomingTickets.filter((x) => x.id !== first?.id && !accessSlugs.has(x.event.slug));
  const rest = [
    ...apps.slice(next ? 1 : 0).map((a) => ({ startsAt: startOf(a), card: ofApplication(a) })),
    ...tickets.map((x) => ({ startsAt: startOf(x), card: ofTicket(x) })),
  ]
    .sort((a, b) => a.startsAt - b.startsAt)
    .map((x) => x.card);
  const out: OutingCard[] = [...(first ? [ofTicket(first)] : []), ...rest];
  if (next) out.unshift(ofApplication(next));
  return out.slice(0, MAX_NEXT_OUTINGS);
}

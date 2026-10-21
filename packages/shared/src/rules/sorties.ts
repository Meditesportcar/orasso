// Mes sorties sur le site (lot 57, relecture) : à quel segment appartient un billet du public, et ce que garde l'accès
// Staff après la fin de l'événement. Mêmes règles que `/me/staff-events` (jusqu'à J+1) et que le mode staff
// (`staffModeClosesAt`).

type Ended = { event: { endsAt: string } };

const endsAt = (x: Ended) => Date.parse(x.event.endsAt);

/**
 * Billet « à venir » : valable (`valid`) ou déjà contrôlé (`used`) tant que l'événement n'est pas fini. Un billet contrôlé
 * garde sa carte et son entrée vers le vote pendant l'événement.
 */
export function ticketIsUpcoming(ticket: Ended & { status: string }, nowMs: number): boolean {
  return (ticket.status === "valid" || ticket.status === "used") && endsAt(ticket) > nowMs;
}

/** Billet « passé » : l'événement est fini, quel que soit son état. */
export function ticketIsPast(ticket: Ended, nowMs: number): boolean {
  return endsAt(ticket) <= nowMs;
}

/**
 * Actions d'une mission Staff selon l'heure : « Je serai là » jusqu'à la fin de l'événement, le mode staff jusqu'à
 * `staffModeClosesAt` (J+1, pointage de rattrapage). La mission reste listée tant que l'API la renvoie.
 */
export function staffMissionActions(
  mission: Ended & { staffModeClosesAt: string },
  nowMs: number,
): { presence: boolean; staffMode: boolean } {
  return { presence: endsAt(mission) > nowMs, staffMode: Date.parse(mission.staffModeClosesAt) > nowMs };
}

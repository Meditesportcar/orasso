// Où l'on peut voter, et quels récaps sont prêts (lot 50, relecture) : les entrées de l'onglet Passeport (« Tampons, Prix
// du public, Récaps »). Toute personne pointée peut voter : un véhicule pointé, un billet contrôlé, le staff présent
// (règle de l'API du lot 49) ; ici on ne fait que repérer les événements en cours où c'en est le cas, l'API tranche.
import type { MyApplication, MyStaffEvent, MyTicket, RecapListItem } from "@orasso/shared";

export type VotableEvent = { eventId: string; title: string };

/** Le vote ouvre au premier pointage (parfois avant l'heure de début) et ferme à la fin de l'événement. */
const notEnded = (event: { endsAt: string }, now: Date) => now < new Date(event.endsAt);
/** Le staff présent : de 3 h avant le début (fenêtre de présence de l'API) à la fin. */
const staffWindow = (event: { startsAt: string; endsAt: string }, now: Date) =>
  new Date(event.startsAt).getTime() - 3 * 3_600_000 <= now.getTime() && now < new Date(event.endsAt);

export function votableEvents(
  input: {
    applications?: readonly MyApplication[] | null;
    tickets?: readonly MyTicket[] | null;
    staff?: readonly MyStaffEvent[] | null;
  },
  now: Date,
): VotableEvent[] {
  const found = new Map<string, VotableEvent>();
  for (const a of input.applications ?? []) {
    if (a.status === "accepted" && a.checkedInAt && notEnded(a.event, now)) {
      found.set(a.event.id, { eventId: a.event.id, title: a.event.title });
    }
  }
  for (const t of input.tickets ?? []) {
    if (t.status === "used" && notEnded(t.event, now)) {
      found.set(t.event.id, { eventId: t.event.id, title: t.event.title });
    }
  }
  for (const s of input.staff ?? []) {
    if (s.presence === "present" && staffWindow(s.event, now)) {
      found.set(s.event.id, { eventId: s.event.id, title: s.event.title });
    }
  }
  return [...found.values()];
}

/** Récaps prêts (à partir du lendemain, 10 h), le plus récent d'abord. */
export function readyRecaps(items: readonly RecapListItem[] | null | undefined, now: Date): RecapListItem[] {
  return (items ?? []).filter((r) => new Date(r.readyAt) <= now).sort((a, b) => b.endsAt.localeCompare(a.endsAt));
}

// Sorties et accès flottant (lot 43) : logique pure, sans écran. Les phrases viennent des maquettes (`s-sorties`) ; les
// règles (délais d'offre, fenêtre d'ouverture) viennent des règles partagées.
import {
  type ArrivalSlot,
  arrivalTime,
  BUSINESS_TIMEZONE,
  calendarDaysBetween,
  type MyApplication,
  type MyStaffEvent,
  type MyTicket,
  OFFER_DELAY_DAY,
  OFFER_DELAY_DEFAULT,
  OFFER_DELAY_EVE,
  wallTime,
} from "@orasso/shared";

const WEEKDAYS = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** « arrivée 18 h 30 – 19 h 15 » ou « arrivée dès 19 h 30 » ; `null` sans créneau. */
export function arrivalPhrase(slot: ArrivalSlot | null | undefined): string | null {
  if (!slot) return null;
  return slot.to
    ? `arrivée ${arrivalTime(slot.from)} – ${arrivalTime(slot.to)}`
    : `arrivée dès ${arrivalTime(slot.from)}`;
}

/** « Si une place se libère, tu as 24 h pour l'accepter » : les délais réels (24 h, 3 h la veille, 2 h le jour J). */
export const waitlistPhrase = `Si une place se libère, tu as ${OFFER_DELAY_DEFAULT / HOUR} h pour l'accepter (${OFFER_DELAY_EVE / HOUR} h la veille, ${OFFER_DELAY_DAY / HOUR} h le jour J).`;

export type SortiesSegment = "upcoming" | "staff" | "past";

/** Une mission staff est « à venir » tant que l'événement n'est pas fini. */
export const staffUpcoming = (items: readonly MyStaffEvent[], now: Date) =>
  items.filter((s) => new Date(s.event.endsAt) > now);

/** Un billet du public est « à venir » s'il est encore valable et que l'événement n'est pas fini. */
export const ticketsUpcoming = (items: readonly MyTicket[], now: Date) =>
  items.filter((x) => x.status === "valid" && new Date(x.event.endsAt) > now);

/** Billets passés : utilisés, ou d'un événement fini. */
export const ticketsPast = (items: readonly MyTicket[], now: Date) =>
  items.filter((x) => x.status === "used" || new Date(x.event.endsAt) <= now);

// --- Accès flottant ------------------------------------------------------------------------------------------------

/** La barre flotte de J-7 (inclus) à J+1 : le jour d'après, l'accès a rendu service. */
export const FLOATING_BEFORE_DAYS = 7;
export const FLOATING_AFTER_DAYS = 1;

export type AccessKind = "application" | "ticket" | "staff" | "accreditation" | "mission";

export type AccessItem = {
  key: string;
  kind: AccessKind;
  startsAt: string;
  endsAt: string;
  title: string;
  /** Écran à ouvrir. */
  href: string;
};

/** Vrai si un événement qui commence à `startsAt` est dans la fenêtre de la barre flottante. */
export function inFloatingWindow(startsAt: string | Date, now: Date): boolean {
  const start = new Date(startsAt).getTime();
  const delta = start - now.getTime();
  return delta <= FLOATING_BEFORE_DAYS * DAY && delta >= -FLOATING_AFTER_DAYS * DAY;
}

/** L'accès le plus proche dans la fenêtre (le plus tôt d'abord ; à égalité : candidature, billet, staff…). */
export function nextAccessOf(items: readonly AccessItem[], now: Date): AccessItem | null {
  const order: AccessKind[] = ["application", "accreditation", "mission", "ticket", "staff"];
  const live = items
    .filter((i) => inFloatingWindow(i.startsAt, now) && new Date(i.endsAt).getTime() > now.getTime() - DAY)
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() ||
        order.indexOf(a.kind) - order.indexOf(b.kind),
    );
  return live[0] ?? null;
}

/** Les candidatures retenues deviennent des accès (une place retenue ouvre le jour J) ; une fois entré, le QR n'a plus d'usage. */
export function applicationAccesses(apps: readonly MyApplication[] | null | undefined): AccessItem[] {
  return (apps ?? [])
    .filter((a) => a.status === "accepted" && !a.checkedInAt)
    .map((a) => ({
      key: `app-${a.id}`,
      kind: "application" as const,
      startsAt: a.event.startsAt,
      endsAt: a.event.endsAt,
      title: a.event.title,
      href: `/jour-j/${a.id}`,
    }));
}

export function ticketAccesses(items: readonly MyTicket[] | null | undefined, now: Date): AccessItem[] {
  return ticketsUpcoming(items ?? [], now).map((x) => ({
    key: `ticket-${x.id}`,
    kind: "ticket" as const,
    startsAt: x.event.startsAt,
    endsAt: x.event.endsAt,
    title: x.event.title,
    href: "/billets",
  }));
}

/** Mission staff : « Je serai là » (présence non refusée) ; le mode staff s'ouvre la veille. */
export function staffAccesses(items: readonly MyStaffEvent[] | null | undefined, now: Date): AccessItem[] {
  return staffUpcoming(items ?? [], now)
    .filter((s) => s.presence !== "absent")
    .map((s) => ({
      key: `staff-${s.event.id}`,
      kind: "staff" as const,
      startsAt: s.event.startsAt,
      endsAt: s.event.endsAt,
      title: s.event.title,
      href: s.staffModeOpen ? `/staff/${s.event.id}` : "/sorties",
    }));
}

/** « Sam. 24 » : le jour de la semaine abrégé et le quantième, dans le fuseau de l'événement. */
export function barDay(startsAt: string | Date, timeZone = BUSINESS_TIMEZONE): string {
  const w = wallTime(new Date(startsAt), timeZone);
  const weekday = new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${w.day}`;
}

/** Nombre de jours calendaires jusqu'à l'événement (négatif après). */
export const daysUntil = (startsAt: string | Date, now: Date) => calendarDaysBetween(now, new Date(startsAt));

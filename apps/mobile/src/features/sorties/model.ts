// Sorties et accès flottant (lot 43) : logique pure, sans écran. Les phrases viennent des maquettes (`s-sorties`) ; les
// règles (délais d'offre, fenêtre d'ouverture) viennent des règles partagées.
import {
  type ArrivalSlot,
  arrivalTime,
  BUSINESS_TIMEZONE,
  calendarDaysBetween,
  inNearWindow,
  keepUnits,
  type MyApplication,
  type MyStaffEvent,
  type MyTicket,
  NEAR_AFTER_DAYS,
  NEAR_BEFORE_DAYS,
  type NearItem,
  type NearKind,
  nearestAccess,
  OFFER_DELAY_DAY,
  OFFER_DELAY_DEFAULT,
  OFFER_DELAY_EVE,
  ticketIsPast,
  ticketIsUpcoming,
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
// Lot R6-police : unités et « jour J » insécables (`keepUnits`).
export const waitlistPhrase = keepUnits(
  `Si une place se libère, tu as ${OFFER_DELAY_DEFAULT / HOUR} h pour l'accepter (${OFFER_DELAY_EVE / HOUR} h la veille, ${OFFER_DELAY_DAY / HOUR} h le jour J).`,
);

/** Candidatures encore vivantes : refusées, retirées, expirées ou annulées ne sont plus des sorties. */
export const LIVE_STATUSES = ["pending", "waitlisted", "offered", "accepted", "awaiting_member"] as const;
export const liveApplications = (items: readonly MyApplication[] | null | undefined) =>
  (items ?? []).filter((a) => (LIVE_STATUSES as readonly string[]).includes(a.status));

export type SortiesSegment = "upcoming" | "staff" | "past";

// Lot 59c : mêmes règles que le site (`packages/shared/src/rules/sorties.ts`, lot 57).

/**
 * Une mission staff reste dans l'onglet Staff jusqu'à la fermeture du mode staff (`staffModeClosesAt`, J+1 : pointage
 * de rattrapage), comme `/me/staff-events` ; ses actions suivent l'heure (`staffMissionActions`).
 */
export const staffUpcoming = (items: readonly MyStaffEvent[], now: Date) =>
  items.filter((s) => Date.parse(s.staffModeClosesAt) > now.getTime());

/** Billet « à venir » : valable, ou déjà contrôlé à l'entrée, tant que l'événement n'est pas fini (vote, carte). */
export const ticketsUpcoming = (items: readonly MyTicket[], now: Date) =>
  items.filter((x) => ticketIsUpcoming(x, now.getTime()));

/** Billets passés : ceux d'un événement fini, quel que soit leur état. */
export const ticketsPast = (items: readonly MyTicket[], now: Date) =>
  items.filter((x) => ticketIsPast(x, now.getTime()));

// --- Accès flottant ------------------------------------------------------------------------------------------------

// Lot C2a : la règle est celle du lot C5, commune à l'appli et au site (`packages/shared/src/rules/nearAccess.ts`) ;
// les noms ci-dessous restent pour l'accès flottant (`NextAccessBar`) et ses tests.

/** La barre flotte de J-7 (inclus) au lendemain de la fin de l'événement. */
export const FLOATING_BEFORE_DAYS = NEAR_BEFORE_DAYS;
export const FLOATING_AFTER_DAYS = NEAR_AFTER_DAYS;

export type AccessKind = NearKind;

export type AccessItem = NearItem & {
  title: string;
  /** Écran à ouvrir. */
  href: string;
};

/**
 * Vrai si l'accès est dans la fenêtre de la barre : en jours calendaires (Europe/Paris), de J-7 dès 0 h jusqu'au lendemain
 * de la fin de l'événement (un événement de plusieurs jours reste là tant qu'il dure).
 */
export const inFloatingWindow = (startsAt: string | Date, endsAt: string | Date, now: Date): boolean =>
  inNearWindow(startsAt, endsAt, now);

/** L'accès le plus proche dans la fenêtre (le plus tôt d'abord ; à égalité : candidature, accréditation, mission…). */
export const nextAccessOf = (items: readonly AccessItem[], now: Date): AccessItem | null => nearestAccess(items, now);

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

/** Billets valables : une fois contrôlé à l'entrée, le billet n'a plus besoin de la barre (comme une place retenue). */
export function ticketAccesses(items: readonly MyTicket[] | null | undefined, now: Date): AccessItem[] {
  return ticketsUpcoming(items ?? [], now)
    .filter((x) => x.status === "valid")
    .map((x) => ({
      key: `ticket-${x.id}`,
      kind: "ticket" as const,
      startsAt: x.event.startsAt,
      endsAt: x.event.endsAt,
      title: x.event.title,
      // Lot C2a : le billet s'ouvre dans la variante visiteur de `s-qr`.
      href: `/billet/${x.id}`,
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

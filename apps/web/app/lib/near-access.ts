// Accès flottant du site (lot C5, artefact DA v2 `.near`) : la carte crème posée au-dessus de la barre d'onglets pour
// l'accès le plus proche, avec les mêmes sources que l'appli (candidatures retenues, billets, missions staff) et la règle
// commune de `@orasso/shared` (J-7 à J+1). Pour une candidature à un jour précis d'un événement de plusieurs jours, le
// jour choisi (`day`) remplace l'événement entier.
import {
  type MyApplication,
  type MyStaffEvent,
  type MyTicket,
  type NearItem,
  nearCountdown,
  nearestAccess,
  nearWeekday,
} from "@orasso/shared";

import { formatTime } from "./format";

export type NearAccess = {
  /** « J-6 », « Demain », « Aujourd'hui », « J+1 ». */
  countdown: string;
  /** « sam. » */
  weekday: string;
  title: string;
  /** « Retenue · zone JDM · 18 h 30 », « Billet · entrée public · 19 h », « Staff · 19 h ». */
  line: string;
  href: string;
};

type Item = NearItem & Omit<NearAccess, "countdown" | "weekday">;

const hhmm = (hm: string) => hm.replace(":", " h ").replace(/ h 00$/, " h");

export function nearAccessOf(
  sources: {
    applications?: readonly MyApplication[] | null;
    tickets?: readonly MyTicket[] | null;
    staff?: readonly MyStaffEvent[] | null;
  },
  now: Date,
): NearAccess | null {
  const items: Item[] = [
    ...(sources.applications ?? [])
      .filter((a) => a.status === "accepted" && !a.checkedInAt && a.event.status === "published")
      .map((a) => {
        const span = a.day ?? a.event;
        const when = a.arrival ? hhmm(a.arrival.from) : formatTime(span.startsAt);
        return {
          key: `app-${a.id}`,
          kind: "application" as const,
          startsAt: span.startsAt,
          endsAt: span.endsAt,
          title: a.event.title,
          line: ["Retenue", a.zone ? `zone ${a.zone.code}` : null, when].filter(Boolean).join(" · "),
          href: "/app/sorties",
        };
      }),
    ...(sources.tickets ?? [])
      .filter((t) => t.status === "valid")
      .map((t) => ({
        key: `ticket-${t.id}`,
        kind: "ticket" as const,
        startsAt: t.event.startsAt,
        endsAt: t.event.endsAt,
        title: t.event.title,
        line: `Billet · entrée public · ${formatTime(t.event.startsAt)}`,
        href: "/app/billets",
      })),
    ...(sources.staff ?? [])
      .filter((s) => s.presence !== "absent")
      .map((s) => ({
        key: `staff-${s.event.id}`,
        kind: "staff" as const,
        startsAt: s.event.startsAt,
        endsAt: s.event.endsAt,
        title: s.event.title,
        line: `Staff · ${formatTime(s.event.startsAt)}`,
        href: "/app/sorties",
      })),
  ];
  const next = nearestAccess(items, now);
  if (!next) return null;
  return {
    // Dans le bloc étroit de la carte, « Aujourd'hui » devient « Auj. » (le J-6 de l'artefact tient sur quatre signes).
    countdown: nearCountdown(next.startsAt, now).replace("Aujourd'hui", "Auj."),
    weekday: nearWeekday(next.startsAt),
    title: next.title,
    line: next.line,
    href: next.href,
  };
}

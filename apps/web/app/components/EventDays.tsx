// Événements sur plusieurs jours (lot 26) : la liste des jours d'un événement (page publique) et le libellé du jour
// d'une candidature (Accès, tri, jour J). Libellés de `packages/shared`, heures de Paris.
import { type DayAccess, dayAccessLabels, type EventDay, eventDaysLabels, formatDayDate } from "@orasso/shared";

import { toInput } from "../lib/datetime";

/** « 09:00 » (heure de Paris). */
export const hourOf = (iso: string) => toInput(iso).slice(11, 16);

/** « samedi 14 mars » ou « Tout l'événement » pour une candidature sans jour. */
export function dayLabel(date: string | null | undefined, opts: { weekday?: boolean } = {}): string {
  return date ? formatDayDate(date, opts) : eventDaysLabels.wholeEvent;
}

/** Les jours d'un événement : date, horaires, places restantes ; le mode d'accès en dessous. */
export function EventDays({
  days,
  dayAccess,
  candidateHref,
}: {
  days: EventDay[];
  dayAccess: DayAccess;
  /** Lien de candidature (choix du jour prérempli avec `?jour=`) ; absent quand on ne peut pas candidater. */
  candidateHref?: string;
}) {
  if (days.length < 2) return null;
  return (
    <section className="s-section" data-testid="event-days" aria-labelledby="ev-days">
      <h2 id="ev-days" className="s-h2">
        {eventDaysLabels.days}
      </h2>
      <ul className="s-stack s-stack--tight ev-days">
        {days.map((d) => (
          <li key={d.id} className="s-row s-row--between ev-days__item">
            <span>
              <strong>{formatDayDate(d.date)}</strong>{" "}
              <span className="o-t-meta s-muted">
                {hourOf(d.startsAt)}–{hourOf(d.endsAt)}
              </span>
            </span>
            <span className="o-t-caption s-muted">
              {d.remaining === null
                ? "Sans limite"
                : d.remaining === 0
                  ? eventDaysLabels.dayFull
                  : `${d.remaining} place${d.remaining > 1 ? "s" : ""}`}
              {candidateHref && dayAccess !== "whole" && d.remaining !== 0 ? (
                <>
                  {" · "}
                  <a href={`${candidateHref}${candidateHref.includes("?") ? "&" : "?"}jour=${d.id}`}>Ce jour-là</a>
                </>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="o-t-caption s-muted">
        {eventDaysLabels.dayAccess} : {dayAccessLabels[dayAccess]}.
      </p>
    </section>
  );
}

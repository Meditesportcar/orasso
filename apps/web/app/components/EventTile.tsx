import { Chip, Icon, StatusBadge } from "@orasso/design-system/web";
import { type EventCard, eventFormatLabels } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";

import { formatTime } from "../lib/format";

const TZ = "Europe/Paris";
const weekdayFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "short" });
const monthFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, month: "short" });
const dayNumFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "numeric" });
const longDateFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });

/** Souche de la carte (prototype `sdate`) : « sam. » / « 24 » / « oct. ». */
export function stubOf(iso: string): { weekday: string; day: string; month: string } {
  const at = new Date(iso);
  return {
    weekday: weekdayFmt.format(at).replace(".", ""),
    day: dayNumFmt.format(at),
    month: monthFmt.format(at).replace(".", ""),
  };
}

/**
 * Affiche de la carte (DA v2, lot 56) : l'affiche générée (Post 4:5, lot 47), jamais l'affiche perso de
 * l'organisateur ; sans affiche générée, ou si l'image ne charge pas (stockage en panne), le gabarit « Minimal » sur
 * l'aplat de l'affiche. Jamais de rectangle vide. `onFail` prévient la carte pour qu'elle pose la souche datée.
 */
export function PosterFace({
  event,
  onFail,
}: {
  event: Pick<EventCard, "generatedPosterUrl" | "format" | "title">;
  onFail?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  const fail = () => {
    setFailed(true);
    onFail?.();
  };
  // L'erreur peut précéder l'hydratation (rendu serveur) : on la relit une fois le composant monté.
  // biome-ignore lint/correctness/useExhaustiveDependencies: lecture unique au montage et au changement d'adresse
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth === 0) fail();
  }, [event.generatedPosterUrl]);
  if (event.generatedPosterUrl && !failed) {
    return (
      <img
        ref={img}
        className="w-card__img"
        src={event.generatedPosterUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onError={fail}
      />
    );
  }
  return (
    <span className="w-card__minimal" data-testid="poster-minimal">
      <span className="o-t-label w-card__minimal-format">{eventFormatLabels[event.format]}</span>
      <span className="o-t-poster-s w-card__minimal-title">{event.title}</span>
      <span className="o-t-credit w-card__minimal-credit">Orasso</span>
    </span>
  );
}

/** Jauge des places exposants : part prise (0 → 1), `null` sans limite. */
function takenOf(event: EventCard): number | null {
  if (event.capacity === null || event.remaining === null || event.capacity <= 0) return null;
  return Math.min(1, Math.max(0, (event.capacity - event.remaining) / event.capacity));
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/**
 * Une carte d'événement dans les listes publiques (accueil, `/evenements`, page d'une structure) : l'affiche (la date y est déjà dessinée ; la
 * souche date ne s'ajoute que sur le gabarit « Minimal »), le titre, le logo de la structure, le lieu et la jauge des places. Tout est un lien.
 * `layout="row"` : la vue Liste d'`/evenements`, l'affiche en petit à gauche.
 */
export function EventTile({
  event,
  showStructure = true,
  hints = [],
  layout = "poster",
}: {
  event: EventCard;
  showStructure?: boolean;
  /** Pastilles de l'Explorer (lot 29) : pourquoi l'événement est là, à quelle distance. */
  hints?: string[];
  layout?: "poster" | "row";
}) {
  const where = [event.city, event.department].filter(Boolean).join(" · ");
  const stub = stubOf(event.startsAt);
  const taken = takenOf(event);
  // Affiche en échec de chargement : la carte pose la souche datée du gabarit « Minimal ».
  const [posterFailed, setPosterFailed] = useState(false);
  const drawsDate = Boolean(event.generatedPosterUrl) && !posterFailed;
  return (
    <article className={`w-card s-pcard w-card--${layout}`} data-testid="event-tile">
      <a className="w-card__link" href={`/e/${event.slug}`}>
        <span className="w-card__poster" aria-hidden="true">
          <PosterFace event={event} onFail={() => setPosterFailed(true)} />
          {!drawsDate && (
            <span className="w-card__stub">
              <small className="o-t-label">{stub.weekday}</small>
              <b className="o-t-number-narrow">{stub.day}</b>
              <small className="o-t-label">{stub.month}</small>
            </span>
          )}
        </span>
        <span className="w-card__body">
          <span className="o-t-label w-card__format">
            <span className="o-visually-hidden">{longDateFmt.format(new Date(event.startsAt))}, </span>
            {eventFormatLabels[event.format]} · {formatTime(event.startsAt)}
          </span>
          <h3 className="w-card__title o-t-poster-s">{event.title}</h3>
          {showStructure && (
            <span className="w-card__org o-t-meta">
              <span className="w-card__logo" aria-hidden="true">
                {event.structure.logoUrl ? (
                  <img src={event.structure.logoUrl} alt="" loading="lazy" />
                ) : (
                  initials(event.structure.name)
                )}
              </span>
              {event.structure.name}
            </span>
          )}
          <span className="w-card__meta o-t-meta">
            {where && (
              <span>
                <Icon name="place" size={14} />
                {where}
              </span>
            )}
            <span>{event.remaining === null ? "Sans limite" : `${event.remaining} places`}</span>
          </span>
          {taken !== null && (
            <span className="w-card__gauge" aria-hidden="true">
              <span style={{ width: `${Math.round(taken * 100)}%` }} />
            </span>
          )}
        </span>
      </a>
      {(event.status === "cancelled" || event.outlook === "uncertain" || hints.length > 0) && (
        <div className="w-card__foot">
          {event.status === "cancelled" ? (
            <StatusBadge status="cancelled" />
          ) : event.outlook === "uncertain" ? (
            <StatusBadge status="uncertain" />
          ) : null}
          {hints.map((hint) => (
            <Chip key={hint}>{hint}</Chip>
          ))}
        </div>
      )}
    </article>
  );
}

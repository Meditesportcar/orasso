import { Chip, Plate, StatusBadge } from "@orasso/design-system/web";
import { type EventCard, eventFormatLabels } from "@orasso/shared";

import { formatDay, formatTime } from "../lib/format";

/** Une carte d'événement dans les listes publiques (accueil, `/evenements`, page d'une structure). Tout est un lien. */
export function EventTile({ event, showStructure = true }: { event: EventCard; showStructure?: boolean }) {
  const where = [event.city, event.department].filter(Boolean).join(" · ");
  return (
    <Plate as="article" className="s-tile" data-testid="event-tile">
      <a className="s-tile__link" href={`/e/${event.slug}`}>
        <div className="s-tile__photo" aria-hidden="true">
          {event.posterUrl ? <img src={event.posterUrl} alt="" loading="lazy" /> : <span className="s-tile__none" />}
        </div>
        <div className="s-tile__body">
          <span className="o-t-label s-tile__format">{eventFormatLabels[event.format]}</span>
          <h3 className="s-tile__title">{event.title}</h3>
          <span className="o-t-meta">
            {formatDay(event.startsAt)} · {formatTime(event.startsAt)}
          </span>
          {where && <span className="o-t-meta s-tile__muted">{where}</span>}
          {showStructure && <span className="o-t-caption s-tile__muted">{event.structure.name}</span>}
        </div>
      </a>
      <div className="s-tile__foot">
        {event.status === "cancelled" ? (
          <StatusBadge status="cancelled" />
        ) : event.outlook === "uncertain" ? (
          <StatusBadge status="uncertain" />
        ) : null}
        <Chip>{event.remaining === null ? "Sans limite" : `${event.remaining} places`}</Chip>
      </div>
    </Plate>
  );
}

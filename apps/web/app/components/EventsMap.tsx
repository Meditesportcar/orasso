import "maplibre-gl/dist/maplibre-gl.css";
import { fitPoints, pinDateLabel, placePins, type WebPin } from "@orasso/design-system/web";
import { dateStrip, dayKey, type EventCard, explorerR2Labels as R, shownStart } from "@orasso/shared";
import { useMemo, useRef, useState } from "react";
import { now } from "../lib/clock";
import { useOrassoMap } from "./useOrassoMap";

const FRANCE: [number, number] = [2.35, 46.6];

/**
 * Carte des événements d'une liste qui ont une position, au style Orasso (lot 44) : une étiquette datée en clair par
 * événement (« Aujourd'hui », « Dim. 1 nov. »), les proches regroupés en pastille (« 2 événements ») ; un clic ouvre une
 * bulle avec le lien vers la page. Lot R2 : la frise des dates au-dessus de la carte (« Toutes · 12 événements »,
 * « Dim. 1 nov. · 2 événements »…) ; choisir une date ne garde que ses épingles. Pas de légende.
 */
export function EventsMap({ events }: { events: EventCard[] }) {
  const container = useRef<HTMLElement>(null);
  const located = useMemo(() => events.filter((e) => e.lat != null && e.lng != null), [events]);
  const strip = useMemo(() => dateStrip(located, now()), [located]);
  const [day, setDay] = useState<string | null>(null);
  const shown = useMemo(
    () => (day ? located.filter((e) => dayKey(shownStart(e.startsAt, now())) === day) : located),
    [located, day],
  );
  const failed = useOrassoMap(
    container,
    { center: FRANCE, zoom: 4.6 },
    (maplibre, { map }) => {
      const pins: WebPin[] = shown.map((e) => ({
        id: e.id,
        kind: "event",
        lat: e.lat as number,
        lng: e.lng as number,
        label: pinDateLabel(shownStart(e.startsAt, now()), now()),
        title: e.title,
      }));
      const bySlug = new Map(shown.map((e) => [e.id, e.slug]));
      fitPoints(maplibre, map, pins);
      const placed = placePins(maplibre, map, pins, {
        popupFor: (pin) => {
          const link = document.createElement("a");
          link.className = "s-popup";
          link.href = `/e/${encodeURIComponent(bySlug.get(pin.id) ?? "")}`;
          link.textContent = pin.title;
          return link;
        },
      });
      return () => placed.remove();
    },
    shown,
  );

  if (failed) return <p className="s-muted">La carte n'a pas pu se charger.</p>;
  return (
    <div className="ex-map">
      {strip.length > 0 ? (
        <fieldset className="ex-dates" data-testid="map-dates">
          <legend className="o-visually-hidden">{R.dates}</legend>
          <button
            type="button"
            className="ex-date"
            aria-pressed={day === null}
            onClick={() => setDay(null)}
            data-testid="map-day-all"
          >
            <span className="o-t-label">{R.allDates}</span>
            <span className="o-t-caption">{R.eventsCount(located.length)}</span>
          </button>
          {strip.map((d) => (
            <button
              key={d.key}
              type="button"
              className="ex-date"
              aria-pressed={day === d.key}
              onClick={() => setDay(day === d.key ? null : d.key)}
              data-testid={`map-day-${d.key}`}
            >
              <span className="o-t-label">{d.label}</span>
              <span className="o-t-caption">{R.eventsCount(d.count)}</span>
            </button>
          ))}
        </fieldset>
      ) : null}
      <section
        ref={container}
        className="ev__map evs__map"
        aria-label={`Carte des événements (${shown.length})`}
        data-testid="events-map"
        data-count={shown.length}
      />
    </div>
  );
}

import { Button, Icon } from "@orasso/design-system/web";
import { departments, type EventCard, eventFormats, fromWallTime, siteLabels as L, type Page } from "@orasso/shared";

import { EventTile } from "../components/EventTile";
import { MapPanel } from "../components/MapPanel";
import { PhraseFilter } from "../components/PhraseFilter";
import { api, originOf } from "../lib/api.server";
import { nowMs } from "../lib/clock";
import { cityById, DEFAULT_RADIUS, type FilterWhen, filterRadii, filterWhens, whenRange } from "../lib/events-filter";
import type { Route } from "./+types/evenements";

const PAGE = 60;

/** « 2026-10-17 » → instant de minuit (début) ou de 23 h 59 (fin) à Paris ; `null` si la date est illisible. */
function dayBound(value: string | null, end: boolean): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  return fromWallTime({
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: end ? 23 : 0,
    minute: end ? 59 : 0,
  }).toISOString();
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const get = (name: string) => url.searchParams.get(name) ?? "";
  const city = cityById(get("ville"));
  const radiusAsked = Number(get("rayon"));
  const when: FilterWhen | "" = (filterWhens as readonly string[]).includes(get("quand"))
    ? (get("quand") as FilterWhen)
    : "";
  const filters = {
    format: (eventFormats as readonly string[]).includes(get("format")) ? get("format") : "",
    categoryId: get("categorie"),
    department: (departments as readonly string[]).includes(get("departement")) ? get("departement") : "",
    from: /^\d{4}-\d{2}-\d{2}$/.test(get("du")) ? get("du") : "",
    to: /^\d{4}-\d{2}-\d{2}$/.test(get("au")) ? get("au") : "",
    q: get("q").slice(0, 80),
    city: city?.id ?? "",
    radius: (filterRadii as readonly number[]).includes(radiusAsked) ? radiusAsked : DEFAULT_RADIUS,
    when,
  };
  const params = new URLSearchParams({ limit: String(PAGE) });
  if (filters.format) params.set("format", filters.format);
  if (/^[0-9a-f-]{36}$/i.test(filters.categoryId)) params.set("categoryId", filters.categoryId);
  if (filters.department) params.set("department", filters.department);
  const range = filters.when ? whenRange(filters.when, nowMs()) : null;
  const from = range?.from ?? dayBound(filters.from, false);
  const to = range?.to ?? dayBound(filters.to, true);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (filters.q) params.set("q", filters.q);
  // « Autour de » : tri par distance à la ville, dans le rayon choisi (l'API garde le tri par date sans position).
  if (city) {
    params.set("lat", String(city.lat));
    params.set("lng", String(city.lng));
    params.set("radiusKm", String(filters.radius));
    params.set("sort", "distance");
  }
  const cursor = get("suite");
  if (cursor) params.set("cursor", cursor);
  const events = await api<Page<EventCard>>(request, `/events?${params}`);
  return {
    events: events.ok ? events.data : { items: [], nextCursor: null },
    filters,
    view: get("vue") === "liste" ? ("liste" as const) : ("affiches" as const),
    unavailable: !events.ok,
    origin: originOf(request),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const origin = loaderData?.origin ?? "";
  const description =
    "Tous les rassemblements, expositions, cars & coffee et salons automobiles à venir : affiches, carte et filtres par format, département, ville et date.";
  return [
    { title: "Événements automobiles à venir · Orasso" },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Orasso" },
    { property: "og:title", content: "Événements automobiles à venir · Orasso" },
    { property: "og:description", content: description },
    { property: "og:url", content: `${origin}/evenements` },
    { property: "og:image", content: `${origin}/og-image.png` },
  ];
}

export default function Evenements({ loaderData }: Route.ComponentProps) {
  const { events, filters, view, unavailable } = loaderData;
  const active = Boolean(
    filters.format || filters.department || filters.city || filters.when || filters.q || filters.from || filters.to,
  );
  // Les paramètres de la page, pour les liens (vue, page suivante).
  const query = (extra: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [key, name] of [
      ["format", "format"],
      ["categoryId", "categorie"],
      ["department", "departement"],
      ["from", "du"],
      ["to", "au"],
      ["q", "q"],
      ["city", "ville"],
      ["when", "quand"],
    ] as const) {
      if (filters[key]) params.set(name, filters[key]);
    }
    if (filters.city) params.set("rayon", String(filters.radius));
    for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
    const text = params.toString();
    return `/evenements${text ? `?${text}` : ""}`;
  };
  const nextHref = events.nextCursor ? query({ suite: events.nextCursor, vue: view === "liste" ? "liste" : "" }) : null;
  const count = L.events.count(events.items.length);

  return (
    <div className="w-events">
      <h1 className="o-visually-hidden">{L.events.title}</h1>
      <PhraseFilter
        values={{
          format: filters.format,
          department: filters.department,
          city: filters.city,
          radius: filters.radius,
          when: filters.when,
          q: filters.q,
          view,
        }}
      />

      <div className="w w-split">
        <div className="s-stack">
          <div className="w-bar">
            <span data-testid="events-count">
              <strong>{events.nextCursor ? `${count} et plus` : count}</strong>
              {filters.city ? L.events.sortedNear : L.events.sortedDate}
            </span>
            <span className="w-bar__views">
              <Button
                variant="secondary"
                icon="cards"
                href={query({})}
                aria-current={view === "affiches" ? "true" : undefined}
              >
                {L.events.posters}
              </Button>
              <Button
                variant="secondary"
                icon="list"
                href={query({ vue: "liste" })}
                aria-current={view === "liste" ? "true" : undefined}
              >
                {L.events.list}
              </Button>
            </span>
          </div>
          {unavailable ? (
            <p className="s-notice s-notice--alert">{L.events.unavailable}</p>
          ) : events.items.length === 0 ? (
            <p className="s-notice" data-testid="events-empty">
              {L.events.empty}
            </p>
          ) : (
            <div className={`w-cards${view === "liste" ? " w-cards--list" : ""}`} data-testid="events-list">
              {events.items.map((event) => (
                <EventTile key={event.id} event={event} layout={view === "liste" ? "row" : "poster"} />
              ))}
            </div>
          )}
          {nextHref && (
            <p className="s-center">
              <Button href={nextHref} variant="secondary" icon="add">
                {L.events.more}
              </Button>
            </p>
          )}
          {active && (
            <p className="s-center">
              <Button href="/evenements" variant="secondary" icon="undo">
                {L.events.reset}
              </Button>
            </p>
          )}
        </div>
        {!unavailable && events.items.length > 0 && <MapPanel events={events.items} />}
      </div>
    </div>
  );
}

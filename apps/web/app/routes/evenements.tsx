import { Button, Plate, SelectField, TextField } from "@orasso/design-system/web";
import {
  type Category,
  departments,
  type EventCard,
  eventFormatLabels,
  eventFormats,
  fromWallTime,
  type Page,
} from "@orasso/shared";
import { Form } from "react-router";

import { EventsMap } from "../components/EventsMap";
import { EventTile } from "../components/EventTile";
import { api, originOf } from "../lib/api.server";
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
  const filters = {
    format: (eventFormats as readonly string[]).includes(get("format")) ? get("format") : "",
    categoryId: get("categorie"),
    department: (departments as readonly string[]).includes(get("departement")) ? get("departement") : "",
    from: /^\d{4}-\d{2}-\d{2}$/.test(get("du")) ? get("du") : "",
    to: /^\d{4}-\d{2}-\d{2}$/.test(get("au")) ? get("au") : "",
    q: get("q").slice(0, 80),
  };
  const params = new URLSearchParams({ limit: String(PAGE) });
  if (filters.format) params.set("format", filters.format);
  if (/^[0-9a-f-]{36}$/i.test(filters.categoryId)) params.set("categoryId", filters.categoryId);
  if (filters.department) params.set("department", filters.department);
  const from = dayBound(filters.from, false);
  const to = dayBound(filters.to, true);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (filters.q) params.set("q", filters.q);
  const cursor = get("suite");
  if (cursor) params.set("cursor", cursor);
  const [events, categories] = await Promise.all([
    api<Page<EventCard>>(request, `/events?${params}`),
    api<Category[]>(request, "/vehicle-reference/categories"),
  ]);
  return {
    events: events.ok ? events.data : { items: [], nextCursor: null },
    categories: categories.ok ? categories.data : [],
    filters,
    unavailable: !events.ok,
    origin: originOf(request),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const origin = loaderData?.origin ?? "";
  const description =
    "Tous les rassemblements, expositions, cars & coffee et salons automobiles à venir : liste, carte et filtres par format, catégorie, département et date.";
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
  const { events, categories, filters, unavailable } = loaderData;
  const active = Object.values(filters).some(Boolean);
  const nextHref = (() => {
    if (!events.nextCursor) return null;
    const params = new URLSearchParams();
    for (const [key, name] of [
      ["format", "format"],
      ["categoryId", "categorie"],
      ["department", "departement"],
      ["from", "du"],
      ["to", "au"],
      ["q", "q"],
    ] as const) {
      if (filters[key]) params.set(name, filters[key]);
    }
    params.set("suite", events.nextCursor);
    return `/evenements?${params}`;
  })();

  return (
    <div className="s-stack">
      <div className="s-head">
        <div className="o-t-label s-label">Découvrir</div>
        <h1 className="s-title">Événements</h1>
      </div>

      <Plate as="section" aria-label="Filtres">
        <Form method="get" className="s-filters" data-testid="events-filters">
          <TextField label="Recherche" name="q" defaultValue={filters.q} placeholder="Nom ou ville" />
          <SelectField
            label="Format"
            name="format"
            defaultValue={filters.format}
            options={[
              { value: "", label: "Tous" },
              ...eventFormats.map((f) => ({ value: f, label: eventFormatLabels[f] })),
            ]}
          />
          <SelectField
            label="Catégorie"
            name="categorie"
            defaultValue={filters.categoryId}
            options={[{ value: "", label: "Toutes" }, ...categories.map((c) => ({ value: c.id, label: c.label }))]}
          />
          <SelectField
            label="Département"
            name="departement"
            defaultValue={filters.department}
            options={[{ value: "", label: "Tous" }, ...departments.map((d) => ({ value: d, label: d }))]}
          />
          <TextField label="À partir du" name="du" type="date" defaultValue={filters.from} />
          <TextField label="Jusqu'au" name="au" type="date" defaultValue={filters.to} />
          <Button type="submit" variant="secondary" icon="search">
            Filtrer
          </Button>
          {active && (
            <Button href="/evenements" variant="secondary" icon="undo">
              Réinitialiser
            </Button>
          )}
        </Form>
      </Plate>

      {unavailable ? (
        <p className="s-notice s-notice--alert">La liste est momentanément indisponible. Réessaie dans un instant.</p>
      ) : events.items.length === 0 ? (
        <p className="s-notice" data-testid="events-empty">
          Aucun événement ne correspond à ces filtres pour l'instant.
        </p>
      ) : (
        <div className="evs">
          <EventsMap events={events.items} />
          <div className="s-grid s-grid--list" data-testid="events-list">
            {events.items.map((event) => (
              <EventTile key={event.id} event={event} />
            ))}
          </div>
        </div>
      )}
      {nextHref && (
        <p className="s-center">
          <Button href={nextHref} variant="secondary" icon="add">
            Voir plus d'événements
          </Button>
        </p>
      )}
    </div>
  );
}

// Le plateau en pleine page (lot R4b, maquette R4.7 « Voir les 42 voitures ») : la même grille que l'appli (R4.3b),
// onglets Voitures et Pros, pastilles de catégorie (filtre côté serveur), « Voir les N autres » par 30. Jamais
// référencée (`noindex`) : on ne publie pas aux moteurs « telle voiture sera là ». Sans compte : photos et modèles
// seulement (l'API n'envoie aucun pseudo) et « Connecte-toi pour voir qui vient ».
import { Button, Chip, ChipRow, Icon } from "@orasso/design-system/web";
import {
  type EventLineup,
  type EventPublic,
  type Grade,
  lineupLabels as L,
  LINEUP_PAGE_SIZE,
  type LineupCar,
} from "@orasso/shared";
import { data } from "react-router";
import { CarGrid, ProItem, VisitorNotice } from "../components/Lineup";
import { api, getMe } from "../lib/api.server";
import { formatWhen } from "../lib/format";
import type { Route } from "./+types/event-plateau";

/** Pages de 30 affichées au plus (« Voir les N autres » ajoute une page). */
const MAX_PAGES = 10;

export const headers: Route.HeadersFunction = ({ parentHeaders }) => {
  const h = new Headers(parentHeaders);
  h.set("cache-control", "private, no-store");
  h.set("x-robots-tag", "noindex, nofollow");
  return h;
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const slug = params.slug;
  const found = await api<EventPublic>(request, `/events/by-slug/${encodeURIComponent(slug)}`);
  if (!found.ok) throw data("Plateau introuvable", { status: 404 });
  const event = found.data;
  const url = new URL(request.url);
  const category = url.searchParams.get("categorie") ?? undefined;
  const tab = url.searchParams.get("onglet") === "pros" ? "pros" : "voitures";
  const pages = Math.min(MAX_PAGES, Math.max(1, Number(url.searchParams.get("pages") ?? 1) || 1));
  const me = await getMe(request);
  // Les pages demandées, à la suite (la première porte les nombres, les catégories et les pros).
  let first: EventLineup | null = null;
  const cars: LineupCar[] = [];
  let next: number | null = 0;
  for (let i = 0; i < pages && next !== null; i++) {
    const q: URLSearchParams = new URLSearchParams({ limit: String(LINEUP_PAGE_SIZE), cursor: String(next) });
    if (category) q.set("category", category);
    const res: Awaited<ReturnType<typeof api<EventLineup>>> = await api<EventLineup>(
      request,
      `/events/${event.id}/lineup?${q}`,
    );
    // Brouillon, privé, annulé : rien.
    if (!res.ok) throw data("Plateau introuvable", { status: 404 });
    first ??= res.data;
    cars.push(...res.data.cars);
    next = res.data.nextCursor;
  }
  if (!first) throw data("Plateau introuvable", { status: 404 });
  return {
    event: { slug: event.slug, title: event.title, startsAt: event.startsAt, endsAt: event.endsAt },
    organizer: event.structure.name,
    lineup: first,
    cars,
    hasMore: next !== null,
    category: category ?? null,
    tab,
    pages,
    connected: Boolean(me),
    grade: (me?.profile.grade as Grade | undefined) ?? null,
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `${L.title} · ${loaderData?.event.title ?? "Événement"} · Orasso` },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

/** Une pastille qui est un lien (onglet, catégorie) : la page se recharge avec le filtre, sans script. */
function LinkChip({
  href,
  selected,
  testid,
  children,
}: {
  href: string;
  selected: boolean;
  testid?: string;
  children: string;
}) {
  return (
    <a href={href} className="lu-chip" aria-current={selected ? "page" : undefined} data-testid={testid}>
      <Chip selected={selected}>{children}</Chip>
    </a>
  );
}

export default function EventLineupPage({ loaderData }: Route.ComponentProps) {
  const { event, organizer, lineup, cars, hasMore, category, tab, pages, connected, grade } = loaderData;
  const base = `/e/${event.slug}/plateau`;
  const link = (q: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== null && v !== "") p.set(k, String(v));
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  const remaining = lineup.filtered - cars.length;
  return (
    <div className="s-narrow s-stack lu" data-testid="lineup-page">
      <p>
        <a href={`/e/${event.slug}`} className="o-t-meta">
          <Icon name="back" size={14} /> {L.backToEvent}
        </a>
      </p>
      <div>
        <h1 className="s-title">{L.title}</h1>
        <p className="o-t-meta s-muted">
          {event.title} · {formatWhen(event.startsAt, event.endsAt)}
        </p>
      </div>
      <div className="lu-num" data-testid="lineup-head">
        <span className="o-t-number-narrow">{lineup.counts.cars}</span>
        <span>
          <strong>{L.cars(lineup.counts.cars, lineup.phase)}</strong>
          <br />
          <span className="o-t-caption s-muted">{L.caption(lineup.phase)}</span>
        </span>
      </div>
      <nav className="lu-tabs" aria-label={L.title}>
        <LinkChip href={link({ categorie: category })} selected={tab === "voitures"} testid="lineup-tab-cars">
          {L.tabCars(lineup.counts.cars)}
        </LinkChip>
        <LinkChip href={link({ onglet: "pros" })} selected={tab === "pros"} testid="lineup-tab-pros">
          {L.tabPros(lineup.counts.pros)}
        </LinkChip>
      </nav>
      {tab === "voitures" ? (
        <>
          {lineup.categories.length > 0 && (
            <ChipRow>
              <LinkChip href={link({})} selected={!category}>
                {L.allCategories}
              </LinkChip>
              {lineup.categories.map((c) => (
                <LinkChip key={c.slug} href={link({ categorie: c.slug })} selected={category === c.slug}>
                  {c.label}
                </LinkChip>
              ))}
            </ChipRow>
          )}
          {cars.length === 0 ? (
            <p className="s-muted" data-testid="lineup-empty">
              {lineup.phase === "present" ? L.emptyPresent : L.empty}
            </p>
          ) : (
            <CarGrid cars={cars} wide />
          )}
          {hasMore && remaining > 0 && (
            <Button
              variant="secondary"
              icon="down"
              href={link({ categorie: category, pages: pages + 1 })}
              fullWidth
              data-testid="lineup-more"
            >
              {L.more(remaining)}
            </Button>
          )}
          {!connected && cars.length > 0 && <VisitorNotice retour={base} />}
        </>
      ) : (
        <div className="lu-pros lu-pros--list" data-testid="lineup-pros">
          {lineup.pros.length === 0 && <p className="s-muted">{L.prosEmpty}</p>}
          {lineup.pros.map((p) => (
            <ProItem key={`${p.kind}-${p.id}`} pro={p} grade={grade} connected={connected} />
          ))}
          {lineup.pros.length > 0 && <p className="o-t-caption s-muted">{L.prosNote(organizer)}</p>}
        </div>
      )}
      <p className="lu-rule o-t-caption" data-testid="lineup-rule">
        <Icon name="lock" size={14} />
        <span>{L.rule}</span>
      </p>
    </div>
  );
}

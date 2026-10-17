import { Chip, Counters } from "@orasso/design-system/web";
import type {
  ApplicationForTriage,
  Category,
  EventCounters,
  EventCrewFilter,
  EventOrganizer,
  Page,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { useRevalidator } from "react-router";

import { ProviderTriage } from "../components/ProviderTriage";
import { TriageFile } from "../components/TriageFile";
import { TriageList } from "../components/TriageList";
import { Waitlist } from "../components/Waitlist";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { formatWhen } from "../lib/format";
import { useChannel } from "../lib/useChannel";
import type { Route } from "./+types/orga-candidatures";

export function meta() {
  return [{ title: "Candidatures · Orasso" }, { name: "robots", content: "noindex" }];
}

const VIEWS = ["file", "liste", "attente"] as const;
type View = (typeof VIEWS)[number];
type Tab = "vehicules" | "prestataires";

async function allPages(request: Request, path: string): Promise<ApplicationForTriage[]> {
  const items: ApplicationForTriage[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 20; guard++) {
    const res: Page<ApplicationForTriage> = await apiOrThrow(
      request,
      `${path}${path.includes("?") ? "&" : "?"}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    items.push(...res.items);
    cursor = res.nextCursor;
    if (!cursor) break;
  }
  return items;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const membership = me.memberships.find((m) => m.structureSlug === params.structure && m.status === "active");
  const url = new URL(request.url);
  const requested = url.searchParams.get("vue");
  const view: View = (VIEWS as readonly string[]).includes(requested ?? "") ? (requested as View) : "file";
  const eventId = params.eventId;
  const event = await apiOrThrow<EventOrganizer>(request, `/events/${eventId}`);
  const canDecide = Boolean(membership && (membership.role !== "staff" || membership.canDecide));
  const isOrganizer = Boolean(membership && membership.role !== "staff");

  // Prestataires (lot 21) : une file à part, hors capacité (`?onglet=prestataires`).
  const tab: Tab = url.searchParams.get("onglet") === "prestataires" ? "prestataires" : "vehicules";
  const providers = await allPages(request, `/events/${eventId}/applications?kind=provider&sort=created_at`);
  const providersPending = providers.filter((p) => p.status === "pending").length;
  const eventHead = {
    id: event.id,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    counters: event.counters,
    zones: event.zones,
    // Lot 26 : jours d'un événement sur plusieurs jours (filtre et colonne du tri).
    days: event.days.map((d) => ({ id: d.id, date: d.date })),
  };
  if (tab === "prestataires") {
    return {
      tab,
      view,
      event: eventHead,
      canDecide,
      isOrganizer,
      providers,
      providersPending,
      file: [] as ApplicationForTriage[],
      list: [] as ApplicationForTriage[],
      nextHref: null as string | null,
      filters: {} as Record<string, string | undefined>,
      categories: [] as Category[],
      crews: [] as EventCrewFilter[],
      waitlisted: [] as ApplicationForTriage[],
      offered: [] as ApplicationForTriage[],
    };
  }

  let file: ApplicationForTriage[] = [];
  let list: Page<ApplicationForTriage> = { items: [], nextCursor: null };
  let waitlisted: ApplicationForTriage[] = [];
  let offered: ApplicationForTriage[] = [];
  let categories: Category[] = [];
  const filters = {
    q: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    categoryId: url.searchParams.get("categoryId") ?? undefined,
    grade: url.searchParams.get("grade") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    crewId: url.searchParams.get("crewId") ?? undefined,
    dayId: url.searchParams.get("dayId") ?? undefined,
  };
  let crews: EventCrewFilter[] = [];
  if (view === "file") {
    const page = await apiOrThrow<Page<ApplicationForTriage>>(
      request,
      `/events/${eventId}/applications?status=pending&sort=created_at&limit=50`,
    );
    file = page.items;
  } else if (view === "liste") {
    const qs = new URLSearchParams({ limit: "25" });
    for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
    const cursor = url.searchParams.get("cursor");
    if (cursor) qs.set("cursor", cursor);
    list = await apiOrThrow<Page<ApplicationForTriage>>(request, `/events/${eventId}/applications?${qs}`);
    const cats = await api<Category[]>(request, "/vehicle-reference/categories");
    categories = cats.ok ? cats.data : [];
    // Filtre « crew » (lot 19).
    const crewRes = await api<EventCrewFilter[]>(request, `/events/${eventId}/applications/crews`);
    crews = crewRes.ok ? crewRes.data : [];
  } else {
    waitlisted = await allPages(request, `/events/${eventId}/applications?status=waitlisted&sort=waitlist_rank`);
    offered = await allPages(request, `/events/${eventId}/applications?status=offered`);
  }
  const nextParams = new URLSearchParams({ vue: "liste" });
  for (const [k, v] of Object.entries(filters)) if (v) nextParams.set(k, v);
  if (list.nextCursor) nextParams.set("cursor", list.nextCursor);
  return {
    tab,
    view,
    event: eventHead,
    canDecide,
    isOrganizer,
    providers: [] as ApplicationForTriage[],
    providersPending,
    file,
    list: list.items,
    nextHref: list.nextCursor ? `?${nextParams}` : null,
    filters,
    categories,
    crews,
    waitlisted,
    offered,
  };
}

export default function OrgaCandidatures({ loaderData }: Route.ComponentProps) {
  const {
    tab,
    view,
    event,
    canDecide,
    isOrganizer,
    providers,
    providersPending,
    file,
    list,
    nextHref,
    filters,
    categories,
    crews,
    waitlisted,
    offered,
  } = loaderData;
  const revalidator = useRevalidator();
  const [counters, setCounters] = useState<EventCounters>(event.counters);
  useEffect(() => setCounters(event.counters), [event.counters]);

  // Compteurs en temps réel (canal de tri) ; hors file, les autres changements rechargent la page.
  const { connected } = useChannel(`event:${event.id}:triage`, (message) => {
    if (message.type === "counters") setCounters(message.payload as EventCounters);
    else if ((view !== "file" || tab === "prestataires") && message.type !== "counters") revalidator.revalidate();
  });

  const mainTabs = (
    <nav className="s-row" aria-label="Candidatures">
      <a href="?" aria-current={tab === "vehicules" ? "page" : undefined}>
        <Chip surface="plate" selected={tab === "vehicules"} variant={tab === "vehicules" ? "accent" : "default"}>
          Véhicules
        </Chip>
      </a>
      <a href="?onglet=prestataires" aria-current={tab === "prestataires" ? "page" : undefined}>
        <Chip surface="plate" selected={tab === "prestataires"} variant={tab === "prestataires" ? "accent" : "default"}>
          Prestataires · {providersPending}
        </Chip>
      </a>
    </nav>
  );

  if (tab === "prestataires") {
    return (
      <>
        <div className="orga__head">
          <div>
            <div className="s-label o-t-label">Candidatures · {event.title}</div>
            <h1 className="s-title">Prestataires</h1>
            <div className="o-t-meta s-label">{formatWhen(event.startsAt, event.endsAt)}</div>
          </div>
          {mainTabs}
        </div>
        <ProviderTriage
          eventId={event.id}
          items={providers}
          canDecide={canDecide}
          canAccreditMedia={isOrganizer}
          onChanged={() => revalidator.revalidate()}
        />
      </>
    );
  }

  const tabs: { id: View; label: string; count?: number }[] = [
    { id: "file", label: "File de tri", count: counters.pending },
    { id: "liste", label: "Vue liste et filtres" },
    { id: "attente", label: "Liste d'attente", count: counters.waitlisted },
  ];

  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Candidatures · {event.title}</div>
          <h1 className="s-title">
            {view === "file" ? "File de tri" : view === "liste" ? "Vue liste" : "Liste d'attente"}
          </h1>
          <div className="o-t-meta s-label">{formatWhen(event.startsAt, event.endsAt)}</div>
        </div>
        <div className="s-stack s-stack--tight">
          {mainTabs}
          <nav className="s-row" aria-label="Vues">
            {tabs.map((t) => (
              <a
                key={t.id}
                href={t.id === "file" ? "?" : `?vue=${t.id}`}
                aria-current={view === t.id ? "page" : undefined}
              >
                <Chip surface="plate" selected={view === t.id} variant={view === t.id ? "accent" : "default"}>
                  {t.label}
                  {t.count !== undefined ? ` · ${t.count}` : ""}
                </Chip>
              </a>
            ))}
          </nav>
        </div>
      </div>

      <Counters
        variant="surface"
        size="site"
        active={2}
        data-testid="counters"
        data-live={connected ? "on" : "off"}
        items={[
          { value: counters.remaining ?? "∞", label: "places restantes" },
          { value: counters.accepted, label: "retenus" },
          { value: counters.pending, label: "à trier" },
          { value: counters.waitlisted, label: "liste d'attente" },
          { value: counters.refused, label: "refusés" },
        ]}
      />

      {view === "file" && <TriageFile eventId={event.id} initial={file} canDecide={canDecide} />}
      {view === "liste" && (
        <TriageList
          eventId={event.id}
          items={list}
          nextHref={nextHref}
          filters={filters}
          categories={categories}
          crews={crews}
          days={event.days}
          canDecide={canDecide}
          onChanged={() => revalidator.revalidate()}
        />
      )}
      {view === "attente" && (
        <Waitlist
          eventId={event.id}
          waitlisted={waitlisted}
          offered={offered}
          canDecide={canDecide}
          onChanged={() => revalidator.revalidate()}
        />
      )}
    </>
  );
}

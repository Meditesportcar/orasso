import { Chip, Counters } from "@orasso/design-system/web";
import type { ApplicationForTriage, Category, EventCounters, EventOrganizer, Page } from "@orasso/shared";
import { useEffect, useState } from "react";
import { useRevalidator } from "react-router";

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
  };
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
  } else {
    waitlisted = await allPages(request, `/events/${eventId}/applications?status=waitlisted&sort=waitlist_rank`);
    offered = await allPages(request, `/events/${eventId}/applications?status=offered`);
  }
  const nextParams = new URLSearchParams({ vue: "liste" });
  for (const [k, v] of Object.entries(filters)) if (v) nextParams.set(k, v);
  if (list.nextCursor) nextParams.set("cursor", list.nextCursor);
  return {
    view,
    event: {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      counters: event.counters,
      zones: event.zones,
    },
    canDecide,
    file,
    list: list.items,
    nextHref: list.nextCursor ? `?${nextParams}` : null,
    filters,
    categories,
    waitlisted,
    offered,
  };
}

export default function OrgaCandidatures({ loaderData }: Route.ComponentProps) {
  const { view, event, canDecide, file, list, nextHref, filters, categories, waitlisted, offered } = loaderData;
  const revalidator = useRevalidator();
  const [counters, setCounters] = useState<EventCounters>(event.counters);
  useEffect(() => setCounters(event.counters), [event.counters]);

  // Compteurs en temps réel (canal de tri) ; hors file, les autres changements rechargent la page.
  const { connected } = useChannel(`event:${event.id}:triage`, (message) => {
    if (message.type === "counters") setCounters(message.payload as EventCounters);
    else if (view !== "file" && message.type !== "counters") revalidator.revalidate();
  });

  const tabs: { id: View; label: string; count?: number }[] = [
    { id: "file", label: "Véhicules", count: counters.pending },
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
        <nav className="s-row" aria-label="Vues">
          {tabs.map((tab) => (
            <a
              key={tab.id}
              href={tab.id === "file" ? "?" : `?vue=${tab.id}`}
              aria-current={view === tab.id ? "page" : undefined}
            >
              <Chip surface="plate" selected={view === tab.id} variant={view === tab.id ? "accent" : "default"}>
                {tab.label}
                {tab.count !== undefined ? ` · ${tab.count}` : ""}
              </Chip>
            </a>
          ))}
        </nav>
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

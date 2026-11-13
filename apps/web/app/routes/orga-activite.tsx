import { Button, Chip } from "@orasso/design-system/web";
import {
  type ActivityDay,
  type ActivityGroup,
  type ActivityItem,
  type ActivityPage,
  type RequestsPage,
  type StructureActivityCount,
  type StructureActivityFilter,
  type StructurePublic,
  structureActivityFilters,
  structureActivityLabels,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { useLocation, useRevalidator } from "react-router";

import { ActivityRow } from "../components/activity/ActivityRow";
import { PersonAvatar } from "../components/People";
import { apiFetch } from "../lib/api.client";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { useChannel } from "../lib/useChannel";
import type { Route } from "./+types/orga-activite";
import "../styles/activity.css";
import "../styles/orga-activity.css";

// L'Activité de la structure (lot R9d, maquette R9.4 `n-cloche`) : la cloche de la casquette organisateur sur le site. Mes lignes
// de cette structure seulement (une par responsable), chips « Tout · À trier · Mentions · Commentaires · Collaborations », la
// ligne « Demandes · N » (staff et collaborations), puis les groupes « Aujourd'hui · Cette semaine · Plus tôt ». Ouvrir la
// page pose « vu » ; toucher une ligne la marque lue puis ouvre sa cible. Même logique que l'appli.
export function meta() {
  return [{ title: "Activité · Orasso" }, { name: "robots", content: "noindex" }];
}

const L = structureActivityLabels;
const DAY_LABELS: Record<ActivityDay, string> = { today: L.today, week: L.week, earlier: L.earlier };

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const membership = me.memberships.find((m) => m.structureSlug === params.structure && m.status === "active");
  if (!membership || membership.role === "staff") {
    throw new Response("Réservé aux organisateurs de la structure.", { status: 403 });
  }
  const structure = await apiOrThrow<StructurePublic>(
    request,
    `/structures/by-slug/${encodeURIComponent(params.structure)}`,
  );
  const url = new URL(request.url);
  const asked = url.searchParams.get("filtre") as StructureActivityFilter | null;
  const filter: StructureActivityFilter = asked && structureActivityFilters.includes(asked) ? asked : "all";
  const cursor = url.searchParams.get("suite");
  const query = new URLSearchParams({ filter });
  if (cursor) query.set("cursor", cursor);
  const [page, count, requests] = await Promise.all([
    apiOrThrow<ActivityPage>(request, `/structures/${structure.id}/activity?${query}`),
    api<StructureActivityCount>(request, `/structures/${structure.id}/activity/count`),
    api<RequestsPage>(request, `/structures/${structure.id}/requests`),
  ]);
  const fallbackTotal = count.ok ? count.data.requests.staff + count.data.requests.coauthor : 0;
  return {
    userId: me.user.id,
    structure: { id: structure.id, slug: structure.slug, name: structure.name },
    filter,
    page,
    requestsTotal: requests.ok ? requests.data.total : fallbackTotal,
    requestItems: requests.ok ? requests.data.items.slice(0, 3) : [],
    isFirstPage: cursor === null,
  };
}

/** Où mène une ligne du site : le tri de l'événement, la publication, la demande, l'équipe. */
function orgaPathOf(item: ActivityItem, slug: string): string | null {
  const d = item.data;
  const base = `/orga/${slug}`;
  if (item.type === "application_received" && typeof d.eventId === "string") {
    return `${base}/e/${d.eventId}/candidatures`;
  }
  if (item.type === "staff_request") return `${base}/staff`;
  if (item.type === "coauthor_invited") return "/app/activite/demandes";
  return null;
}

export default function OrgaActivite({ loaderData }: Route.ComponentProps) {
  const { userId, structure, filter, page, requestsTotal, requestItems, isFirstPage } = loaderData;
  const revalidator = useRevalidator();
  const here = useLocation().pathname;
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(new Set());

  const seenOnce = useRef(false);
  const markSeen = () => {
    void apiFetch(`/structures/${structure.id}/activity/seen`, { method: "POST" }).then((r) => {
      if (r.ok) revalidator.revalidate();
    });
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: une seule fois à l'ouverture
  useEffect(() => {
    if (seenOnce.current) return;
    seenOnce.current = true;
    markSeen();
  }, []);
  useChannel(`user:${userId}`, (m) => {
    if (m.type === "notification") markSeen();
  });

  const isRead = (i: ActivityItem) => i.read || i.ids.every((id) => readIds.has(id));
  const open = (item: ActivityItem) => async () => {
    if (isRead(item)) return;
    setReadIds((s) => new Set([...s, ...item.ids]));
    await apiFetch("/me/notifications/read", { method: "POST", json: { ids: item.ids }, keepalive: true });
    revalidator.revalidate();
  };
  const groups: ActivityGroup[] = page.groups;
  const empty = groups.length === 0 && requestsTotal === 0;
  const chipHref = (f: StructureActivityFilter) => (f === "all" ? here : `${here}?filtre=${f}`);

  return (
    <div className="s-narrow s-stack" data-testid="structure-activity">
      <h1 className="s-title">{L.title}</h1>
      <p className="o-t-caption s-muted">{structure.name}</p>

      <nav className="sact__chips" aria-label={L.title}>
        {structureActivityFilters.map((f) => (
          <a
            key={f}
            href={chipHref(f)}
            className="s-chip-link"
            data-testid={`sact-chip-${f}`}
            aria-current={f === filter ? "page" : undefined}
          >
            <Chip selected={f === filter}>{L.chips[f]}</Chip>
          </a>
        ))}
      </nav>

      {isFirstPage && filter === "all" && requestsTotal > 0 ? (
        <a className="act-requests" href={`/orga/${structure.slug}/staff`} data-testid="sact-requests-row">
          <span className="act-avs" aria-hidden="true">
            {requestItems.map((r) => (
              <PersonAvatar
                key={`${r.kind}:${r.id}`}
                url={r.from.type === "person" ? r.from.avatarUrl : r.from.logoUrl}
                pseudo={r.from.type === "person" ? r.from.pseudo : r.from.name}
                size={32}
              />
            ))}
          </span>
          <span className="act-requests__text">
            <strong>{`${L.requests} · ${requestsTotal}`}</strong>
          </span>
        </a>
      ) : null}

      {groups.map((g) => (
        <section key={g.day} className="act-group" data-testid={`sact-${g.day}`}>
          <h2 className="o-t-label s-muted">{DAY_LABELS[g.day]}</h2>
          <ul className="act-card">
            {g.items.map((item) => {
              const read = isRead(item);
              const shown = read === item.read ? item : { ...item, read };
              const path = orgaPathOf(item, structure.slug);
              // La cible propre à la structure passe dans `data.link` : `ActivityRow` ouvre toujours `link`.
              const withLink = path ? { ...shown, data: { ...shown.data, link: path } } : shown;
              return <ActivityRow key={item.id} item={withLink} day={g.day} onOpen={open(item)} />;
            })}
          </ul>
        </section>
      ))}

      {page.nextCursor ? (
        <Button
          variant="secondary"
          icon="down"
          href={`${here}?${new URLSearchParams({ ...(filter === "all" ? {} : { filtre: filter }), suite: page.nextCursor })}`}
          data-testid="sact-more"
        >
          Voir plus
        </Button>
      ) : null}
      {!isFirstPage ? (
        <Button variant="secondary" icon="back" href={chipHref(filter)}>
          Retour au début
        </Button>
      ) : null}
      {empty ? (
        <p className="s-notice" data-testid="sact-empty">
          {L.empty(structure.name)}
        </p>
      ) : null}
    </div>
  );
}

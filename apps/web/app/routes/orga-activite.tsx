import { Button, Chip } from "@orasso/design-system/web";
import {
  type ActivityDay,
  type ActivityGroup,
  type ActivityItem,
  type ActivityPage,
  coauthorLabels,
  type RequestItem,
  type RequestsPage,
  type StructureActivityCount,
  type StructureActivityFilter,
  type StructurePublic,
  structureActivityFilters,
  structureActivityLabels,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { data, Form, useLocation, useNavigation, useRevalidator } from "react-router";

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
// ligne « Demandes · N » (staff et collaborations : la vue `?vue=demandes` les montre toutes les deux, avec Accepter et Refuser),
// puis les groupes « Aujourd'hui · Cette semaine · Plus tôt ». Ouvrir la page pose « vu » ; toucher une ligne la marque lue puis
// ouvre sa cible. Même logique que l'appli.
export function meta() {
  return [{ title: "Activité · Orasso" }, { name: "robots", content: "noindex" }];
}

const L = structureActivityLabels;
const DAY_LABELS: Record<ActivityDay, string> = { today: L.today, week: L.week, earlier: L.earlier };

async function organizerOf(request: Request, slug: string) {
  const me = await requireMe(request);
  const membership = me.memberships.find((m) => m.structureSlug === slug && m.status === "active");
  if (!membership || membership.role === "staff") {
    throw new Response("Réservé aux organisateurs de la structure.", { status: 403 });
  }
  const structure = await apiOrThrow<StructurePublic>(request, `/structures/by-slug/${encodeURIComponent(slug)}`);
  return { me, structure };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { me, structure } = await organizerOf(request, params.structure);
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
  // Compteur **inconnu** (liste et compteur en échec tous les deux) ≠ zéro : la ligne reste, avec « Réessayer ». Le compteur
  // sert de secours à la liste.
  const requestsTotal = requests.ok
    ? requests.data.total
    : count.ok
      ? count.data.requests.staff + count.data.requests.coauthor
      : null;
  return {
    userId: me.user.id,
    structure: { id: structure.id, slug: structure.slug, name: structure.name },
    filter,
    page,
    requestsTotal,
    requestItems: requests.ok ? requests.data.items : [],
    requestsListFailed: !requests.ok,
    showRequests: url.searchParams.get("vue") === "demandes",
    isFirstPage: cursor === null,
    unseen: count.ok ? count.data.unseen : 0,
  };
}

/** Répondre à une demande de la structure : le staff (`/structures/:id/members/:userId/…`) ou une collaboration. */
export async function action({ request, params }: Route.ActionArgs) {
  const { structure } = await organizerOf(request, params.structure);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = encodeURIComponent(String(form.get("id") ?? ""));
  const answer = intent.endsWith("accept") ? "accept" : "decline";
  let path: string | null = null;
  if (intent === "staff-accept" || intent === "staff-decline") {
    path = `/structures/${structure.id}/members/${id}/${answer}`;
  } else if (intent === "coauthor-accept" || intent === "coauthor-decline") {
    path = `/me/feed-coauthor-requests/${id}/${answer}`;
  }
  if (!path) return data({ formError: "Action inconnue." }, { status: 400 });
  const res = await api(request, path, { method: "POST" });
  if (!res.ok) return data({ formError: res.error.message }, { status: res.status });
  const author = String(form.get("author") ?? "");
  return data({
    formError: null as string | null,
    notice:
      intent === "coauthor-accept"
        ? coauthorLabels.accepted
        : intent === "coauthor-decline"
          ? coauthorLabels.declined(author)
          : null,
  });
}

/** Où mène une ligne du site : le tri du bon genre (véhicules, Presse, Prestataires), les demandes, ou la publication. */
export function orgaPathOf(item: Pick<ActivityItem, "type" | "data">, slug: string): string | null {
  const d = item.data;
  const base = `/orga/${slug}`;
  if (item.type === "application_received" && typeof d.eventId === "string") {
    const where = d.kind === "media" ? "presse" : d.kind === "provider" ? "prestataires" : "candidatures";
    return `${base}/e/${d.eventId}/${where}`;
  }
  if (item.type === "staff_request" || item.type === "coauthor_invited") return `${base}/activite?vue=demandes`;
  return null;
}

function RequestCard({ r }: { r: RequestItem }) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const name = r.from.type === "person" ? r.from.pseudo : r.from.name;
  const forName = typeof r.payload.forName === "string" ? r.payload.forName : null;
  const caption = typeof r.payload.caption === "string" ? r.payload.caption : null;
  const title = r.kind === "staff" ? `${name} ${L.staffAsks}` : coauthorLabels.requestTitle(name, forName);
  const prefix = r.kind === "staff" ? "staff" : "coauthor";
  return (
    <li className="act-row" data-testid={`sact-request-${r.kind}`}>
      <PersonAvatar url={r.from.type === "person" ? r.from.avatarUrl : r.from.logoUrl} pseudo={name} size={40} />
      <span className="act-row__text">
        <strong>{title}</strong>
        {caption ? <span className="o-t-caption s-muted">{caption}</span> : null}
      </span>
      <Form method="post" className="s-row">
        <input type="hidden" name="id" value={r.id} />
        <input type="hidden" name="author" value={name} />
        <Button type="submit" name="intent" value={`${prefix}-accept`} variant="secondary" icon="check" disabled={busy}>
          {r.kind === "staff" ? "Accepter" : coauthorLabels.accept}
        </Button>
        <Button
          type="submit"
          name="intent"
          value={`${prefix}-decline`}
          variant="secondary"
          icon="close"
          disabled={busy}
        >
          {r.kind === "staff" ? "Refuser" : coauthorLabels.decline}
        </Button>
      </Form>
    </li>
  );
}

export default function OrgaActivite({ loaderData, actionData }: Route.ComponentProps) {
  const {
    userId,
    structure,
    filter,
    page,
    requestsTotal,
    requestItems,
    requestsListFailed,
    showRequests,
    isFirstPage,
    unseen,
  } = loaderData;
  const revalidator = useRevalidator();
  const here = useLocation().pathname;
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(new Set());

  // « Vu » : posé seulement quand la lecture montre des lignes non vues (`unseen > 0`) ; une fois posé, la relecture rend 0 et rien
  // ne repart. Aucune fenêtre de temps : l'écho du « vu » (`inbox.changed`) ne fait que relire la page, jamais reposer un « vu ».
  const markSeen = () => {
    void apiFetch(`/structures/${structure.id}/activity/seen`, { method: "POST" }).then((r) => {
      if (r.ok) revalidator.revalidate();
    });
  };
  // À chaque nouvelle lecture (`loaderData` change) qui compte des lignes non vues : un « vu » qui a échoué est retenté après la
  // lecture suivante ; un « vu » réussi relit la page, qui rend 0 : rien ne boucle. La relecture ne dépend jamais du POST.
  // biome-ignore lint/correctness/useExhaustiveDependencies: voir ci-dessus
  useEffect(() => {
    if (unseen > 0) markSeen();
  }, [loaderData]);
  // Une ligne regroupée qui s'ajoute à une ligne déjà livrée n'envoie que `inbox.changed` : tout signal relit la page, sans
  // exception (deux signaux rapprochés sont pris en compte tous les deux).
  useChannel(`user:${userId}`, (m) => {
    if (m.type === "inbox.changed" || m.type === "notification") revalidator.revalidate();
  });

  const isRead = (i: ActivityItem) => i.read || i.ids.every((id) => readIds.has(id));
  const open = (item: ActivityItem) => async () => {
    if (isRead(item)) return;
    setReadIds((s) => new Set([...s, ...item.ids]));
    await apiFetch("/me/notifications/read", { method: "POST", json: { ids: item.ids }, keepalive: true });
    revalidator.revalidate();
  };
  const groups: ActivityGroup[] = page.groups;
  // Jamais « Aucune nouveauté » quand les demandes n'ont pas pu être lues.
  const empty = groups.length === 0 && requestsTotal === 0;
  const chipHref = (f: StructureActivityFilter) => (f === "all" ? here : `${here}?filtre=${f}`);
  const formError = (actionData as { formError?: string | null } | undefined)?.formError ?? null;
  const notice = (actionData as { notice?: string | null } | undefined)?.notice ?? null;

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

      {requestsTotal === null && isFirstPage ? (
        <div className="s-notice" role="alert" data-testid="sact-requests-unknown">
          <p>{L.requestsUnknown}</p>
          <Button variant="secondary" icon="undo" onClick={() => revalidator.revalidate()} data-testid="sact-retry">
            {L.retry}
          </Button>
        </div>
      ) : null}
      {isFirstPage && filter === "all" && requestsTotal !== null && requestsTotal > 0 ? (
        <a
          className="act-requests"
          href={showRequests ? here : `${here}?vue=demandes`}
          data-testid="sact-requests-row"
          aria-expanded={showRequests}
        >
          <span className="act-avs" aria-hidden="true">
            {requestItems.slice(0, 3).map((r) => (
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
      {showRequests ? (
        <section data-testid="sact-requests">
          {requestsListFailed ? (
            <div className="s-notice" role="alert">
              <p>{L.requestsListFailed}</p>
              <Button variant="secondary" icon="undo" onClick={() => revalidator.revalidate()}>
                {L.retry}
              </Button>
            </div>
          ) : (
            <ul className="act-card">
              {requestItems.map((r) => (
                <RequestCard key={`${r.kind}:${r.id}`} r={r} />
              ))}
            </ul>
          )}
          {formError ? (
            <p className="s-notice s-notice--alert" role="alert">
              {formError}
            </p>
          ) : null}
          {notice ? (
            <p className="s-notice s-notice--ok" role="status">
              {notice}
            </p>
          ) : null}
        </section>
      ) : null}

      {groups.map((g) => (
        <section key={g.day} className="act-group" data-testid={`sact-${g.day}`}>
          <h2 className="o-t-label s-muted">{DAY_LABELS[g.day]}</h2>
          <ul className="act-card">
            {g.items.map((item) => {
              const read = isRead(item);
              const shown = read === item.read ? item : { ...item, read };
              return (
                <ActivityRow
                  key={item.id}
                  item={shown}
                  day={g.day}
                  onOpen={open(item)}
                  target={orgaPathOf(item, structure.slug)}
                />
              );
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

import { Button, Icon } from "@orasso/design-system/web";
import {
  type ActivityDay,
  type ActivityGroup,
  type ActivityItem,
  type ActivityPage,
  type InboxSummary,
  type RequestItem,
  type RequestsPage,
  requestCountSpoken,
  requestCountText,
  requestRowCounts,
  requestRowShown,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { useLocation, useRevalidator } from "react-router";

import { ActivityRow, openAfterRead, pathOfItem } from "../components/activity/ActivityRow";
import { PersonAvatar } from "../components/People";
import { apiFetch } from "../lib/api.client";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { useChannel } from "../lib/useChannel";
import type { Route } from "./+types/app-activite";

// L'Activité, derrière la cloche (lot R7c2, D38 ; maquette R7.2 `n-act`) : ce qui te concerne, rien d'autre. Les nouvelles
// des autres vont au Fil, les conversations dans la bulle (Messages). En tête la ligne « Demandes · 3 » (page
// `/app/activite/demandes`), puis le bandeau moutarde des changements d'horaire, puis « Aujourd'hui », « Cette semaine »,
// « Plus tôt ». Ouvrir la page pose « vu » (`POST /me/activity/seen` : la pastille de la cloche tombe) ; toucher une ligne la
// marque lue (`POST /me/notifications/read` avec ses `ids`). Même logique que l'appli.
export function meta() {
  return [{ title: "Activité · Orasso" }, { name: "robots", content: "noindex" }];
}

const DAY_LABELS: Record<ActivityDay, string> = { today: "Aujourd'hui", week: "Cette semaine", earlier: "Plus tôt" };

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const cursor = new URL(request.url).searchParams.get("suite");
  const [page, summary, requests] = await Promise.all([
    apiOrThrow<ActivityPage>(request, `/me/activity${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
    api<InboxSummary>(request, "/me/inbox/summary"),
    // La ligne « Demandes » ne montre que les premières personnes : une panne ne cache pas la liste.
    api<RequestsPage>(request, "/me/requests"),
  ]);
  // Compteur **inconnu** (résumé et liste en échec tous les deux) ≠ zéro : la ligne reste, sans nombre, avec « Réessayer ».
  // Liste incomplète sans résumé : « au moins N » (tour 3). Le chargeur attend ses lectures : pas d'état « en cours ».
  const counts = requestRowCounts(summary.ok ? summary.data : null, requests.ok ? requests.data : null, {
    summary: !summary.ok,
    list: !requests.ok,
  });
  return {
    userId: me.user.id,
    // Les structures que je gère (propriétaire ou co-organisateur) : « Ajouter à ma story » ne s'offre que pour celles-ci.
    organizerIds: me.personas.flatMap((p) => (p.kind === "organizer" ? [p.id] : [])),
    page,
    activityRequests: counts.activityRequests,
    atLeast: counts.atLeast,
    countFailed: counts.status === "failed",
    rowShown: requestRowShown(counts.activityRequests, counts.status),
    requestItems: (requests.ok ? requests.data.items : []).filter((r) => r.kind !== "contact").slice(0, 3),
    isFirstPage: cursor === null,
  };
}

/** « Côte Vermeille Classic et 2 autres attendent ta réponse » : la demande la plus récente, puis le reste. */
function requestSummary(first: RequestItem, total: number): string {
  const who = first.from.type === "person" ? first.from.pseudo : first.from.name;
  return total > 1
    ? `${who} et ${total - 1} autre${total - 1 > 1 ? "s" : ""} attendent ta réponse`
    : `${who} attend ta réponse`;
}

export default function Activite({ loaderData }: Route.ComponentProps) {
  const { userId, organizerIds, page, activityRequests, atLeast, countFailed, rowShown, requestItems, isFirstPage } =
    loaderData;
  const revalidator = useRevalidator();
  const here = useLocation().pathname;
  // Lignes touchées : lues tout de suite à l'écran, sans attendre la relecture.
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(new Set());

  // La cloche vient d'être ouverte : « vu » dès que la liste est là (une panne ne compte pas pour vue), puis les pastilles
  // de la barre se relisent.
  const seenOnce = useRef(false);
  const markSeen = () => {
    void apiFetch("/me/activity/seen", { method: "POST" }).then((r) => {
      if (r.ok) revalidator.revalidate();
    });
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: une seule fois à l'ouverture
  useEffect(() => {
    if (seenOnce.current) return;
    seenOnce.current = true;
    markSeen();
  }, []);

  // Une notification arrive pendant que la page est ouverte : elle est vue tout de suite (la mise en page recharge déjà les
  // pastilles sur ces signaux).
  useChannel(`user:${userId}`, (m) => {
    if (m.type === "notification") markSeen();
  });

  const highlighted = isFirstPage ? page.highlighted : [];
  const highlightedIds = new Set(highlighted.flatMap((h) => h.ids));
  const groups: ActivityGroup[] = page.groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.ids.some((id) => highlightedIds.has(id))) }))
    .filter((g) => g.items.length > 0);
  const isRead = (i: ActivityItem) => i.read || i.ids.every((id) => readIds.has(id));
  // Marque des identifiants lus (à l'écran tout de suite, puis côté API). La requête attend la réponse : le lien n'est suivi
  // qu'après (`openAfterRead`), et `keepalive` la garde en vie si la page se ferme malgré tout.
  const markRead = async (ids: string[]) => {
    setReadIds((s) => new Set([...s, ...ids]));
    await apiFetch("/me/notifications/read", { method: "POST", json: { ids }, keepalive: true });
  };
  const open = (item: ActivityItem) => async () => {
    if (isRead(item)) return;
    await markRead(item.ids);
    revalidator.revalidate();
  };
  const empty = groups.length === 0 && highlighted.length === 0 && activityRequests === 0;

  return (
    <div className="s-narrow s-stack" data-testid="activity">
      <h1 className="s-title">Activité</h1>
      <p className="o-t-caption s-muted">Ce qui te concerne</p>

      {countFailed && isFirstPage ? (
        <div className="s-notice" role="alert" data-testid="activity-requests-unknown">
          <p>Le nombre de demandes n'a pas pu être lu.</p>
          <Button variant="secondary" icon="undo" onClick={() => revalidator.revalidate()} data-testid="activity-retry">
            Réessayer
          </Button>
        </div>
      ) : null}
      {rowShown && isFirstPage ? (
        <a
          className="act-requests"
          href="/app/activite/demandes"
          data-testid="activity-requests-row"
          aria-label={
            activityRequests === null ? "Demandes" : `Demandes, ${requestCountSpoken(activityRequests, atLeast)}`
          }
        >
          <span className="act-avs" aria-hidden="true">
            {requestItems.map((r) => {
              const from =
                r.from.type === "person"
                  ? { name: r.from.pseudo, url: r.from.avatarUrl }
                  : { name: r.from.name, url: r.from.logoUrl };
              return <PersonAvatar key={`${r.kind}:${r.id}`} url={from.url} pseudo={from.name} size={32} />;
            })}
          </span>
          <span className="act-requests__text">
            <strong>
              {activityRequests === null ? "Demandes" : `Demandes · ${requestCountText(activityRequests, atLeast)}`}
            </strong>
            {requestItems[0] && activityRequests !== null ? (
              <span className="o-t-caption s-muted">{requestSummary(requestItems[0], activityRequests)}</span>
            ) : null}
          </span>
          <Icon name="next" size={20} />
        </a>
      ) : null}

      {highlighted.map((h) => {
        const path = pathOfItem(h);
        return (
          <div key={h.id} className="act-band" data-testid="activity-highlight">
            <Icon name="calendar" size={20} />
            <div className="act-band__text">
              <span className="o-t-label act-band__kicker">Changement d'horaire</span>
              <strong>{h.title}</strong>
              {h.body ? <span className="o-t-caption s-muted">{h.body}</span> : null}
              {path ? (
                <div>
                  <Button
                    variant="secondary"
                    icon="next"
                    href={path}
                    onClick={(e) => openAfterRead(e, path, () => markRead(h.ids))}
                    data-testid="activity-highlight-open"
                  >
                    Voir la fiche
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}

      {groups.map((g) => (
        <section key={g.day} className="act-group" data-testid={`activity-${g.day}`}>
          <h2 className="o-t-label s-muted">{DAY_LABELS[g.day]}</h2>
          <ul className="act-card">
            {g.items.map((item) => {
              const read = isRead(item);
              const shown = read === item.read ? item : { ...item, read };
              return (
                <ActivityRow key={item.id} item={shown} day={g.day} onOpen={open(item)} organizerIds={organizerIds} />
              );
            })}
          </ul>
        </section>
      ))}

      {page.nextCursor ? (
        <Button
          variant="secondary"
          icon="down"
          href={`${here}?suite=${encodeURIComponent(page.nextCursor)}`}
          data-testid="activity-more"
        >
          Voir plus
        </Button>
      ) : null}
      {!isFirstPage ? (
        <Button variant="secondary" icon="back" href={here}>
          Retour au début
        </Button>
      ) : null}
      {empty ? <p className="s-notice">Rien de neuf pour le moment.</p> : null}
      <p className="o-t-caption s-muted">Les nouvelles des autres sont dans le Fil, les conversations dans Messages.</p>
    </div>
  );
}

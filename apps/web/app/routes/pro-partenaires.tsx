// « Voir tout » de « Ses partenaires » sur le site (`/p/<slug>/partenaires`, lot R7m1, tour 2) : la liste complète des
// passionnés partenaires d'une fiche pro, 20 par page (`?apres=`, curseur `nextCursor` de l'API). Connecté seulement ; l'API
// décide de ce qui s'y trouve (compte privé non suivi : pseudo, photo et grade, sans voiture). Une panne se dit avec
// « Réessayer » : jamais une liste vide à sa place.
import { Button, Icon } from "@orasso/design-system/web";
import { gradeLabels, partnershipLabels as L, networkLabels, type ProPartnersPage } from "@orasso/shared";

import { PersonAvatar } from "../components/People";
import { PanelDown } from "../components/profile/PanelDown";
import { api, requireMe } from "../lib/api.server";
import type { Route } from "./+types/pro-partenaires";
import "../styles/partnerships.css";

export function meta() {
  return [{ title: `${L.partnersTitle} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireMe(request);
  const cursor = new URL(request.url).searchParams.get("apres") ?? "";
  const query = new URLSearchParams({ limit: "20", ...(cursor ? { cursor } : {}) });
  const res = await api<ProPartnersPage>(
    request,
    `/pros/by-slug/${encodeURIComponent(params.slug)}/partners?${query.toString()}`,
  );
  if (!res.ok && res.status === 404) throw new Response("Fiche pro introuvable", { status: 404 });
  return {
    slug: params.slug,
    page: res.ok ? res.data : null,
    error: res.ok ? null : res.error.message,
    after: cursor !== "",
    here: `/p/${encodeURIComponent(params.slug)}/partenaires${cursor ? `?${new URLSearchParams({ apres: cursor }).toString()}` : ""}`,
  };
}

export const headers: Route.HeadersFunction = ({ parentHeaders }) => {
  const h = new Headers(parentHeaders);
  h.set("cache-control", "private, no-store");
  return h;
};

export default function ProPartenaires({ loaderData }: Route.ComponentProps) {
  const { slug, page, error, after, here } = loaderData;
  return (
    <div className="s-stack" data-testid="pro-member-partners-page">
      <Button variant="secondary" icon="back" href={`/p/${encodeURIComponent(slug)}`}>
        {L.backToFiche}
      </Button>
      <h1 className="s-h1">
        {L.partnersTitle}
        {page ? <span className="o-t-caption s-muted"> · {L.partnersCount(page.total)}</span> : null}
      </h1>
      {error ? <PanelDown message={error} href={here} /> : null}
      {page && !page.items.length ? <p className="s-muted">{L.partnersEmpty}</p> : null}
      {page ? (
        <ul className="ptn-people">
          {page.items.map((p) => (
            <li key={p.pseudo}>
              <a className="ptn-person" href={`/u/${encodeURIComponent(p.pseudo)}`} data-testid="pro-member-partner">
                <PersonAvatar url={p.avatarUrl} pseudo={p.pseudo} size={40} />
                <span>
                  <b>{p.pseudo}</b>
                  <small>{[gradeLabels[p.grade], p.vehicle?.label].filter(Boolean).join(" · ")}</small>
                </span>
                <Icon name="next" size={16} />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {(page?.nextCursor || after) && (
        <div className="s-row" data-testid="pro-member-partners-pages">
          {after && (
            <Button variant="secondary" icon="back" href={`/p/${encodeURIComponent(slug)}/partenaires`}>
              {networkLabels.firstPage}
            </Button>
          )}
          {page?.nextCursor && (
            <Button
              variant="secondary"
              icon="down"
              href={`/p/${encodeURIComponent(slug)}/partenaires?${new URLSearchParams({ apres: page.nextCursor }).toString()}`}
              data-testid="pro-member-partners-next"
            >
              {networkLabels.next}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

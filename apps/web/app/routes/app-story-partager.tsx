import { shareLabels as L, type ShareInfo, storyLinkTypes } from "@orasso/shared";

import { ficheHandle } from "../components/FicheBar";
import { ShareComposer } from "../components/stories/ShareComposer";
import { api, requireMe } from "../lib/api.server";
import type { Route } from "./+types/app-story-partager";

// « Partager en story » (lot R7f4, maquette R7.23) : la carte d'un contenu d'Orasso sur un fond 9:16, déplacée à la souris,
// agrandie à la molette. Mode B (page de flux). Le contenu vient de l'adresse (`?type=&id=`) ; l'API dit s'il se partage.
export const handle = ficheHandle;

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "";
  const id = url.searchParams.get("id") ?? "";
  const known = (storyLinkTypes as readonly string[]).includes(type);
  const [info, crews] = await Promise.all([
    known ? api<ShareInfo>(request, `/me/share/info?type=${type}&id=${encodeURIComponent(id)}`) : null,
    api<{ id: string; name: string; membersCount: number }[]>(request, "/me/crews"),
  ]);
  return {
    type: type as (typeof storyLinkTypes)[number],
    id,
    info: info?.ok ? info.data : null,
    infoError: !known ? L.errors.unsupported : info && !info.ok ? info.error.message : null,
    visibility: me.profile.visibility,
    crews: crews.ok ? crews.data.map((c) => ({ id: c.id, name: c.name, membersCount: c.membersCount })) : [],
  };
}

export function meta() {
  return [{ title: `${L.composeTitle} · Orasso` }, { name: "robots", content: "noindex" }];
}

export default function AppStoryPartager({ loaderData }: Route.ComponentProps) {
  return (
    <div className="s-narrow s-stack">
      <h1 className="s-h1">{L.composeTitle}</h1>
      <ShareComposer
        type={loaderData.type}
        id={loaderData.id}
        info={loaderData.info}
        infoError={loaderData.infoError}
        visibility={loaderData.visibility}
        crews={loaderData.crews}
      />
    </div>
  );
}

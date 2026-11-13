import { storyPublishLabels as L, resolveStoryAuthor, type StoryAuthor } from "@orasso/shared";

import { ficheHandle } from "../components/FicheBar";
import { PublishForm } from "../components/stories/PublishForm";
import { api, requireMe } from "../lib/api.server";
import type { Route } from "./+types/app-story-publier";

// « Publier une story » (lot R7f3, D38, maquettes R7.8 et R7.22) : une photo en 9:16 (fichier, pas d'appareil : il vit dans
// l'appli), « Ajuster » à la souris, la plaque à la main, les détails, l'aperçu. Mode B (page de flux).
export const handle = ficheHandle;

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const [vehicles, applications, crews] = await Promise.all([
    api<{ id: string; label: string; status?: string }[]>(request, "/me/vehicles"),
    api<{ status: string; event: { id: string; title: string; startsAt: string; status: string } }[]>(
      request,
      "/me/applications?scope=upcoming",
    ),
    api<{ id: string; name: string; membersCount: number }[]>(request, "/me/crews"),
  ]);
  // Lot R9h (T18, T51) : `?auteur=` comme l'appli (`resolveStoryAuthor`) : `me` ou absent → la personne ; une clé `s:`, `p:`, `v:`, `m:`
  // d'une page que le compte tient → cette page ; une clé qui n'est pas au compte → ignorée (l'API revérifie les droits).
  const asked = new URL(request.url).searchParams.get("auteur");
  const choice = resolveStoryAuthor(
    asked,
    me.personas.filter((p) => p.kind !== "fan" && p.kind !== "visitor" && !p.suspended),
  );
  const author: StoryAuthor =
    choice?.kind === "page"
      ? {
          persona: choice.persona,
          ...(choice.persona === "organizer" ? { structureId: choice.id } : {}),
          ...(choice.persona === "pro" ? { proId: choice.id } : {}),
          name: choice.name,
        }
      : { persona: "fan" };
  const authorKey = choice?.kind === "page" ? choice.key : "me";
  return {
    author,
    authorKey,
    back: backOf(choice?.kind === "page" ? choice : null, me),
    visibility: me.profile.visibility,
    vehicles: vehicles.ok
      ? vehicles.data.filter((v) => !v.status || v.status === "active").map((v) => ({ id: v.id, label: v.label }))
      : [],
    applications: applications.ok ? applications.data.map((a) => ({ status: a.status, event: a.event })) : [],
    crews:
      author.persona === "fan" && crews.ok
        ? crews.data.map((c) => ({ id: c.id, name: c.name, membersCount: c.membersCount }))
        : [],
    optionsFailed: !vehicles.ok || !applications.ok || !crews.ok,
  };
}

/** Le Fil de la casquette d'où l'on vient (`/orga/<slug>/fil`…), sinon le Fil du passionné. */
function backOf(
  page: { persona: StoryAuthor["persona"]; id: string } | null,
  me: Awaited<ReturnType<typeof requireMe>>,
): string {
  if (!page) return "/app/fil";
  if (page.persona === "organizer") {
    const slug = me.memberships.find((m) => m.structureId === page.id && m.status === "active")?.structureSlug;
    return slug ? `/orga/${slug}/fil` : "/app/fil";
  }
  if (page.persona === "pro") return me.pro?.id === page.id ? `/pro/${me.pro.slug}/fil` : "/app/fil";
  return page.persona === "media"
    ? "/app/media/fil"
    : page.persona === "provider"
      ? "/app/prestataire/fil"
      : "/app/fil";
}

export function meta() {
  return [{ title: `${L.title} · Orasso` }, { name: "robots", content: "noindex" }];
}

export default function AppStoryPublier({ loaderData }: Route.ComponentProps) {
  return (
    <PublishForm
      visibility={loaderData.visibility}
      crews={loaderData.crews}
      vehicles={loaderData.vehicles}
      applications={loaderData.applications}
      optionsFailed={loaderData.optionsFailed}
      author={loaderData.author}
      authorKey={loaderData.authorKey}
      back={loaderData.back}
    />
  );
}

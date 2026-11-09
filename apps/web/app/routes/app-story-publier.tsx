import { storyPublishLabels as L } from "@orasso/shared";

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
  return {
    visibility: me.profile.visibility,
    vehicles: vehicles.ok
      ? vehicles.data.filter((v) => !v.status || v.status === "active").map((v) => ({ id: v.id, label: v.label }))
      : [],
    applications: applications.ok ? applications.data.map((a) => ({ status: a.status, event: a.event })) : [],
    crews: crews.ok ? crews.data.map((c) => ({ id: c.id, name: c.name, membersCount: c.membersCount })) : [],
    optionsFailed: !vehicles.ok || !applications.ok || !crews.ok,
  };
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
    />
  );
}

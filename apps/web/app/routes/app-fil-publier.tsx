import { feedScreenLabels as L } from "@orasso/shared";

import { ficheHandle } from "../components/FicheBar";
import { PublishForm } from "../components/fil/PublishForm";
import { api, requireMe } from "../lib/api.server";
import type { Route } from "./+types/app-fil-publier";

// « Publier au Fil » (lot R7e2, D38, maquette R7.24) : photos (fichiers), recadrage 4:5 par défaut (1:1, paysage), cadre de
// plaque à la main ou « Aucune plaque visible » obligatoire, un mot, la voiture et l'événement. Mode B (page de flux).
export const handle = ficheHandle;

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  const [vehicles, applications] = await Promise.all([
    api<{ id: string; label: string; status?: string }[]>(request, "/me/vehicles"),
    api<{ status: string; event: { id: string; title: string; startsAt: string; status: string } }[]>(
      request,
      "/me/applications?scope=upcoming",
    ),
  ]);
  return {
    vehicles: vehicles.ok
      ? vehicles.data.filter((v) => !v.status || v.status === "active").map((v) => ({ id: v.id, label: v.label }))
      : [],
    applications: applications.ok ? applications.data.map((a) => ({ status: a.status, event: a.event })) : [],
    optionsFailed: !vehicles.ok || !applications.ok,
  };
}

export function meta() {
  return [{ title: `${L.publishTitle} · Orasso` }, { name: "robots", content: "noindex" }];
}

export default function AppFilPublier({ loaderData }: Route.ComponentProps) {
  return (
    <PublishForm
      vehicles={loaderData.vehicles}
      applications={loaderData.applications}
      optionsFailed={loaderData.optionsFailed}
    />
  );
}

import { feedScreenLabels as L } from "@orasso/shared";

import { ficheHandle } from "../components/FicheBar";
import { PublishForm } from "../components/fil/PublishForm";
import { api, requireMe } from "../lib/api.server";
import type { Route } from "./+types/app-fil-publier";

// « Publier au Fil » (lot R7e2, D38, maquette R7.24 ; lot R8p, maquette R8.4) : photos (fichiers), recadrage 4:5 par défaut
// (1:1, paysage), cadre de plaque à la main ou « Aucune plaque visible » obligatoire, un mot, la voiture, au nom de qui
// (les casquettes du compte), pour quel événement (chargés au changement de casquette), « Info importante ». Mode B.
export const handle = ficheHandle;

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const vehicles = await api<{ id: string; label: string; status?: string }[]>(request, "/me/vehicles");
  return {
    userId: me.user.id,
    pseudo: me.profile.pseudo,
    avatarUrl: me.profile.avatarUrl,
    personas: (me.personas ?? []).map((p) => ({ kind: p.kind, id: p.id, label: p.label, logoUrl: p.logoUrl })),
    vehicles: vehicles.ok
      ? vehicles.data.filter((v) => !v.status || v.status === "active").map((v) => ({ id: v.id, label: v.label }))
      : [],
    optionsFailed: !vehicles.ok,
  };
}

export function meta() {
  return [{ title: `${L.publishTitle} · Orasso` }, { name: "robots", content: "noindex" }];
}

export default function AppFilPublier({ loaderData }: Route.ComponentProps) {
  return (
    <PublishForm
      userId={loaderData.userId}
      pseudo={loaderData.pseudo}
      avatarUrl={loaderData.avatarUrl}
      personas={loaderData.personas}
      vehicles={loaderData.vehicles}
      optionsFailed={loaderData.optionsFailed}
    />
  );
}

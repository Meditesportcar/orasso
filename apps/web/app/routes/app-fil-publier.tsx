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
  // Lot R8d : « Publier pour cet événement » ouvre l'écran avec la structure et l'événement déjà choisis.
  const url = new URL(request.url);
  return {
    start: {
      structure: url.searchParams.get("structure"),
      evenement: url.searchParams.get("evenement"),
      // Lot R9c : « Publier une offre » pose la fiche pro et l'étiquette « Offre ».
      fiche: url.searchParams.get("fiche"),
      etiquette: url.searchParams.get("etiquette"),
      // Lot R9h (T18, T51) : « Publier » depuis le Fil d'une casquette : `?auteur=<clé d'auteur>` (comme l'appli).
      auteur: url.searchParams.get("auteur"),
    },
    back: filHrefOfAuthor(url.searchParams.get("auteur"), me),
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

/** Le Fil où revenir : celui de la casquette qu'on tient (`?auteur=`), sinon le Fil du passionné. */
function filHrefOfAuthor(auteur: string | null, me: Awaited<ReturnType<typeof requireMe>>): string {
  const at = auteur ? auteur.indexOf(":") : -1;
  if (!auteur || at < 1) return "/app/fil";
  const id = auteur.slice(at + 1);
  switch (auteur.slice(0, at)) {
    case "s": {
      const slug = me.memberships.find(
        (m) => m.structureId === id && m.status === "active" && m.role !== "staff",
      )?.structureSlug;
      return slug ? `/orga/${slug}/fil` : "/app/fil";
    }
    case "p":
      return me.pro?.id === id ? `/pro/${me.pro.slug}/fil` : "/app/fil";
    case "m":
      return me.personas.some((p) => p.kind === "media" && p.id === id) ? "/app/media/fil" : "/app/fil";
    case "v":
      return me.personas.some((p) => p.kind === "provider" && p.id === id) ? "/app/prestataire/fil" : "/app/fil";
    default:
      return "/app/fil";
  }
}

export function meta() {
  return [{ title: `${L.publishTitle} · Orasso` }, { name: "robots", content: "noindex" }];
}

export default function AppFilPublier({ loaderData }: Route.ComponentProps) {
  return (
    <PublishForm
      key={loaderData.userId}
      userId={loaderData.userId}
      pseudo={loaderData.pseudo}
      avatarUrl={loaderData.avatarUrl}
      personas={loaderData.personas}
      vehicles={loaderData.vehicles}
      optionsFailed={loaderData.optionsFailed}
      start={loaderData.start}
      back={loaderData.back}
    />
  );
}

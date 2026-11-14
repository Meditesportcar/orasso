// « Tes photos » d'un album (lot R9f, maquette R9.7 ; `/app/albums/:id/mes-photos`) : les photos où je suis identifié, voiture ou pseudo.
// La notification, la fiche de la voiture, la sortie et le souvenir y mènent. Connecté seulement ; l'API ne sert que mes photos.
import { albumTagLabels as L, type MyPhotosView } from "@orasso/shared";

import { MyPhotos } from "../components/albums/MyPhotos";
import { api, requireMe } from "../lib/api.server";
import { isAfterReload } from "../lib/sessionReload";
import "../styles/albums.css";
import type { Route } from "./+types/app-album-mes-photos";

export function meta() {
  return [{ title: `${L.myPhotos} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  // Page née d'un rechargement automatique : rien de « Tes photos » n'est lu (la session a pu changer pendant la lecture : rien de
  // l'ancien compte ne reste dans le HTML ni dans les données sérialisées) ; la page confirme le compte par `/me`, puis navigue
  // sans la marque (comme le Crew).
  if (isAfterReload(new URL(request.url))) {
    return { view: null, albumId: params.id, myUserId: me.user.id, afterReload: true as const };
  }
  const res = await api<MyPhotosView>(request, `/me/albums/${encodeURIComponent(params.id)}/my-photos`);
  // 404 : plus aucune identification à mon nom dans cet album (ou album inconnu) : l'écran le dit, ce n'est pas une panne.
  if (!res.ok && res.status !== 404) throw new Response(res.error.message, { status: res.status });
  return { view: res.ok ? res.data : null, albumId: params.id, myUserId: me.user.id, afterReload: false as const };
}

export default function MesPhotos({ loaderData }: Route.ComponentProps) {
  // Une page née d'un rechargement (`afterReload`) n'a pas de données : `MyPhotos` se confirme, puis navigue sans la marque.
  if (!loaderData.view && !loaderData.afterReload) {
    return (
      <div className="s-narrow s-stack" data-testid="my-photos-empty">
        <h1 className="s-title">{L.myPhotos}</h1>
        <p className="s-muted">{L.screens.myPhotosEmpty}</p>
      </div>
    );
  }
  return (
    <MyPhotos
      key={`${loaderData.myUserId}:${loaderData.albumId}`}
      view={loaderData.view}
      afterReload={loaderData.afterReload}
      albumId={loaderData.albumId}
      myUserId={loaderData.myUserId}
    />
  );
}

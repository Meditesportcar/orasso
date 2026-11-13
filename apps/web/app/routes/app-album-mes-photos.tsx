// « Tes photos » d'un album (lot R9f, maquette R9.7 ; `/app/albums/:id/mes-photos`) : les photos où je suis identifié, voiture ou pseudo.
// La notification, la fiche de la voiture, la sortie et le souvenir y mènent. Connecté seulement ; l'API ne sert que mes photos.
import { albumTagLabels as L, type MyPhotosView } from "@orasso/shared";

import { MyPhotos } from "../components/albums/MyPhotos";
import { apiOrThrow, requireMe } from "../lib/api.server";
import "../styles/albums.css";
import type { Route } from "./+types/app-album-mes-photos";

export function meta() {
  return [{ title: `${L.myPhotos} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const view = await apiOrThrow<MyPhotosView>(request, `/me/albums/${encodeURIComponent(params.id)}/my-photos`);
  return { view, albumId: params.id, myUserId: me.user.id };
}

export default function MesPhotos({ loaderData }: Route.ComponentProps) {
  return <MyPhotos view={loaderData.view} albumId={loaderData.albumId} myUserId={loaderData.myUserId} />;
}

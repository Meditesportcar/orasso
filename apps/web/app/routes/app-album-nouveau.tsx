// « Nouvel album » (lot R9e, maquettes R9.5 `m-album-as_e1` à `e3`) : les trois étapes dans une page (l'événement, les photos, les détails et
// « Publier l'album »). Réservé au média (profil média) ; `?album=<id>` reprend un brouillon (l'étape des photos).
import {
  type AlbumsList,
  type AlbumView,
  albumLabels as L,
  type MediaAccreditationView,
  type MediaProfileView,
} from "@orasso/shared";
import { redirect } from "react-router";

import { NewAlbumForm } from "../components/albums/NewAlbumForm";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import "../styles/albums.css";
import "../styles/media.css";
import type { Route } from "./+types/app-album-nouveau";

// Parcours : mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

export function meta() {
  return [{ title: `${L.newAlbum} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  const { profile } = await apiOrThrow<{ profile: MediaProfileView | null }>(request, "/me/media-profile");
  if (!profile) throw redirect("/app/media/nouveau");
  const [accreditations, drafts] = await Promise.all([
    apiOrThrow<MediaAccreditationView[]>(request, "/me/accreditations?scope=all"),
    apiOrThrow<AlbumsList>(request, "/me/albums?status=draft&limit=100"),
  ]);
  const asked = new URL(request.url).searchParams.get("album");
  let resume: AlbumView | null = null;
  if (asked) {
    const res = await api<AlbumView>(request, `/albums/${encodeURIComponent(asked)}`);
    if (res.ok && res.data.mine && res.data.status === "draft") resume = res.data;
  }
  return {
    mediaName: profile.name,
    accreditations,
    draftEvents: drafts.items.map((d) => d.event.id),
    resume,
  };
}

export default function NewAlbumPage({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <FicheBar heading={false} title={L.newAlbum} back="/app/media?onglet=contenus" />
      <div className="s-narrow s-stack">
        <NewAlbumForm
          key={loaderData.resume?.id ?? "new"}
          mediaName={loaderData.mediaName}
          accreditations={loaderData.accreditations}
          draftEvents={loaderData.draftEvents}
          resume={loaderData.resume}
        />
      </div>
    </>
  );
}

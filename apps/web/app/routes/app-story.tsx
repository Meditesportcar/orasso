import { type StoryBar, storyChain, storyViewerLabels } from "@orasso/shared";

import { ficheHandle } from "../components/FicheBar";
import { Viewer } from "../components/stories/Viewer";
import { api, requireMe } from "../lib/api.server";
import type { Route } from "./+types/app-story";

// La visionneuse de stories (lot R7f2, maquette R7.7) : une superposition plein écran, la story en 9:16 centrée. Le chargeur
// exige la session (aucune story ni adresse de média dans le HTML rendu pour un visiteur sans session) ; les stories sont
// lues dans le navigateur (cookie, `/api/stories/by-author/:key`), les fichiers passent par la route protégée de l'API.
// `authorKey` : `u:<compte>`, `s:<structure>` ou `p:<pro>`.
// Lot R8s : avec `?suite=barre` (ouverte depuis la barre du Fil), le chargeur lit la barre une fois et calcule la chaîne des
// auteurs à lire (`storyChain`), figée à l'ouverture ; sans lui, l'auteur seul. Une panne de la barre : l'auteur seul.
// Mode B : ni bande ORASSO ni barre d'onglets sous la superposition.
export const handle = ficheHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  if (new URL(request.url).searchParams.get("suite") !== "barre") return { userId: me.user.id, chain: null };
  const key = decodeURIComponent(params.authorKey);
  const bar = await api<StoryBar>(request, "/stories/bar");
  const chain = bar.ok ? storyChain(bar.data.authors, key, bar.data.mine ? `u:${me.user.id}` : null) : [key];
  return { userId: me.user.id, chain };
}

export function meta() {
  return [{ title: `${storyViewerLabels.barTitle} · Orasso` }, { name: "robots", content: "noindex" }];
}

export default function AppStory({ loaderData, params }: Route.ComponentProps) {
  // `key` = le compte : un autre compte (déconnexion puis connexion, retour arrière) remonte une visionneuse neuve, rien de
  // l'ancien (stories, feuilles, brouillon) ne reste affiché.
  const authorKey = decodeURIComponent(params.authorKey);
  return (
    <Viewer
      key={`${loaderData.userId}:${authorKey}`}
      authorKey={authorKey}
      userId={loaderData.userId}
      chain={loaderData.chain ?? undefined}
    />
  );
}

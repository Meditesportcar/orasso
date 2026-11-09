import { storyViewerLabels } from "@orasso/shared";

import { ficheHandle } from "../components/FicheBar";
import { Viewer } from "../components/stories/Viewer";
import { requireMe } from "../lib/api.server";
import type { Route } from "./+types/app-story";

// La visionneuse de stories (lot R7f2, maquette R7.7) : une superposition plein écran, la story en 9:16 centrée. Le chargeur
// exige la session (aucune story ni adresse de média dans le HTML rendu pour un visiteur sans session) ; les stories sont
// lues dans le navigateur (cookie, `/api/stories/by-author/:key`), les fichiers passent par la route protégée de l'API.
// `authorKey` : `u:<compte>`, `s:<structure>` ou `p:<pro>`.
// Mode B : ni bande ORASSO ni barre d'onglets sous la superposition.
export const handle = ficheHandle;

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  return { userId: me.user.id };
}

export function meta() {
  return [{ title: `${storyViewerLabels.barTitle} · Orasso` }, { name: "robots", content: "noindex" }];
}

export default function AppStory({ loaderData, params }: Route.ComponentProps) {
  return <Viewer authorKey={decodeURIComponent(params.authorKey)} userId={loaderData.userId} />;
}

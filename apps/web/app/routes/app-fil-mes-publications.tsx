import { feedScreenLabels as L } from "@orasso/shared";

import { ficheHandle } from "../components/FicheBar";
import { MyPosts } from "../components/fil/MyPosts";
import { requireMe } from "../lib/api.server";
import type { Route } from "./+types/app-fil-mes-publications";

// « Mes publications » (lot R7e2) : les publications faites au Fil, supprimables ; lien depuis « Mon compte ».
export const handle = ficheHandle;

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  return null;
}

export function meta() {
  return [{ title: `${L.mineTitle} · Orasso` }, { name: "robots", content: "noindex" }];
}

export default function AppFilMesPublications() {
  return <MyPosts />;
}

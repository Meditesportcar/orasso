import { type FeedPostWithManage, publicationsLabels as L } from "@orasso/shared";
import { data } from "react-router";

import { ficheHandle } from "../components/FicheBar";
import { PublicationPage } from "../components/publications/PublicationPage";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import type { Route } from "./+types/app-publication";

// La page d'une publication seule (lot R8b2, D40) : la carte entière du Fil, ses commentaires dessous. Mode B (fiche).
// Retirée ou devenue invisible (404) : la page le dit (« Cette publication n'est plus visible. ») sans dire pourquoi.
export const handle = ficheHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireMe(request);
  const res = await api<FeedPostWithManage>(request, `/feed-posts/${encodeURIComponent(params.id)}`);
  if (res.ok) return { post: res.data };
  if (res.status === 404 || res.status === 403) return data({ post: null }, { status: 404 });
  // Une panne n'est pas « plus visible » : la page d'erreur du site, avec le message de l'API.
  return apiOrThrow<FeedPostWithManage>(request, `/feed-posts/${encodeURIComponent(params.id)}`).then((post) => ({
    post,
  }));
}

export function meta() {
  return [{ title: `${L.pageTitle} · Orasso` }, { name: "robots", content: "noindex" }];
}

export default function AppPublication({ loaderData }: Route.ComponentProps) {
  return <PublicationPage post={loaderData.post} back="/app/fil" />;
}

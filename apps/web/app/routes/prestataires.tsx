// Vitrine d'un prestataire vue par les connectés (lot 57, `s-vitrine`) : ce qu'une organisation regarde avant de le
// retenir sur une mission (métier, menu, besoins sur place, zone, avis des organisateurs). `GET /providers/:id` et ses
// avis sont réservés aux connectés (lot 46).
import { proV2Labels as P, type ProviderPublic, type ProviderReviewsSummary } from "@orasso/shared";

import { ProviderVitrine } from "../components/ProviderVitrine";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import "../styles/providers.css";
import type { Route } from "./+types/prestataires";

export function meta({ loaderData: d }: Route.MetaArgs) {
  return [{ title: `${d?.provider.name ?? P.providerPage} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireMe(request);
  const id = encodeURIComponent(params.id);
  const [provider, reviews] = await Promise.all([
    apiOrThrow<ProviderPublic>(request, `/providers/${id}`),
    api<ProviderReviewsSummary>(request, `/providers/${id}/reviews`),
  ]);
  return { provider, reviews: reviews.ok ? reviews.data : null };
}

export default function Prestataires({ loaderData }: Route.ComponentProps) {
  return (
    <div className="s-narrow s-stack" data-testid="provider-public">
      <div className="o-t-label s-label">{P.providerPage}</div>
      <ProviderVitrine provider={loaderData.provider} reviews={loaderData.reviews} />
    </div>
  );
}

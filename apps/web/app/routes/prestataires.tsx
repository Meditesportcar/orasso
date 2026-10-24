// Vitrine d'un prestataire vue par les connectés (lot 57, `s-vitrine`) : ce qu'une organisation regarde avant de le
// retenir sur une mission (métier, menu, besoins sur place, zone, avis des organisateurs). `GET /providers/:id` et ses
// avis sont réservés aux connectés (lot 46).
import { proV2Labels as P, type ProviderPublic, type ProviderReviewsSummary } from "@orasso/shared";

import { ProviderVitrine } from "../components/ProviderVitrine";
import { ReportDialog } from "../components/ReportDialog";
import { api, apiOrThrow, requireMe, safeReturn } from "../lib/api.server";
import "../styles/providers.css";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import type { Route } from "./+types/prestataires";

// Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

export function meta({ loaderData: d }: Route.MetaArgs) {
  return [{ title: `${d?.provider.name ?? P.providerPage} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  // Lot M7, tour 2 : le ✕ revient à l'écran d'origine (`?retour=`, chemin interne seulement).
  const back = safeReturn(new URL(request.url).searchParams.get("retour"), "/app");
  await requireMe(request);
  const id = encodeURIComponent(params.id);
  const [provider, reviews] = await Promise.all([
    apiOrThrow<ProviderPublic>(request, `/providers/${id}`),
    api<ProviderReviewsSummary>(request, `/providers/${id}/reviews`),
  ]);
  return {
    back,
    provider,
    reviews: reviews.ok ? reviews.data : null,
  };
}

export default function Prestataires({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <FicheBar title={P.providerPage} back={loaderData.back} />
      <div className="s-narrow s-stack" data-testid="provider-public">
        <ProviderVitrine provider={loaderData.provider} reviews={loaderData.reviews} />
        {/* Lot R4b, tour 2 : le signalement d'un prestataire (il était sur la fiche de l'événement, qui l'a confié au plateau). */}
        <ReportDialog look="link" targetType="provider" targetId={loaderData.provider.id} />
      </div>
    </>
  );
}

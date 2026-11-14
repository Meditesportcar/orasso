// L'onglet « Prestations » de la page d'un prestataire, sur le site (lot R9h partie 2, T54 ; lot R9b, T25 de l'appli) : la vitrine
// d'aujourd'hui (métier, menu avec les prix, besoins, zone, réalisations, avis des organisateurs), au même endroit pour le propriétaire,
// l'organisateur et le passionné. Lecture seule : on la modifie depuis « Modifier ma vitrine ». Le téléphone et l'e-mail ne sont jamais
// envoyés par l'API aux autres comptes.
import type { ProviderPage } from "@orasso/shared";

import { ProviderVitrine } from "../ProviderVitrine";

export function PagePrestations({ provider }: { provider: ProviderPage }) {
  return (
    <div data-testid="page-prestations">
      <ProviderVitrine provider={provider} reviews={provider.reviews ?? null} />
    </div>
  );
}

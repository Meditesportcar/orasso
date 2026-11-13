// Page d'un prestataire dans l'appli (DA v2, lot 54 ; lot R9b : au gabarit des pages, maquette R9.3 `n-page`) : l'anneau de ses
// stories, « Suivre », trois compteurs, « Publications · Prestations · Mentions ». « Prestations » est la vitrine d'hier (métier, menu,
// besoins, zone, avis, photos), jamais le téléphone ni l'e-mail (l'API ne les envoie pas aux autres comptes).
import { VisitedPage } from "@/features/pages/VisitedPage";

export default function ProviderPage() {
  return <VisitedPage kind="provider" />;
}

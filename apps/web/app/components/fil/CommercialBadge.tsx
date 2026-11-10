// Bandeau « Collaboration commerciale · <pro> » d'une publication (lot R7m2, maquette R7.21 `.r7collabl`) : en tête de la
// carte, avant l'en-tête et la photo, pour qu'on le lise avant le reste. Posé par l'API (jamais retiré) ; il ouvre la
// fiche du pro. Rien sans mention.
import { Icon } from "@orasso/design-system/web";
import { type CommercialPartnerView, partnershipLabels as L } from "@orasso/shared";

export function CommercialBadge({ partner }: { partner: CommercialPartnerView | null }) {
  if (!partner) return null;
  return (
    <a
      className="fil-collab o-t-caption"
      href={`/p/${partner.slug}`}
      aria-label={`${L.commercialLine(partner.name)}. ${L.commercialOpenPro(partner.name)}`}
      data-testid="feed-post-commercial"
    >
      {partner.logoUrl ? (
        <span className="fil-collab__logo" aria-hidden="true">
          <img src={partner.logoUrl} alt="" />
        </span>
      ) : (
        <Icon name="briefcase" size={16} />
      )}
      <span>
        <b>{L.commercialCollaboration}</b>
        {` · ${partner.name}`}
      </span>
    </a>
  );
}

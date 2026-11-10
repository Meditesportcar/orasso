// Bandeau « Collaboration commerciale · <pro> » d'une story (lot R7m2, maquette R7.21 `.r7collabb`) : en tête, sous l'en-tête
// de la visionneuse, texte exact, logo rond du pro. Posé par l'API (jamais retiré, y compris sur la copie du pro) ; le
// bandeau ouvre la fiche du pro. Rien sans mention.
import { Icon } from "@orasso/design-system/web";
import { partnershipLabels as L, type StoryView } from "@orasso/shared";

export function CommercialBadge({ story }: { story: StoryView }) {
  const partner = story.commercialPartner;
  if (!partner) return null;
  // Fiche plus visible (dépubliée, supprimée) : le texte reste, sans lien.
  const slug = partner.slug;
  const Tag = slug ? "a" : "span";
  return (
    <Tag
      className="story-view__commercial o-t-strong"
      {...(slug
        ? {
            href: `/p/${slug}`,
            "aria-label": `${L.commercialLine(partner.name)}. ${L.commercialOpenPro(partner.name)}`,
          }
        : { "aria-disabled": true })}
      data-testid="story-commercial"
    >
      {partner.logoUrl ? (
        <span className="story-view__commercial-logo" aria-hidden="true">
          <img src={partner.logoUrl} alt="" />
        </span>
      ) : (
        <Icon name="briefcase" size={16} />
      )}
      <span>{L.commercialLine(partner.name)}</span>
    </Tag>
  );
}

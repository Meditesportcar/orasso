// Aperçu de la carte « Sponsorisé » du Fil (lot R7k1, administration) : un cadre 4:5, l'image (ou sa place), la mention
// « Sponsorisé » et celle de l'annonceur (« Publicité »), le nom, le titre, le texte et le domaine du lien. Ce n'est pas
// la carte du Fil elle-même (lot R7k2) : un dessin fidèle de ce que l'annonceur y verra.
import { Chip } from "@orasso/design-system/web";
import { adminAppLabels as L } from "@orasso/shared";

export type SponsoredPreviewProps = {
  advertiserName: string;
  title: string;
  body: string;
  imageUrl: string | null;
  disclosure: string | null;
  /** Domaine du lien, affiché pour un annonceur externe. */
  domain: string | null;
  /** Emplacement pas encore créé : l'image s'envoie après la création (sinon : « Pas encore d'image »). */
  isNew?: boolean;
};

export function SponsoredPreview({
  advertiserName,
  title,
  body,
  imageUrl,
  disclosure,
  domain,
  isNew = false,
}: SponsoredPreviewProps) {
  return (
    <figure className="adm-ad" aria-label={L.sponsoredPreview} data-testid="placement-preview">
      <div className="adm-ad__media">
        {imageUrl ? (
          <img src={imageUrl} alt="" />
        ) : (
          <span className="o-t-caption">{isNew ? L.sponsoredPreviewNoImage : L.sponsoredPreviewNoImageYet}</span>
        )}
      </div>
      <div className="adm-ad__body">
        <div className="adm-ad__tags">
          <Chip>{L.sponsoredPreviewBadge}</Chip>
          {disclosure ? <span className="o-t-caption">{disclosure}</span> : null}
        </div>
        <span className="o-t-meta">{advertiserName || "…"}</span>
        <strong className="o-t-poster-m o-never-truncate">{title || "…"}</strong>
        <span className="o-t-caption">{body}</span>
        {domain ? <span className="o-t-caption adm-ad__domain">{domain}</span> : null}
      </div>
    </figure>
  );
}

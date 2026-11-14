// L'emplacement laissé par R9e sous les tags de l'album ouvert (lot R9f, maquette R9.6) : pour le média auteur et l'organisateur,
// « Identifier les voitures · N sur M photos identifiées · Continuer » (« Continuer » ouvre la première photo sans identification dans la
// visionneuse) ; pour une personne identifiée sur l'album, « Voir mes photos » (« Tes photos »). Aucune règle ici : les nombres et les
// droits viennent de l'API.
import { Button, Icon } from "@orasso/design-system/web";
import { albumTagLabels as L } from "@orasso/shared";

import "../../styles/albums.css";

export function IdentifyBanner({
  albumId,
  identified,
  total,
  firstUntagged,
  canIdentify,
  hasMine,
}: {
  albumId: string;
  identified: number;
  total: number;
  /** L'index de la première photo sans identification (`-1` : toutes le sont). */
  firstUntagged: number;
  canIdentify: boolean;
  hasMine: boolean;
}) {
  const done = identified >= total;
  // La visionneuse est celle de la galerie : on ouvre la vignette voulue, comme le ferait un clic.
  const openFirst = () => {
    const thumbs = document.querySelectorAll<HTMLElement>('[data-testid="media-gallery-photo"]');
    thumbs[Math.max(0, firstUntagged)]?.click();
  };
  return (
    <div className="tag-slot" data-testid="album-identify-slot">
      {canIdentify && total > 0 && (
        <div className="tag-banner" data-testid="identify-banner">
          <Icon name="vehicle" size={22} />
          <span className="tag-banner__text">
            <strong>{L.identifyCars}</strong>
            <span className="o-t-caption s-muted" data-testid="identify-banner-count">
              {L.photosIdentified(identified, total)}
            </span>
          </span>
          {!done && (
            <Button
              type="button"
              variant="secondary"
              icon="next"
              onClick={openFirst}
              data-testid="identify-banner-continue"
            >
              {L.continue}
            </Button>
          )}
        </div>
      )}
      {hasMine && (
        <a
          className="tag-banner tag-banner--mine"
          href={`/app/albums/${albumId}/mes-photos`}
          data-testid="album-my-photos-link"
        >
          <Icon name="camera" size={22} />
          <strong className="tag-banner__text">{L.seeMyPhotos}</strong>
          <Icon name="next" size={18} />
        </a>
      )}
    </div>
  );
}

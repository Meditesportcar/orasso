// Le crédit d'une photo reprise d'un album dans le journal de l'événement (lot R9g, T45, maquette R9.8 `r9cr` et `r9ph`) : « Photo : <média> »
// en surimpression de la photo, et le pied « repartagée, crédit non retirable · Voir l'album » (l'album d'origine ; caché s'il n'est plus
// visible). Il ne se retire pas : aucune action ici.
import { Icon } from "@orasso/design-system/web";
import { creditAlbumId, creditLine, type FeedPhotoCredit, eventPhotosLabels as L } from "@orasso/shared";

import "../../styles/albums.css";

/** « Photo : <média> » posé sur le bas de la photo (le parent est positionné). */
export function CreditOverlay({ credit }: { credit?: FeedPhotoCredit | null }) {
  const line = creditLine(credit);
  if (!line) return null;
  return (
    <span className="credit-overlay o-t-caption" data-testid="credit-overlay">
      {line}
    </span>
  );
}

/** Le pied de la carte : « repartagée, crédit non retirable » et « Voir l'album ». */
export function CreditFoot({ credit }: { credit?: FeedPhotoCredit | null }) {
  if (!credit) return null;
  const albumId = creditAlbumId(credit);
  return (
    <p className="credit-foot o-t-caption" data-testid="credit-foot">
      <Icon name="camera" size={14} />
      <span className="credit-foot__text">{L.repostedFoot}</span>
      {albumId ? (
        <a className="credit-foot__link" href={`/albums/${albumId}`} data-testid="credit-album">
          {L.seeCreditAlbum}
          <Icon name="next" size={14} />
        </a>
      ) : null}
    </p>
  );
}

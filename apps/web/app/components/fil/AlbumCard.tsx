// Carte « album » du Fil sur le site (lot R9e, maquette R9.5 `albCard`) : l'en-tête est la page du média (logo, nom, « Média · il y a 1 h »),
// la ligne « présent au <événement> », le corps « Les photos du <événement> · 48 photos » et la mosaïque, « Voir l'album » en pied. **Sans flamme ni
// commentaire** (un album n'est pas une publication). L'API ne sert cette carte qu'à qui envoie `?cards=album`.
import { Icon } from "@orasso/design-system/web";
import { type AlbumCardView, feedAgo, albumLabels as L } from "@orasso/shared";

import "../../styles/albums.css";
import { AlbumCover } from "../albums/AlbumCover";
import { AttachLine } from "./AttachLine";
import { type CardProps, OrgLogo, Shell } from "./Shell";

/** Le corps de la carte (aussi « Ce que verront les autres » dans « Nouvel album »). */
export function AlbumCardBody({ album }: { album: AlbumCardView }) {
  return (
    <div className="s-stack s-stack--tight">
      <AttachLine attach={album.attach} />
      <p className="o-t-body" data-testid="feed-album-title">
        <strong>{album.title}</strong>
        {` · ${L.photosCount(album.photosCount)}`}
      </p>
      <AlbumCover photos={album.cover} label={L.coverAlt(album.title)} testId="feed-album-cover" />
    </div>
  );
}

export function AlbumCard({ card, onMenu, faded }: CardProps<"album">) {
  const album = card.payload.album;
  return (
    <Shell
      card={card}
      head={<OrgLogo url={album.author.avatarUrl} name={album.author.name} />}
      title={album.author.name}
      reasonText={`${L.mediaTag} · ${feedAgo(card.at, new Date())}`}
      href={`/m/${album.author.key.slice(2)}`}
      onMenu={onMenu}
      faded={faded}
      actions={
        <a className="fil-link" href={`/albums/${album.id}`} data-testid="feed-album-open">
          <Icon name="next" size={16} /> {L.seeAlbum}
        </a>
      }
    >
      <AlbumCardBody album={album} />
    </Shell>
  );
}

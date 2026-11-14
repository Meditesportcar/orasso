// Où vivent les photos où je suis identifié (lot R9f, T42, maquette R9.7), comme dans l'appli : la fiche de la voiture (« Vu au <événement> · N
// photos »), la sortie passée (« Photos de ma voiture · N · <média> »), le souvenir (« N photos de ta <voiture> · <média> », « Revoir mes
// photos »). Une mention = un album : six vignettes au plus, le nom du média en pastille, « Voir les N photos » (« Tes photos » si c'est ma
// voiture, sinon l'album). Jamais des publications. Rien tant qu'aucune identification n'est visible.
import { Button, Icon } from "@orasso/design-system/web";
import { type AlbumMention, albumTagLabels as L, mentionsSummary, reviewButtonsOf } from "@orasso/shared";

import "../../styles/albums.css";

const pathOf = (m: AlbumMention, mine: boolean) =>
  mine ? `/app/albums/${m.albumId}/mes-photos` : `/albums/${m.albumId}`;

export function AlbumMentionsBlock({
  mentions,
  mine,
  outing = false,
}: {
  mentions: readonly AlbumMention[] | undefined;
  mine: boolean;
  outing?: boolean;
}) {
  if (!mentions || mentions.length === 0) return null;
  return (
    <div className="s-stack s-stack--tight" data-testid={outing ? "outing-album-photos" : "vehicle-album-mentions"}>
      {mentions.map((m) => (
        <section key={m.albumId} className="mention" data-testid="album-mention">
          <div className="mention__head">
            <Icon name="camera" size={16} />
            <strong data-testid="album-mention-title">{outing ? L.photosOfMyCar : L.seenAt(m.eventTitle)}</strong>
            <span className="o-t-caption s-muted" data-testid="album-mention-count">
              {outing ? `${m.count} · ${m.mediaName}` : L.screens.seenAtCount(m.count)}
            </span>
          </div>
          <div className="mention__rail" data-testid="album-mention-rail">
            {m.photos.map((p) => (
              <a
                key={p.id}
                className="mention__thumb"
                href={pathOf(m, mine || outing)}
                aria-label={`${L.seeCountPhotos(m.count)} · ${m.mediaName}`}
                data-testid="album-mention-thumb"
              >
                <img src={p.url} alt="" loading="lazy" />
                <span className="mention__pill">{m.mediaName}</span>
              </a>
            ))}
          </div>
          <div>
            <Button variant="secondary" icon="next" href={pathOf(m, mine || outing)} data-testid="album-mention-open">
              {L.seeCountPhotos(m.count)}
            </Button>
          </div>
        </section>
      ))}
    </div>
  );
}

/** Le souvenir : « N photos de ta <voiture> · <média> » et « Revoir mes photos ». */
export function MemoryAlbumLine({
  albumPhotos,
  carLabel,
  testId = "memory-album",
}: {
  albumPhotos: readonly AlbumMention[] | undefined;
  carLabel: string | null;
  testId?: string;
}) {
  const s = mentionsSummary(albumPhotos, carLabel);
  const albums = albumPhotos ?? [];
  if (!s || albums.length === 0) return null;
  return (
    <div className="s-stack s-stack--tight">
      <p className="o-t-caption s-muted" data-testid={testId}>
        {s.line}
      </p>
      {/* Un lien par album : le souvenir peut en annoncer plusieurs, chacun s'ouvre. */}
      {reviewButtonsOf(albums).map((b) => (
        <div key={b.albumId}>
          <Button
            variant="secondary"
            icon="camera"
            href={`/app/albums/${b.albumId}/mes-photos`}
            data-testid={`${testId}-open`}
          >
            {b.label}
          </Button>
        </div>
      ))}
    </div>
  );
}

// Fiche d'un média (lot 57) : ce que voient les connectés et les organisations quand ils trient une demande
// d'accréditation (nom, formats, présentation, liens, zone couverte, « Profil vérifié »). `GET /media/:id` est réservé
// aux connectés (lot 45) : la fiche vit dans l'espace connecté, comme les profils (`/u/:pseudo`).
import { Button, Chip, ChipRow, Plate } from "@orasso/design-system/web";
import {
  instagramHandle,
  instagramUrl,
  mediaAppLabels as L,
  type MediaContentView,
  type MediaPublic,
  mediaFormatLabels,
  type Page,
} from "@orasso/shared";

import { PhotoGallery } from "../components/PhotoGallery";
import { api, apiOrThrow, requireMe, safeReturn } from "../lib/api.server";
import { type CursorChunk, cursorParam, loadChunk, useCursorList } from "../lib/useCursorList";
import "../styles/media.css";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import type { Route } from "./+types/m";

// Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

export function meta({ loaderData: d }: Route.MetaArgs) {
  return [{ title: `${d?.media.name ?? "Média"} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  // Lot M7, tour 2 : le ✕ revient à l'écran d'origine (`?retour=`, chemin interne seulement).
  const back = safeReturn(new URL(request.url).searchParams.get("retour"), "/app");
  await requireMe(request);
  const id = encodeURIComponent(params.id);
  const media = await apiOrThrow<MediaPublic>(request, `/media/${id}`);
  // Contenus publiés (relecture du lot 57) : une page par appel, au curseur de l'API (`?cursor=`), 20 par page
  // (`?taille=` : de 1 à 20, pour alléger la page). « Voir la suite » charge la suivante, sans plafond de pages.
  const url = new URL(request.url);
  const size = Math.min(PAGE_SIZE, Math.max(1, Math.floor(Number(url.searchParams.get("taille"))) || PAGE_SIZE));
  const cursor = cursorParam(url);
  const chunk = await loadChunk<MediaContentView>(cursor, async (c) => {
    const res = await api<Page<MediaContentView>>(
      request,
      `/media/${id}/contents?limit=${size}${c ? `&cursor=${encodeURIComponent(c)}` : ""}`,
    );
    return res.ok ? res.data : null;
  });
  return {
    back,
    media,
    chunk,
    size,
  };
}

const PAGE_SIZE = 20;

/** Adresse de la fiche, à un curseur donné (liste « Voir la suite » et « Réessayer »). */
function pageHref(id: string, size: number, cursor: string): string {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (size !== PAGE_SIZE) params.set("taille", String(size));
  const query = params.toString();
  return `/m/${id}${query ? `?${query}` : ""}`;
}
export default function MediaPage({ loaderData }: Route.ComponentProps) {
  const m = loaderData.media;
  const ig = instagramUrl(m.instagram);
  return (
    <>
      <FicheBar heading={false} title="Média" back={loaderData.back} />
      <div className="s-narrow s-stack" data-testid="media-public">
        <div className="s-row">
          {m.logoUrl && <img className="md-logo" src={m.logoUrl} alt="" />}
          <div className="s-stack s-stack--tight">
            <h1 className="s-title o-never-truncate">{m.name}</h1>
            <ChipRow className="s-chips-wrap">
              {m.verified && <Chip variant="verified">{L.profileVerified}</Chip>}
              {m.formats.map((f) => (
                <Chip key={f}>{mediaFormatLabels[f]}</Chip>
              ))}
            </ChipRow>
          </div>
        </div>
        {m.description && <p className="s-prewrap">{m.description}</p>}
        <Plate className="s-stack s-stack--tight">
          <div className="o-t-label">{L.profileCover}</div>
          <p>{m.departments.length ? m.departments.join(", ") : L.profileCoverAll}</p>
        </Plate>
        <div className="s-row">
          {m.website && (
            <Button variant="secondary" icon="explore" href={m.website} target="_blank" rel="noreferrer">
              {L.profileWebsite}
            </Button>
          )}
          {ig && (
            <Button variant="secondary" icon="instagram" href={ig} target="_blank" rel="noreferrer">
              {instagramHandle(m.instagram) ?? L.profileInstagram}
            </Button>
          )}
          {m.youtube && (
            <Button variant="secondary" icon="live" href={m.youtube} target="_blank" rel="noreferrer">
              {L.profileYoutube}
            </Button>
          )}
        </div>
        <MediaContents
          key={`${m.id}:${loaderData.chunk.cursor}:${loaderData.size}`}
          mediaId={m.id}
          first={loaderData.chunk}
          size={loaderData.size}
        />{" "}
      </div>
    </>
  );
}

type LoaderData = Awaited<ReturnType<typeof loader>>;

/** Contenus publiés : toutes les photos d'une galerie, « Voir la suite » au curseur, panne avec « Réessayer ». */
function MediaContents({
  mediaId,
  first,
  size,
}: {
  mediaId: string;
  first: CursorChunk<MediaContentView>;
  size: number;
}) {
  const list = useCursorList<MediaContentView, LoaderData>(
    first,
    (cursor) => pageHref(mediaId, size, cursor),
    (data) => data.chunk,
  );
  if (list.items.length === 0 && !list.failed) return null;
  return (
    <section className="s-stack" aria-labelledby="m-contents" data-testid="media-public-contents">
      <h2 id="m-contents" className="s-h2">
        {L.contents}
        {list.items.length > 0 && (
          <>
            {" · "}
            {list.items.length}
            {list.to !== null && !list.failed ? "+" : ""}
          </>
        )}
      </h2>
      {list.items.map((c) => (
        <article key={c.id} className="s-card s-stack s-stack--tight" data-testid="media-public-content">
          <div className="o-t-label s-label">
            {L.kindOf(c)} · <a href={`/e/${c.event.slug}`}>{c.event.title}</a>
          </div>
          <h3 className="s-h2 o-never-truncate">
            {c.url ? (
              <a href={c.url} target="_blank" rel="noreferrer">
                {c.title}
              </a>
            ) : (
              c.title
            )}
          </h3>
          {c.kind === "gallery" && c.photos.length > 0 && (
            <>
              <PhotoGallery photos={c.photos} />
              <div className="o-t-caption s-muted">{L.galleryStats(c.photos.length)}</div>
            </>
          )}
        </article>
      ))}
      {list.failed && (
        <Plate className="s-stack s-stack--tight" role="alert" data-testid="media-public-error">
          <strong>{L.contentsErrorTitle}</strong>
          <p>{L.contentsErrorText}</p>
          <div>
            <Button
              icon="undo"
              href={pageHref(mediaId, size, list.to ?? first.cursor)}
              onClick={(e) => {
                e.preventDefault();
                list.load();
              }}
              data-testid="media-public-retry"
            >
              {L.contentsRetry}
            </Button>
          </div>
        </Plate>
      )}
      {list.to !== null && !list.failed && (
        <div>
          <Button
            variant="secondary"
            icon="down"
            href={pageHref(mediaId, size, list.to)}
            onClick={(e) => {
              e.preventDefault();
              list.load();
            }}
            data-testid="media-public-more"
          >
            {L.exploreMore}
          </Button>
        </div>
      )}
    </section>
  );
}

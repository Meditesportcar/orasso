// La page d'un média (`/m/<id>`) vue par un connecté (lot 57 ; lot R9h partie 2, T54, maquette R9.3 `n-page`, vue « Un visiteur »), au gabarit
// de la page d'une structure et de la fiche d'un pro (R8g) : le logo dans l'anneau de ses stories, le nom (jamais tronqué), « Média » et
// « Média vérifié », « Suivre » (le seul bouton principal) ou « Suivi », la bio sur une ligne, « Plus » (Partager, « Modifier » pour son
// propriétaire), la bande « abonnés · albums · photos » ; puis « Publications » (ouvert par défaut quand il y en a), « Albums » (ses albums
// publiés, puis ses liens) et « Mentions · N ». Les formats, la zone couverte et les réseaux d'hier restent sous l'en-tête, au-dessus des
// onglets. « Suivre » écrit l'abonnement de la casquette portée par l'adresse (`?auteur=`, T48) : vu depuis l'espace d'une casquette, c'est
// la page qui suit (T6 et T14). `GET /media/:id` est réservé aux connectés (lot 45) : la page vit dans l'espace connecté.
import { Button, Chip, ChipRow, Plate } from "@orasso/design-system/web";
import {
  type AlbumsList,
  albumLabels,
  authorKeyOf,
  instagramHandle,
  instagramUrl,
  isOwnPage,
  mediaAppLabels as L,
  type MediaContentView,
  type MediaPage as MediaPageData,
  mediaFormatLabels,
  PAGE_TAB_PARAM,
  type Page,
  type PageFollowResult,
  pageCounters,
  pageMentionsCount,
  pagePublicationsCount,
  pageShownTab,
  pagesLabels,
  pageTabs,
  profileRingState,
  type WithPageExtras,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { ActorOnPage } from "../components/casquette/ActorOnPage";
import { PageAlbums } from "../components/pages/PageAlbums";
import { PageFollow } from "../components/pages/PageFollow";
import { PageHead } from "../components/pages/PageHead";
import { PageMentions } from "../components/pages/PageMentions";
import { PageMore } from "../components/pages/PageMore";
import { PagePublications } from "../components/pages/PagePublications";
import { mentionsShown, PageTabs } from "../components/pages/PageTabs";
import { ShareButtons } from "../components/ShareButtons";
import { ActorIfAny, casquetteOfParam, withoutActorParam } from "../lib/actor";
import { api, apiOrThrow, originOf, requireMe, safeReturn } from "../lib/api.server";
import { type CursorChunk, cursorParam, loadChunk, useCursorList } from "../lib/useCursorList";
import "../styles/albums.css";
import "../styles/media.css";
import "../styles/pages.css";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import type { Route } from "./+types/m";

// Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

export function meta({ loaderData: d }: Route.MetaArgs) {
  return [{ title: `${d?.media.name ?? "Média"} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const url = new URL(request.url);
  // Lot M7, tour 2 : le ✕ revient à l'écran d'origine (`?retour=`, chemin interne seulement).
  const back = safeReturn(url.searchParams.get("retour"), "/app");
  const me = await requireMe(request);
  const id = encodeURIComponent(params.id);
  // Lot R9h (T48) : la casquette qui regarde est portée par l'adresse (`?auteur=`), revérifiée ici et par l'API.
  const casquette = casquetteOfParam(url.searchParams.get("auteur"), me.personas);
  const actor = casquette?.key ?? null;
  // « En mon nom » : la même adresse sans `auteur` (onglet, retour et curseur restent).
  const ownHref = withoutActorParam(url);
  const media = await apiOrThrow<WithPageExtras<MediaPageData>>(request, `/media/${id}`, { actor });
  const owner = me.personas.some((p) => p.kind === "media" && p.id === media.id);
  const tab = pageShownTab("media", {
    raw: url.searchParams.get(PAGE_TAB_PARAM),
    counts: { publications: pagePublicationsCount(media) },
    session: true,
  });
  // Lot R9e : les albums publiés (une page, la suite se charge au clic) ; les photos viennent d'une route protégée (session).
  // Tour 1 de la partie 2 : albums et liens ne se lisent que pour l'onglet « Albums » (les autres onglets n'en ont pas besoin).
  const albumsRes =
    tab === "albums" ? await api<AlbumsList>(request, `/media/${id}/albums?limit=${ALBUMS_PAGE}`) : null;
  const albums = albumsRes?.ok ? albumsRes.data : null;
  // Contenus publiés (relecture du lot 57) : une page par appel, au curseur de l'API (`?cursor=`), 20 par page
  // (`?taille=` : de 1 à 20, pour alléger la page). « Voir la suite » charge la suivante, sans plafond de pages.
  const size = Math.min(PAGE_SIZE, Math.max(1, Math.floor(Number(url.searchParams.get("taille"))) || PAGE_SIZE));
  const cursor = cursorParam(url);
  const chunk: CursorChunk<MediaContentView> =
    tab === "albums"
      ? await loadChunk<MediaContentView>(cursor, async (c) => {
          const res = await api<Page<MediaContentView>>(
            request,
            `/media/${id}/contents?kind=link&limit=${size}${c ? `&cursor=${encodeURIComponent(c)}` : ""}`,
          );
          return res.ok ? res.data : null;
        })
      : { items: [], next: null, failed: false, cursor: "" };
  return {
    back,
    media,
    owner,
    actor,
    casquette,
    ownHref,
    retour: url.searchParams.get("retour") ? back : null,
    tab,
    origin: originOf(request),
    albums,
    chunk,
    size,
  };
}

const PAGE_SIZE = 20;
const ALBUMS_PAGE = 20;

/**
 * Adresse de la fiche, à un curseur donné (liste « Voir la suite » et « Réessayer ») : l'onglet « Albums » (le seul qui lit les liens) et la
 * casquette (`auteur`) restent dans l'adresse, sinon la suite se lirait sous un autre onglet ou au nom d'une autre casquette.
 */
function pageHref(id: string, size: number, cursor: string, actor: string | null, back: string | null): string {
  const params = new URLSearchParams();
  params.set(PAGE_TAB_PARAM, "albums");
  if (actor) params.set("auteur", actor);
  if (back) params.set("retour", back);
  if (cursor) params.set("cursor", cursor);
  if (size !== PAGE_SIZE) params.set("taille", String(size));
  const query = params.toString();
  return `/m/${id}${query ? `?${query}` : ""}`;
}

export default function MediaPage({ loaderData }: Route.ComponentProps) {
  const { media: m, owner, actor, casquette, ownHref, retour, tab, origin } = loaderData;
  const ig = instagramUrl(m.instagram);
  const [follow, setFollow] = useState({ following: m.isFollowing, followers: m.followersCount });
  const [mentionsDelta, setMentionsDelta] = useState(0);
  // Le nombre servi fait foi : la correction locale repart de zéro à chaque nombre neuf ou autre page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chaque réponse servie neuve remet l'état à zéro
  useEffect(() => {
    setFollow({ following: m.isFollowing, followers: m.followersCount });
    setMentionsDelta(0);
  }, [m]);
  const path = `/m/${m.id}`;
  // La casquette qui regarde reste dans l'adresse des onglets.
  // `retour` (le ✕ de la fiche) reste aussi dans l'adresse des onglets.
  const tabQuery = new URLSearchParams();
  if (actor) tabQuery.set("auteur", actor);
  if (retour) tabQuery.set("retour", retour);
  const tabQueryText = tabQuery.toString();
  const tabPath = tabQueryText ? `${path}?${tabQueryText}` : path;
  const key = authorKeyOf("media", m.id);
  // Pas de « Suivre » sur sa propre page : avec une casquette, c'est la clé de la casquette qui compte (la structure de Sarah peut suivre le
  // média ou le prestataire de Sarah : deux pages distinctes) ; sans casquette, le propriétaire de la page (on ne se suit pas soi-même).
  const selfPage = isOwnPage({ actorKey: actor, pageKey: key, owner });
  const tabs = pageTabs("media", {
    session: true,
    mentionsCount: mentionsShown(pageMentionsCount(m), mentionsDelta),
  });
  const counters = pageCounters("media", {
    followers: follow.followers,
    albums: m.albumsCount ?? null,
    photos: m.photosCount ?? null,
  });
  return (
    <ActorIfAny casquette={casquette}>
      <FicheBar heading={false} title="Média" back={loaderData.back} />
      <div className="s-narrow s-stack pg-page" data-testid="media-public">
        {casquette ? <ActorOnPage casquette={casquette} ownHref={ownHref} /> : null}
        <PageHead
          testId="media-head"
          name={m.name}
          logoUrl={m.logoUrl}
          ring={profileRingState(m.stories)}
          storiesHref={(m.stories?.count ?? 0) > 0 ? `/app/story/${encodeURIComponent(key)}` : undefined}
          typeLabel={pagesLabels.typeMedia}
          verifiedLabel={m.verified ? pagesLabels.verifiedMedia : null}
          follow={
            selfPage ? null : (
              <PageFollow
                targetKey={key}
                actor={actor}
                actorName={casquette?.name}
                following={follow.following}
                onDone={(r: PageFollowResult) => setFollow({ following: r.following, followers: r.followersCount })}
              />
            )
          }
          bio={m.description}
          side={
            <PageMore>
              <div className="s-stack s-stack--tight">
                <ShareButtons url={`${origin}${path}`} title={`${m.name} sur Orasso`} />
                {owner ? (
                  <a className="s-linkbutton o-t-button" href="/app/media/page" data-testid="page-edit">
                    {pagesLabels.edit}
                  </a>
                ) : null}
              </div>
            </PageMore>
          }
          counters={counters}
        />
        {m.formats.length > 0 ? (
          <ChipRow className="s-chips-wrap">
            {m.formats.map((f) => (
              <Chip key={f}>{mediaFormatLabels[f]}</Chip>
            ))}
          </ChipRow>
        ) : null}
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

        <PageTabs value={tab} items={tabs} path={tabPath} />

        {tab === "albums" ? (
          <PageAlbums mediaId={m.id} owner={false} first={loaderData.albums} counts={m}>
            <MediaContents
              key={`${m.id}:${loaderData.chunk.cursor}:${loaderData.size}`}
              mediaId={m.id}
              first={loaderData.chunk}
              size={loaderData.size}
              actor={actor}
              back={retour}
            />
          </PageAlbums>
        ) : tab === "publications" ? (
          <PagePublications
            authorKey={key}
            name={m.name}
            path={tabPath}
            withFilter={false}
            filter="all"
            total={pagePublicationsCount(m) ?? null}
            session
            publicFirst={null}
          />
        ) : (
          <PageMentions
            pageKey={key}
            pageName={m.name}
            manage={owner}
            onHiddenChange={(d) => setMentionsDelta((v) => v + d)}
          />
        )}
      </div>
    </ActorIfAny>
  );
}

type LoaderData = Awaited<ReturnType<typeof loader>>;

/** Contenus publiés : les liens d'un média, « Voir la suite » au curseur, panne avec « Réessayer ». */
function MediaContents({
  mediaId,
  first,
  size,
  actor,
  back,
}: {
  mediaId: string;
  first: CursorChunk<MediaContentView>;
  size: number;
  actor: string | null;
  /** Le `retour` de l'adresse (le ✕ de la fiche), gardé par « Voir la suite » et « Réessayer ». */
  back: string | null;
}) {
  const list = useCursorList<MediaContentView, LoaderData>(
    first,
    (cursor) => pageHref(mediaId, size, cursor, actor, back),
    (data) => data.chunk,
  );
  // Lot R9e : les galeries sont des albums (section « Albums ») ; ici, les liens seulement (`kind=link` : l'API pagine les liens seuls,
  // chaque « Voir la suite » ajoute des liens).
  const links = list.items;
  if (links.length === 0 && !list.failed) return null;
  return (
    <section className="s-stack" aria-labelledby="m-contents" data-testid="media-public-contents">
      <h2 id="m-contents" className="s-h2">
        {albumLabels.links}
        {links.length > 0 && (
          <>
            {" · "}
            {links.length}
            {list.to !== null && !list.failed ? "+" : ""}
          </>
        )}
      </h2>
      {links.map((c) => (
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
        </article>
      ))}
      {list.failed && (
        <Plate className="s-stack s-stack--tight" role="alert" data-testid="media-public-error">
          <strong>{L.contentsErrorTitle}</strong>
          <p>{L.contentsErrorText}</p>
          <div>
            <Button
              icon="undo"
              href={pageHref(mediaId, size, list.to ?? first.cursor, actor, back)}
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
            href={pageHref(mediaId, size, list.to, actor, back)}
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

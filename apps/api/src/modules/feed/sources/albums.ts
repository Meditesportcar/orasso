// Source « Album » du Fil (lot R9e, T33) : un album publié par un média accrédité est une carte à part, **pas une publication** (ni
// flamme, ni commentaire en R9e : un album n'est pas une publication). Albums publiés des 30 derniers jours, visibles de tous (même
// règle que la page du média : accréditation toujours `accepted`, média et compte en règle, événement ni brouillon ni sur invitation).
// - « Abonnements » : les abonnés de la page du média (`page_follows`, personnes ; une page lit ce que la page suit) ;
// - « Autour de moi » : le département de l'événement ;
// - « Pour toi » : tous, notés comme une publication (fraîcheur, proximité, affinité), plus l'avantage « ma sortie ».
// La carte porte la page du média (jamais le compte derrière : `authorId` est nul), l'événement (« présent au … », rôle `on_site`
// déduit de l'accréditation), le nombre de photos et la mosaïque. Carte vue : `album:<id>`.
//
// **APK en ligne** : un genre de carte inconnu y rend `UnknownCard`, une carte **visible** (le genre et « carte non gérée ») : la carte
// n'est donc servie qu'aux clients qui envoient `?cards=album` (le nouveau client le fait, sur `GET /fil` et `GET /fil/fresh`). La
// demande est lue par un middleware (`albumCardsMiddleware`, monté sur `/fil`) et gardée le temps de la requête.
import { AsyncLocalStorage } from "node:async_hooks";
import {
  ALBUM_COVER_PHOTOS,
  type AlbumCardView,
  albumTitle,
  attachPhase,
  authorKeyOf,
  type FeedAttachView,
  type FeedAuthorView,
} from "@orasso/shared";
import { and, desc, type SQL, sql } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";

import { db } from "../../../db/client";
import { eventAlbums, events, mediaProfiles } from "../../../db/schema";
import { storage } from "../../../lib/storage";
import { type AlbumJoin, albumBase, albumVisibleSql, loadFirstPhotos, photoView } from "../../albums/view";
import {
  atBounds,
  atMs,
  type FeedSource,
  inDepartments,
  type LoadedCard,
  type SourceInput,
  type SourceResult,
  sliceRows,
  tsParam,
} from "./types";

const DAY_MS = 86_400_000;
/** Un album compte dans le Fil pendant 30 jours. */
const ALBUM_WINDOW_MS = 30 * DAY_MS;

// --- `?cards=album` ----------------------------------------------------------------------------------------------------------

const requested = new AsyncLocalStorage<ReadonlySet<string>>();

/** Lit `?cards=` (genres que le client sait dessiner, séparés par des virgules) et le garde pour la suite de la requête. */
export const albumCardsMiddleware: MiddlewareHandler = (c, next) => {
  const wanted = new Set(
    (c.req.query("cards") ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
  );
  return requested.run(wanted, next);
};

/** Le client de cette requête a-t-il demandé la carte « album » ? */
export const albumCardsRequested = (): boolean => requested.getStore()?.has("album") === true;

/** Tests : exécute `fn` comme une requête qui envoie `?cards=<cards>`. */
export const withRequestedCards = <T>(cards: readonly string[], fn: () => Promise<T>): Promise<T> =>
  requested.run(new Set(cards), fn);

// --- La source ---------------------------------------------------------------------------------------------------------------

type Row = AlbumJoin;

/** La personne (ou la page qui lit) suit la page de ce média, en SQL. */
function mediaFollowedSql(input: Pick<SourceInput, "page" | "userId" | "ctx">): SQL {
  if (input.page) {
    const ids = input.ctx.followedMedias;
    return ids?.size ? sql`${eventAlbums.mediaProfileId} = any(${sql.param([...ids])}::uuid[])` : sql`false`;
  }
  return sql`exists (select 1 from page_follows pg where pg.follower_kind = 'user' and pg.follower_id = ${input.userId}
    and pg.target_kind = 'media' and pg.target_id = ${eventAlbums.mediaProfileId}::text)`;
}

const authorOf = (m: Row["m"]): FeedAuthorView => ({
  key: authorKeyOf("media", m.id),
  kind: "media",
  name: m.name,
  avatarUrl: storage.url(m.logoKey),
  verified: m.pressCardVerifiedAt !== null,
  // Pour une page, `pseudo = name` et pas de grade (comme les autres pages du Fil).
  pseudo: m.name,
  grade: null,
  official: false,
});

const attachOf = (e: Row["e"], ref: Date): FeedAttachView => ({
  event: {
    id: e.id,
    slug: e.slug,
    title: e.title,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    city: e.city,
  },
  // L'album n'existe (et n'est servi) que tant que le média est accrédité : le rôle est toujours « sur place ».
  role: "on_site",
  phase: attachPhase(e, ref),
  presenceValidated: false,
});

/** Les cartes de ces albums (une seule requête pour toutes les mosaïques). */
export async function albumCards(
  rows: Row[],
  userId: string,
  ref: Date,
  page?: SourceInput["page"],
): Promise<LoadedCard<"album">[]> {
  if (!rows.length) return [];
  const covers = await loadFirstPhotos(
    db,
    rows.map((r) => r.a.id),
    ALBUM_COVER_PHOTOS,
  );
  return rows.map(({ a, e, m }): LoadedCard<"album"> => {
    const view: AlbumCardView = {
      id: a.id,
      title: albumTitle(a.title, e.title),
      photosCount: a.photosCount,
      author: authorOf(m),
      attach: attachOf(e, ref),
      cover: (covers.get(a.id) ?? []).map((p) => photoView(a.id, p)),
      official: a.officialAt !== null,
    };
    return {
      id: `album:${a.id}`,
      kind: "album",
      at: a.publishedAt as Date,
      department: e.department || null,
      // Une page n'a pas d'auteur dans le Fil : « Abonnements » suit la page du média (`mediaId`), jamais le compte derrière.
      authorId: null,
      structureId: null,
      proId: null,
      mediaId: m.id,
      categoryIds: [],
      eventId: e.id,
      mine: page ? page.kind === "media" && page.id === m.id : m.userId === userId,
      authorPseudo: m.name,
      payload: { album: view },
    };
  });
}

export const source: FeedSource<"album"> = {
  kind: "album",
  async load(input: SourceInput): Promise<SourceResult<"album">> {
    if (!albumCardsRequested()) return { cards: [], more: false, tail: null };
    const atExpr = atMs(sql`${eventAlbums.publishedAt}`);
    const filters: (SQL | undefined)[] = [
      sql`${eventAlbums.status} = 'published'`,
      sql`${eventAlbums.deletedAt} is null`,
      sql`${eventAlbums.photosCount} > 0`,
      albumVisibleSql(input.ref),
      sql`${eventAlbums.publishedAt} <= ${tsParam(input.ref)}`,
      sql`${eventAlbums.publishedAt} > ${tsParam(new Date(input.ref.getTime() - ALBUM_WINDOW_MS))}`,
      input.filter === "following" ? mediaFollowedSql(input) : undefined,
      input.filter === "nearby" ? inDepartments(sql`nullif(${events.department}, '')`, input.nearby) : undefined,
      input.excludeMine
        ? input.page
          ? input.page.kind === "media"
            ? sql`${eventAlbums.mediaProfileId} <> ${input.page.id}::uuid`
            : undefined
          : sql`${mediaProfiles.userId} <> ${input.userId}`
        : undefined,
      ...atBounds(atExpr, sql`${eventAlbums.id}`, "album", input),
    ];
    const raw = await albumBase()
      .where(and(...filters))
      .orderBy(desc(atExpr), desc(eventAlbums.id))
      .limit(input.limit + 1);
    const { rows, more, tail } = sliceRows(raw, input.limit, (r) => ({
      at: r.a.publishedAt as Date,
      id: `album:${r.a.id}`,
    }));
    return { cards: await albumCards(rows, input.userId, input.ref, input.page), more, tail };
  },
};

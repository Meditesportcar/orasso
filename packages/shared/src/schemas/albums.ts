import { z } from "zod";
import type { AlbumTagView } from "./albumTags";
import type { FeedAttachView, FeedAuthorView } from "./feed";
import { plateRectsSchema } from "./vehicle";

// Albums des médias rattachés à un événement (vague R9, lot R9e, ARCHITECTURE-R8 § 1.10) : un album est publié par un média
// accrédité (`accepted`) à l'événement ; ses photos ne deviennent jamais des publications. Le floutage de plaque est
// **proposé** photo par photo (D28), jamais imposé : l'état de chaque photo est gardé (`plate_state`), mais jamais servi.

export const ALBUM_TITLE_MAX = 80;

/** Un brouillon jamais publié est purgé après ce délai (tâche quotidienne `albums.draft-purge`). */
export const ALBUM_DRAFT_TTL_DAYS = 7;

/** Quatre photos de couverture (la mosaïque). */
export const ALBUM_COVER_PHOTOS = 4;

export const albumStatuses = ["draft", "published"] as const;
export type AlbumStatus = (typeof albumStatuses)[number];

/**
 * Ce que le média décide pour une photo, au moment de l'ajouter : flouter la plaque repérée (`blurred`), l'envoyer telle
 * quelle (`kept`), ou aucune plaque repérée par l'appareil (`none`). `unknown` : photo reprise d'une ancienne galerie.
 */
export const albumPlateDecisions = ["blurred", "kept", "none"] as const;
export type AlbumPlateDecision = (typeof albumPlateDecisions)[number];
export const albumPlateStates = [...albumPlateDecisions, "unknown"] as const;
export type AlbumPlateState = (typeof albumPlateStates)[number];

const title = z.string().trim().max(ALBUM_TITLE_MAX);

/** `POST /me/albums` : un brouillon (un par événement et par média). */
export const albumCreateSchema = z.object({
  eventId: z.uuid(),
  title: title.nullish().transform((v) => (v ? v : null)),
  allowSave: z.boolean().optional(),
  clientId: z.uuid().optional(),
});
export type AlbumCreate = z.infer<typeof albumCreateSchema>;

/** `PATCH /me/albums/:id` : le titre (vide = le titre par défaut) et l'option « Enregistrer ». */
export const albumPatchSchema = z
  .object({
    title: title.nullish().transform((v) => (v === undefined ? undefined : v ? v : null)),
    allowSave: z.boolean().optional(),
  })
  .refine((v) => v.title !== undefined || v.allowSave !== undefined, "Rien à modifier");
export type AlbumPatch = z.infer<typeof albumPatchSchema>;

/**
 * `POST /me/albums/:id/photos` : une photo à la fois. `uploadKey` vient de `POST /me/uploads purpose=album_photo`. Les cadres
 * de plaque sont obligatoires pour `blurred` (floutés à l'envoi) et `kept` (gardés pour flouter une copie plus tard) ; ils
 * sont absents pour `none`. `clientId` rend l'ajout rejouable (unique par album).
 */
export const albumPhotoAddSchema = z
  .object({
    uploadKey: z.string().min(1).max(200),
    plateDecision: z.enum(albumPlateDecisions),
    plateRects: plateRectsSchema.nullish(),
    clientId: z.uuid(),
  })
  .superRefine((v, ctx) => {
    const hasRects = Boolean(v.plateRects?.length);
    if (v.plateDecision === "none" && hasRects) {
      ctx.addIssue({ code: "custom", path: ["plateRects"], message: "Aucune plaque repérée : pas de cadre" });
    }
    if (v.plateDecision !== "none" && !hasRects) {
      ctx.addIssue({ code: "custom", path: ["plateRects"], message: "Cadres de plaque attendus" });
    }
  });
export type AlbumPhotoAdd = z.infer<typeof albumPhotoAddSchema>;

/** `GET /me/albums?status=&limit=&cursor=` : les miens, brouillons compris, par pages (le curseur est l'identifiant du dernier album lu). */
export const albumsMineQuery = z.object({
  status: z.enum(albumStatuses).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.uuid().optional(),
});
export type AlbumsMineQuery = z.infer<typeof albumsMineQuery>;

/** `GET /media/:id/albums?cursor=&limit=` et `GET /events/:id/albums` : publiés, pagination par identifiant d'album. */
export const albumsListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.uuid().optional(),
});
export type AlbumsListQuery = z.infer<typeof albumsListQuery>;

// --- Vues -------------------------------------------------------------------------------------------------------------

/** Une photo d'album. `width` et `height` sont nuls pour une photo reprise d'une ancienne galerie (dimensions inconnues). */
export type AlbumPhotoView = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  position: number;
  /**
   * Lot R9f : les identifications visibles de cette photo (`GET /albums/:id` seulement, jamais dans une liste ni sans session).
   * Seulement celles que la personne connectée a le droit de voir (`canSeeTag`) ; **absent** hors de l'album ouvert et sur une photo sans
   * identification visible (la forme de R9e est gardée).
   */
  tags?: AlbumTagView[];
};

/**
 * Un album sans ses photos (liste) : la page du média (`m:<id>`, jamais le compte derrière), l'événement, la mosaïque. Ni
 * `plate_state`, ni `plate_rects`, ni `author_id`, ni le pseudo du titulaire (liste blanche, vie privée).
 */
export type AlbumSummary = {
  id: string;
  /** Le titre servi : celui du média, sinon « Les photos du <événement> ». */
  title: string;
  status: AlbumStatus;
  event: { id: string; slug: string; title: string; startsAt: string; endsAt: string };
  media: { key: string; name: string; logoUrl: string | null; verified: boolean };
  photosCount: number;
  allowSave: boolean;
  /** « Album officiel » : posé par l'organisateur (lot R9g) ; faux en R9e. */
  official: boolean;
  /** `null` pour un brouillon. */
  publishedAt: string | null;
  /** Les quatre premières photos. */
  cover: AlbumPhotoView[];
  /** C'est un album du titulaire de la page du média (lecture par lui seul de ses brouillons). */
  mine: boolean;
};

/** `GET /albums/:id` : l'album ouvert. */
export type AlbumView = AlbumSummary & {
  photos: AlbumPhotoView[];
  /** Lot R9f : le nombre de photos de cet album avec au moins une identification visible de moi (« N sur M photos identifiées ») ; absent si zéro. */
  tagsCount?: number;
};

/** `GET /me/albums`, `GET /events/:id/albums`, `GET /media/:id/albums`. */
export type AlbumsList = { items: AlbumSummary[]; nextCursor: string | null };

/** Le contenu de la carte « album » du Fil : une carte à part, pas une publication (ni flamme, ni commentaire en R9e). */
export type AlbumCardView = {
  id: string;
  title: string;
  photosCount: number;
  /** La page du média (jamais le compte derrière). */
  author: FeedAuthorView;
  /** « présent au <événement> » : le rôle `on_site` est déduit de l'accréditation. */
  attach: FeedAttachView;
  cover: AlbumPhotoView[];
  official: boolean;
};

/** `GET /media/:id` en plus de la fiche : combien d'albums publiés et de photos. */
export type MediaAlbumsCounts = { albumsCount: number; photosCount: number };

import { z } from "zod";

import { STORY_CAPTION_MAX } from "../rules/audience";
import type { AlbumPhotoView } from "./albums";

// Identification sur une photo d'album (vague R9, lot R9f, ARCHITECTURE-R8 § 1.10) : une **voiture** du plateau (pointée à
// l'événement) ou une **personne par son pseudo**. Peuvent identifier : le média auteur, l'organisateur de l'événement, et
// l'intéressé pour lui-même. L'intéressé retire son identification à tout moment ; elle ne peut pas être reposée par un autre.

export const albumTagTargets = ["vehicle", "user"] as const;
export type AlbumTagTarget = (typeof albumTagTargets)[number];

/** Qui a posé l'identification : le média auteur de l'album, l'organisateur de l'événement, ou l'intéressé (« propriétaire »). */
export const albumTaggers = ["media", "organizer", "owner"] as const;
export type AlbumTagger = (typeof albumTaggers)[number];

/**
 * Pourquoi une identification est retirée : « Ce n'est pas ma voiture » (`not_mine`, posée par un autre), « Retirer mon
 * identification » (`withdraw`, posée par l'intéressé lui-même), ou retirée par celui qui l'avait posée (`tagger`, erreur de voiture).
 */
export const albumTagRemovedReasons = ["not_mine", "withdraw", "tagger"] as const;
export type AlbumTagRemovedReason = (typeof albumTagRemovedReasons)[number];

/** La recherche d'une personne par son pseudo commence à 2 caractères (pas d'annuaire). */
export const ALBUM_TAG_SEARCH_MIN = 2;
/** Voitures du plateau à choisir par page. */
export const TAGGABLE_PAGE_SIZE = 60;
/** Vignettes d'une mention (fiche de la voiture, sortie, souvenir) et de la bande d'une notification. */
export const ALBUM_MENTION_PHOTOS = 6;
export const ALBUM_NOTIFICATION_THUMBS = 4;
/** « Tes photos » : toutes mes identifications, par albums. */
export const MY_TAGS_PAGE_SIZE = 20;

/** `POST /album-photos/:id/tags` : une voiture OU une personne (jamais les deux, jamais un corps vide). */
export const albumTagCreateSchema = z.union([
  z.object({ vehicleId: z.uuid() }).strict(),
  z.object({ userId: z.string().min(1).max(64) }).strict(),
]);
export type AlbumTagCreate = z.infer<typeof albumTagCreateSchema>;

/**
 * `DELETE /me/album-tags/:id` : le motif est déduit par le serveur (qui a posé l'identification) ; s'il est envoyé, il doit
 * être le bon (une incohérence est refusée plutôt que corrigée en silence).
 */
export const albumTagRemoveSchema = z.object({ reason: z.enum(["not_mine", "withdraw"]).optional() }).strict();
export type AlbumTagRemove = z.infer<typeof albumTagRemoveSchema>;

/** `GET /albums/:id/taggable?q=&category=&cursor=&limit=` : la recherche de personnes demande 2 caractères au moins. */
export const taggableQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v ? v : undefined)),
  category: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .optional(),
  cursor: z.coerce.number().int().min(0).max(100_000).optional(),
  limit: z.coerce.number().int().min(1).max(TAGGABLE_PAGE_SIZE).default(TAGGABLE_PAGE_SIZE),
});
export type TaggableQuery = z.infer<typeof taggableQuerySchema>;

/** `POST /album-photos/:id/share-to-story` : le public (« tout le monde » par défaut) et la légende. */
export const shareToStorySchema = z
  .object({
    audience: z.enum(["public", "followers"]).optional(),
    caption: z
      .string()
      .trim()
      .max(STORY_CAPTION_MAX)
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .strict();
export type ShareToStory = z.infer<typeof shareToStorySchema>;

export const myAlbumTagsQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(MY_TAGS_PAGE_SIZE),
});
export type MyAlbumTagsQuery = z.infer<typeof myAlbumTagsQuerySchema>;

// --- Vues ---------------------------------------------------------------------------------------------------------------

/**
 * Une identification servie avec sa photo (`AlbumView.photos[].tags`), **seulement** à qui a le droit de la voir (`canSeeTag`).
 * Liste blanche : jamais l'identifiant du compte, jamais la plaque. `vehicle` pour une voiture, `user` pour une personne (et le
 * propriétaire d'une voiture quand son pseudo se montre : compte public, lui-même, abonné accepté ; jamais pour un compte privé
 * vu par le média ou l'organisateur : « <voiture> » sans pseudo, comme le plateau à choisir).
 */
export type AlbumTagView = {
  id: string;
  kind: AlbumTagTarget;
  taggedAs: AlbumTagger;
  vehicle: { id: string; label: string } | null;
  user: { pseudo: string; avatarUrl: string | null } | null;
  /** C'est moi l'identifié (ma voiture ou mon pseudo). */
  mine: boolean;
  canRemove: boolean;
  /** Le geste : `not_mine` « Ce n'est pas ma voiture », `withdraw` « Retirer mon identification », `tagger` (croix du média ou de l'organisateur) ; `null` si je ne peux pas retirer. */
  removeAs: AlbumTagRemovedReason | null;
};

/** Ce que je peux faire sur cet album : mon rôle pour identifier (`null` : rien, je n'ai aucune voiture ni pseudo identifiable). */
export type TagRole = "media" | "organizer" | "owner";

export type TaggableVehicle = {
  vehicleId: string;
  /** Nom complet (marque, modèle, génération), jamais coupé à l'affichage. */
  label: string;
  makeName: string;
  modelName: string;
  /** Photo dont la plaque est floutée ou « aucune plaque » confirmée, sinon `null` (silhouette). */
  photoUrl: string | null;
  /** Le pseudo du propriétaire ; `null` pour un compte privé (jamais de pseudo ni de lien), sauf pour moi. */
  pseudo: string | null;
  private: boolean;
  /** Ma voiture (« Toi »). */
  mine: boolean;
  /** Slugs des catégories (les puces de la grille). */
  categories: string[];
};

export type TaggablePerson = { userId: string; pseudo: string; avatarUrl: string | null; mine: boolean };

/** `GET /albums/:id/taggable` : le plateau à choisir et la recherche par pseudo. */
export type Taggable = {
  role: TagRole;
  vehicles: TaggableVehicle[];
  /** Toujours vide sous 2 caractères de recherche. */
  people: TaggablePerson[];
  categories: { slug: string; label: string; count: number }[];
  /** Aucun pointage à l'événement : toutes les voitures retenues sont proposées (« Plateau sans pointage : … »). */
  fallback: boolean;
  nextCursor: number | null;
};

/** `GET /me/albums/:id/my-photos` : mes photos d'un album (la voiture, la personne, ou les deux). */
export type MyPhoto = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  position: number;
  /** Qui m'a identifié sur cette photo : le média, l'organisateur, ou moi. */
  taggedBy: "media" | "organizer" | "me";
  tagId: string;
  /** « Enregistrer » : le média l'a autorisé (`allow_save`). */
  canSave: boolean;
  /** « En story » : faux pour une photo d'ancienne galerie (`unknown`), dont la plaque n'a jamais été regardée. */
  canStory: boolean;
  /** Ma story originale de cette photo, encore en ligne (« Déjà en story · <public> ») ; `null` sinon. Jamais une copie d'une story d'un autre. */
  liveStory: { audience: "public" | "followers" | "crew"; expiresAt: string } | null;
};

export type MyPhotosView = {
  album: { id: string; title: string; event: { id: string; slug: string; title: string; startsAt: string } };
  media: { key: string; name: string; logoUrl: string | null };
  /** Ma voiture identifiée (la première, par ordre de photo) ; `null` si je ne suis identifié que par mon pseudo. */
  vehicle: { id: string; label: string } | null;
  photos: MyPhoto[];
};

/**
 * Des photos d'un album où quelqu'un est identifié (≤ 6 vignettes) : `albumMentions` de la fiche d'une voiture, `albumPhotos` de
 * la sortie passée et du souvenir. Jamais des publications ; jamais comptées dans « Publications ».
 */
export type AlbumMention = {
  albumId: string;
  eventTitle: string;
  eventSlug: string;
  mediaName: string;
  photos: AlbumPhotoView[];
  count: number;
};

/** `GET /me/album-tags` : toutes mes identifications actives, par album. */
export type MyAlbumTagsList = { items: AlbumMention[]; nextCursor: string | null };

/** Le crédit du photographe, servi par la visionneuse d'une story reprise d'une photo d'album : non retirable. */
export type StoryCredit = { mediaKey: string; mediaName: string };

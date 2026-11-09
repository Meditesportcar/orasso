import { z } from "zod";

import type { EventFormat, VehicleType } from "../enums";
import type { Grade } from "../grades";
import { reportReasonAllowed, reportReasons } from "../moderation";
import {
  DEFAULT_FEED_ASPECT,
  FEED_CAPTION_MAX,
  FEED_POST_PHOTOS_MAX,
  type FeedAspect,
  type FeedCardKind,
  type FeedFilter,
  type FeedReasonCode,
  feedAspects,
  feedCardKinds,
  feedFilters,
} from "../rules/feed";
import { optionalText } from "./common";
import { plateRectsSchema } from "./vehicle";

// Le Fil (lot R7e1) : `GET /fil`, publications, « Moins de ce genre », signalement.

export const feedQuery = z.object({
  filter: z.enum(feedFilters).default("for_you"),
  cursor: z.string().max(400).optional(),
});

/** Clé rendue par `POST /me/uploads` avec `purpose=feed_post` (privée jusqu'à la publication). */
const uploadKey = z.string().regex(/^private\/feed-posts\/[0-9a-f-]{36}\.webp$/, "Photo inconnue");

/**
 * Une photo à publier : la clé envoyée, et **une décision de plaque obligatoire** : des cadres à flouter
 * (`plateRects`, floutés par le serveur à la publication) ou « aucune plaque visible » (`noPlateConfirmed`). Ni l'un ni
 * l'autre → 400 `plate_decision_required` (contrôlé par l'API, pas par ce schéma, pour rendre ce code).
 */
export const feedPostPhotoInput = z.object({
  uploadKey,
  plateRects: plateRectsSchema.nullish(),
  noPlateConfirmed: z.boolean().nullish(),
});
export type FeedPostPhotoInput = z.infer<typeof feedPostPhotoInput>;

/** `POST /me/feed-posts` : 1 à 6 photos, légende de 500 caractères, véhicule (le sien) et événement facultatifs. */
export const feedPostCreateSchema = z.object({
  caption: optionalText(FEED_CAPTION_MAX),
  vehicleId: z.uuid().nullish(),
  eventId: z.uuid().nullish(),
  aspect: z.enum(feedAspects).default(DEFAULT_FEED_ASPECT),
  photos: z
    .array(feedPostPhotoInput)
    .min(1)
    .max(FEED_POST_PHOTOS_MAX)
    .refine((list) => new Set(list.map((p) => p.uploadKey)).size === list.length, {
      message: "Une photo est en double.",
    }),
  /** Identifiant tiré par l'appareil : un nouvel essai après une réponse perdue rend la même publication. */
  clientId: z.uuid().nullish(),
});
export type FeedPostCreate = z.infer<typeof feedPostCreateSchema>;

export const feedLessSchema = z.object({ kind: z.enum(feedCardKinds) });
export const feedMineQuery = z.object({ cursor: z.string().max(200).optional() });

/** `POST /feed-posts/:id/report` : le motif (liste du type `feed_post`) et, pour « Autre », quelques mots. */
export const feedReportSchema = z
  .object({ reason: z.enum(reportReasons), details: optionalText(1000) })
  .refine((v) => v.reason !== "other" || Boolean(v.details), {
    message: "Précise le motif « Autre » en quelques mots",
    path: ["details"],
  })
  .refine((v) => reportReasonAllowed("feed_post", v.reason), {
    message: "Motif inconnu pour ce type de signalement",
    path: ["reason"],
  });

// --- Ce que l'API rend (liste blanche) -----------------------------------------------------------------------------

/** Une personne dans le Fil : pseudo, photo, grade ; jamais un identifiant de compte. */
export type FeedPerson = { pseudo: string; avatarUrl: string | null; grade: Grade; official: boolean };

export type FeedEventSummary = {
  id: string;
  slug: string;
  title: string;
  format: EventFormat;
  startsAt: string;
  endsAt: string;
  city: string | null;
  department: string | null;
  posterUrl: string | null;
  photoUrl: string | null;
  structure: { slug: string; name: string; logoUrl: string | null };
};

export type FeedPostPhoto = { url: string; width: number; height: number };

export type FeedPostView = {
  id: string;
  author: FeedPerson;
  caption: string | null;
  aspect: FeedAspect;
  photos: FeedPostPhoto[];
  vehicle: { id: string; label: string } | null;
  event: { slug: string; title: string } | null;
  reactionsCount: number;
  reactedByMe: boolean;
  createdAt: string;
  mine: boolean;
};

export type FeedPodiumEntry = {
  rank: number;
  vehicleLabel: string;
  /** `null` pour un compte privé que la personne ne suit pas : la voiture seule. */
  pseudo: string | null;
  photoUrl: string | null;
  votes: number;
};

/** Le contenu de chaque genre de carte (`Card.payload`). */
export type FeedPayloads = {
  event_recommended: { event: FeedEventSummary };
  vehicle_public: {
    vehicle: { id: string; label: string; vehicleType: VehicleType; photoUrl: string };
    owner: FeedPerson;
  };
  lineup: { event: FeedEventSummary; count: number; photoUrls: string[] };
  vote_result: { event: FeedEventSummary; podium: FeedPodiumEntry[] };
  announcement: {
    event: FeedEventSummary;
    announcement: { id: string; body: string; imageUrl: string | null; publishedAt: string };
  };
  pro: {
    pro: {
      slug: string;
      name: string;
      logoUrl: string | null;
      photoUrl: string | null;
      city: string | null;
      department: string | null;
      activities: string[];
    };
  };
  feed_post: { post: FeedPostView };
  spot_meetup: Record<string, unknown>;
  memory: Record<string, unknown>;
  sponsored: Record<string, unknown>;
};

export type FeedCard<K extends FeedCardKind = FeedCardKind> = {
  [Kind in K]: {
    id: string;
    kind: Kind;
    reason: { code: FeedReasonCode; label: string };
    at: string;
    payload: FeedPayloads[Kind];
  };
}[K];

export type FeedPage = { items: FeedCard[]; nextCursor: string | null; filter: FeedFilter };

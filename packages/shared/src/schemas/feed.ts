import { z } from "zod";

import type { EventFormat, VehicleType } from "../enums";
import type { Grade } from "../grades";
import { reportReasonAllowed, reportReasons } from "../moderation";
import { storyPersonas } from "../rules/audience";
import type { AuthorKind } from "../rules/authors";
import {
  DEFAULT_FEED_ASPECT,
  FEED_CURSOR_MAX,
  FEED_POST_PHOTOS_MAX,
  type FeedAspect,
  type FeedCardKind,
  type FeedFilter,
  type FeedReasonCode,
  feedAspects,
  feedCardKinds,
  feedFilters,
} from "../rules/feed";
import type { FeedAttachPhase, FeedEventRole, ImportantReason } from "../rules/feedAttach";
import { FEED_CAPTION_PERSONA_MAX, FEED_PLACE_LABEL_MAX, importantReasons } from "../rules/feedAttach";
import type { OfferView } from "../rules/proOffers";
import type { AdvertiserKind } from "../rules/sponsored";
import { optionalText } from "./common";
import { coAuthorInputSchema, type FeedCoAuthorInvite } from "./feedCoauthors";
import type { MemoryCardPayload } from "./memories";
import type { SpotFeedPayload } from "./spotMeetup";
import type { CommercialPartnerView } from "./stories";
import { plateRectsSchema } from "./vehicle";

// Le Fil (lot R7e1) : `GET /fil`, publications, « Moins de ce genre », signalement.

export const feedQuery = z.object({
  filter: z.enum(feedFilters).default("for_you"),
  cursor: z.string().max(FEED_CURSOR_MAX).optional(),
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

/**
 * `POST /me/feed-posts` : 1 à 6 photos, légende de 500 caractères (2 000 pour une casquette), véhicule (le sien) et
 * événement facultatifs. Sans photo ni carte : seulement rattachée à un événement (visuel = son affiche, T1 du 11/11).
 */
export const feedPostCreateSchema = z
  .object({
    caption: optionalText(FEED_CAPTION_PERSONA_MAX),
    vehicleId: z.uuid().nullish(),
    eventId: z.uuid().nullish(),
    aspect: z.enum(feedAspects).default(DEFAULT_FEED_ASPECT),
    photos: z
      .array(feedPostPhotoInput)
      .max(FEED_POST_PHOTOS_MAX)
      .refine((list) => new Set(list.map((p) => p.uploadKey)).size === list.length, {
        message: "Une photo est en double.",
      })
      .default([]),
    /**
     * Partager une carte au Fil (R7f4) : un événement ou une voiture ; l'API rend la carte en 4:5 (1080 × 1350) et la publie
     * comme photo, sans photo envoyée. Sans `linked`, au moins une photo est attendue.
     */
    linked: z
      .object({
        type: z.enum(["event", "vehicle"]),
        id: z
          .string()
          .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Identifiant invalide")
          .transform((v) => v.toLowerCase()),
      })
      .nullish(),
    /** Identifiant tiré par l'appareil : un nouvel essai après une réponse perdue rend la même publication. */
    clientId: z.uuid().nullish(),
    /** Mention « Collaboration commerciale » posée à la main (R7m2) : une fiche pro publiée, partenaire ou non. */
    commercialPartnerId: z.uuid().nullish(),
    /** Vague R8 : la casquette au nom de laquelle on publie (défaut : la personne). */
    persona: z.enum(storyPersonas).default("fan"),
    /** Le compte qui croit publier (R8p, tour 8) : si la session est devenue celle d'un autre, rien n'est écrit (409 `account_changed`). */
    expectedUserId: z.string().max(64).nullish(),
    structureId: z.uuid().nullish(),
    proId: z.uuid().nullish(),
    /** Lieu libre d'une publication sans événement. */
    placeLabel: optionalText(FEED_PLACE_LABEL_MAX),
    /** « Info importante » (organisateur, événement rattaché) : le motif est obligatoire. Le rôle n'est jamais reçu. */
    important: z.object({ reason: z.enum(importantReasons) }).nullish(),
    /** Collaboration (R8o) : un seul co-auteur invité. Tant qu'il n'a pas accepté, la publication n'est que chez son auteur. */
    coAuthor: coAuthorInputSchema.nullish(),
    /**
     * Étiquette « Offre » (R9c) : fiche pro seulement. Le titre et les jours (`AAAA-MM-JJ`, début facultatif, fin obligatoire) sont
     * contrôlés par l'API (`offerIssue`), pour rendre un message par cause.
     */
    offer: z
      .object({
        title: z.string().max(200),
        startsOn: z.string().max(10).nullish(),
        endsOn: z.string().max(10).nullish(),
      })
      .nullish(),
  })
  .refine((v) => !(v.photos.length > 0 && v.linked), {
    message: "Une carte partagée n'a pas de photo envoyée",
    path: ["photos"],
  });
export type FeedPostCreate = z.infer<typeof feedPostCreateSchema>;

/** `PATCH /me/feed-posts/:id` (R7m2) : le seul champ est la mention commerciale, et seulement pour la retirer (refusé si elle est posée). */
export const feedPostPatchSchema = z.object({ commercialPartnerId: z.null() }).strict();
export type FeedPostPatch = z.infer<typeof feedPostPatchSchema>;

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

/** Une personne dans le Fil : pseudo, photo, grade (sans identifiant de compte ; `FeedAuthorView.key` en porte un pour une personne, comme les stories). */
export type FeedPerson = { pseudo: string; avatarUrl: string | null; grade: Grade; official: boolean };

/**
 * Qui parle (vague R8) : la personne ou la page (structure, fiche pro, prestataire, média) au nom de laquelle la
 * publication est faite. `key` = clé d'auteur (`u: s: p: v: m:`) ; `u:<compte>` pour une personne (comme les stories), jamais un identifiant de personne pour une page. Pour une
 * page : `pseudo = name`, `grade` nul. Les champs de `FeedPerson` restent (l'APK en ligne les lit).
 */
export type FeedAuthorView = {
  key: string;
  kind: AuthorKind;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
  pseudo: string;
  grade: Grade | null;
  official: boolean;
};

/** Le rattachement d'une publication à un événement, avec le rôle déduit et la phase calculée à la lecture. */
export type FeedAttachView = {
  event: { id: string; slug: string; title: string; startsAt: string; endsAt: string; city: string | null };
  /** `null` : rattachement sans verbe (passionné après la fin, sans présence validée). */
  role: FeedEventRole | null;
  phase: FeedAttachPhase;
  presenceValidated: boolean;
};

/** `GET /me/feed-posts/attachable-events?persona=&structureId=&proId=` : la casquette, comme pour publier. */
export const attachableEventsQuery = z.object({
  persona: z.enum(storyPersonas).default("fan"),
  structureId: z.uuid().optional(),
  proId: z.uuid().optional(),
});

/** Un événement où l'on peut se rattacher, avec le rôle qui serait déduit (jamais choisi) ; 50 au plus. */
export type AttachableEventItem = {
  id: string;
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string;
  city: string | null;
  posterUrl: string | null;
  role: FeedEventRole;
  phase: FeedAttachPhase;
  /** Une affiche (ou une photo) existe : une publication sans photo peut la prendre pour visuel. */
  hasVisual: boolean;
  /** Seulement pour la casquette organisateur : ce qu'il reste d'« Info importante » aujourd'hui et cette semaine. */
  important: { leftToday: number; leftWeek: number } | null;
};

/** Aperçu d'un commentaire sous une publication (rempli par R8k1 ; vide dans R8a1). */
export type FeedCommentPreview = { id: string; author: FeedAuthorView; text: string; createdAt: string };

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
  /** Vague R8 : `FeedAuthorView` ⊇ `FeedPerson` (pseudo, avatarUrl, grade, official) ; la page ou la personne. */
  author: FeedAuthorView;
  caption: string | null;
  aspect: FeedAspect;
  photos: FeedPostPhoto[];
  vehicle: { id: string; label: string } | null;
  event: { slug: string; title: string } | null;
  reactionsCount: number;
  reactedByMe: boolean;
  createdAt: string;
  mine: boolean;
  /** « Collaboration commerciale » (R7m2) : posée par l'API, jamais retirée ; `null` sans collaboration. */
  commercialPartner: CommercialPartnerView | null;
  /** Vague R8 : co-auteur accepté (R8o), sinon `null`. */
  coAuthor: FeedAuthorView | null;
  /** R8o : à l'auteur d'origine seulement, l'état de son invitation (en attente, refusée, retirée) ; `null` pour tout autre. */
  coAuthorInvite: FeedCoAuthorInvite | null;
  /** R8o : je suis le co-auteur accepté (moi, ou une page que je gère) : le menu propose « Me retirer de la publication ». */
  coAuthoredByMe: boolean;
  /** Rattachement à un événement (rôle déduit) ; `null` sans événement ou si l'événement n'existe plus. */
  attach: FeedAttachView | null;
  /** La ville de l'événement quand il y en a un, sinon le lieu libre de la publication. */
  placeLabel: string | null;
  /** `event_poster` : pas de photo propre, `photos` porte l'affiche de l'événement. */
  visual: "photos" | "event_poster";
  /** « Info importante » : motif et heure d'envoi aux inscrits ; `null` sinon. */
  important: { reason: ImportantReason; sentAt: string | null } | null;
  pinned: boolean;
  commentsCount: number;
  commentsOff: boolean;
  /** Les deux derniers commentaires (R8k1). */
  lastComments: FeedCommentPreview[];
  /** Étiquette « Offre » (R9c) : titre, jours et état à la lecture ; `null` pour toute autre publication. */
  offer: OfferView | null;
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
  spot_meetup: SpotFeedPayload;
  memory: MemoryCardPayload;
  /**
   * Carte « Sponsorisé » (lot R7k1). `id` = l'emplacement (à envoyer à `POST /sponsored/:id/impression|click` avec
   * `{ surface: "feed" }`). `domain` : le domaine du lien, affiché pour un annonceur externe. `disclosure` : la mention
   * choisie par l'administration (« Publicité »), en plus du libellé « Sponsorisé » de la carte.
   */
  sponsored: {
    id: string;
    advertiserName: string;
    advertiserKind: AdvertiserKind;
    title: string;
    body: string;
    imageUrl: string | null;
    linkUrl: string;
    disclosure: string | null;
    domain: string | null;
    pro: { slug: string; name: string; logoUrl: string | null } | null;
  };
};

export type FeedCard<K extends FeedCardKind = FeedCardKind> = {
  [Kind in K]: {
    id: string;
    kind: Kind;
    reason: { code: FeedReasonCode; label: string };
    at: string;
    payload: FeedPayloads[Kind];
    /**
     * Vue sans interaction (ni flamme, ni ouverture, ni partage) à l'instant du parcours (`FeedPage.ref`) : l'écran pose
     * « Tu es à jour » avant la première carte `seen: true`. Donnée de lecture privée de la personne (R8c1).
     */
    seen: boolean;
  };
}[K];

export type FeedPage = {
  items: FeedCard[];
  nextCursor: string | null;
  filter: FeedFilter;
  /**
   * `true` quand le contexte de la personne a changé en plein parcours (nouvel abonnement, nouveau département…) : le
   * curseur est abandonné, cette page est la première d'un nouveau parcours, et le client **remplace** sa liste.
   */
  reset?: true;
  /** L'instant du parcours (ISO), figé à la première page : base de `GET /fil/fresh?since=` et du « vu » (R8c1). */
  ref: string;
  /** Rail « Ça plaît en ce moment » : première page d'« Abonnements » et d'« Autour de moi » seulement (les cartes restent aussi dans `items`). */
  hot?: FeedCard<"feed_post">[];
};

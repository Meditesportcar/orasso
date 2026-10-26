import { z } from "zod";

import type { VehicleType } from "../enums";
import type { Grade } from "../grades";
import {
  CREW_COMMENT_MAX,
  CREW_POLL_OPTION_MAX,
  CREW_POLL_OPTIONS_MAX,
  CREW_POLL_OPTIONS_MIN,
  CREW_POLL_QUESTION_MAX,
  CREW_POST_PHOTOS_MAX,
  CREW_POST_TEXT_MAX,
  type CrewPostKind,
} from "../rules/crewFeed";
import type { CrewOutingRsvp } from "../rules/crewPage";
import { optionalText } from "./common";

// Fil d'un crew (lot R5c1) : routes `GET /crews/:id/feed`, `POST /crews/:id/posts`, réactions, commentaires, sondages.

const uploadKey = z.string().min(10).max(200);
const requiredText = (max: number) => z.string().trim().min(1).max(max);

/**
 * Tour 2 : identifiant tiré par l'appareil, gardé entre les tentatives d'envoi ; un nouvel essai après une réponse
 * perdue rend la même publication (ni doublon ni « Photo inconnue ou déjà utilisée »).
 */
const clientId = z.uuid().nullish();

/** Véhicule (de l'auteur) et événement facultatifs, communs aux publications photo et texte. */
const postLinks = {
  vehicleId: z.uuid().nullish(),
  eventId: z.uuid().nullish(),
  clientId,
};

export const crewPollInputSchema = z
  .object({
    question: requiredText(CREW_POLL_QUESTION_MAX),
    options: z.array(requiredText(CREW_POLL_OPTION_MAX)).min(CREW_POLL_OPTIONS_MIN).max(CREW_POLL_OPTIONS_MAX),
    /** Date de fin facultative (dans le futur, vérifiée par l'API avec son horloge). */
    endsAt: z.iso.datetime({ offset: true }).nullish(),
  })
  .refine((p) => new Set(p.options.map((o) => o.toLocaleLowerCase("fr"))).size === p.options.length, {
    message: "Deux réponses sont identiques.",
    path: ["options"],
  });
export type CrewPollInput = z.infer<typeof crewPollInputSchema>;

/**
 * `POST /crews/:id/posts`. Photos : clés rendues par `POST /me/uploads` avec `purpose=crew_post` (1 à 6), rattachées
 * une seule fois par leur auteur. Texte seul : un mot obligatoire. Sondage : la question et ses réponses.
 */
export const crewPostCreateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("photo"),
    text: optionalText(CREW_POST_TEXT_MAX),
    photoKeys: z
      .array(uploadKey)
      .min(1)
      .max(CREW_POST_PHOTOS_MAX)
      .refine((keys) => new Set(keys).size === keys.length, { message: "Une photo est en double." }),
    ...postLinks,
  }),
  z.object({ kind: z.literal("text"), text: requiredText(CREW_POST_TEXT_MAX), ...postLinks }),
  z.object({ kind: z.literal("poll"), poll: crewPollInputSchema, clientId }),
]);
export type CrewPostCreate = z.infer<typeof crewPostCreateSchema>;

export const crewCommentCreateSchema = z.object({ text: requiredText(CREW_COMMENT_MAX) });
export const crewPollVoteSchema = z.object({ optionId: z.uuid() });
export const crewFeedQuery = z.object({ cursor: z.string().max(300).optional() });

export type CrewFeedPerson = { userId: string; pseudo: string; avatarUrl: string | null; grade: Grade };

/** Photo du fil : adresse protégée par l'appartenance au crew, format d'origine (largeur et hauteur réelles). */
export type CrewPostPhoto = { id: string; url: string; width: number; height: number };

export type CrewPollView = {
  question: string;
  options: { id: string; label: string; votes: number }[];
  totalVotes: number;
  /** « Ton choix » ; jamais qui a voté quoi. */
  myOptionId: string | null;
  endsAt: string | null;
  closedAt: string | null;
  open: boolean;
  /** L'auteur ou le chef peut le clore. */
  canClose: boolean;
};

export type CrewPostView = {
  id: string;
  crewId: string;
  kind: CrewPostKind;
  /** `null` : compte supprimé entre-temps (ses publications partent avec lui, garde-fou). */
  author: CrewFeedPerson | null;
  createdAt: string;
  text: string | null;
  photos: CrewPostPhoto[];
  vehicle: { id: string; label: string; vehicleType: VehicleType } | null;
  event: { id: string; slug: string; title: string; startsAt: string } | null;
  firesCount: number;
  firedByMe: boolean;
  commentsCount: number;
  poll: CrewPollView | null;
  mine: boolean;
  /** L'auteur ou le chef. */
  canRemove: boolean;
};

/**
 * Une entrée du fil. Les publications et des **événements automatiques** lus dans les tables existantes : arrivée d'un
 * membre, crew retenu à un événement, sortie proposée dans le crew (lot R5c2).
 */
export type CrewFeedItem =
  | { type: "post"; key: string; at: string; post: CrewPostView }
  | {
      type: "member_joined";
      key: string;
      at: string;
      person: CrewFeedPerson;
      /** Son véhicule principal, s'il en a un d'actif. */
      vehicleLabel: string | null;
    }
  | {
      type: "crew_accepted";
      key: string;
      at: string;
      event: { id: string; slug: string; title: string; startsAt: string; city: string | null };
      /** Pseudos des membres retenus (comptes actifs). */
      members: string[];
    }
  | { type: "crew_outing"; key: string; at: string; outing: CrewFeedOuting };

/**
 * Lot R5c2 (maquette R5.7) : une sortie proposée dans le crew, « Kenji_66 propose une sortie : Balade des Aspres ». Une
 * sortie annulée n'est plus dans le fil ; une sortie passée y reste, sans « Je viens ».
 */
export type CrewFeedOuting = {
  id: string;
  title: string;
  startsAt: string;
  place: string;
  /** Auteur (`null` : compte supprimé ou suspendu). */
  authorPseudo: string | null;
  /** Membres actifs qui viennent. */
  yes: number;
  maybe: number;
  /** Ma réponse. */
  mine: CrewOutingRsvp | null;
  /** Encore à venir : on peut y répondre. */
  open: boolean;
};

export type CrewFeedPage = { items: CrewFeedItem[]; nextCursor: string | null };

export type CrewCommentView = {
  id: string;
  author: CrewFeedPerson | null;
  text: string;
  createdAt: string;
  mine: boolean;
  canRemove: boolean;
};

/** Composeur « Publier dans le crew » : mes véhicules actifs, mes événements proches, le nombre de membres. */
export type CrewPostOptions = {
  crew: { id: string; slug: string; name: string; membersCount: number };
  /** Le membre qui publie (avatar du composeur du site). */
  me: CrewFeedPerson;
  vehicles: { id: string; label: string; vehicleType: VehicleType }[];
  events: { id: string; title: string; startsAt: string }[];
};

/** Réponse de la flamme : le nouveau compte. */
export type CrewFireState = { firesCount: number; firedByMe: boolean };

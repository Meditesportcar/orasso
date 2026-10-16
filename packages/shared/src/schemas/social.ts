import { z } from "zod";

import { departmentSchema } from "../enums";
import { gradeSchema } from "../grades";
import { FRIEND_MESSAGE_MAX, type FriendshipState, type ProfileAudience } from "../rules/visibility";
import { optionalText, pageQuery } from "./common";
import type { PublicProfile } from "./profile";
import { pseudoSchema } from "./profile";
import type { VehicleBrief, VehiclePublic } from "./vehicle";

// Social (lot 17) : amis, profils des autres, recherche de personnes. Routes : ARCHITECTURE-SUITE § 2.3.

export const friendRequestCreateSchema = z.object({
  pseudo: pseudoSchema,
  message: optionalText(FRIEND_MESSAGE_MAX),
  /** Où la demande a été faite (le QR et le lien d'ami ont leurs propres routes). */
  source: z.enum(["search", "profile", "event"]).optional(),
});
export type FriendRequestCreate = z.infer<typeof friendRequestCreateSchema>;

/** Charge utile lue dans le QR de compte (`OA1…`). */
export const friendRequestByQrSchema = z.object({ payload: z.string().min(8).max(200) });
export const friendRequestByInviteSchema = z.object({ token: z.string().min(6).max(64) });

export const peopleSearchQuery = pageQuery.extend({
  q: z.string().trim().max(60).optional(),
  department: departmentSchema.optional(),
  categoryId: z.uuid().optional(),
  makeId: z.uuid().optional(),
  modelId: z.uuid().optional(),
  generationId: z.uuid().optional(),
  grade: gradeSchema.optional(),
});
export type PeopleSearchQuery = z.infer<typeof peopleSearchQuery>;

export const friendsListQuery = pageQuery.extend({ direction: z.enum(["in", "out"]).optional() });

/** Carte d'une personne (recherche, propriétaires près de chez moi, amis). Jamais de plaque, de nom ni de contact. */
export type PersonCard = {
  userId: string;
  pseudo: string;
  avatarUrl: string | null;
  grade: z.infer<typeof gradeSchema>;
  /** Départements du secteur : absents d'un compte privé que l'on n'est pas ami avec. */
  departments: string[] | null;
  /** Marque + modèle (+ génération si le profil le permet, jamais l'année ni la plaque). */
  vehicles: { id: string; label: string }[];
  friendship: FriendshipState;
  /** Demande d'ami en cours (pour l'accepter depuis une liste), sinon null. */
  friendshipId: string | null;
};

/** Fiche d'un véhicule d'un autre (`GET /vehicles/:id`) : complète ou réduite, avec son propriétaire. */
export type OtherVehicle = (VehiclePublic | VehicleBrief) & {
  /** Vrai si la fiche complète est consultable (compte public ou ami). */
  detailed: boolean;
  owner: Pick<PersonCard, "userId" | "pseudo" | "avatarUrl" | "grade">;
};

export type PeopleSearchPage = { items: PersonCard[]; nextCursor: string | null };

export type ProfileVehicle = {
  id: string;
  label: string;
  makeName: string;
  modelName: string;
  photoUrl: string | null;
  /** Vrai si la fiche complète (génération, année, photos) est consultable. */
  detailed: boolean;
};

export type ProfileEvent = {
  slug: string;
  title: string;
  startsAt: string;
  city: string | null;
  posterUrl: string | null;
  structureName: string;
};

/** Profil d'un autre selon l'audience (compatible avec l'aperçu `/me/public-preview`, type `PublicProfile`). */
export type UserProfileView = Omit<PublicProfile, "vehicles"> & {
  userId: string;
  audience: ProfileAudience;
  friendsCount: number | null;
  vehicles: ProfileVehicle[];
  upcomingEvents: ProfileEvent[] | null;
  /** Événements passés des 12 derniers mois : le nombre et les titres. */
  pastEvents: { count: number; titles: string[] } | null;
  /** Vide jusqu'au lot 19. */
  crews: { id: string; name: string }[] | null;
  /** Organisateur seulement : coordonnées déjà accessibles dans son tri. */
  contact: { firstName: string | null; lastName: string | null; phone: string | null; email: string | null } | null;
  friendship: { state: FriendshipState; id: string | null };
};

export type FriendRequestView = {
  id: string;
  direction: "in" | "out";
  message: string | null;
  createdAt: string;
  person: Pick<PersonCard, "userId" | "pseudo" | "avatarUrl" | "grade">;
};

export type FriendItem = Pick<PersonCard, "userId" | "pseudo" | "avatarUrl" | "grade"> & { since: string };

export type FriendRequestResult = { id: string; status: "pending" | "accepted"; pseudo: string };

/** Actualité du Journal : personne concernée (avatar affiché devant l'item). */
export type JournalActor = { userId: string; pseudo: string; avatarUrl: string | null };

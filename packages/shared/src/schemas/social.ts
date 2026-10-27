import { z } from "zod";

import { departmentSchema, type VehicleType } from "../enums";
import { gradeSchema } from "../grades";
import type { ProfileSocials } from "../rules/socials";
import type { FollowState } from "../rules/follows";
import type { ProfileAudience } from "../rules/visibility";
import { pageQuery } from "./common";
import type { CrewCard } from "./crews";
import type { PassportStamp } from "./passport";
import type { PublicProfile } from "./profile";
import type { VehiclePrivate, VehiclePublic } from "./vehicle";

// Social (lot 17, puis lot R6b : « Suivre » remplace l'amitié) : profils des autres, recherche de personnes, réseau.
// Routes : ARCHITECTURE-SUITE § 2.3.

/** Charge utile lue dans le QR de compte (`OA1…`) : suivre la personne (ou lui demander, compte privé). */
export const followByQrSchema = z.object({ payload: z.string().min(8).max(200) });
/** Lien de profil `/ami/:jeton` (ancien « lien d'ami ») : suivre la personne. */
export const followByInviteSchema = z.object({ token: z.string().min(6).max(64) });

export const peopleSearchQuery = pageQuery.extend({
  q: z.string().trim().max(60).optional(),
  department: departmentSchema.optional(),
  /** Lot R2, tour 2 (« Mon coin » choisi) : l'un de ces départements, séparés par des virgules (comptes au détail visible). */
  departments: z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v),
    z.array(departmentSchema).max(20).optional(),
  ),
  categoryId: z.uuid().optional(),
  makeId: z.uuid().optional(),
  modelId: z.uuid().optional(),
  generationId: z.uuid().optional(),
  grade: gradeSchema.optional(),
});
export type PeopleSearchQuery = z.infer<typeof peopleSearchQuery>;

/** Mon lien avec une personne : mon abonnement vers elle (`mine`), et si elle me suit (abonnement accepté). */
export type FollowRelation = { mine: FollowState; followsMe: boolean };

/** Carte d'une personne (recherche, propriétaires près de chez moi). Jamais de plaque, de nom ni de contact. */
export type PersonCard = {
  userId: string;
  pseudo: string;
  avatarUrl: string | null;
  grade: z.infer<typeof gradeSchema>;
  /** Départements du secteur : absents d'un compte privé dont on n'est pas abonné accepté. */
  departments: string[] | null;
  /** Marque + modèle (+ génération si le profil le permet, jamais l'année ni la plaque). */
  vehicles: { id: string; label: string }[];
  /** Lot R6b : mon lien avec elle (bouton « Suivre », étiquette « Te suit »). */
  follow: FollowRelation;
};

/** Fiche d'un véhicule d'un autre (`GET /vehicles/:id`) : complète ou réduite, avec son propriétaire. */
export type OtherVehicle = (VehiclePublic | VehiclePrivate) & {
  /** Vrai si la fiche complète est consultable (compte public ou abonné accepté). */
  detailed: boolean;
  owner: Pick<PersonCard, "userId" | "pseudo" | "avatarUrl" | "grade">;
};

export type PeopleSearchPage = { items: PersonCard[]; nextCursor: string | null };

/**
 * Lot R2 (Personnes et crews à l'ouverture, maquette R2.6) : des suggestions courtes, tirées de données publiques
 * seulement. « Même modèle que toi » : des comptes publics (ni moi, ni ceux que je suis) dont le garage a le modèle d'un
 * de mes véhicules. Ni « Suivis par tes abonnements » (aucune liste n'est publique) ni « Vus aux mêmes sorties » (il faudrait
 * l'accord de chacun : v2.1, « Le plateau »).
 */
export type PeopleSuggestions = {
  sameModel: { model: string; vehicle: string; items: PersonCard[] } | null;
};
export const peopleSuggestionsQuery = z.object({
  department: departmentSchema.optional(),
  /** Lot R2, tour 2 : l'un de ces départements (le lieu choisi, ou mon coin), séparés par des virgules. */
  departments: z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v),
    z.array(departmentSchema).max(20).optional(),
  ),
});

export type ProfileVehicle = {
  id: string;
  label: string;
  makeName: string;
  modelName: string;
  photoUrl: string | null;
  /** Vrai si la fiche complète (génération, année, photos) est consultable. */
  detailed: boolean;
  /** Lot R4c : le véhicule principal de la personne (en premier dans la vitrine). */
  main: boolean;
  /** Lot R5b : l'icône de la ligne (voiture, moto, camion). */
  vehicleType: VehicleType;
  /** Lot R5b (« Sa voiture ») : l'année et les catégories, seulement quand la fiche complète est consultable. */
  year: number | null;
  categories: string[];
};

export type ProfileEvent = {
  slug: string;
  title: string;
  startsAt: string;
  city: string | null;
  posterUrl: string | null;
  /** Lot C5 : photo de la voiture de l'affiche, `null` sans photo. */
  photoUrl: string | null;
  structureName: string;
};

/** Profil d'un autre selon l'audience (compatible avec l'aperçu `/me/public-preview`, type `PublicProfile`). */
export type UserProfileView = Omit<PublicProfile, "vehicles"> & {
  userId: string;
  audience: ProfileAudience;
  vehicles: ProfileVehicle[];
  upcomingEvents: ProfileEvent[] | null;
  /** Événements passés des 12 derniers mois : le nombre et les titres. */
  pastEvents: { count: number; titles: string[] } | null;
  /** Crews actifs de la personne (lot 19), pour les audiences qui voient tout le profil. */
  crews: CrewCard[] | null;
  /** Organisateur seulement : coordonnées déjà accessibles dans son tri. */
  contact: { firstName: string | null; lastName: string | null; phone: string | null; email: string | null } | null;
  /**
   * Lot R4c : abonnés et abonnements ; tour 2 (Damien, 24/10) : visibles de tout membre connecté, comme
   * `outingsCount`, même pour un compte privé. Lot R6b : abonnés acceptés seulement (une demande ne compte pas).
   */
  followersCount: number | null;
  followingCount: number | null;
  /** Nombre de sorties (retenu, 12 derniers mois et à venir, hors événements sur invitation). */
  outingsCount: number | null;
  /**
   * Lot R6b (maquette R6.1) : le bouton unique. `canFollow` : suivre ou demander est possible (ni soi-même, ni un compte
   * indisponible) ; `mine` : mon abonnement (aucun, demande en attente, accepté) ; `followsMe` : la personne me suit
   * (abonnement accepté), d'où l'étiquette « Te suit » et « Suivre en retour ».
   */
  follow: { canFollow: boolean } & FollowRelation;
  /**
   * Lot R5b (maquette R5.5) : ses réseaux, pseudos seuls (le lien vient de `socialUrl`). Mêmes audiences que la
   * description : tout membre connecté pour un compte public, ses abonnés acceptés pour un compte privé ; `null` sinon.
   */
  socials: ProfileSocials | null;
  /**
   * Lot R5b (maquette R5.6) : la première sortie à venir (la première de `upcomingEvents`), et « Toi aussi » : la personne
   * qui regarde y va aussi (candidature en cours ou billet valide), calculé pour elle seule. `null` sans sortie à venir
   * ou quand les sorties ne sont pas visibles.
   */
  nextOuting: { event: ProfileEvent; together: boolean } | null;
  /**
   * Lot R5b : « Vu à », ses tampons de la saison en cours (les plus récents d'abord, 12 au plus) et le nombre de sorties
   * tamponnées. Mêmes données et même visibilité que ses sorties passées : événements publiés, hors invitation, finis.
   */
  seenAt: { events: number; stamps: PassportStamp[] } | null;
};

/** Actualité du Journal : personne concernée (avatar affiché devant l'item). */
export type JournalActor = { userId: string; pseudo: string; avatarUrl: string | null };

// --- Réseau (lot R4c) : suivre une personne, listes visibles par soi seul ----------------------------------------------

/**
 * `GET /me/network` : les nombres de l'en-tête du profil (abonnements = personnes + organisateurs + pros) et les
 * demandes reçues en attente (onglet Demandes de « Ton réseau », compte privé).
 */
export type NetworkCounts = {
  followers: number;
  following: number;
  followingBy: { people: number; structures: number; pros: number };
  /** Lot R6b (maquette R6.2) : le troisième nombre de l'onglet Profil, mes sorties (même règle que mon profil). */
  outings: number;
  /** Lot R6b : demandes d'abonnement reçues en attente. */
  requestsIn: number;
  /** Lot R6b : mon compte est privé (l'onglet Demandes n'existe que pour lui). */
  private: boolean;
};

/** Une personne des listes Abonnés / Abonnements / Demandes. */
export type FollowPerson = Pick<PersonCard, "userId" | "pseudo" | "avatarUrl" | "grade"> &
  FollowRelation & {
    /** Son véhicule principal (marque et modèle, jamais la plaque), `null` sans véhicule actif. */
    vehicle: string | null;
    /** Suivre (ou demander) est possible. */
    canFollow: boolean;
    /** Son compte est public (« Suivre en retour » suit tout de suite) ou privé (une demande). */
    visibility: "public" | "private";
  };

/** Lot R6b : une demande d'abonnement reçue (`GET /me/follow-requests`) ; `id` = identifiant de son compte. */
export type FollowRequestsPage = { items: FollowPerson[]; nextCursor: string | null; total: number };

/** Un organisateur ou un pro suivi (onglet Abonnements). */
export type FollowedPage = { id: string; slug: string; name: string; logoUrl: string | null; caption: string | null };

export const networkListQuery = z.object({
  q: z.string().trim().max(40).optional(),
  cursor: z.string().max(200).optional(),
});
export const followingListQuery = networkListQuery.extend({
  kind: z.enum(["people", "structures", "pros"]).default("people"),
});
export type FollowingKind = z.infer<typeof followingListQuery>["kind"];

export type FollowersPage = { items: FollowPerson[]; nextCursor: string | null; total: number };
export type FollowingPage =
  | { kind: "people"; items: FollowPerson[]; nextCursor: string | null; total: number }
  | { kind: "structures" | "pros"; items: FollowedPage[]; nextCursor: string | null; total: number };

/** Lot R6b : après « Suivre », « Ne plus suivre » ou « Annuler la demande » : mon abonnement vers la personne. */
export type FollowResult = { mine: FollowState };

/** `GET /me/public-preview?as=member|follower` (lot R4c, R6b) : mon profil vu par un membre, ou par un abonné. */
export const publicPreviewQuery = z.object({ as: z.enum(["member", "follower"]).default("member") });
export type PreviewAs = z.infer<typeof publicPreviewQuery>["as"];

/** `PUT /me/main-vehicle` (lot R4c). */
export const mainVehicleSchema = z.object({ vehicleId: z.uuid() });

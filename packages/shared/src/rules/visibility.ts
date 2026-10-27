import type { ProfileVisibility } from "../enums";

// Visibilité des profils (docs/01 « Compte public ou privé », ARCHITECTURE-SUITE § 2.2).
// Pures : l'API les applique, l'appli et le site affichent le résultat sans le recalculer.
// Lot R6b (D37, 27/10) : plus d'« ami ». Ce que voyait l'ami, l'abonné accepté le voit (`follower`).

export const profileAudiences = ["self", "follower", "public_full", "public_limited", "organizer"] as const;
export type ProfileAudience = (typeof profileAudiences)[number];

/**
 * Ce que voit `viewer` du profil de `target`. Ordre : soi-même, organisateur (superset de l'abonné : tout +
 * coordonnées), abonné accepté (tout, quel que soit le réglage), puis le réglage public / privé du compte. Une demande
 * en attente ne donne rien de plus.
 */
export function profileAudience(input: {
  isSelf: boolean;
  /** La personne qui regarde suit la cible, demande acceptée. */
  isFollower: boolean;
  isOrganizer: boolean;
  visibility: ProfileVisibility;
}): ProfileAudience {
  if (input.isSelf) return "self";
  if (input.isOrganizer) return "organizer";
  if (input.isFollower) return "follower";
  return input.visibility === "public" ? "public_full" : "public_limited";
}

/** Champs d'un profil selon l'audience. La plaque n'y figure jamais : aucune audience ne la voit sur un profil. */
export type ProfileFields = {
  bio: boolean;
  departments: boolean;
  /** Véhicule complet (génération, année, fiche, photos) ; sinon marque + modèle seulement. */
  vehicleDetails: boolean;
  upcomingEvents: boolean;
  pastEvents: boolean;
  crews: boolean;
  /** Lot R5b : les réseaux, comme le profil complet (compte public : membres connectés ; compte privé : abonnés acceptés). */
  socials: boolean;
  /** Nom, prénom, téléphone, e-mail : l'organisateur seulement. */
  contact: boolean;
};

export function profileFields(audience: ProfileAudience): ProfileFields {
  const everything = audience !== "public_limited";
  return {
    bio: everything,
    departments: everything,
    vehicleDetails: everything,
    upcomingEvents: everything,
    pastEvents: everything,
    crews: everything,
    socials: everything,
    contact: audience === "organizer",
  };
}

/**
 * Lot R4b (maquette R4.3b, choix validé par Damien le 24/10) : la fiche de la voiture d'un compte privé, vue par un
 * autre (plateau, `GET /vehicles/:id`). La photo (plaque masquée), la marque, le modèle, la génération et les
 * catégories ; rien d'autre : ni année, ni fiche technique, ni description, ni historique, ni plaque. Liste blanche.
 */
export const privateVehicleFields = [
  "id",
  "label",
  "vehicleType",
  "makeName",
  "modelName",
  "generationName",
  "photoUrl",
  "categories",
] as const;
export type PrivateVehicleField = (typeof privateVehicleFields)[number];

// --- Recherche de personnes --------------------------------------------------------------------------------------

/** Longueur minimale du texte d'une recherche de personnes. */
export const PEOPLE_SEARCH_MIN_QUERY = 2;

/**
 * Lot R2, tour 2 (relecture : plus aucun annuaire) : sans texte d'au moins deux caractères, aucune liste de personnes.
 * Les filtres (département, centre d'intérêt, grade, véhicule) ne font qu'affiner une recherche par texte ; seuls,
 * page après page, ils reconstitueraient un annuaire de tous les comptes.
 */
export function hasPeopleSearchCriteria(c: { q?: string | null }): boolean {
  return Boolean(c.q && c.q.trim().length >= PEOPLE_SEARCH_MIN_QUERY);
}

// --- Journal -------------------------------------------------------------------------------------------------------

/** Le Journal remonte 7 jours en arrière, sauf les éléments non lus (ARCHITECTURE-SUITE § 2.4). */
export const JOURNAL_WINDOW_DAYS = 7;

export function journalWindowStart(now: Date): Date {
  return new Date(now.getTime() - JOURNAL_WINDOW_DAYS * 86_400_000);
}

export function inJournalWindow(item: { createdAt: Date; readAt: Date | null }, now: Date): boolean {
  return item.readAt === null || item.createdAt >= journalWindowStart(now);
}

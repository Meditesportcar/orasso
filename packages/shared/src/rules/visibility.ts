import type { ProfileVisibility } from "../enums";

// Visibilité des profils (docs/01 « Compte public ou privé », ARCHITECTURE-SUITE § 2.2) et règles de l'amitié.
// Pures : l'API les applique, l'appli et le site affichent le résultat sans le recalculer.

export const profileAudiences = ["self", "friend", "public_full", "public_limited", "organizer"] as const;
export type ProfileAudience = (typeof profileAudiences)[number];

/**
 * Ce que voit `viewer` du profil de `target`. Ordre : soi-même, organisateur (superset de l'ami : tout + coordonnées),
 * ami (tout, quel que soit le réglage), puis le réglage public / privé du compte.
 */
export function profileAudience(input: {
  isSelf: boolean;
  isFriend: boolean;
  isOrganizer: boolean;
  visibility: ProfileVisibility;
}): ProfileAudience {
  if (input.isSelf) return "self";
  if (input.isOrganizer) return "organizer";
  if (input.isFriend) return "friend";
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
  friendsCount: boolean;
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
    friendsCount: everything,
    contact: audience === "organizer",
  };
}

// --- Amitié ------------------------------------------------------------------------------------------------------

export const friendshipStatuses = ["pending", "accepted", "declined"] as const;
export type FriendshipStatus = (typeof friendshipStatuses)[number];

export const friendSources = ["search", "qr", "invite_link", "profile", "event"] as const;
export type FriendSource = (typeof friendSources)[number];

/** Un refus bloque une nouvelle demande du même demandeur pendant 30 jours (S7). */
export const FRIEND_DECLINE_COOLDOWN_DAYS = 30;
/** Demandes d'ami par personne et par jour. */
export const FRIEND_REQUESTS_PER_DAY = 20;
export const FRIEND_MESSAGE_MAX = 200;

export type FriendshipRowLike = {
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  respondedAt: Date | null;
};

/** État de la relation vu par `me` : sert aux boutons Ami / Demande envoyée / Accepter. */
export type FriendshipState = "none" | "friends" | "pending_out" | "pending_in";

export function friendshipState(row: FriendshipRowLike | null | undefined, me: string): FriendshipState {
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  if (row.status === "pending") return row.requesterId === me ? "pending_out" : "pending_in";
  // Refusée : pour le demandeur comme pour le destinataire, aucune demande n'est en cours.
  return "none";
}

export type FriendRequestOutcome =
  | { kind: "create" }
  /** La ligne existe (refusée) : elle repasse en attente, `flip` si le demandeur et le destinataire s'inversent. */
  | { kind: "reopen"; flip: boolean }
  | { kind: "error"; code: "friendship_exists" | "recently_declined" | "already_friends" };

/**
 * Que faire d'une demande d'ami de `me` vers l'autre personne, d'après la relation existante (une seule ligne par paire) :
 * - aucune ligne → créer ;
 * - déjà amis → `already_friends` ; demande en attente (dans un sens ou l'autre) → `friendship_exists` ;
 * - refusée : le même demandeur attend 30 jours (`recently_declined`) puis la ligne repasse en attente ; le destinataire
 *   du refus peut demander à tout moment (la ligne s'inverse).
 */
export function friendRequestOutcome(
  row: FriendshipRowLike | null | undefined,
  me: string,
  now: Date,
): FriendRequestOutcome {
  if (!row) return { kind: "create" };
  if (row.status === "accepted") return { kind: "error", code: "already_friends" };
  if (row.status === "pending") return { kind: "error", code: "friendship_exists" };
  if (row.requesterId !== me) return { kind: "reopen", flip: true };
  const since = row.respondedAt ? now.getTime() - row.respondedAt.getTime() : Number.POSITIVE_INFINITY;
  if (since < FRIEND_DECLINE_COOLDOWN_DAYS * 86_400_000) return { kind: "error", code: "recently_declined" };
  return { kind: "reopen", flip: false };
}

// --- Recherche de personnes --------------------------------------------------------------------------------------

/** Longueur minimale d'un pseudo recherché (sauf si un filtre est posé). */
export const PEOPLE_SEARCH_MIN_QUERY = 2;

/** Une recherche sans aucun critère ne liste pas tout le monde. */
export function hasPeopleSearchCriteria(c: {
  q?: string | null;
  department?: string | null;
  categoryId?: string | null;
  makeId?: string | null;
  modelId?: string | null;
  generationId?: string | null;
  grade?: string | null;
}): boolean {
  return Boolean(
    (c.q && c.q.trim().length >= PEOPLE_SEARCH_MIN_QUERY) ||
      c.department ||
      c.categoryId ||
      c.makeId ||
      c.modelId ||
      c.generationId ||
      c.grade,
  );
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

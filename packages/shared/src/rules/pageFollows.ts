// Qui peut suivre qui, au nom de qui (lot R9a, ARCHITECTURE-R8 § 1.7 et § 6 T6). Règle pure : l'API charge l'état des deux
// côtés (page en règle, confidentialité d'un compte, même compte derrière les deux) et la déclinaison est ici.
//
// - Une personne suit un prestataire ou un média ; pour les personnes, les structures et les pros, ses abonnements
//   restent dans leurs trois tables d'origine (`user_follows`, `structure_follows`, `pro_follows`) : jamais deux vérités.
// - Une page (structure, fiche pro, prestataire, média) suit une autre page en règle ou un compte public en règle.
//   Jamais un compte privé : pas de demande d'abonnement au nom d'une page (T6).
import type { ProfileVisibility } from "../enums";
import type { AuthorKind } from "./authors";

export type FollowSubject = { kind: AuthorKind; id: string };

export type FollowTarget = FollowSubject & {
  /** Page en règle (structure ni supprimée ni suspendue, fiche pro publiée, prestataire ou média non supprimé) ou compte actif. */
  available: boolean;
  /** Compte seulement : son réglage de confidentialité. */
  visibility?: ProfileVisibility;
  /** Le compte qui suit est celui qui est derrière la cible (sa propre page, ou son compte quand c'est une page qui suit). */
  sameAccount?: boolean;
};

export type PageFollowRefusal = "self" | "existing_route" | "unavailable" | "private_account";

const isPage = (kind: AuthorKind) => kind !== "user";

/** `null` = permis. */
export function canFollow(follower: FollowSubject, target: FollowTarget): PageFollowRefusal | null {
  if ((follower.kind === target.kind && follower.id === target.id) || target.sameAccount) return "self";
  // Une personne : seulement un prestataire ou un média (le reste passe par les routes existantes).
  if (!isPage(follower.kind) && target.kind !== "provider" && target.kind !== "media") return "existing_route";
  if (!target.available) return "unavailable";
  // Une page : un compte privé est refusé (T6).
  if (isPage(follower.kind) && target.kind === "user" && target.visibility !== "public") return "private_account";
  return null;
}

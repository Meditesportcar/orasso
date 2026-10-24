import type { ProfileVisibility } from "../enums";

// Lot R4c (maquette R4.6, 10.2 validée) : suivre une personne, sans acceptation. Suivre ne montre rien de plus que le
// profil déjà visible ; les listes (abonnés, abonnements, amis) ne sont visibles que par soi.

/** Taille d'une page des listes du réseau (abonnés, abonnements). */
export const FOLLOW_PAGE_SIZE = 30;

/**
 * « Suivre » n'existe que vers un compte public, jamais vers soi : un compte privé n'a que « Ajouter en ami » (suivre ne
 * montrerait rien de plus). Un compte supprimé, banni ou suspendu n'est pas suivable non plus.
 */
export function canFollowUser(input: {
  isSelf: boolean;
  visibility: ProfileVisibility;
  /** Supprimé, banni ou suspendu en ce moment. */
  unavailable?: boolean;
}): boolean {
  return !input.isSelf && !input.unavailable && input.visibility === "public";
}

/** Une notification « … te suit » par paire au plus par 24 h (suivre, ne plus suivre, suivre : pas de nouvelle alerte). */
export const FOLLOW_NOTIFY_WINDOW_MS = 24 * 3_600_000;

/** Texte de la notification regroupée : « Kenji_66 te suit », « Kenji_66 et Lea_11 te suivent », « … et 3 autres ». */
export function followNotificationBody(pseudos: readonly string[], total: number): string {
  const [first, second] = pseudos;
  if (!first) return "";
  if (total <= 1) return `${first} te suit.`;
  if (total === 2 && second) return `${first} et ${second} te suivent.`;
  const others = total - 1;
  return `${first} et ${others} autres personnes te suivent.`;
}

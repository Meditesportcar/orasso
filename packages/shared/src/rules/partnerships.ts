// Partenariats entre un pro et un passionné (lot R7m1, ARCHITECTURE-R7 § 1.7 et § 2.10, décision D38). Fonctions pures,
// communes à l'API, au site et à l'appli : qui peut proposer, qui voit un partenariat et jusqu'où.
// Aucune rémunération ne passe par Orasso : rien ici ni ailleurs ne porte de somme.
import { fromWallTime } from "./time";

export const partnershipStatuses = ["pending", "active", "declined", "ended"] as const;
export type PartnershipStatus = (typeof partnershipStatuses)[number];

/** Texte de la proposition : court (maquette R7.19), 200 caractères au plus. */
export const PARTNERSHIP_MESSAGE_MAX = 200;

/** Après un refus, le même pro ne repropose pas à la même personne avant 30 jours (même esprit que la demande d'abonnement). */
export const PARTNERSHIP_RETRY_DAYS = 30;

/** Au plus 3 propositions d'un même pro à une même personne sur 30 jours, toutes causes confondues (retrait, refus, fin). */
export const PARTNERSHIP_MAX_PER_PERIOD = 3;

/** Date (Paris, minuit) à partir de laquelle proposer un partenariat demande l'abonnement pro. Réglable : `partnerships.subscription_from`. */
export const PARTNERSHIP_SUBSCRIPTION_FROM_DEFAULT = "2027-06-21";

/** `AAAA-MM-JJ` : un vrai jour du calendrier. */
export function isIsoDay(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

/** Instant de minuit (heure de Paris) du jour du réglage. */
export function subscriptionFromInstant(subscriptionFrom: string): Date {
  const [year = 0, month = 0, day = 0] = subscriptionFrom.split("-").map(Number);
  return fromWallTime({ year, month, day, hour: 0, minute: 0 });
}

export type PartnershipRefusal = "not_verified" | "not_published" | "subscription_required";

/**
 * Un pro peut-il proposer ? Il faut une fiche vérifiée (SIRET) et publiée. À partir de `subscriptionFrom`, il faudra l'abonnement
 * pro ; tant que la billetterie pro n'existe pas, personne ne l'a : la proposition est refusée pour tous (le réglage
 * permet de reculer la date).
 */
export function canPropose(
  pro: { verifiedAt: Date | null; publishedAt: Date | null },
  settings: { subscriptionFrom: string },
  now: Date,
): PartnershipRefusal | null {
  if (!pro.verifiedAt) return "not_verified";
  if (!pro.publishedAt) return "not_published";
  if (now.getTime() >= subscriptionFromInstant(settings.subscriptionFrom).getTime()) return "subscription_required";
  return null;
}

/** Ce que la personne qui regarde voit d'un partenariat : rien, la ligne réduite (pseudo, grade), ou tout. */
export type PartnershipView = "none" | "limited" | "full";

/**
 * Qui voit un partenariat :
 * - sans compte connecté : rien (les identifiés ne sont jamais montrés à un visiteur) ;
 * - une proposition, un refus, une fin : la personne concernée et le titulaire de la fiche, personne d'autre (le titulaire
 *   sans la voiture si le compte est privé et qu'il n'en est pas l'abonné accepté) ;
 * - un partenariat actif : la personne concernée voit tout ; pour les autres membres connectés, tout si son compte est
 *   public ou s'ils sont ses abonnés acceptés, sinon la ligne réduite (pseudo et grade, sans voiture).
 */
export function partnershipVisibleTo(
  viewer: { userId: string | null },
  partnership: { status: PartnershipStatus; userId: string; proOwnerId: string; userVisibility: "public" | "private" },
  rel: { followAccepted: boolean },
): PartnershipView {
  if (!viewer.userId) return "none";
  if (viewer.userId === partnership.userId) return "full";
  const regard = partnership.userVisibility === "public" || rel.followAccepted ? "full" : "limited";
  // Le titulaire de la fiche lit sa proposition, mais la voiture (« full ») ne sort que s'il a encore le droit de la voir :
  // compte passé privé ou abonné retiré depuis la proposition, plus de voiture.
  if (partnership.status !== "active") return viewer.userId === partnership.proOwnerId ? regard : "none";
  return regard;
}

/** Date de début de la ligne « depuis le 8 nov. ». */
export function partnershipSince(partnership: { respondedAt: Date | null; proposedAt: Date }): Date {
  return partnership.respondedAt ?? partnership.proposedAt;
}

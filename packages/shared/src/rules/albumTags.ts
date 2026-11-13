import { albumLabels } from "../labels/albums.fr";
import { albumTagLabels } from "../labels/albumTags.fr";
import type { AlbumPlateState } from "../schemas/albums";
import type { AlbumTagger, AlbumTagRemovedReason, AlbumTagTarget, TagRole } from "../schemas/albumTags";

// Identification sur une photo d'album (lot R9f) : règles pures. L'API les applique, l'appli et le site affichent le résultat.
// `now` n'intervient nulle part : aucune règle ici ne lit l'heure.

/**
 * Peut-on poser cette identification ? Le média auteur et l'organisateur identifient toute voiture (ou personne) proposée par
 * le plateau ; l'intéressé (« propriétaire ») seulement sa propre voiture et son propre pseudo.
 */
export function canTagAlbum(role: TagRole, viewerId: string, target: { ownerId: string }): boolean {
  if (role === "owner") return target.ownerId === viewerId;
  return true;
}

/** Le lien de la personne qui regarde avec l'identifié. */
export type TagRelation = {
  /** C'est moi l'identifié. */
  self: boolean;
  /** Je suis le média auteur de l'album. */
  mediaAuthor: boolean;
  /** Je suis responsable de la structure de l'événement (propriétaire ou co-organisateur actif). */
  manager: boolean;
  /** Je suis un abonné accepté de l'identifié. */
  followerAccepted: boolean;
};

/**
 * Qui voit une identification (T5). Sans session : jamais (ni pseudo, ni nombre). Compte public : tout membre connecté.
 * Compte **privé** : lui-même, le média auteur, les responsables de la structure et ses abonnés acceptés, personne d'autre.
 */
export function canSeeTag(input: { hasSession: boolean; accountPrivate: boolean }, relation: TagRelation): boolean {
  if (!input.hasSession) return false;
  if (!input.accountPrivate) return true;
  return relation.self || relation.mediaAuthor || relation.manager || relation.followerAccepted;
}

/**
 * Le pseudo accompagne-t-il l'identification ? Une identification par pseudo le montre à qui la voit (celui qui l'a posée
 * le connaissait). Pour une **voiture**, le pseudo suit la règle du plateau à choisir : compte public, lui-même, ou abonné
 * accepté ; pour un compte privé, « <voiture> » sans pseudo (le média ni l'organisateur ne l'apprennent par la liste).
 */
export function tagPseudoShown(
  input: { kind: AlbumTagTarget; accountPrivate: boolean },
  relation: Pick<TagRelation, "self" | "followerAccepted">,
): boolean {
  if (input.kind === "user") return true;
  if (!input.accountPrivate) return true;
  return relation.self || relation.followerAccepted;
}

/**
 * Le geste de retrait de cette personne sur cette identification :
 * - l'intéressé : `withdraw` si c'est lui qui l'avait posée (« Retirer mon identification »), `not_mine` sinon (« Ce n'est pas
 *   ma voiture ») ; dans les deux cas elle ne peut plus être reposée par un autre ;
 * - celui qui l'a posée en tant que média ou organisateur : `tagger` (erreur de voiture), tant que l'intéressé ne l'a pas retirée ;
 * - personne d'autre : `null`.
 */
export function tagRemovalKind(
  tag: { userId: string; taggedBy: string; taggedAs: AlbumTagger },
  viewer: { id: string; isMediaAuthor: boolean; isOrganizer: boolean },
): AlbumTagRemovedReason | null {
  if (viewer.id === tag.userId) return tag.taggedBy === viewer.id ? "withdraw" : "not_mine";
  if (tag.taggedAs === "media" && viewer.isMediaAuthor) return "tagger";
  if (tag.taggedAs === "organizer" && viewer.isOrganizer) return "tagger";
  return null;
}

/** `not_mine` prévient celui qui a posé l'identification ; `withdraw` et `tagger` ne préviennent personne. */
export const removalNotifies = (reason: AlbumTagRemovedReason): boolean => reason === "not_mine";

/** Une identification retirée par l'intéressé : personne d'autre ne la repose. */
export const declinedByInterested = (reason: AlbumTagRemovedReason | null): boolean =>
  reason === "not_mine" || reason === "withdraw";

/** Le titre de la notification d'identification (T40) : une par album et par personne. */
export function tagNotificationTitle(input: {
  kind: AlbumTagTarget;
  mediaName: string;
  count: number;
  vehicleLabel: string | null;
  eventTitle: string;
}): string {
  if (input.kind === "vehicle" && input.vehicleLabel) {
    return albumTagLabels.taggedTitle(input.mediaName, input.count, input.vehicleLabel, input.eventTitle);
  }
  return albumTagLabels.taggedUserTitle(input.mediaName, input.count, input.eventTitle);
}

/** Le titre de la notification « Ce n'est pas ma voiture » : jamais le pseudo d'un compte privé. */
export function tagDeclinedTitle(input: { kind: AlbumTagTarget; pseudo: string | null; albumTitle: string }): string {
  const who = input.pseudo ?? albumTagLabels.declinedWho;
  return input.kind === "user"
    ? albumTagLabels.declinedUserTitle(who, input.albumTitle)
    : albumTagLabels.declinedTitle(who, input.albumTitle);
}

/**
 * « En story » (T38) : que devient la plaque de la copie ? `blurred` et `none` : la copie telle quelle ; `kept` (plaque lisible
 * gardée par le média) : la copie est **floutée** avec les cadres gardés, une story exige une plaque traitée ; `unknown`
 * (ancienne galerie, plaque jamais regardée) : refusé.
 */
export function storyPlateOfAlbumPhoto(
  state: AlbumPlateState,
): { ok: true; plate: "blurred" | "none_confirmed"; blur: boolean } | { ok: false; reason: "plate_unknown" } {
  if (state === "unknown") return { ok: false, reason: "plate_unknown" };
  if (state === "none") return { ok: true, plate: "none_confirmed", blur: false };
  if (state === "kept") return { ok: true, plate: "blurred", blur: true };
  return { ok: true, plate: "blurred", blur: false };
}

/** « Enregistrer » : autorisé par le média, ou toujours pour le média auteur lui-même. */
export const canSavePhoto = (input: { allowSave: boolean; isMediaAuthor: boolean }): boolean =>
  input.isMediaAuthor || input.allowSave;

/** La ligne de crédit imprimée sur un fichier qui sort d'Orasso et sous la story : « Photos : <média> ». */
export const albumCreditLine = (mediaName: string): string => albumLabels.creditLine(mediaName);

// Regards et audiences de la vague R7 (ARCHITECTURE-R7 § 2.1). Le lot R7f1 crée ce fichier (stories, classement,
// présence) ; le lot R7e1 n'y pose que `canSeeFeedPost`, que le Fil utilise aussi. À la fusion, le coordinateur garde
// la version de R7f1 (même signature attendue) : un contenu du Fil n'est jamais visible sans session.
import type { ProfileVisibility } from "../enums";

/** Qui regarde : `null` = visiteur sans compte (jamais de Fil). */
export type AudienceViewer = { userId: string } | null;

/** Le lien entre le lecteur et l'auteur, décidé par l'API (jamais par l'écran). */
export type AudienceRel = {
  /** Le lecteur suit l'auteur, demande acceptée (`user_follows.status = accepted`). */
  followAccepted: boolean;
};

export type FeedPostFacts = {
  authorId: string;
  authorVisibility: ProfileVisibility;
  /** Auteur supprimé, banni ou suspendu en ce moment. */
  authorUnavailable: boolean;
  /** Publication retirée (par l'auteur ou la modération). */
  deleted: boolean;
};

/**
 * Une publication du Fil se voit : avec une session, jamais retirée, d'un auteur en règle ; compte public → tout
 * membre connecté ; compte privé → ses abonnés acceptés et lui-même (un abonnement en attente ne voit rien). Rien d'un
 * crew : les publications de crew (`crew_posts`) ne sont pas des publications du Fil (D36).
 */
export function canSeeFeedPost(viewer: AudienceViewer, post: FeedPostFacts, rel: AudienceRel): boolean {
  if (!viewer || post.deleted) return false;
  if (viewer.userId === post.authorId) return true;
  if (post.authorUnavailable) return false;
  if (post.authorVisibility === "public") return true;
  return rel.followAccepted;
}

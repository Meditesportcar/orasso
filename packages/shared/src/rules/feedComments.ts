// Commentaires d'une publication du Fil (vague R8, lot R8k1, ARCHITECTURE-R8 § 1.2 et § 2.6). Règles pures, communes à
// l'API, au site et à l'appli : qui voit un commentaire, un seul niveau de réponses, les pseudos cités.
import type { AudienceRel } from "./audience";

/** Longueur d'un commentaire (1 à 300 caractères, vérifiée aussi par la base). */
export const FEED_COMMENT_MAX = 300;
/** Pseudos cités au plus dans un commentaire : les suivants ne préviennent personne. */
export const FEED_COMMENT_MENTIONS_MAX = 5;
/** Commentaires de premier niveau (ou réponses) par page. */
export const FEED_COMMENTS_PAGE = 20;
/** Commentaires montrés sous une carte. */
export const FEED_COMMENT_PREVIEW_COUNT = 2;
/** Personnes proposées au plus quand on tape « @ ». */
export const FEED_MENTION_SUGGESTIONS_MAX = 8;
/** Au moins ce nombre de caractères pour chercher hors de ses liens : jamais un annuaire. */
export const FEED_MENTION_QUERY_MIN = 2;
/** Début du commentaire repris dans le corps d'une notification. */
export const FEED_COMMENT_EXCERPT_MAX = 120;

/** Pourquoi une personne est proposée après « @ » (le libellé vit dans `labels/feedComments.fr.ts`). */
export const mentionWhys = ["thread", "following", "follower", "event"] as const;
export type MentionWhy = (typeof mentionWhys)[number];

/** Le regard de la personne qui lit : son compte, et si elle gère la publication (son auteur, ou la page avec second facteur). */
export type CommentViewer = { userId: string; managesPost: boolean };

/** Ce qu'on sait d'un commentaire pour décider de sa lecture. */
export type CommentFacts = {
  authorId: string;
  authorVisibility: "public" | "private";
  /** Auteur supprimé, banni ou suspendu en ce moment. */
  authorUnavailable: boolean;
  /** Le commentaire est supprimé, ou le commentaire dont il est la réponse. */
  deleted: boolean;
};

/**
 * Le commentaire est-il servi à ce lecteur ? Suppose que la publication elle-même est visible (`canSeeFeedPost`). Un
 * commentaire n'est servi que si son auteur est en règle ; celui d'un compte privé n'est servi qu'à lui, à ses abonnés
 * acceptés et à ceux qui gèrent la publication (sans cela l'auteur d'une publication ne pourrait pas modérer la sienne).
 */
export function canSeeComment(viewer: CommentViewer, facts: CommentFacts, rel: AudienceRel): boolean {
  if (facts.deleted || facts.authorUnavailable) return false;
  if (facts.authorVisibility === "public") return true;
  return facts.authorId === viewer.userId || rel.followAccepted || viewer.managesPost;
}

/** Un commentaire visé par une réponse. `deleted` vaut aussi quand le commentaire racine est supprimé. */
export type CommentParentFacts = { id: string; parentId: string | null; postId: string; deleted: boolean };

export type CommentParent = { ok: true; parentId: string | null } | { ok: false };

/**
 * Où rattacher un nouveau commentaire. Un seul niveau : répondre à une réponse rattache au commentaire de premier niveau.
 * `parent` est `null` pour un commentaire de premier niveau ; un parent supprimé ou d'une autre publication est refusé.
 */
export function commentParent(parent: CommentParentFacts | null | undefined, postId: string): CommentParent {
  if (parent === null) return { ok: true, parentId: null };
  if (!parent || parent.deleted || parent.postId !== postId) return { ok: false };
  return { ok: true, parentId: parent.parentId ?? parent.id };
}

/** Pseudo : lettres, chiffres, « _ » et « . » (3 à 24), comme `pseudoSchema`. */
const MENTION = /@([A-Za-z0-9_.]{3,24})/g;
const WORD_CHAR = /[\p{L}\p{N}_@]/u;

/**
 * Les pseudos cités dans un commentaire (`@Kenji_66`), dans l'ordre, sans doublon (sans tenir compte de la casse), 5 au
 * plus. Jamais dans un mot ni une adresse e-mail ; un point final de phrase n'est pas du pseudo.
 */
export function commentMentions(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(MENTION)) {
    const at = m.index ?? 0;
    const before = at > 0 ? text.charAt(at - 1) : "";
    const prev = at > 1 && /[\uDC00-\uDFFF]/.test(before) ? text.slice(at - 2, at) : before;
    if (prev && WORD_CHAR.test(prev)) continue;
    const pseudo = (m[1] ?? "").replace(/\.+$/, "");
    if (pseudo.length < 3) continue;
    // Un mot plus long que 24 caractères n'est pas un pseudo : on ne le coupe pas.
    const next = text.charAt(at + 1 + (m[1] ?? "").length);
    if (next && /[A-Za-z0-9_]/.test(next)) continue;
    if (out.some((p) => p.toLowerCase() === pseudo.toLowerCase())) continue;
    out.push(pseudo);
    if (out.length >= FEED_COMMENT_MENTIONS_MAX) break;
  }
  return out;
}

/** Le début d'un commentaire pour un corps de notification (coupé sur un mot, « … » si coupé). */
export function commentExcerpt(text: string, max: number = FEED_COMMENT_EXCERPT_MAX): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

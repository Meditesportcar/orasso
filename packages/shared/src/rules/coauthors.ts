// Collaboration (vague R8, lot R8o, ARCHITECTURE-R8 § 1.6, § 2.8) : règles pures. Un seul co-auteur par publication ; tant
// qu'il n'a pas accepté, rien ne le montre ; il se retire quand il veut ; seul l'auteur d'origine supprime. Aucune lecture
// de base ni d'horloge ici : l'API appelle ces fonctions, et les écrans s'en servent pour n'afficher que ce qui est permis
// (l'API revérifie toujours).
import { coauthorLabels } from "../labels/coauthors.fr";
import { type AuthorKind, parseAuthorKey } from "./authors";

export const coauthorStatuses = ["pending", "accepted", "declined", "withdrawn"] as const;
export type CoauthorStatus = (typeof coauthorStatuses)[number];

/** Les genres de co-auteur qu'on peut inviter dans cette livraison (le prestataire attend la livraison 3). */
export const coauthorKinds = ["user", "structure", "pro", "media"] as const satisfies readonly AuthorKind[];
export type CoauthorKind = (typeof coauthorKinds)[number];

/** Invitations envoyées par jour et par compte. */
export const COAUTHOR_INVITES_PER_DAY = 10;
/** Résultats de la recherche d'un co-auteur, et longueur minimale de la saisie. */
export const COAUTHOR_SEARCH_MAX = 8;
export const COAUTHOR_SEARCH_MIN_CHARS = 2;
/** La légende, dans la demande de l'Activité. */
export const COAUTHOR_CAPTION_PREVIEW_MAX = 120;

/** Seule une invitation acceptée se voit : le co-auteur est servi, signé, listé et compté seulement alors. */
export const coauthorShown = (status: CoauthorStatus): boolean => status === "accepted";

/** Pourquoi on ne peut pas inviter, ou `null`. */
export type InviteRefusal = "self" | "important" | "provider";

/**
 * Inviter ce co-auteur est-il permis (les règles qui ne demandent aucune lecture) ? Refus : soi-même ou la page au nom de
 * laquelle on publie (`self`), une « Info importante » (`important`), un prestataire (`provider`, livraison 3).
 * `authorKey` : la clé de l'auteur d'origine (la personne ou sa page) ; `targetKey` : la clé du co-auteur.
 */
export function inviteRefusal(input: {
  authorKey: string;
  /** Le compte qui publie : l'inviter lui-même, sous sa propre clé de personne, est aussi refusé. */
  publisherKey: string;
  targetKey: string;
  targetKind: AuthorKind;
  important: boolean;
}): InviteRefusal | null {
  if (input.targetKind === "provider") return "provider";
  if (input.targetKey === input.authorKey || input.targetKey === input.publisherKey) return "self";
  if (input.important) return "important";
  return null;
}

export const canInvite = (input: Parameters<typeof inviteRefusal>[0]): boolean => inviteRefusal(input) === null;

/** Répondre (accepter, refuser) : seulement à une invitation en attente. */
export const canRespond = (status: CoauthorStatus): boolean => status === "pending";

/**
 * Se retirer ou retirer l'autre. `by: "coauthor"` : « Me retirer », à tout moment une fois accepté (`withdrawn`) ; avant, c'est
 * un refus (`declined`). `by: "author"` : l'auteur d'origine annule l'invitation ou retire le co-auteur, à tout état.
 */
export function canWithdraw(by: "coauthor" | "author", status: CoauthorStatus): boolean {
  return by === "author" || status === "accepted" || status === "pending";
}

/** Supprimer la publication : l'auteur d'origine seulement, jamais le co-auteur. */
export const canDeletePost = (role: "author" | "coauthor" | "other"): boolean => role === "author";

/** « Kenji_66 et Wrap 66 ». */
export const signature = (author: { name: string }, coAuthor: { name: string }): string =>
  coauthorLabels.signature(author.name, coAuthor.name);

/**
 * L'étiquette « Avec … » d'une publication sur le profil de `viewedKey` : sur celui de l'auteur, « Avec <co-auteur> » ; sur
 * celui du co-auteur, « Avec <auteur> » ; ailleurs (ou sans co-auteur accepté), `null`.
 */
export function withLabel(
  viewedKey: string,
  post: { author: { key: string; name: string }; coAuthor: { key: string; name: string } | null },
): string | null {
  const co = post.coAuthor;
  if (!co) return null;
  if (viewedKey === post.author.key) return coauthorLabels.with(co.name);
  if (viewedKey === co.key) return coauthorLabels.with(post.author.name);
  return null;
}

/** La légende d'une demande : 120 caractères au plus, coupée sans couper un mot quand c'est possible. */
export function captionPreview(caption: string | null | undefined): string {
  const text = (caption ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= COAUTHOR_CAPTION_PREVIEW_MAX) return text;
  const cut = text.slice(0, COAUTHOR_CAPTION_PREVIEW_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > COAUTHOR_CAPTION_PREVIEW_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Le co-auteur choisi (un résultat de la recherche) tel que `POST /me/feed-posts` l'attend : `kind` et l'identifiant de sa clé. */
export function coAuthorInputOf(item: { key: string; kind: CoauthorKind }): { kind: CoauthorKind; id: string } {
  const parsed = parseAuthorKey(item.key);
  return { kind: item.kind, id: parsed?.id ?? "" };
}

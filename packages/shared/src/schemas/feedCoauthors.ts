import { z } from "zod";

import { type CoauthorKind, type CoauthorStatus, coauthorKinds } from "../rules/coauthors";

// Collaboration (vague R8, lot R8o) : l'invitation à la création, la recherche d'un co-auteur, la demande de l'Activité.

/**
 * `POST /me/feed-posts` + `coAuthor` : une personne, une structure, une fiche pro publiée ou un média. `id` est celui de la clé
 * d'auteur (`u:<compte>`, `s:<uuid>`…), jamais autre chose ; l'API relit tout (existence, état, droit de voir).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCOUNT_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const coAuthorInputSchema = z
  .object({
    kind: z.enum(coauthorKinds),
    id: z.string().trim().min(1).max(64),
  })
  .refine((v) => (v.kind === "user" ? ACCOUNT_RE.test(v.id) : UUID_RE.test(v.id)), {
    message: "Identifiant de co-auteur invalide",
    path: ["id"],
  })
  // Une page s'écrit en minuscules (comme sa clé d'auteur) avant toute comparaison ou écriture.
  .transform((v) => ({ kind: v.kind, id: v.kind === "user" ? v.id : v.id.toLowerCase() }));
export type CoAuthorInput = z.output<typeof coAuthorInputSchema>;

/** `GET /me/feed-posts/coauthor-search?q=&kind=` : moins de deux caractères, aucun résultat. */
export const coAuthorSearchQuery = z.object({
  q: z.string().trim().max(60).default(""),
  kind: z.enum(coauthorKinds).optional(),
});

export type CoAuthorSearchItem = {
  key: string;
  kind: CoauthorKind;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
  /** Pro partenaire actif de la personne qui cherche (la mention « Collaboration commerciale » s'appliquera). */
  partner: boolean;
};
export type CoAuthorSearchPage = { items: CoAuthorSearchItem[] };

/** Ce que l'auteur d'origine voit de son invitation (jamais le co-auteur ni un tiers). */
export type FeedCoAuthorInvite = { key: string; name: string; status: CoauthorStatus };

/** `payload` d'une demande de l'Activité, genre `coauthor` : liste blanche. */
export type CoAuthorRequestPayload = {
  postId: string;
  /** L'auteur d'origine : sa clé, son nom, sa photo (la page si la publication est celle d'une page). */
  author: { key: string; kind: string; name: string; avatarUrl: string | null };
  /** La clé invitée : la mienne (`u:…`) ou celle d'une page que je gère. */
  forKey: string;
  /** Le nom de la page invitée, ou `null` quand c'est moi. */
  forName: string | null;
  caption: string;
  photoUrl: string | null;
};

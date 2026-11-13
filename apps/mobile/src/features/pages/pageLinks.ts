// L'adresse de la page d'un auteur dans l'appli, d'après sa clé d'auteur (lot R9b, T6) : un seul endroit pour les cartes du Fil, les
// mentions et les commentaires. `u:` le profil d'une personne (par son pseudo), `s:` la page d'une structure et `p:` la fiche d'un pro
// (par leur adresse, `slug`), `v:` la page d'un prestataire et `m:` celle d'un média (par leur identifiant). Sans le mot dont
// l'adresse a besoin (un pseudo, un `slug`), pas d'adresse : `null`, l'appelant garde ce qu'il faisait.
import { parseAuthorKey } from "@orasso/shared";

export function pageHrefOf(
  authorKey: string,
  opts: { slug?: string | null; pseudo?: string | null } = {},
): string | null {
  const parsed = parseAuthorKey(authorKey);
  if (!parsed) return null;
  switch (parsed.kind) {
    case "user":
      return opts.pseudo ? `/u/${encodeURIComponent(opts.pseudo)}` : null;
    case "structure":
      return opts.slug ? `/o/${opts.slug}` : null;
    case "pro":
      return opts.slug ? `/p/${opts.slug}` : null;
    case "provider":
      return `/providers/${parsed.id}`;
    case "media":
      return `/m/${parsed.id}`;
  }
}

/** L'adresse publique d'une page à partager (le site), pour la feuille « QR de la page » : `/o/<slug>`, `/p/<slug>`, `/providers/<id>`, `/m/<id>`. */
export const publicPathOf = (
  kind: "structure" | "pro" | "provider" | "media",
  input: { slug?: string | null; id: string },
): string | null =>
  kind === "structure"
    ? input.slug
      ? `/o/${input.slug}`
      : null
    : kind === "pro"
      ? input.slug
        ? `/p/${input.slug}`
        : null
      : kind === "provider"
        ? `/providers/${input.id}`
        : `/m/${input.id}`;

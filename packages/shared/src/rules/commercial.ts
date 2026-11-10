// « Collaboration commerciale » (lot R7m2, ARCHITECTURE-R7 § 2.11, décision D38 : loi du 9 juin 2023). Fonctions pures,
// communes à l'API, au site et à l'appli : quelles mentions `@<slug>` une légende contient, et quel pro partenaire une
// story ou une publication désigne. L'API pose la mention (`commercial_partner_id`), l'écran ne fait qu'annoncer ce qu'elle
// posera ; elle ne se retire pas tant que le partenariat dure, et un contenu publié la garde ensuite.

/** Un pro avec lequel l'auteur a un partenariat actif. */
export type CommercialPartnerCandidate = { proId: string; slug: string };

/**
 * Une mention : `@` puis le mot ENTIER (lettres, chiffres, `_`, `-`, Unicode). Le mot est capturé en entier avant d'être
 * validé : `@wrap-66_x` n'est pas `wrap-66`. Sans assertion arrière (Hermes) : la borne gauche est testée à la main.
 */
const MENTION = /@([\p{L}\p{N}_-]+)/gu;
const WORD_CHAR = /[\p{L}\p{N}_@]/u;
/** La forme d'un slug de fiche pro : minuscules, chiffres, tirets entre deux. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Les slugs cités dans une légende, en minuscules, sans doublon, dans l'ordre. Jamais dans un mot ni une adresse e-mail. */
export function mentionedSlugs(caption: string | null | undefined): string[] {
  if (!caption) return [];
  const out: string[] = [];
  for (const m of caption.matchAll(MENTION)) {
    const at = m.index ?? 0;
    const before = at > 0 ? caption.charAt(at - 1) : "";
    // Une lettre accentuée hors plan de base occuperait deux unités : on remonte d'un point de code entier.
    const prev = at > 1 && /[\uDC00-\uDFFF]/.test(before) ? caption.slice(at - 2, at) : before;
    if (prev && WORD_CHAR.test(prev)) continue;
    const slug = (m[1] ?? "").toLowerCase().replace(/-+$/, "");
    if (SLUG.test(slug) && !out.includes(slug)) out.push(slug);
  }
  return out;
}

/**
 * Le pro partenaire désigné : d'abord une identification (`tagProIds`, dans l'ordre), puis une mention `@<slug>` de la
 * légende. `null` si aucun pro cité n'est un partenaire actif.
 */
export function commercialPartnerOf(
  partners: readonly CommercialPartnerCandidate[],
  tagProIds: readonly string[],
  caption: string | null | undefined,
): string | null {
  for (const id of tagProIds) {
    const hit = partners.find((p) => p.proId === id);
    if (hit) return hit.proId;
  }
  for (const slug of mentionedSlugs(caption)) {
    const hit = partners.find((p) => p.slug.toLowerCase() === slug);
    if (hit) return hit.proId;
  }
  return null;
}

/** Un pro choisi à la main (mention « Collaboration commerciale » posée par l'auteur). */
export type CommercialPick = { id: string; name: string };

/** L'état du brouillon : l'interrupteur « Poser moi-même » et le pro choisi. */
export type CommercialDraft = { on: boolean; pick: CommercialPick | null };
export const noCommercialDraft: CommercialDraft = { on: false, pick: null };

/** Un partenaire actif, avec son nom (de quoi écrire « Collaboration commerciale · Wrap 66 » avant l'envoi). */
export type CommercialPartnerNamed = CommercialPartnerCandidate & { name: string };

/**
 * Ce que la ligne de l'écran de publication dit : `required` (un partenaire actif est identifié ou cité : la ligne est là,
 * non décochable) ou `manual` (un interrupteur « Poser moi-même » et le pro choisi). L'écran annonce ; c'est l'API qui pose.
 */
export type CommercialLineState =
  | { kind: "required"; proId: string; name: string }
  | { kind: "manual"; on: boolean; pick: CommercialPick | null };

export function commercialLineState(
  partners: readonly CommercialPartnerNamed[],
  tagProIds: readonly string[],
  caption: string | null | undefined,
  draft: CommercialDraft,
): CommercialLineState {
  const proId = commercialPartnerOf(partners, tagProIds, caption);
  const named = proId ? partners.find((p) => p.proId === proId) : undefined;
  if (proId && named) return { kind: "required", proId, name: named.name };
  return { kind: "manual", on: draft.on, pick: draft.pick };
}

/** Le champ `commercialPartnerId` à envoyer : seulement une mention posée à la main (la mention d'un partenaire est posée par l'API). */
export function commercialField(line: CommercialLineState): { commercialPartnerId?: string } {
  return line.kind === "manual" && line.on && line.pick ? { commercialPartnerId: line.pick.id } : {};
}

/** Ce qui manque pour envoyer : l'interrupteur est posé mais aucun pro n'est choisi. `null` : rien. */
export function commercialIssue(line: CommercialLineState, missing: string): string | null {
  return line.kind === "manual" && line.on && !line.pick ? missing : null;
}

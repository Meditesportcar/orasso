// « Collaboration commerciale » (lot R7m2, ARCHITECTURE-R7 § 2.11, décision D38 : loi du 9 juin 2023). Fonctions pures,
// communes à l'API, au site et à l'appli : quelles mentions `@<slug>` une légende contient, et quel pro partenaire une
// story ou une publication désigne. L'API pose la mention (`commercial_partner_id`), l'écran ne fait qu'annoncer ce qu'elle
// posera ; elle ne se retire pas tant que le partenariat dure, et un contenu publié la garde ensuite.

/** Un pro avec lequel l'auteur a un partenariat actif. */
export type CommercialPartnerCandidate = { proId: string; slug: string };

/** La mention `@wrap-66` : un slug de fiche pro (minuscules, chiffres, tirets), jamais collée à un mot (`a@b.fr`, `@damien_66`). */
const MENTION = /(?<![\w@])@([a-z0-9]+(?:-[a-z0-9]+)*)(?![a-z0-9_])/gi;

/** Les slugs cités dans une légende, en minuscules, sans doublon, dans l'ordre. */
export function mentionedSlugs(caption: string | null | undefined): string[] {
  if (!caption) return [];
  const out: string[] = [];
  for (const m of caption.matchAll(MENTION)) {
    const slug = (m[1] ?? "").toLowerCase();
    if (slug && !out.includes(slug)) out.push(slug);
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

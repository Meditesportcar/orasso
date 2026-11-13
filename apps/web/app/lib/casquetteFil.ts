// Le Fil d'une casquette d'après sa clé d'auteur (lot R9h, tour 1) : où reviennent ✕ et « Retour au Fil » quand on vient du Fil d'une
// page (publier, story, visionneuse). La clé n'est jamais crue : on ne rend l'adresse que pour une page que le compte tient.
import type { Me } from "@orasso/shared";

type Holder = Pick<Me, "memberships" | "pro" | "personas">;

/** `/orga/<slug>/fil`, `/pro/<slug>/fil`, `/app/media/fil`, `/app/prestataire/fil` pour une page tenue ; sinon le Fil du passionné. */
export function filHrefOfAuthor(auteur: string | null | undefined, me: Holder): string {
  const at = auteur ? auteur.indexOf(":") : -1;
  if (!auteur || at < 1) return "/app/fil";
  const id = auteur.slice(at + 1);
  switch (auteur.slice(0, at)) {
    case "s": {
      const slug = me.memberships.find(
        (m) => m.structureId === id && m.status === "active" && m.role !== "staff" && !m.assisted,
      )?.structureSlug;
      const persona = me.personas.find((p) => p.kind === "organizer" && p.id === id);
      return slug && !persona?.suspended ? `/orga/${slug}/fil` : "/app/fil";
    }
    case "p":
      return me.pro?.id === id ? `/pro/${me.pro.slug}/fil` : "/app/fil";
    case "m":
      return me.personas.some((p) => p.kind === "media" && p.id === id) ? "/app/media/fil" : "/app/fil";
    case "v":
      return me.personas.some((p) => p.kind === "provider" && p.id === id) ? "/app/prestataire/fil" : "/app/fil";
    default:
      return "/app/fil";
  }
}

/** La clé d'auteur de la barre d'origine, si c'est celle d'une page tenue (`s:`, `p:`, `m:`, `v:`) ; sinon `null` (la personne). */
export function heldBarKey(raw: string | null | undefined, me: Holder): string | null {
  if (!raw) return null;
  return filHrefOfAuthor(raw, me) === "/app/fil" ? null : raw;
}

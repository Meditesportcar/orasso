// L'auteur d'une story (lot R7f3, repris par R9n) : logique pure, testée seule.
import type { StoryAuthor, StoryAuthorChoice } from "@orasso/shared";

import type { Persona } from "@/lib/personaModel";

/** La casquette active → sous quelle casquette la story part (un visiteur ou l'administration publient en passionné). */
export function authorOf(persona: Persona, name: string): StoryAuthor {
  switch (persona.kind) {
    case "organizer":
      return { persona: "organizer", structureId: persona.structureId, name };
    case "pro":
      return { persona: "pro", proId: persona.proProfileId, name };
    case "provider":
      return { persona: "provider", name };
    case "media":
      return { persona: "media", name };
    default:
      return { persona: "fan" };
  }
}

/**
 * L'auteur d'une story : la page choisie par `?auteur=` (déjà résolue contre les casquettes du compte), `me`, sinon la casquette
 * active — **mais seulement si on agit en son nom** : sans acteur (`actor` nul : casquette suspendue, survol en assistance), le repli
 * est la personne, jamais la page (R9n, tour 2, point 2).
 */
export function storyAuthorFor(
  choice: StoryAuthorChoice | null,
  actor: string | null,
  persona: Persona,
  activeLabel: string,
): StoryAuthor {
  if (choice?.kind === "me") return { persona: "fan" };
  if (choice?.kind === "page") {
    return {
      persona: choice.persona,
      ...(choice.persona === "organizer" ? { structureId: choice.id } : {}),
      ...(choice.persona === "pro" ? { proId: choice.id } : {}),
      name: choice.name,
    };
  }
  return actor ? authorOf(persona, activeLabel) : { persona: "fan" };
}

/** L'adresse de « Publier une story » depuis la barre des stories : la page de la casquette (`auteur=<clé>`), sinon la personne **explicitement** (`auteur=me`). */
export const storyPublishHref = (actor: string | null): string =>
  actor ? `/story/publier?auteur=${encodeURIComponent(actor)}` : "/story/publier?auteur=me";

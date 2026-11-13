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

/**
 * L'adresse de « Publier une story » depuis la barre des stories : la page de la casquette (`auteur=<clé>`) ; la personne
 * **explicitement** (`auteur=me`) seulement si la casquette active est une page sans acteur (suspendue, survol) ; casquette de base
 * (passionné, visiteur, administration) : l'adresse d'avant, sans paramètre (l'écran garde « Visible 24 h »).
 */
export const storyPublishHref = (actor: string | null, activeKind: string): string =>
  actor
    ? `/story/publier?auteur=${encodeURIComponent(actor)}`
    : activeKind === "fan" || activeKind === "visitor" || activeKind === "admin"
      ? "/story/publier"
      : "/story/publier?auteur=me";

/**
 * L'en-tête de l'écran de story : « Visible 24 h » (le sous-titre d'avant) quand l'auteur est la personne **et** que la casquette active
 * est celle de base (le passionné qui passe par Publication → Story garde son écran) ; « en tant que <nom> » sinon (R9n, tour 4, I2).
 */
export const storyHeaderPlain = (author: StoryAuthor, activeKind: string): boolean =>
  author.persona === "fan" && (activeKind === "fan" || activeKind === "visitor" || activeKind === "admin");

/**
 * `?auteur=` demande une page (`s:`, `p:`, `v:`, `m:`) que le compte ne tient pas (ou plus) : l'écran ne la remplace pas en silence
 * par la casquette active ni par la personne, il bloque l'envoi avec un choix explicite (« Publier en mon nom »). `me` et l'absence
 * de paramètre ne sont jamais « indisponibles ».
 */
export const askedPageUnavailable = (auteur: string | null | undefined, choice: StoryAuthorChoice | null): boolean =>
  choice === null && /^[spvm]:./.test(auteur?.trim() ?? "");

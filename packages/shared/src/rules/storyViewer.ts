// Lecture des stories (lot R7f2, maquette R7.6 `p-fil` et R7.7 `p-story`) : ce que la barre et la visionneuse décident,
// pur et testé, partagé par l'appli et le site (mêmes règles, mêmes mots). Aucune règle de visibilité ici : l'API a déjà
// filtré (`canSeeStory`), l'écran n'a jamais à re-filtrer.
import type { StoryRing } from "./audience";

/** Durée d'une photo à l'écran (R7.7 : 5 s). Une vidéo dure sa durée (`durationMs`, lot R7g2). */
export const STORY_PHOTO_MS = 5_000;
/** Largeur de la zone « précédente » (toucher à gauche) ; le reste de l'écran passe à la suivante. */
export const STORY_PREV_ZONE = 0.35;
/** Appui long : au-delà, la story se met en pause. */
export const STORY_HOLD_MS = 220;
/** Glisser vers le bas : distance (px) ou vitesse (px/ms) à partir desquelles la visionneuse se ferme. */
export const STORY_CLOSE_DISTANCE = 120;
export const STORY_CLOSE_VELOCITY = 0.9;

/** Ce qu'une entrée de la barre porte pour son anneau. */
export type BarRingInput = { ring: StoryRing; hasUnseen: boolean };

export type BarRingState = "followers" | "crew" | "live" | "seen";

/** Anneau affiché : tout vu = anneau fin (`seen`), sinon la couleur de l'audience. */
export function barRingState(e: BarRingInput): BarRingState {
  return e.hasUnseen ? e.ring : "seen";
}

export type BarDisplay = {
  state: BarRingState;
  /** Étiquette « EN COURS » sous l'avatar (auteur en direct). */
  liveLabel: boolean;
};

/**
 * Affichage de chaque entrée, dans l'ordre reçu. Aucun néon dans la barre (un seul néon moutarde par écran : le bouton
 * principal du Fil) : l'anneau « en direct » est une bordure moutarde pleine et l'étiquette n'a pas de halo, comme
 * `.r7ring.rlive` de la maquette.
 */
export function barDisplay(entries: readonly BarRingInput[]): BarDisplay[] {
  return entries.map((e) => ({ state: barRingState(e), liveLabel: e.ring === "live" }));
}

/** « Ta story » : mon anneau, ou « + » sans story. Je connais mes stories : jamais « non vue ». */
export function mineRingState(mine: { count: number; ring: StoryRing } | null): BarRingState | null {
  if (!mine || mine.count < 1) return null;
  return mine.ring === "crew" ? "crew" : "followers";
}

/** Anneau d'un profil (`stories` de `GET /users/:pseudo`) : `null` sans story, `seen` si tout est vu. */
export function profileRingState(
  s: { count: number; hasUnseen: boolean; ring: StoryRing | null } | null | undefined,
): BarRingState | null {
  if (!s || s.count < 1 || !s.ring) return null;
  return barRingState({ ring: s.ring, hasUnseen: s.hasUnseen });
}

/** Où va un toucher : dans la zone de gauche, la précédente ; ailleurs, la suivante. */
export function tapTarget(x: number, width: number): "prev" | "next" {
  return width > 0 && x < width * STORY_PREV_ZONE ? "prev" : "next";
}

export type StoryStep = { kind: "story"; index: number } | { kind: "close" };

/** Après la dernière story, la visionneuse se ferme. */
export function storyNext(index: number, count: number): StoryStep {
  return index + 1 >= count ? { kind: "close" } : { kind: "story", index: index + 1 };
}

/** Avant la première, on repart de son début (la même story, de zéro). */
export function storyPrev(index: number): StoryStep {
  return { kind: "story", index: Math.max(0, index - 1) };
}

/** On ouvre sur la première story non vue, sinon sur la première (on reprend là où on s'était arrêté). */
export function storyStartIndex(stories: readonly { viewed: boolean }[]): number {
  const i = stories.findIndex((s) => !s.viewed);
  return i < 0 ? 0 : i;
}

/** Durée d'une story à l'écran. */
export function storyDurationMs(s: { mediaKind: "photo" | "video"; durationMs: number | null }): number {
  if (s.mediaKind === "video" && s.durationMs && s.durationMs > 0) return s.durationMs;
  return STORY_PHOTO_MS;
}

/** Ce qui reste de la durée après une pause (jamais négatif, jamais au-delà du total). */
export function remainingMs(total: number, elapsed: number): number {
  return Math.min(total, Math.max(0, total - elapsed));
}

/** Part déjà jouée (0 à 1) d'une barre de progression. */
export function progressOf(total: number, elapsed: number): number {
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, elapsed / total));
}

/** Glisser vers le bas : on ferme à partir d'une distance ou d'une vitesse. `dy` en px, `vy` en px/ms (vers le bas > 0). */
export function shouldCloseOnDrag(dy: number, vy: number): boolean {
  return dy >= STORY_CLOSE_DISTANCE || (dy > 30 && vy >= STORY_CLOSE_VELOCITY);
}

/** Une story a un fichier lisible maintenant ? (une vidéo en préparation ou en échec n'est pas servie). */
export function storyPlayable(s: { status: "processing" | "ready" | "failed" }): boolean {
  return s.status === "ready";
}

/** Au plus ce nombre de noms dans la liste « Vues » (les plus récents) ; le total reste celui de `viewsCount`. */
export const STORY_VIEWERS_MAX = 200;

/**
 * Le total du titre « Vues · N » : le plus grand du compteur de l'API et de la longueur de la liste reçue (une vue arrivée
 * entre les deux lectures ne doit jamais faire afficher moins de noms que le total).
 */
export function viewersTotal(viewsCount: number | null | undefined, listLength: number | null | undefined): number {
  return Math.max(viewsCount ?? 0, listLength ?? 0);
}

/** Le titre « Vues · N » garde le total ; la liste, elle, est partielle au-delà de `STORY_VIEWERS_MAX`. */
export function viewersListPartial(total: number | null | undefined): boolean {
  return (total ?? 0) > STORY_VIEWERS_MAX;
}

/**
 * Identifiant d'idempotence d'une réponse (`POST /stories/:id/reply`, `clientId`) lié à une soumission immuable : la même
 * story et le même texte reprennent le même identifiant (une réponse perdue, renvoyée, n'est pas envoyée deux fois) ; un
 * texte modifié ou une autre story = un nouvel identifiant (sinon le serveur rejouerait l'ancienne réponse sans envoyer
 * le nouveau texte). `done` oublie l'identifiant d'une soumission réussie.
 */
export function createReplyKeys(newId: () => string) {
  let last: { storyId: string; text: string; id: string } | null = null;
  return {
    idFor(storyId: string, text: string): string {
      if (!last || last.storyId !== storyId || last.text !== text) last = { storyId, text, id: newId() };
      return last.id;
    },
    done(storyId: string, text: string) {
      if (last && last.storyId === storyId && last.text === text) last = null;
    },
  };
}

/**
 * La fin d'un envoi (succès ou erreur) ne touche au champ de réponse que si la soumission est encore celle qui s'affiche :
 * même story, même texte. Sinon (navigation vers une autre story, texte retapé pendant l'envoi) le brouillon présent reste.
 */
export function replyStillShown(
  sent: { storyId: string; text: string },
  shown: { storyId: string | null; text: string },
): boolean {
  return shown.storyId === sent.storyId && shown.text.trim() === sent.text;
}

// « Publier une story » : le brouillon d'une photo, son cadrage 9:16 et sa décision de plaque, sans React ni réseau (testé par
// `model.test.ts`). Une seule photo. La plaque est cherchée et posée sur la **photo d'origine** (les rectangles restent dans
// ses coordonnées : le serveur les transforme avec le cadrage) ; la copie envoyée est la même photo, réduite à 2048 px.
// Les décisions de plaque sont celles de « Publier au Fil » (`features/fil/publish/model.ts`) : mêmes règles, mêmes mots.
import {
  type Frame,
  fillFrame,
  fitDefault,
  frameState,
  isStoryRatio,
  limitFrame,
  type StoryPlateDraft,
} from "@orasso/shared";

import type { PickedPhoto } from "@/lib/photos";
import { type FeedDraftPhoto, newDraftPhoto } from "../../fil/publish/model";

export type StoryStep = "media" | "fit" | "plate" | "details" | "preview" | "done";

export type StoryDraft = {
  /** Décision de plaque : `source` et `photo` sont la photo d'origine (aucun recadrage), `rects` dans ses coordonnées. */
  plate: FeedDraftPhoto;
  /** La copie envoyée (2048 px au plus) ; la même que l'origine si elle est déjà assez petite. */
  upload: PickedPhoto;
  /**
   * La copie d'affichage (`STORY_DISPLAY_SIDE` au plus) : elle sert à « Ajuster », à la plaque (cadre et loupe), aux détails
   * et à l'aperçu. L'original (4096 px) ne sert qu'à la détection ML Kit ; la copie `upload`, à l'envoi. Les cadres sont des
   * fractions de la photo : ils valent sur toutes les copies.
   */
  display: PickedPhoto;
  frame: Frame;
};

/** Plus grand côté de la copie d'affichage : assez pour régler un cadre de plaque au doigt, sans garder 4096 px en mémoire. */
export const STORY_DISPLAY_SIDE = 1280;

export function newStoryDraft(
  key: string,
  original: PickedPhoto,
  upload: PickedPhoto = original,
  display: PickedPhoto = upload,
): StoryDraft {
  return {
    plate: newDraftPhoto(key, original, original),
    upload,
    display,
    frame: fitDefault(original.width, original.height),
  };
}

/** Une photo qui n'est pas en 9:16 passe par l'écran « Ajuster » ; l'appareil, déjà en 9:16, va droit à la plaque. */
export const needsFit = (photo: { width: number; height: number }): boolean => !isStoryRatio(photo.width, photo.height);

export const stepAfterMedia = (photo: { width: number; height: number }): StoryStep =>
  needsFit(photo) ? "fit" : "plate";

/** Le pas en arrière (bouton retour du téléphone, « Modifier ») : jamais plus loin que le choix de la photo. */
export function stepBefore(step: StoryStep, photo: { width: number; height: number } | null): StoryStep | null {
  switch (step) {
    case "fit":
      return "media";
    case "plate":
      return photo && needsFit(photo) ? "fit" : "media";
    case "details":
      return "plate";
    case "preview":
      return "details";
    default:
      return null;
  }
}

/** Le pas en arrière d'une vidéo (lot R7g) : elle saute « Ajuster » et la plaque ; jamais plus loin que le choix du média. */
export function videoStepBefore(step: StoryStep): StoryStep | null {
  return step === "details" ? "media" : step === "preview" ? "details" : null;
}

/** Le cadrage change à la main (geste) : toujours dans ses bornes. Il ne touche pas à la décision de plaque. */
export const withFrame = (d: StoryDraft, frame: Frame): StoryDraft => ({
  ...d,
  frame: limitFrame(frame, d.plate.photo.width, d.plate.photo.height),
});

/** « Remplir » : la photo couvre le canevas (jusqu'à la limite de zoom). */
export const fillDraft = (d: StoryDraft): StoryDraft => ({
  ...d,
  frame: fillFrame(d.plate.photo.width, d.plate.photo.height),
});

/** « Rétablir » : la photo entière, centrée, sur son fond flouté. */
export const resetDraft = (d: StoryDraft): StoryDraft => ({
  ...d,
  frame: fitDefault(d.plate.photo.width, d.plate.photo.height),
});

export const draftFrameState = (d: StoryDraft) => frameState(d.frame, d.plate.photo.width, d.plate.photo.height);

/** La plaque du brouillon, pour les règles partagées (`storyPlateIssue`). */
export const plateOf = (d: StoryDraft): StoryPlateDraft => ({
  rects: d.plate.rects,
  noPlate: d.plate.noPlate,
  detection: d.plate.detection,
});

// « Publier au Fil » : le brouillon d'une photo et ses décisions de plaque, sans React ni réseau (testé par
// `model.test.ts`). Une photo est recadrée au format de la publication, la plaque est cherchée sur la photo recadrée ;
// la personne règle les cadres ou confirme « aucune plaque visible » : jamais l'un ni l'autre = pas d'envoi.
import { MAX_PLATE_RECTS, nextPlateFrame, type PlateRect } from "@orasso/shared";

import type { PickedPhoto } from "@/lib/photos";

export type DetectionState = "pending" | "found" | "none" | "unavailable";

export type FeedDraftPhoto = {
  key: string;
  /** La photo choisie, telle quelle : le recadrage repart d'elle quand le format change. */
  source: PickedPhoto;
  /** La photo recadrée au format de la publication : c'est elle qui part, et sur elle la plaque est cherchée. */
  photo: PickedPhoto;
  rects: PlateRect[];
  /** Les cadres proposés par la détection (pour revenir à « Flouter » après « Aucune plaque »). */
  detected: PlateRect[];
  noPlate: boolean;
  detection: DetectionState;
};

export const newDraftPhoto = (key: string, source: PickedPhoto, photo: PickedPhoto): FeedDraftPhoto => ({
  key,
  source,
  photo,
  rects: [],
  detected: [],
  noPlate: false,
  detection: "pending",
});

/** Ce que la détection a rendu (`null` : pas de détection possible ici, tableau vide : aucune plaque repérée). */
export function withDetection(p: FeedDraftPhoto, found: readonly PlateRect[] | null): FeedDraftPhoto {
  const rects = found ? [...found] : [];
  return {
    ...p,
    detected: rects,
    rects,
    noPlate: false,
    detection: found === null ? "unavailable" : rects.length ? "found" : "none",
  };
}

/** « Aucune plaque n'est visible », confirmé : les cadres tombent, la décision est prise. */
export const confirmNoPlate = (p: FeedDraftPhoto): FeedDraftPhoto => ({ ...p, noPlate: true, rects: [] });

/** Finalement, flouter : les cadres repérés reviennent, ou un cadre à poser à la main. */
export const blurInstead = (p: FeedDraftPhoto): FeedDraftPhoto => ({
  ...p,
  noPlate: false,
  rects: p.detected.length ? [...p.detected] : [nextPlateFrame([])],
});

export const addFrame = (p: FeedDraftPhoto): FeedDraftPhoto =>
  p.rects.length >= MAX_PLATE_RECTS ? p : { ...p, noPlate: false, rects: [...p.rects, nextPlateFrame(p.rects)] };

export const removeFrame = (p: FeedDraftPhoto): FeedDraftPhoto => ({ ...p, rects: p.rects.slice(0, -1) });

export const setFrames = (p: FeedDraftPhoto, rects: PlateRect[]): FeedDraftPhoto => ({ ...p, noPlate: false, rects });

/** Le format change : la photo recadrée est refaite, la décision de plaque repart de zéro (les cadres ne vaudraient plus). */
export const recropped = (p: FeedDraftPhoto, photo: PickedPhoto): FeedDraftPhoto => ({
  ...p,
  photo,
  rects: [],
  detected: [],
  noPlate: false,
  detection: "pending",
});

/** État affiché sur la vignette. */
export type PlateBadge = "pending" | "blurred" | "none" | "todo";
export function plateBadge(p: Pick<FeedDraftPhoto, "rects" | "noPlate" | "detection">): PlateBadge {
  if (p.rects.length) return "blurred";
  if (p.noPlate) return "none";
  return p.detection === "pending" ? "pending" : "todo";
}

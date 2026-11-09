// « Publier au Fil » : le brouillon d'une photo et ses décisions de plaque, sans React ni réseau (testé par
// `model.test.ts`). Une photo est recadrée au format de la publication, la plaque est cherchée sur la photo recadrée ;
// la personne règle les cadres ou confirme « aucune plaque visible » : jamais l'un ni l'autre = pas d'envoi.
import { framesPlaced, MAX_PLATE_RECTS, mergeDetectedFrames, nextPlateFrame, type PlateRect } from "@orasso/shared";

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
  /** Le centre choisi au doigt (0 à 1, « Glisse pour recadrer ») ; absent : le centre de la photo. */
  focus?: { x: number; y: number };
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

/**
 * Ce que la détection a rendu (`null` : pas de détection possible ici, tableau vide : aucune plaque repérée). Elle
 * s'ajoute à ce que la personne a déjà fait, jamais à sa place : les cadres posés restent (union avec les cadres repérés),
 * et un « Aucune plaque visible » confirmé reste tel quel (les cadres repérés sont gardés pour « Finalement, flouter »).
 */
export function withDetection(p: FeedDraftPhoto, found: readonly PlateRect[] | null): FeedDraftPhoto {
  const detected = found ? [...found] : [];
  return {
    ...p,
    detected,
    rects: p.noPlate ? [] : mergeDetectedFrames(p.rects, detected),
    detection: found === null ? "unavailable" : detected.length ? "found" : "none",
  };
}

/**
 * Ce que les boutons de la plaque permettent : tant que la détection tourne, « Ajouter un cadre » et « Aucune plaque
 * visible » sont grisés (le résultat de la recherche pourrait contredire ce qu'on poserait maintenant).
 */
export function plateControls(p: Pick<FeedDraftPhoto, "rects" | "detection">): {
  searching: boolean;
  canAdd: boolean;
  canNone: boolean;
} {
  const searching = p.detection === "pending";
  return { searching, canAdd: !searching && p.rects.length < MAX_PLATE_RECTS, canNone: !searching };
}

/**
 * Les cadres viennent de la détection (« repérée ») tant qu'il n'y en a pas plus que de cadres repérés ; un cadre posé à
 * la main ou ajouté (ou rien de repéré) se dit « posée », comme sur le site.
 */
export const framesFromDetection = (p: Pick<FeedDraftPhoto, "rects" | "detected" | "detection">): boolean =>
  p.detection === "found" && p.detected.length > 0 && p.rects.length <= p.detected.length;

/**
 * « Aucune plaque n'est visible », confirmé : les cadres tombent, la décision est prise. Refusé tant que la détection
 * cherche (la recherche pourrait contredire ce qu'on confirme) : la photo reste telle quelle.
 */
export const confirmNoPlate = (p: FeedDraftPhoto): FeedDraftPhoto =>
  p.detection === "pending" ? p : { ...p, noPlate: true, rects: [] };

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

/**
 * Le format ou le cadrage change : la photo recadrée est refaite, la décision de plaque repart de zéro (les cadres ne
 * vaudraient plus) et la détection est relancée. `focus` : le centre choisi au doigt.
 */
export const recropped = (
  p: FeedDraftPhoto,
  photo: PickedPhoto,
  focus: { x: number; y: number } | undefined = undefined,
): FeedDraftPhoto => ({
  ...p,
  photo,
  focus,
  rects: [],
  detected: [],
  noPlate: false,
  detection: "pending",
});

/** État affiché sur la vignette. */
export type PlateBadge = "pending" | "blurred" | "none" | "todo";
export function plateBadge(p: Pick<FeedDraftPhoto, "rects" | "noPlate" | "detection">): PlateBadge {
  if (framesPlaced(p.rects)) return "blurred";
  if (p.noPlate) return "none";
  return p.detection === "pending" ? "pending" : "todo";
}

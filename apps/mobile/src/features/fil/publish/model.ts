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

/**
 * Recadre chaque photo, une à une. `alive` dit si l'opération est encore d'actualité (écran quitté, compte changé,
 * format rechangé) : dès qu'un résultat arrive et qu'elle ne l'est plus, ce résultat et ceux d'avant sont effacés tout
 * de suite (ce sont des JPEG non floutés) et rien n'est rendu (`null`). Un échec efface aussi ce qui était déjà produit.
 */
export async function cropAll(
  sources: readonly PickedPhoto[],
  crop: (source: PickedPhoto) => Promise<PickedPhoto>,
  alive: () => boolean,
  discard: (uris: string[]) => void,
  remember?: (uri: string) => void,
): Promise<PickedPhoto[] | null> {
  const done: PickedPhoto[] = [];
  try {
    for (const source of sources) {
      const out = await crop(source);
      // Noté dès sa création (pas à la fin du lot) : une purge qui tombe pendant le recadrage suivant le voit.
      remember?.(out.uri);
      done.push(out);
      if (!alive()) {
        discard(done.map((p) => p.uri));
        return null;
      }
    }
  } catch (e) {
    discard(done.map((p) => p.uri));
    throw e;
  }
  return done;
}

/**
 * Applique un recadrage terminé à la liste d'aujourd'hui, photo par photo (par clé) : une photo retirée entre-temps ne
 * revient pas, une photo ajoutée entre-temps reste telle quelle (elle n'est pas dans `again`).
 */
export const mergeRecropped = (
  list: readonly FeedDraftPhoto[],
  again: ReadonlyMap<string, PickedPhoto>,
): FeedDraftPhoto[] =>
  list.map((p) => {
    const photo = again.get(p.key);
    return photo ? recropped(p, photo) : p;
  });

/**
 * « Je confirme » pour la photo dont la confirmation porte la clé `key` : aucune autre photo n'est touchée, et si cette
 * photo n'est plus là (retirée, passée à une autre place) il ne se passe rien. Jamais par l'index.
 */
export const confirmNoPlateFor = (list: readonly FeedDraftPhoto[], key: string | null): FeedDraftPhoto[] =>
  list.map((p) => (key !== null && p.key === key ? confirmNoPlate(p) : p));

/**
 * Un envoi figé en attente de vérification (`uncertain`) : l'erreur reçue lève-t-elle l'incertitude ? Seul un refus définitif du serveur
 * (4xx) prouve que rien n'a été créé. 429 et 401 ne prouvent rien (le contrôle de rejeu de l'API vient après), le 409 `account_changed`
 * non plus (une première tentative sous le bon compte a pu aboutir) ; 5xx et réseau gardent le corps incertain.
 */
export function liftsUncertainty(e: { status: number; code?: string | null }): boolean {
  if (e.status < 400 || e.status >= 500) return false;
  if (e.status === 429 || e.status === 401) return false;
  return e.code !== "account_changed";
}

/**
 * L'événement choisi doit-il être retiré de la saisie parce que la liste relue ne le contient plus ? Pas tant qu'un envoi est figé
 * (`uncertain`) : le corps gardé le contient encore, l'écran doit montrer ce qui part.
 */
export function dropEventFromChoice(
  eventId: string | null,
  listedIds: readonly string[] | null,
  uncertain: boolean,
): boolean {
  if (uncertain || !eventId || listedIds === null) return false;
  return !listedIds.includes(eventId);
}

/**
 * L'événement montré à l'écran : celui de la liste relue ; pendant un envoi figé (`uncertain`), si la liste ne le contient plus, le dernier
 * connu pour ce choix (le corps gardé le porte : « Lieu », « Info importante » et la phrase restent ceux de l'envoi).
 */
export function eventShown<E extends { id: string }>(
  found: E | null,
  lastKnown: E | null,
  eventId: string | null,
  uncertain: boolean,
): E | null {
  if (found) return found;
  return uncertain && eventId && lastKnown?.id === eventId ? lastKnown : null;
}

import { MAX_PLATE_RECTS, movePlateFrame, publishIssue, feedScreenLabels as L } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import {
  addFrame,
  blurInstead,
  confirmNoPlate,
  type FeedDraftPhoto,
  newDraftPhoto,
  plateBadge,
  plateControls,
  recropped,
  removeFrame,
  setFrames,
  withDetection,
} from "./model";

const pic = { uri: "file:///a.jpg", width: 1080, height: 1350 };
const base = (): FeedDraftPhoto => newDraftPhoto("k", pic, pic);
const RECT = { x: 0.4, y: 0.6, w: 0.2, h: 0.06 };

describe("décision de plaque d'une photo du Fil", () => {
  it("une photo neuve est en recherche, sans décision : l'envoi est refusé avec la ligne qui dit quoi", () => {
    const p = base();
    expect(plateBadge(p)).toBe("pending");
    expect(publishIssue({ photos: [p], caption: "", preparing: true })).toBeTruthy();
    expect(publishIssue({ photos: [p], caption: "" })).toContain("Photo 1");
  });
  it("détection indisponible (web, Expo Go) ou aucune plaque : à régler à la main, rien n'est décidé d'office", () => {
    expect(plateBadge(withDetection(base(), null))).toBe("todo");
    expect(plateBadge(withDetection(base(), []))).toBe("todo");
    expect(publishIssue({ photos: [withDetection(base(), [])], caption: "" })).toContain("plaque");
  });
  it("plaque repérée : le cadre proposé est posé, la décision est prise", () => {
    const p = withDetection(base(), [RECT]);
    expect(p.detection).toBe("found");
    expect(plateBadge(p)).toBe("blurred");
    expect(publishIssue({ photos: [p], caption: "" })).toBeNull();
  });
  it("« Aucune plaque visible » confirmé : les cadres tombent, décision prise ; « Finalement, flouter » les rend", () => {
    const found = withDetection(base(), [RECT]);
    const none = confirmNoPlate(found);
    expect(none.rects).toEqual([]);
    expect(plateBadge(none)).toBe("none");
    expect(publishIssue({ photos: [none], caption: "" })).toBeNull();
    expect(blurInstead(none).rects).toEqual([RECT]);
    // Sans cadre repéré : un cadre à poser à la main.
    expect(blurInstead(confirmNoPlate(withDetection(base(), []))).rects).toHaveLength(1);
  });
  it("cadres : ajouter (au plus MAX), retirer ; retirer le dernier cadre ôte la décision", () => {
    let p = withDetection(base(), [RECT]);
    for (let i = 0; i < MAX_PLATE_RECTS + 2; i++) p = addFrame(p);
    expect(p.rects).toHaveLength(MAX_PLATE_RECTS);
    p = withDetection(base(), [RECT]);
    p = removeFrame(p);
    expect(p.rects).toEqual([]);
    expect(plateBadge(p)).toBe("todo");
  });
  it("le format change : la photo est refaite et la décision de plaque repart de zéro", () => {
    const decided = confirmNoPlate(withDetection(base(), [RECT]));
    const again = recropped(decided, { uri: "file:///b.jpg", width: 1080, height: 1080 });
    expect(again.noPlate).toBe(false);
    expect(again.rects).toEqual([]);
    expect(again.detection).toBe("pending");
    expect(again.photo.uri).toBe("file:///b.jpg");
    expect(again.source).toBe(decided.source);
  });
  it("une détection qui arrive après un cadre posé ne le retire pas : les deux cadres sont là", () => {
    const hand = setFrames(base(), [RECT]);
    const other = { x: 0.1, y: 0.2, w: 0.2, h: 0.06 };
    const after = withDetection(hand, [other]);
    expect(after.rects).toEqual([RECT, other]);
    // La même plaque repérée ne fait pas de doublon.
    expect(withDetection(hand, [{ ...RECT, x: 0.41 }]).rects).toEqual([RECT]);
    expect(after.detected).toEqual([other]);
  });
  it("une détection qui arrive après « Aucune plaque visible » ne change pas la décision", () => {
    const none = confirmNoPlate(base());
    const after = withDetection(none, [RECT]);
    expect(after.noPlate).toBe(true);
    expect(after.rects).toEqual([]);
    expect(publishIssue({ photos: [after], caption: "" })).toBeNull();
    // Les cadres repérés restent proposés pour « Finalement, flouter ».
    expect(blurInstead(after).rects).toEqual([RECT]);
  });
  it("détection en cours : « Ajouter un cadre » et « Aucune plaque visible » sont inactifs", () => {
    expect(plateControls(base())).toEqual({ searching: true, canAdd: false, canNone: false });
    expect(plateControls(withDetection(base(), []))).toEqual({ searching: false, canAdd: true, canNone: true });
    const full = withDetection(base(), [RECT]);
    expect(plateControls({ ...full, rects: Array.from({ length: MAX_PLATE_RECTS }, () => RECT) }).canAdd).toBe(false);
  });
  it("un cadre ajouté à la main ne compte qu'une fois déplacé ; un cadre de la détection compte tel quel", () => {
    const hand = addFrame(withDetection(base(), []));
    expect(hand.rects).toHaveLength(1);
    expect(plateBadge(hand)).toBe("todo");
    expect(publishIssue({ photos: [hand], caption: "" })).toBe(L.placeFrame(1));
    const moved = setFrames(hand, [movePlateFrame(hand.rects[0] as typeof RECT, 0.05, -0.1)]);
    expect(plateBadge(moved)).toBe("blurred");
    expect(publishIssue({ photos: [moved], caption: "" })).toBeNull();
    // Un cadre repéré, puis un cadre à la main resté où il est né : la photo reste à régler.
    const both = addFrame(withDetection(base(), [RECT]));
    expect(both.rects).toHaveLength(2);
    expect(publishIssue({ photos: [both], caption: "" })).toBe(L.placeFrame(1));
    expect(publishIssue({ photos: [removeFrame(both)], caption: "" })).toBeNull();
  });
});

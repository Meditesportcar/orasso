import { feedScreenLabels as L, MAX_PLATE_RECTS, movePlateFrame, publishIssue } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import {
  addFrame,
  blurInstead,
  confirmNoPlate,
  confirmNoPlateFor,
  cropAll,
  dropEventFromChoice,
  type FeedDraftPhoto,
  framesFromDetection,
  liftsUncertainty,
  mergeRecropped,
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
  it("« Aucune plaque visible » est refusé tant que la détection cherche ; un recadrage repart en recherche", () => {
    const searching = base();
    expect(plateControls(searching).canNone).toBe(false);
    expect(confirmNoPlate(searching)).toBe(searching);
    // Confirmé, puis recadré : la décision repart de zéro et la confirmation est impossible pendant la recherche.
    const confirmed = confirmNoPlate(withDetection(base(), []));
    expect(confirmed.noPlate).toBe(true);
    const again = recropped(confirmed, { ...pic, uri: "file:///b.jpg" }, { x: 0.2, y: 0.5 });
    expect(again.noPlate).toBe(false);
    expect(plateControls(again).canNone).toBe(false);
    expect(confirmNoPlate(again).noPlate).toBe(false);
  });
  it("libellé : « repérée » pour les cadres de la détection, « posée » pour un cadre posé à la main", () => {
    expect(framesFromDetection(withDetection(base(), [RECT]))).toBe(true);
    expect(framesFromDetection(withDetection(base(), []))).toBe(false);
    expect(framesFromDetection(addFrame(withDetection(base(), [RECT])))).toBe(false);
    expect(framesFromDetection(addFrame(withDetection(base(), [])))).toBe(false);
    expect(L.platePlaced(1)).toBe("1 plaque posée : ajuste le cadre si besoin.");
    expect(L.platePlaced(2)).toContain("plaques posées");
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
  it("une détection tardive (réponse en retard) après « Aucune plaque visible » ne change pas la décision", () => {
    const none = confirmNoPlate(withDetection(base(), []));
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

describe("opérations tardives du composeur (lot R7e2, tour 4)", () => {
  const later = <T>(value: T) => {
    let release: () => void = () => undefined;
    const promise = new Promise<T>((resolve) => {
      release = () => resolve(value);
    });
    return { promise, release };
  };
  const shot = (n: number) => ({ uri: `file:///c${n}.jpg`, width: 1080, height: 1350 });

  it("un recadrage qui finit après le départ est effacé tout de suite et ne rend rien", async () => {
    const slow = later(shot(1));
    let alive = true;
    const erased: string[] = [];
    const run = cropAll(
      [pic],
      () => slow.promise,
      () => alive,
      (uris) => erased.push(...uris),
    );
    alive = false; // l'écran est quitté pendant la découpe
    slow.release();
    expect(await run).toBeNull();
    expect(erased).toEqual(["file:///c1.jpg"]);
  });
  it("un recadrage encore d'actualité rend toutes les photos et n'efface rien", async () => {
    const erased: string[] = [];
    const out = await cropAll(
      [pic, pic],
      async () => shot(2),
      () => true,
      (uris) => erased.push(...uris),
    );
    expect(out).toHaveLength(2);
    expect(erased).toEqual([]);
  });
  it("une opération qui devient caduque à la deuxième photo efface aussi la première", async () => {
    let calls = 0;
    const erased: string[] = [];
    const out = await cropAll(
      [pic, pic, pic],
      async () => shot(++calls),
      () => calls < 2,
      (uris) => erased.push(...uris),
    );
    expect(out).toBeNull();
    expect(erased).toEqual(["file:///c1.jpg", "file:///c2.jpg"]);
  });
  it("un échec efface ce qui était déjà produit", async () => {
    let calls = 0;
    const erased: string[] = [];
    await expect(
      cropAll(
        [pic, pic],
        async () => {
          if (++calls === 2) throw new Error("disque plein");
          return shot(1);
        },
        () => true,
        (uris) => erased.push(...uris),
      ),
    ).rejects.toThrow("disque plein");
    expect(erased).toEqual(["file:///c1.jpg"]);
  });
  it("un changement de format qui finit après un retrait ne ressuscite pas la photo, et garde la photo ajoutée", () => {
    const b = newDraftPhoto("b", pic, pic);
    const added = newDraftPhoto("c", pic, pic);
    // Recadrage lancé sur [a, b] ; entre-temps a est retiré et c ajouté.
    const merged = mergeRecropped(
      [b, added],
      new Map([
        ["a", shot(7)],
        ["b", shot(8)],
      ]),
    );
    expect(merged.map((p) => p.key)).toEqual(["b", "c"]);
    expect(merged[0]?.photo.uri).toBe("file:///c8.jpg");
    expect(merged[1]).toBe(added);
  });
  it("« Je confirme » vise la clé de la confirmation : la photo 1 retirée, la photo 2 (devenue index 0) reste intacte", () => {
    const one = { ...newDraftPhoto("one", pic, pic), detection: "found" as const, rects: [RECT] };
    const two = { ...newDraftPhoto("two", pic, pic), detection: "found" as const, rects: [RECT] };
    const after = confirmNoPlateFor([two], "one"); // la confirmation ouverte sur "one" est validée après son retrait
    expect(after[0]).toBe(two);
    expect(after[0]?.rects).toEqual([RECT]);
    // Sur la bonne photo, elle joue ; sans confirmation, rien.
    expect(confirmNoPlateFor([one, two], "one")[0]?.noPlate).toBe(true);
    expect(confirmNoPlateFor([one, two], "one")[1]).toBe(two);
    expect(confirmNoPlateFor([one, two], null)).toEqual([one, two]);
  });
});

describe("événement repris pendant un envoi figé", () => {
  it("liste relue sans l'événement et envoi figé : l'événement reste", () => {
    expect(dropEventFromChoice("e1", ["e2"], true)).toBe(false);
  });
  it("envoi libre : l'événement qui n'est plus dans la liste part", () => {
    expect(dropEventFromChoice("e1", ["e2"], false)).toBe(true);
    expect(dropEventFromChoice("e1", ["e1", "e2"], false)).toBe(false);
  });
  it("sans événement choisi ou sans liste relue : rien à retirer", () => {
    expect(dropEventFromChoice(null, ["e2"], false)).toBe(false);
    expect(dropEventFromChoice("e1", null, false)).toBe(false);
  });
});

describe("l'incertitude d'un envoi se lève-t-elle sur cette erreur ?", () => {
  it("le 409 account_changed la garde", () => {
    expect(liftsUncertainty({ status: 409, code: "account_changed" })).toBe(false);
  });
  it("un refus 4xx définitif la lève (autre 409 compris)", () => {
    expect(liftsUncertainty({ status: 400, code: "validation" })).toBe(true);
    expect(liftsUncertainty({ status: 409, code: "event_not_attachable" })).toBe(true);
    expect(liftsUncertainty({ status: 403 })).toBe(true);
  });
  it("429, 401, 5xx et réseau la gardent", () => {
    for (const status of [429, 401, 500, 503, 504, 0]) expect(liftsUncertainty({ status })).toBe(false);
  });
});

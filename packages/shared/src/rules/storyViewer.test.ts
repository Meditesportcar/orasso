import { describe, expect, it } from "vitest";

import {
  barDisplay,
  barRingState,
  mineRingState,
  profileRingState,
  progressOf,
  remainingMs,
  STORY_PHOTO_MS,
  shouldCloseOnDrag,
  storyDurationMs,
  storyNext,
  storyPlayable,
  storyPrev,
  storyStartIndex,
  tapTarget,
} from "./storyViewer";

describe("anneaux de la barre", () => {
  it("tout vu : anneau fin, sinon la couleur de l'audience", () => {
    expect(barRingState({ ring: "followers", hasUnseen: true })).toBe("followers");
    expect(barRingState({ ring: "crew", hasUnseen: true })).toBe("crew");
    expect(barRingState({ ring: "crew", hasUnseen: false })).toBe("seen");
    expect(barRingState({ ring: "live", hasUnseen: false })).toBe("seen");
  });

  it("un seul néon par écran : la première entrée en direct non vue, les autres sans néon", () => {
    const d = barDisplay([
      { ring: "followers", hasUnseen: true },
      { ring: "live", hasUnseen: true },
      { ring: "crew", hasUnseen: true },
      { ring: "live", hasUnseen: true },
    ]);
    expect(d.map((x) => x.neon)).toEqual([false, true, false, false]);
    expect(d.map((x) => x.liveLabel)).toEqual([false, true, false, true]);
    expect(d.filter((x) => x.neon)).toHaveLength(1);
  });

  it("un direct déjà vu ne prend pas le néon : le suivant le garde", () => {
    const d = barDisplay([
      { ring: "live", hasUnseen: false },
      { ring: "live", hasUnseen: true },
    ]);
    expect(d.map((x) => x.neon)).toEqual([false, true]);
    expect(d[0]?.state).toBe("seen");
  });

  it("ma story : anneau clair ou brique, « + » sans story", () => {
    expect(mineRingState(null)).toBeNull();
    expect(mineRingState({ count: 0, ring: "followers" })).toBeNull();
    expect(mineRingState({ count: 2, ring: "followers" })).toBe("followers");
    expect(mineRingState({ count: 1, ring: "crew" })).toBe("crew");
  });

  it("profil : rien sans story, `seen` quand tout est vu", () => {
    expect(profileRingState({ count: 0, hasUnseen: false, ring: null })).toBeNull();
    expect(profileRingState(null)).toBeNull();
    expect(profileRingState({ count: 1, hasUnseen: true, ring: "followers" })).toBe("followers");
    expect(profileRingState({ count: 2, hasUnseen: false, ring: "followers" })).toBe("seen");
  });
});

describe("navigation et minuterie", () => {
  it("toucher à gauche = précédente, ailleurs = suivante", () => {
    expect(tapTarget(10, 400)).toBe("prev");
    expect(tapTarget(139, 400)).toBe("prev");
    expect(tapTarget(141, 400)).toBe("next");
    expect(tapTarget(390, 400)).toBe("next");
    expect(tapTarget(10, 0)).toBe("next");
  });

  it("la dernière story ferme la visionneuse ; la première se rejoue", () => {
    expect(storyNext(0, 3)).toEqual({ kind: "story", index: 1 });
    expect(storyNext(2, 3)).toEqual({ kind: "close" });
    expect(storyNext(0, 1)).toEqual({ kind: "close" });
    expect(storyPrev(2)).toEqual({ kind: "story", index: 1 });
    expect(storyPrev(0)).toEqual({ kind: "story", index: 0 });
  });

  it("on ouvre sur la première story non vue", () => {
    expect(storyStartIndex([{ viewed: true }, { viewed: false }, { viewed: false }])).toBe(1);
    expect(storyStartIndex([{ viewed: true }, { viewed: true }])).toBe(0);
    expect(storyStartIndex([])).toBe(0);
  });

  it("5 s par photo ; une vidéo dure sa durée", () => {
    expect(storyDurationMs({ mediaKind: "photo", durationMs: null })).toBe(STORY_PHOTO_MS);
    expect(storyDurationMs({ mediaKind: "photo", durationMs: 12_000 })).toBe(STORY_PHOTO_MS);
    expect(storyDurationMs({ mediaKind: "video", durationMs: 24_000 })).toBe(24_000);
    expect(storyDurationMs({ mediaKind: "video", durationMs: null })).toBe(STORY_PHOTO_MS);
  });

  it("la pause garde le temps restant, borné", () => {
    expect(remainingMs(5000, 2000)).toBe(3000);
    expect(remainingMs(5000, 9000)).toBe(0);
    expect(remainingMs(5000, -10)).toBe(5000);
    expect(progressOf(5000, 1250)).toBe(0.25);
    expect(progressOf(5000, 9000)).toBe(1);
    expect(progressOf(0, 0)).toBe(1);
  });

  it("glisser vers le bas : distance ou vitesse", () => {
    expect(shouldCloseOnDrag(130, 0)).toBe(true);
    expect(shouldCloseOnDrag(50, 0.3)).toBe(false);
    expect(shouldCloseOnDrag(50, 1.2)).toBe(true);
    expect(shouldCloseOnDrag(10, 3)).toBe(false);
    expect(shouldCloseOnDrag(-200, 0)).toBe(false);
  });

  it("seule une story prête est lisible", () => {
    expect(storyPlayable({ status: "ready" })).toBe(true);
    expect(storyPlayable({ status: "processing" })).toBe(false);
    expect(storyPlayable({ status: "failed" })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import {
  barDisplay,
  barRingState,
  createReplyKeys,
  mineRingState,
  profileRingState,
  progressOf,
  remainingMs,
  replyStillShown,
  STORY_PHOTO_MS,
  STORY_VIEWERS_MAX,
  shouldCloseOnDrag,
  storyDurationMs,
  storyNext,
  storyPlayable,
  storyPrev,
  storyStartIndex,
  tapTarget,
  viewersListPartial,
} from "./storyViewer";

describe("anneaux de la barre", () => {
  it("tout vu : anneau fin, sinon la couleur de l'audience", () => {
    expect(barRingState({ ring: "followers", hasUnseen: true })).toBe("followers");
    expect(barRingState({ ring: "crew", hasUnseen: true })).toBe("crew");
    expect(barRingState({ ring: "crew", hasUnseen: false })).toBe("seen");
    expect(barRingState({ ring: "live", hasUnseen: false })).toBe("seen");
  });

  it("aucun néon dans la barre : l'étiquette « EN COURS » suit l'audience « live », même pour plusieurs auteurs", () => {
    const d = barDisplay([
      { ring: "followers", hasUnseen: true },
      { ring: "live", hasUnseen: true },
      { ring: "crew", hasUnseen: true },
      { ring: "live", hasUnseen: true },
    ]);
    expect(d.map((x) => x.liveLabel)).toEqual([false, true, false, true]);
    expect(d.map((x) => x.state)).toEqual(["followers", "live", "crew", "live"]);
    expect(d.every((x) => !("neon" in x))).toBe(true);
  });

  it("un direct déjà vu : anneau fin, l'étiquette reste", () => {
    const d = barDisplay([
      { ring: "live", hasUnseen: false },
      { ring: "live", hasUnseen: true },
    ]);
    expect(d[0]?.state).toBe("seen");
    expect(d.map((x) => x.liveLabel)).toEqual([true, true]);
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

describe("réponse à une story : identifiant d'idempotence lié à la soumission", () => {
  const keys = () => {
    let n = 0;
    return createReplyKeys(() => `id-${++n}`);
  };

  it("même story, même texte (renvoi après une réponse perdue) : même identifiant", () => {
    const k = keys();
    const first = k.idFor("s1", "Belle auto");
    expect(k.idFor("s1", "Belle auto")).toBe(first);
  });

  it("succès serveur dont la réponse est perdue, puis texte modifié : nouvel identifiant", () => {
    const k = keys();
    const lost = k.idFor("s1", "Belle auto");
    const edited = k.idFor("s1", "Belle auto !");
    expect(edited).not.toBe(lost);
    // Revenir au premier texte ne ressuscite pas l'ancien identifiant : une soumission = un identifiant.
    expect(k.idFor("s1", "Belle auto")).not.toBe(lost);
  });

  it("une autre story = un nouvel identifiant ; un succès oublie l'identifiant", () => {
    const k = keys();
    const a = k.idFor("s1", "Salut");
    expect(k.idFor("s2", "Salut")).not.toBe(a);
    const b = k.idFor("s2", "Salut");
    k.done("s2", "Salut");
    expect(k.idFor("s2", "Salut")).not.toBe(b);
  });

  it("`done` d'une autre soumission ne touche pas l'identifiant courant", () => {
    const k = keys();
    const a = k.idFor("s1", "Salut");
    k.done("s1", "Autre");
    expect(k.idFor("s1", "Salut")).toBe(a);
  });
});

describe("fin d'un envoi tardif", () => {
  it("s'applique seulement à la soumission encore affichée", () => {
    expect(replyStillShown({ storyId: "s1", text: "Salut" }, { storyId: "s1", text: "Salut" })).toBe(true);
    expect(replyStillShown({ storyId: "s1", text: "Salut" }, { storyId: "s1", text: "  Salut " })).toBe(true);
    // Navigation vers la story suivante pendant l'envoi : le brouillon de la suivante reste.
    expect(replyStillShown({ storyId: "s1", text: "Salut" }, { storyId: "s2", text: "Autre brouillon" })).toBe(false);
    expect(replyStillShown({ storyId: "s1", text: "Salut" }, { storyId: null, text: "" })).toBe(false);
    // Texte retapé pendant l'envoi.
    expect(replyStillShown({ storyId: "s1", text: "Salut" }, { storyId: "s1", text: "Salut les gars" })).toBe(false);
  });
});

describe("liste des vues", () => {
  it("partielle au-delà de 200 : le total reste celui de viewsCount", () => {
    expect(STORY_VIEWERS_MAX).toBe(200);
    expect(viewersListPartial(200)).toBe(false);
    expect(viewersListPartial(201)).toBe(true);
    expect(viewersListPartial(null)).toBe(false);
  });
});

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
  viewersTotal,
  viewersTotalFor,
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
    // Revenir au premier texte reprend l'identifiant de cette soumission (jamais résolue) : pas de second message.
    expect(k.idFor("s1", "Belle auto")).toBe(lost);
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

describe("réponses en parallèle : un envoi et un identifiant par soumission", () => {
  const keys = () => {
    let n = 0;
    return createReplyKeys(() => `id-${++n}`);
  };

  it("deux envois simultanés sur deux stories : chacun garde son identifiant, dans les deux ordres de réponse", () => {
    for (const order of [
      ["s1", "s2"],
      ["s2", "s1"],
    ] as const) {
      const k = keys();
      const a = k.begin("s1", "Belle auto");
      const b = k.begin("s2", "Superbe");
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(a).not.toBe(b);
      expect(k.sendingStories().sort()).toEqual(["s1", "s2"]);
      const text = { s1: "Belle auto", s2: "Superbe" };
      // La première réponse reçue ne libère que sa story.
      k.end(order[0], text[order[0]], true);
      expect(k.isSending(order[0])).toBe(false);
      expect(k.isSending(order[1])).toBe(true);
      k.end(order[1], text[order[1]], true);
      expect(k.sendingStories()).toEqual([]);
    }
  });

  it("une story ne part qu'une fois à la fois, même avec un autre texte ; une autre story reste libre", () => {
    const k = keys();
    expect(k.begin("s1", "Belle auto")).not.toBeNull();
    expect(k.begin("s1", "Belle auto !")).toBeNull();
    expect(k.begin("s2", "Superbe")).not.toBeNull();
    k.end("s1", "Belle auto", false);
    expect(k.begin("s1", "Belle auto !")).not.toBeNull();
  });

  it("reprise après une réponse perdue, malgré un envoi intermédiaire sur une autre story : un seul message", () => {
    const k = keys();
    const first = k.begin("s1", "Belle auto");
    // La réponse de s1 est perdue (erreur côté écran) : l'identifiant est gardé.
    k.end("s1", "Belle auto", false);
    // On passe à s2 et on y répond (envoi réussi).
    const other = k.begin("s2", "Superbe");
    k.end("s2", "Superbe", true);
    expect(other).not.toBe(first);
    // Retour sur s1, même texte : même identifiant, le serveur n'enregistre pas un second message.
    expect(k.begin("s1", "Belle auto")).toBe(first);
    k.end("s1", "Belle auto", true);
    // Résolue : une nouvelle réponse identique est un nouvel envoi.
    expect(k.begin("s1", "Belle auto")).not.toBe(first);
  });

  it("réponse perdue de s1 pendant que s2 est en cours : l'identifiant de s1 survit à la fin de s2", () => {
    const k = keys();
    const first = k.begin("s1", "Belle auto");
    k.begin("s2", "Superbe");
    k.end("s2", "Superbe", true);
    k.end("s1", "Belle auto", false);
    expect(k.idFor("s1", "Belle auto")).toBe(first);
  });

  it("au-delà de 51 soumissions incertaines : la première garde son identifiant, la nouvelle est refusée", () => {
    const k = keys();
    const first = k.begin("s0", "texte");
    k.end("s0", "texte", false);
    for (let i = 1; i < 50; i++) {
      expect(k.begin(`s${i}`, "texte")).not.toBeNull();
      k.end(`s${i}`, "texte", false);
    }
    // 50 soumissions incertaines : une 51e est refusée au lieu d'oublier un identifiant.
    expect(k.isFull("s50", "texte")).toBe(true);
    expect(k.begin("s50", "texte")).toBeNull();
    expect(k.isSending("s50")).toBe(false);
    // Renvoyer la première reprend son identifiant (pas de doublon).
    expect(k.isFull("s0", "texte")).toBe(false);
    expect(k.begin("s0", "texte")).toBe(first);
    // Un succès libère une place.
    k.end("s0", "texte", true);
    expect(k.begin("s50", "texte")).not.toBeNull();
  });

  it("une soumission incertaine expire après 30 minutes", () => {
    let t = 0;
    let n = 0;
    const k = createReplyKeys(() => `id-${++n}`, () => t);
    const first = k.begin("s0", "texte");
    k.end("s0", "texte", false);
    t = 29 * 60 * 1000;
    expect(k.idFor("s0", "texte")).toBe(first);
    t = 31 * 60 * 1000;
    expect(k.idFor("s0", "texte")).not.toBe(first);
  });

  it("la mémoire est bornée mais n'oublie jamais un envoi en cours", () => {
    const k = keys();
    const pending = k.begin("s0", "en cours");
    for (let i = 1; i < 120; i++) k.idFor(`s${i}`, "texte");
    expect(k.idFor("s0", "en cours")).toBe(pending);
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

  it("le total du titre est le plus grand du compteur et de la liste", () => {
    expect(viewersTotal(5, 7)).toBe(7);
    expect(viewersTotal(7, 5)).toBe(7);
    expect(viewersTotal(null, 3)).toBe(3);
    expect(viewersTotal(undefined, undefined)).toBe(0);
    expect(viewersListPartial(viewersTotal(150, 201))).toBe(true);
  });

  it("le total frais de l'API remplace celui de l'ouverture : des vues arrivées entre les deux lectures", () => {
    const person = { userId: "u", pseudo: "p", avatarUrl: null, viewedAt: "2026-11-10T10:00:00.000Z" };
    // Ouverte à zéro vue, puis trois personnes ont vu la story : la liste et son total disent trois.
    expect(viewersTotalFor(0, null)).toBe(0);
    expect(viewersTotalFor(0, { total: 3, viewers: [person, person, person] })).toBe(3);
    // Le total frais prime sur le compteur reçu à l'ouverture (quand la liste est plus courte que le total).
    expect(viewersTotalFor(2, { total: 250, viewers: Array(200).fill(person) })).toBe(250);
    // Franchir 200 vues entre les deux lectures déclenche l'avertissement de liste partielle.
    expect(viewersListPartial(viewersTotalFor(150, { total: 201, viewers: Array(200).fill(person) }))).toBe(true);
    // Réponse sans total (ancien serveur) : le compteur d'ouverture et la liste.
    expect(viewersTotalFor(5, { viewers: [person] })).toBe(5);
  });
});

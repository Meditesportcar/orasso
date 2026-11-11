import { describe, expect, it } from "vitest";

import { authorKeyOf } from "./authors";
import { MENTION_WORDS_MAX, mentionedCandidates, mentionsOf, mentionVisible } from "./feedMentions";

const NOW = new Date("2026-11-11T10:00:00Z");
const EV = "11111111-1111-4111-8111-111111111111";
const ST = "22222222-2222-4222-8222-222222222222";
const PRO = "33333333-3333-4333-8333-333333333333";
const base = {
  authorKey: "u:abc",
  eventId: null,
  eventRole: null,
  eventStructureId: null,
  commercialPartnerId: null,
  words: [],
} as const;

describe("mentions : mots lus", () => {
  const first = (caption: string | null) => mentionedCandidates(caption).map((c) => c[0]);
  it("lit les mots entiers, pseudos compris, sans doublon ni adresse e-mail", () => {
    expect(first("Salut @Kenji_66 et @wrap-66, @KENJI_66 ! mail a@b.fr @-")).toEqual(["kenji_66", "wrap-66"]);
    expect(first(null)).toEqual([]);
  });
  it("borne le nombre de mots", () => {
    const caption = Array.from({ length: 60 }, (_, i) => `@mot${i}`).join(" ");
    expect(first(caption)).toHaveLength(MENTION_WORDS_MAX);
  });
  it("un pseudo avec un point est lu en entier ; le point final d'une phrase n'en fait pas partie", () => {
    expect(mentionedCandidates("Salut @jean.dupont, et @jean. Fin @jean.dupont.")).toEqual([
      ["jean.dupont"],
      ["jean.", "jean"],
      ["jean.dupont.", "jean.dupont"],
    ]);
    expect(first("@jean.dupont")).not.toContain("jean");
  });
  it("cinq fois le même mot : un seul", () => {
    expect(first("@a @a @a @a @a")).toEqual(["a"]);
  });
  it("une lettre hors du plan de base collée devant le @ écarte la mention", () => {
    expect(first("𝐚@jean")).toEqual([]);
    expect(first("𝐚 @jean")).toEqual(["jean"]);
  });
});

describe("mentionedCandidates", () => {
  it("le mot complet d'abord, puis la ponctuation finale retirée une à une", () => {
    expect(mentionedCandidates("Merci @jean.. et @jean. puis @jean.dupont.")).toEqual([
      ["jean..", "jean.", "jean"],
      ["jean.", "jean"],
      ["jean.dupont.", "jean.dupont"],
    ]);
    expect(mentionedCandidates("@kenji_66 @kenji_66 a@b.fr")).toEqual([["kenji_66"]]);
    expect(mentionedCandidates(null)).toEqual([]);
  });
});

describe("mentionsOf", () => {
  it("rattachement par un non-organisateur : l'événement et sa structure", () => {
    for (const eventRole of ["on_site", "attendee"] as const) {
      expect(mentionsOf({ ...base, eventId: EV, eventRole, eventStructureId: ST })).toEqual([
        { kind: "event", id: EV, source: "attach" },
        { kind: "structure", id: ST, source: "attach" },
      ]);
    }
  });
  it("l'organisateur ou un rattachement sans rôle ne crée rien", () => {
    expect(mentionsOf({ ...base, eventId: EV, eventRole: "organizer", eventStructureId: ST })).toEqual([]);
    expect(mentionsOf({ ...base, eventId: EV, eventRole: null, eventStructureId: ST })).toEqual([]);
  });
  it("un mot : fiche pro d'abord, puis structure, puis personne ; une cible au plus par mot", () => {
    const got = mentionsOf({
      ...base,
      words: [
        { word: "a", proId: PRO, structureId: ST, userId: "u1" },
        { word: "b", structureId: ST, userId: "u1" },
        { word: "c", userId: "u2" },
        { word: "inconnu" },
      ],
    });
    expect(got).toEqual([
      { kind: "pro", id: PRO, source: "caption" },
      { kind: "structure", id: ST, source: "caption" },
      { kind: "user", id: "u2", source: "caption" },
    ]);
  });
  it("collaboration commerciale : la fiche pro ; la première source garde la cible", () => {
    expect(mentionsOf({ ...base, commercialPartnerId: PRO })).toEqual([{ kind: "pro", id: PRO, source: "commercial" }]);
    expect(mentionsOf({ ...base, commercialPartnerId: PRO, words: [{ word: "x", proId: PRO }] })).toEqual([
      { kind: "pro", id: PRO, source: "caption" },
    ]);
  });
  it("jamais l'auteur lui-même (personne ou page)", () => {
    expect(mentionsOf({ ...base, words: [{ word: "moi", userId: "abc" }] })).toEqual([]);
    expect(
      mentionsOf({ ...base, authorKey: authorKeyOf("structure", ST), words: [{ word: "x", structureId: ST }] }),
    ).toEqual([]);
  });
});

const fans = (over = {}) => ({
  source: "attach" as const,
  persona: "fan" as const,
  authorPrivate: false,
  eventRole: "attendee" as const,
  eventEndsAt: new Date(NOW.getTime() + 3_600_000),
  presenceValidated: false,
  ...over,
});

describe("mentionVisible", () => {
  it("« Sur place » : le rôle on_site seulement", () => {
    const f = fans({ persona: "provider", eventRole: "on_site" });
    expect(mentionVisible("on_site", f, NOW)).toBe(true);
    expect(mentionVisible("fans", f, NOW)).toBe(false);
    expect(mentionVisible("on_site", fans(), NOW)).toBe(false);
  });
  it("« Passionnés » avant la fin : tout rattachement ; après : présence validée seulement", () => {
    expect(mentionVisible("fans", fans(), NOW)).toBe(true);
    const over = { eventEndsAt: new Date(NOW.getTime() - 1) };
    expect(mentionVisible("fans", fans(over), NOW)).toBe(false);
    expect(mentionVisible("fans", fans({ ...over, presenceValidated: true }), NOW)).toBe(true);
    // À l'heure pile de la fin, c'est fini.
    expect(mentionVisible("fans", fans({ eventEndsAt: NOW }), NOW)).toBe(false);
  });
  it("un compte privé n'est jamais montré, quelle que soit la rubrique", () => {
    for (const section of ["on_site", "fans", "all"] as const) {
      expect(mentionVisible(section, fans({ authorPrivate: true, presenceValidated: true }), NOW)).toBe(false);
      expect(mentionVisible(section, fans({ source: "caption", authorPrivate: true }), NOW)).toBe(false);
    }
  });
  it("une citation ne vaut que dans « toutes » ; une page n'est pas arrêtée par un compte privé", () => {
    expect(mentionVisible("all", fans({ source: "caption", eventRole: null }), NOW)).toBe(true);
    expect(mentionVisible("fans", fans({ source: "commercial", eventRole: null }), NOW)).toBe(false);
    expect(mentionVisible("all", fans({ persona: "pro", authorPrivate: true, source: "commercial" }), NOW)).toBe(true);
  });
  it("sur une page : les deux rôles comptent, l'organisateur jamais", () => {
    expect(mentionVisible("all", fans({ eventRole: "on_site", persona: "media" }), NOW)).toBe(true);
    expect(mentionVisible("all", fans({ eventRole: "organizer", persona: "organizer" }), NOW)).toBe(false);
  });
});

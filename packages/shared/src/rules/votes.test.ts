import { describe, expect, it } from "vitest";

import { adminSettingSchemas } from "../schemas/admin";
import { adminSettingDefaults, adminSettingKeys } from "./admin";
import { rankResults } from "./audiencePrize";
import {
  bestRankPerVehicle,
  candidateEligible,
  canSeeRanking,
  canVoteIn,
  type EventVote,
  matchesCandidateRule,
  podiumPoints,
  rankingHiddenReason,
  type VoteContext,
  voteClosesAt,
  voteOpensAt,
  votePodium,
  voteState,
} from "./votes";

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 17, h, m));
const base: EventVote = {
  kind: "theme",
  openMode: "manual",
  opensAt: null,
  durationMinutes: null,
  openedAt: null,
  closedAt: null,
};
const ctx: VoteContext = { status: "published", endsAt: at(22, 30), firstCheckinAt: at(19, 2), candidatesEntered: 3 };
const nobody = { checkedInAt: null, ticketScannedAt: null, staffPresent: false, gpsPresentAt: null };

describe("état d'un vote", () => {
  it("à la main : prévu jusqu'au lancement, ouvert ensuite, clos à la fin de l'événement", () => {
    expect(voteState(base, ctx, at(20))).toBe("upcoming");
    expect(voteState({ ...base, openedAt: at(20) }, ctx, at(20, 1))).toBe("open");
    expect(voteState({ ...base, openedAt: at(20) }, ctx, at(22, 30))).toBe("closed");
  });

  it("au premier pointage : ouvert dès deux candidats entrés (règle du lot 49), pas avant", () => {
    const first: EventVote = { ...base, kind: "all_categories", openMode: "first_entry" };
    expect(voteState(first, { ...ctx, candidatesEntered: 1 }, at(20))).toBe("upcoming");
    expect(voteState(first, { ...ctx, firstCheckinAt: null, candidatesEntered: 0 }, at(20))).toBe("upcoming");
    expect(voteState(first, ctx, at(19, 1))).toBe("upcoming");
    expect(voteState(first, ctx, at(19, 2))).toBe("open");
  });

  it("à l'heure fixée : ouvert à l'heure, clos au bout de la durée", () => {
    const timed: EventVote = { ...base, openMode: "at", opensAt: at(21), durationMinutes: 30 };
    expect(voteState(timed, ctx, at(20, 59))).toBe("upcoming");
    expect(voteState(timed, ctx, at(21))).toBe("open");
    expect(voteState(timed, ctx, at(21, 29))).toBe("open");
    expect(voteState(timed, ctx, at(21, 30))).toBe("closed");
  });

  it("jamais au-delà de la fin de l'événement, même avec une longue durée", () => {
    const long: EventVote = { ...base, openedAt: at(22), durationMinutes: 600 };
    expect(voteClosesAt(long, ctx)).toEqual(at(22, 30));
  });

  it("clôture à la main : clos tout de suite, la fin avancée", () => {
    const closed: EventVote = { ...base, openedAt: at(20), closedAt: at(21) };
    expect(voteClosesAt(closed, ctx)).toEqual(at(21));
    expect(voteState(closed, ctx, at(21))).toBe("closed");
    expect(voteState(closed, ctx, at(20, 59))).toBe("open");
  });

  it("sous deux candidats entrés, un vote lancé reste prévu ; un événement non publié n'a que des votes clos", () => {
    const opened: EventVote = { ...base, openedAt: at(20) };
    expect(voteState(opened, { ...ctx, candidatesEntered: 1 }, at(21))).toBe("upcoming");
    expect(voteState(opened, { ...ctx, status: "cancelled" }, at(21))).toBe("closed");
    expect(voteState(opened, { ...ctx, status: "draft" }, at(21))).toBe("closed");
  });

  it("ouverture annoncée : constatée, sinon l'heure prévue, sinon le premier pointage", () => {
    expect(voteOpensAt({ ...base, openedAt: at(20) }, ctx)).toEqual(at(20));
    expect(voteOpensAt({ ...base, openMode: "at", opensAt: at(21) }, ctx)).toEqual(at(21));
    expect(voteOpensAt({ ...base, openMode: "first_entry" }, ctx)).toEqual(at(19, 2));
    expect(voteOpensAt(base, ctx)).toBeNull();
  });
});

describe("qui peut voter dans un vote", () => {
  const open: EventVote = { ...base, openedAt: at(20) };
  it("une preuve de présence suffit : véhicule entré, billet, staff, GPS", () => {
    expect(canVoteIn({ ...nobody, checkedInAt: at(19, 2) }, open, ctx, at(21))).toBeNull();
    expect(canVoteIn({ ...nobody, ticketScannedAt: at(19, 5) }, open, ctx, at(21))).toBeNull();
    expect(canVoteIn({ ...nobody, staffPresent: true }, open, ctx, at(21))).toBeNull();
    expect(canVoteIn({ ...nobody, gpsPresentAt: at(19, 30) }, open, ctx, at(21))).toBeNull();
    expect(canVoteIn(nobody, open, ctx, at(21))).toBe("not_checked_in");
  });

  it("clos avant tout, puis la preuve de présence, puis « pas encore ouvert »", () => {
    const here = { ...nobody, checkedInAt: at(19, 2) };
    expect(canVoteIn(here, open, ctx, at(22, 30))).toBe("vote_closed");
    expect(canVoteIn(here, base, ctx, at(21))).toBe("vote_not_open");
    expect(canVoteIn(nobody, base, ctx, at(21))).toBe("not_checked_in");
  });
});

describe("candidats d'un vote", () => {
  const jp = { country: "JP", makeId: "toyota", zoneId: null };
  const de = { country: "DE", makeId: "bmw", zoneId: "z1" };
  it("tous, origine (pays ou marque), zone", () => {
    expect(matchesCandidateRule("all", null, de)).toBe(true);
    expect(matchesCandidateRule("origins", { countries: ["JP"] }, jp)).toBe(true);
    expect(matchesCandidateRule("origins", { countries: ["JP"] }, de)).toBe(false);
    expect(matchesCandidateRule("origins", { makeIds: ["bmw"] }, de)).toBe(true);
    expect(matchesCandidateRule("origins", { countries: ["JP"], makeIds: ["bmw"] }, de)).toBe(true);
    expect(matchesCandidateRule("origins", {}, jp)).toBe(false);
    expect(matchesCandidateRule("zone", { zoneId: "z1" }, de)).toBe(true);
    expect(matchesCandidateRule("zone", { zoneId: "z1" }, jp)).toBe(false);
    expect(matchesCandidateRule("zone", null, de)).toBe(false);
  });

  it("à la main : la règle ne choisit pas, c'est l'appartenance", () => {
    expect(matchesCandidateRule("hand", null, de)).toBe(false);
  });

  it("éligible seulement une fois entré", () => {
    expect(candidateEligible({ enteredAt: at(19) })).toBe(true);
    expect(candidateEligible({ enteredAt: null })).toBe(false);
  });
});

describe("classement visible", () => {
  it("l'équipe toujours, qui a voté pendant le vote, tout le monde à la clôture", () => {
    expect(canSeeRanking({ team: true, voted: false, state: "open" })).toBe(true);
    expect(canSeeRanking({ team: false, voted: true, state: "open" })).toBe(true);
    expect(canSeeRanking({ team: false, voted: false, state: "open" })).toBe(false);
    expect(canSeeRanking({ team: false, voted: false, state: "upcoming" })).toBe(false);
    expect(canSeeRanking({ team: false, voted: false, state: "closed" })).toBe(true);
  });

  it("la raison : « après ton vote » à qui peut voter, « à la clôture » aux autres", () => {
    expect(rankingHiddenReason({ canVote: true })).toBe("vote_first");
    expect(rankingHiddenReason({ canVote: false })).toBe("not_closed");
  });
});

describe("podium et points", () => {
  it("15 / 10 / 5 par défaut, réglables, rien hors podium", () => {
    expect([1, 2, 3, 4].map((r) => podiumPoints(null, r))).toEqual([15, 10, 5, 0]);
    expect(podiumPoints({ "points.vote_first": 20, "points.vote_second": 0, "points.vote_third": 7 }, 1)).toBe(20);
    expect(podiumPoints({ "points.vote_second": 0 }, 2)).toBe(0);
    expect(podiumPoints({ "points.vote_third": 7 }, 3)).toBe(7);
    // Valeur abîmée : la valeur par défaut.
    expect(podiumPoints({ "points.vote_first": -3 }, 1)).toBe(15);
    expect(podiumPoints({ "points.vote_first": 2.5 }, 1)).toBe(15);
  });

  it("un podium demande deux candidats entrés et trois voix, et au moins une voix par marche", () => {
    const entered = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ applicationId: `a${i}`, checkedInAt: at(19, i) }));
    const votes = (...to: string[]) => to.map((applicationId) => ({ applicationId }));
    const ranked = rankResults(votes("a0", "a0", "a1", "a2"), entered(4));
    expect(votePodium(ranked, 4).map((r) => [r.applicationId, r.rank])).toEqual([
      ["a0", 1],
      ["a1", 2],
      ["a2", 3],
    ]);
    // Trois voix mais un seul candidat entré : pas de choix, pas de podium.
    expect(votePodium(rankResults(votes("a0", "a0", "a0"), entered(1)), 3)).toEqual([]);
    // Deux voix : trop peu.
    expect(votePodium(rankResults(votes("a0", "a1"), entered(3)), 2)).toEqual([]);
    // Une marche sans voix n'est pas décernée.
    expect(votePodium(rankResults(votes("a0", "a0", "a1"), entered(3)), 3).map((r) => r.rank)).toEqual([1, 2]);
  });

  it("égalité : le premier entré passe devant", () => {
    const ranked = rankResults(
      [{ applicationId: "b" }, { applicationId: "a" }],
      [
        { applicationId: "a", checkedInAt: at(19, 5) },
        { applicationId: "b", checkedInAt: at(19, 1) },
      ],
    );
    expect(ranked.map((r) => r.applicationId)).toEqual(["b", "a"]);
  });

  it("une voiture garde son meilleur podium : le meilleur rang, à égalité le premier vote", () => {
    const best = bestRankPerVehicle([
      { key: "v1", rank: 3, voteId: "all" },
      { key: "v1", rank: 1, voteId: "jp" },
      { key: "v2", rank: 2, voteId: "all" },
      { key: "v2", rank: 2, voteId: "jp" },
    ]);
    expect(best.get("v1")).toMatchObject({ rank: 1, voteId: "jp" });
    expect(best.get("v2")).toMatchObject({ rank: 2, voteId: "all" });
    expect(best.size).toBe(2);
  });
});

describe("réglages du podium", () => {
  it("trois clés 15 / 10 / 5, l'ancien « Prix du public » (50) n'en est plus une", () => {
    expect(adminSettingKeys).toEqual(
      expect.arrayContaining(["points.vote_first", "points.vote_second", "points.vote_third"]),
    );
    expect(adminSettingKeys).not.toContain("points.audience_prize");
    expect([
      adminSettingDefaults["points.vote_first"],
      adminSettingDefaults["points.vote_second"],
      adminSettingDefaults["points.vote_third"],
    ]).toEqual([15, 10, 5]);
    expect(adminSettingSchemas["points.vote_first"].safeParse(20).success).toBe(true);
    expect(adminSettingSchemas["points.vote_first"].safeParse(-1).success).toBe(false);
    expect(adminSettingSchemas["points.vote_first"].safeParse(501).success).toBe(false);
  });
});

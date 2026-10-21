import type { AudiencePrizeBoard, AudiencePrizeEntry, AudiencePrizeMine } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { applyTop3, BOARD_RELOAD_MS, barPercent, gridOrder, isOwn, myRank, reloadDelay, voteView } from "./model";

describe("classement en direct", () => {
  it("un rechargement complet toutes les 10 s au plus : le premier tout de suite, les suivants différés", () => {
    expect(reloadDelay(null, 1_000)).toBe(0);
    expect(reloadDelay(1_000, 1_000 + 2_000)).toBe(BOARD_RELOAD_MS - 2_000);
    expect(reloadDelay(1_000, 1_000 + BOARD_RELOAD_MS)).toBe(0);
    // Rafale d'un message par seconde pendant 30 s : au plus 3 rechargements.
    let last: number | null = null;
    let reloads = 0;
    for (let t = 0; t < 30_000; t += 1_000) {
      if (reloadDelay(last, t) === 0) {
        reloads++;
        last = t;
      }
    }
    expect(reloads).toBe(3);
  });

  it("le top 3 du message met à jour voix et rang sans recharger", () => {
    const e = (id: string, votes: number, rank: number) => ({
      applicationId: id,
      vehicleLabel: id,
      pseudo: id,
      photoUrl: null,
      votes,
      rank,
    });
    const next = applyTop3(
      [e("b", 31, 1), e("a", 24, 2), e("c", 11, 3)],
      [
        { applicationId: "a", votes: 33, rank: 1 },
        { applicationId: "b", votes: 31, rank: 2 },
      ],
    );
    expect(next.map((x) => [x.applicationId, x.votes, x.rank])).toEqual([
      ["a", 33, 1],
      ["b", 31, 2],
      ["c", 11, 3],
    ]);
  });
});

// Prix du public, côté appli (lot 50) : ce que l'écran montre selon la réponse de l'API.
const entry = (id: string, votes: number, rank: number): AudiencePrizeEntry => ({
  applicationId: id,
  vehicleLabel: `Voiture ${id}`,
  pseudo: `pilote_${id}`,
  photoUrl: null,
  votes,
  rank,
});

const board = (over: Partial<AudiencePrizeBoard> = {}): AudiencePrizeBoard => ({
  eventId: "e1",
  open: true,
  closesAt: "2026-10-24T20:30:00.000Z",
  settled: false,
  total: 96,
  vehicles: 3,
  winnerPoints: 50,
  entries: [entry("b", 31, 1), entry("a", 24, 2), entry("c", 11, 3)],
  winner: null,
  ...over,
});

const mine = (over: Partial<AudiencePrizeMine> = {}): AudiencePrizeMine => ({
  canVote: true,
  reason: null,
  open: true,
  closesAt: "2026-10-24T20:30:00.000Z",
  checkedInAt: "2026-10-24T17:02:00.000Z",
  votedFor: null,
  votedAt: null,
  ownApplicationIds: ["c"],
  ...over,
});

describe("écran du prix du public", () => {
  it("vote ouvert : la grille ; sinon la raison, ou le classement figé", () => {
    expect(voteView(board(), mine())).toBe("vote");
    expect(voteView(board(), mine({ canVote: false, reason: "not_checked_in" }))).toBe("not_checked_in");
    expect(
      voteView(board({ open: false, total: 0, vehicles: 1 }), mine({ canVote: false, reason: "vote_not_open" })),
    ).toBe("not_open");
    expect(voteView(board({ open: false }), mine({ canVote: false, reason: "vote_closed", open: false }))).toBe(
      "closed",
    );
    expect(voteView(board({ settled: true, open: false }), mine({ canVote: false, reason: "vote_closed" }))).toBe(
      "settled",
    );
    expect(voteView(null, mine())).toBeNull();
  });

  it("la barre du premier est pleine, celle d'un autre proportionnelle, un trait pour une voix perdue", () => {
    expect(barPercent(31, 31)).toBe(100);
    expect(barPercent(24, 31)).toBe(77);
    expect(barPercent(1, 100)).toBe(4);
    expect(barPercent(0, 31)).toBe(0);
    expect(barPercent(5, 0)).toBe(0);
  });

  it("mon rang est celui de mon véhicule pointé, ma voiture est grisée", () => {
    expect(myRank(board(), mine())?.rank).toBe(3);
    expect(myRank(board(), mine())?.of).toBe(3);
    expect(myRank(board(), mine({ ownApplicationIds: [] }))).toBeNull();
    expect(isOwn(entry("c", 1, 1), mine())).toBe(true);
    expect(isOwn(entry("a", 1, 1), mine())).toBe(false);
  });

  it("la grille n'est pas triée par voix : même ordre quel que soit le classement", () => {
    const a = gridOrder([entry("b", 31, 1), entry("a", 24, 2), entry("c", 11, 3)]).map((e) => e.applicationId);
    const b = gridOrder([entry("c", 99, 1), entry("b", 2, 2), entry("a", 1, 3)]).map((e) => e.applicationId);
    expect(a).toEqual(["a", "b", "c"]);
    expect(b).toEqual(a);
  });
});

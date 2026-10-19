import { describe, expect, it } from "vitest";

import {
  AUDIENCE_PRIZE_POINTS_DEFAULT,
  type AudienceVoteWindow,
  audienceWinner,
  canVote,
  isOwnVehicle,
  pointsForWinner,
  prizeAwardable,
  rankResults,
  voteOpen,
} from "./audiencePrize";

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 17, h, m));
const event: AudienceVoteWindow = {
  status: "published",
  endsAt: at(20, 30),
  firstCheckinAt: at(17, 2),
  vehiclesCheckedIn: 2,
};
const nobody = { checkedInAt: null, ticketScannedAt: null, staffPresent: false };

describe("qui peut voter", () => {
  it("les pointés, les billets scannés et le staff présent, pendant la fenêtre", () => {
    expect(canVote({ ...nobody, checkedInAt: at(17, 2) }, event, at(18))).toBeNull();
    expect(canVote({ ...nobody, ticketScannedAt: at(17, 30) }, event, at(18))).toBeNull();
    expect(canVote({ ...nobody, staffPresent: true }, event, at(18))).toBeNull();
    expect(canVote(nobody, event, at(18))).toBe("not_checked_in");
  });

  it("fermé à la fin de l'événement ; pas ouvert avant le premier pointage ni sous deux véhicules", () => {
    const voter = { ...nobody, staffPresent: true };
    expect(canVote(voter, event, at(20, 30))).toBe("vote_closed");
    expect(canVote(voter, event, at(21))).toBe("vote_closed");
    expect(canVote(voter, { ...event, status: "cancelled" }, at(18))).toBe("vote_closed");
    expect(canVote(voter, { ...event, firstCheckinAt: null, vehiclesCheckedIn: 0 }, at(18))).toBe("vote_not_open");
    expect(canVote(voter, event, at(17))).toBe("vote_not_open");
    expect(canVote(voter, { ...event, vehiclesCheckedIn: 1 }, at(18))).toBe("vote_not_open");
    expect(voteOpen(event, at(17, 2))).toBe(true);
    expect(voteOpen(event, at(20, 29))).toBe(true);
  });

  it("pas pour soi-même : ni sa candidature, ni son véhicule", () => {
    expect(isOwnVehicle("u1", { userId: "u1" })).toBe(true);
    expect(isOwnVehicle("u1", { userId: "u2", vehicleOwnerId: "u1" })).toBe(true);
    expect(isOwnVehicle("u1", { userId: "u2", vehicleOwnerId: "u2" })).toBe(false);
  });
});

describe("classement", () => {
  const checkins = [
    { applicationId: "a", checkedInAt: at(17, 10) },
    { applicationId: "b", checkedInAt: at(17, 2) },
    { applicationId: "c", checkedInAt: at(17, 30) },
  ];

  it("le plus de voix d'abord ; égalité : le premier pointé ; les véhicules sans voix sont classés", () => {
    const votes = [{ applicationId: "a" }, { applicationId: "c" }, { applicationId: "a" }, { applicationId: "c" }];
    expect(rankResults(votes, checkins)).toEqual([
      { applicationId: "a", votes: 2, rank: 1 },
      { applicationId: "c", votes: 2, rank: 2 },
      { applicationId: "b", votes: 0, rank: 3 },
    ]);
  });

  it("les voix pour un véhicule non pointé sont ignorées", () => {
    const r = rankResults([{ applicationId: "x" }, { applicationId: "b" }], checkins);
    expect(r.map((x) => x.applicationId)).toEqual(["b", "a", "c"]);
    expect(r.find((x) => x.applicationId === "x")).toBeUndefined();
  });

  it("un gagnant à partir de deux véhicules et trois voix", () => {
    expect(prizeAwardable({ vehicles: 2, votes: 3 })).toBe(true);
    expect(prizeAwardable({ vehicles: 1, votes: 30 })).toBe(false);
    expect(prizeAwardable({ vehicles: 10, votes: 2 })).toBe(false);
    const three = [{ applicationId: "a" }, { applicationId: "a" }, { applicationId: "b" }];
    expect(audienceWinner(rankResults(three, checkins), 3)).toMatchObject({ applicationId: "a", votes: 2 });
    expect(audienceWinner(rankResults(three.slice(0, 2), checkins), 2)).toBeNull();
    expect(audienceWinner(rankResults(three, checkins.slice(0, 1)), 3)).toBeNull();
  });

  it("points du gagnant : réglage de l'administration, 50 par défaut", () => {
    expect(AUDIENCE_PRIZE_POINTS_DEFAULT).toBe(50);
    expect(pointsForWinner(null)).toBe(50);
    expect(pointsForWinner({})).toBe(50);
    expect(pointsForWinner({ "points.audience_prize": 80 })).toBe(80);
    expect(pointsForWinner({ "points.audience_prize": 0 })).toBe(0);
    expect(pointsForWinner({ "points.audience_prize": -5 })).toBe(50);
  });
});

import { describe, expect, it } from "vitest";

import {
  canManageCrewOuting,
  canProposeCrewOuting,
  crewInstagramHandle,
  crewOutingDateIssue,
  crewOutingShown,
} from "./crewPage";
import { HOUR } from "./time";

const now = new Date("2026-10-26T12:00:00Z");

describe("page du crew (lot R5c2)", () => {
  it("proposer une sortie : le chef toujours, un membre selon le réglage", () => {
    expect(canProposeCrewOuting({ isLeader: true, membersCanPropose: false })).toBe(true);
    expect(canProposeCrewOuting({ isLeader: false, membersCanPropose: true })).toBe(true);
    expect(canProposeCrewOuting({ isLeader: false, membersCanPropose: false })).toBe(false);
    expect(canManageCrewOuting({ isAuthor: false, isLeader: false })).toBe(false);
    expect(canManageCrewOuting({ isAuthor: true, isLeader: false })).toBe(true);
  });

  it("date d'une sortie : à venir, au plus un an à l'avance", () => {
    expect(crewOutingDateIssue(new Date(now.getTime() - 1), now)).toBe("past");
    expect(crewOutingDateIssue(now, now)).toBe("past");
    expect(crewOutingDateIssue(new Date(Number.NaN), now)).toBe("past");
    expect(crewOutingDateIssue(new Date(now.getTime() + HOUR), now)).toBeNull();
    expect(crewOutingDateIssue(new Date(now.getTime() + 366 * 24 * HOUR), now)).toBe("too_far");
    expect(crewOutingShown(new Date(now.getTime() - 11 * HOUR), now)).toBe(true);
    expect(crewOutingShown(new Date(now.getTime() - 13 * HOUR), now)).toBe(false);
  });

  it("Instagram : le pseudo seul, jamais une adresse libre", () => {
    expect(crewInstagramHandle("")).toBeNull();
    expect(crewInstagramHandle("  ")).toBeNull();
    expect(crewInstagramHandle("@roussillondrift")).toBe("roussillondrift");
    expect(crewInstagramHandle("roussillon.drift_66")).toBe("roussillon.drift_66");
    expect(crewInstagramHandle("https://www.instagram.com/roussillondrift/")).toBe("roussillondrift");
    expect(crewInstagramHandle("instagram.com/roussillondrift?igsh=x")).toBe("roussillondrift");
    expect(crewInstagramHandle("https://www.instagram.com/p/C0ffee/")).toBeUndefined();
    expect(crewInstagramHandle("https://www.instagram.com/reel/abc")).toBeUndefined();
    expect(crewInstagramHandle("https://instagram.com.evil.example/roussillon")).toBeUndefined();
    expect(crewInstagramHandle("https://evil.example/roussillon")).toBeUndefined();
    expect(crewInstagramHandle("rouss illon")).toBeUndefined();
    expect(crewInstagramHandle("a".repeat(31))).toBeUndefined();
  });
});

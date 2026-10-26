import { describe, expect, it } from "vitest";

import {
  canManageCrewOuting,
  canProposeCrewOuting,
  crewInstagramHandle,
  crewOutingDateIssue,
  crewOutingShown,
  crewOutingWallInstant,
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

describe("jour et heure d'une sortie, lus strictement (tour 2)", () => {
  it("lit le jour et l'heure à l'heure de Paris", () => {
    expect(crewOutingWallInstant("2026-11-01", "09:00").at?.toISOString()).toBe("2026-11-01T08:00:00.000Z");
    expect(crewOutingWallInstant("2028-02-29", "9h30").at?.toISOString()).toBe("2028-02-29T08:30:00.000Z");
  });
  it("refuse un jour qui n'existe pas, jamais décalé au mois suivant", () => {
    expect(crewOutingWallInstant("2027-02-31", "09:00").issue).toBe("no_such_day");
    expect(crewOutingWallInstant("2027-02-29", "09:00").issue).toBe("no_such_day");
    expect(crewOutingWallInstant("2026-11-31", "09:00").issue).toBe("no_such_day");
    expect(crewOutingWallInstant("2026-11-00", "09:00").issue).toBe("no_such_day");
  });
  it("refuse une heure qui n'existe pas (passage à l'heure d'été) ; l'heure qui se répète en octobre reste lisible", () => {
    expect(crewOutingWallInstant("2027-03-28", "02:30").issue).toBe("no_such_hour");
    expect(crewOutingWallInstant("2027-03-28", "03:00").issue).toBeNull();
    expect(crewOutingWallInstant("2027-10-31", "02:30").issue).toBeNull();
  });
  it("refuse ce qui ne se lit pas", () => {
    expect(crewOutingWallInstant("01/11/2026", "09:00").issue).toBe("unreadable");
    expect(crewOutingWallInstant("2026-13-01", "09:00").issue).toBe("unreadable");
    expect(crewOutingWallInstant("2026-11-01", "25:00").issue).toBe("unreadable");
    expect(crewOutingWallInstant("2026-11-01", "").issue).toBe("unreadable");
  });
});

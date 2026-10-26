import { describe, expect, it } from "vitest";

import { outingDayReady, outingInstant, outingWhenIssue } from "./outingForm";

describe("formulaire de sortie du crew (lot R5c2)", () => {
  it("lit le jour et l'heure à l'heure de Paris", () => {
    expect(outingInstant("2026-11-01", "09:00")?.toISOString()).toBe("2026-11-01T08:00:00.000Z");
    expect(outingInstant("2026-07-14", "9h30")?.toISOString()).toBe("2026-07-14T07:30:00.000Z");
  });
  it("refuse ce qui ne se lit pas", () => {
    expect(outingInstant("2026-11-01", "")).toBeNull();
    expect(outingInstant("01/11/2026", "09:00")).toBeNull();
    expect(outingInstant("2026-13-01", "09:00")).toBeNull();
    expect(outingInstant("2026-11-01", "25:00")).toBeNull();
    expect(outingDayReady("2026-11-01")).toBe(true);
    expect(outingDayReady("2026-11")).toBe(false);
  });
  it("tour 2 : un jour ou une heure qui n'existe pas est refusé et dit pourquoi", () => {
    expect(outingInstant("2027-02-31", "09:00")).toBeNull();
    expect(outingWhenIssue("2027-02-31", "09:00")).toBe("no_such_day");
    expect(outingInstant("2027-03-28", "02:30")).toBeNull();
    expect(outingWhenIssue("2027-03-28", "02:30")).toBe("no_such_hour");
    expect(outingWhenIssue("2027-03-28", "03:30")).toBeNull();
  });
});

describe("liens des notifications de crew (lot R5c2)", () => {
  it("mènent à la page du crew, onglet Sorties pour une sortie", async () => {
    const { appLinkOf } = await import("../../../lib/links");
    expect(appLinkOf("/c/roussillon-drift")).toBe("/crew/roussillon-drift");
    expect(appLinkOf("/c/roussillon-drift?onglet=sorties")).toBe("/crew/roussillon-drift?onglet=sorties");
    expect(appLinkOf("/c/../acces")).toBeNull();
    expect(appLinkOf("/c/roussillon-drift?onglet=autre")).toBeNull();
  });
});

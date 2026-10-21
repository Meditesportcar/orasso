import { describe, expect, it } from "vitest";

import { staffMissionActions, ticketIsPast, ticketIsUpcoming } from "./sorties";

const event = { endsAt: "2026-10-10T20:00:00Z" };
const at = (iso: string) => Date.parse(iso);

describe("billets du public dans Mes sorties", () => {
  it("valable puis contrôlé avant la fin : toujours à venir", () => {
    const during = at("2026-10-10T18:00:00Z");
    expect(ticketIsUpcoming({ status: "valid", event }, during)).toBe(true);
    expect(ticketIsUpcoming({ status: "used", event }, during)).toBe(true);
    expect(ticketIsPast({ event }, during)).toBe(false);
  });
  it("après la fin : passé, quel que soit l'état", () => {
    const after = at("2026-10-10T20:00:00Z");
    expect(ticketIsUpcoming({ status: "valid", event }, after)).toBe(false);
    expect(ticketIsUpcoming({ status: "used", event }, after)).toBe(false);
    expect(ticketIsPast({ event }, after)).toBe(true);
  });
  it("un billet annulé ou remboursé n'est jamais à venir", () => {
    expect(ticketIsUpcoming({ status: "cancelled", event }, at("2026-10-09T10:00:00Z"))).toBe(false);
  });
});

describe("missions Staff après la fin", () => {
  const mission = { event, staffModeClosesAt: "2026-10-11T20:00:00Z" };
  it("avant la fin : présence et mode staff", () => {
    expect(staffMissionActions(mission, at("2026-10-10T19:59:00Z"))).toEqual({ presence: true, staffMode: true });
  });
  it("juste après la fin : plus de présence, le mode staff reste (pointage de rattrapage)", () => {
    expect(staffMissionActions(mission, at("2026-10-10T20:01:00Z"))).toEqual({ presence: false, staffMode: true });
  });
  it("à J+1 : plus aucune action", () => {
    expect(staffMissionActions(mission, at("2026-10-11T20:00:00Z"))).toEqual({ presence: false, staffMode: false });
  });
});

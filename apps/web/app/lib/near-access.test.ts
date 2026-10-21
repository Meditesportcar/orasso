import { fromWallTime, type MyApplication, type MyStaffEvent, type MyTicket } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { nearAccessOf } from "./near-access";

const at = (month: number, day: number, hour = 10) => fromWallTime({ year: 2026, month, day, hour, minute: 0 });
const app = (over: Partial<MyApplication> = {}, ev: Partial<MyApplication["event"]> = {}) =>
  ({
    id: "a",
    status: "accepted",
    checkedInAt: null,
    day: null,
    zone: { code: "JDM", name: "JDM" },
    arrival: { from: "18:30", to: "19:15", strict: true, note: null },
    event: {
      id: "e",
      slug: "e",
      title: "Nocturne de Canet",
      format: "night",
      startsAt: at(10, 24, 19).toISOString(),
      endsAt: at(10, 24, 23).toISOString(),
      city: "Canet",
      status: "published",
      ...ev,
    },
    ...over,
  }) as MyApplication;

describe("accès flottant du site", () => {
  it("candidature retenue : contenu de l'artefact (J-6, sam., zone, heure d'arrivée)", () => {
    expect(nearAccessOf({ applications: [app()] }, at(10, 18))).toEqual({
      countdown: "J-6",
      weekday: "sam.",
      title: "Nocturne de Canet",
      line: "Retenue · zone JDM · 18 h 30",
      href: "/app/sorties",
    });
  });

  it("seulement une place retenue, pas encore entrée, d'un événement publié", () => {
    const now = at(10, 20);
    expect(nearAccessOf({ applications: [app({ status: "pending" })] }, now)).toBeNull();
    expect(nearAccessOf({ applications: [app({ checkedInAt: now.toISOString() })] }, now)).toBeNull();
    expect(nearAccessOf({ applications: [app({}, { status: "cancelled" })] }, now)).toBeNull();
    expect(nearAccessOf({ applications: [app()] }, at(10, 5))).toBeNull();
  });

  it("jour choisi d'un festival : le dimanche, vu le samedi, c'est « Demain »", () => {
    const festival = app(
      {
        day: {
          id: "d",
          date: "2026-10-25",
          startsAt: at(10, 25, 10).toISOString(),
          endsAt: at(10, 25, 18).toISOString(),
        },
      },
      { startsAt: at(10, 23, 10).toISOString(), endsAt: at(10, 25, 18).toISOString() },
    );
    expect(nearAccessOf({ applications: [festival] }, at(10, 24, 12))?.countdown).toBe("Demain");
  });

  it("J+1 : visible le lendemain de la fin", () => {
    expect(nearAccessOf({ applications: [app()] }, at(10, 25, 9))?.countdown).toBe("J+1");
    expect(nearAccessOf({ applications: [app()] }, at(10, 26, 0))).toBeNull();
  });

  it("billets et missions staff, le plus proche d'abord", () => {
    const ticket = {
      id: "t",
      status: "valid",
      event: { startsAt: at(10, 22, 19).toISOString(), endsAt: at(10, 22, 23).toISOString(), title: "Cars & Coffee" },
    } as MyTicket;
    const staff = {
      presence: "absent",
      event: { id: "s", startsAt: at(10, 21, 9).toISOString(), endsAt: at(10, 21, 12).toISOString(), title: "Staff" },
    } as MyStaffEvent;
    const r = nearAccessOf({ applications: [app()], tickets: [ticket], staff: [staff] }, at(10, 20));
    expect(r).toMatchObject({ title: "Cars & Coffee", line: "Billet · entrée public · 19 h", href: "/app/billets" });
  });
});

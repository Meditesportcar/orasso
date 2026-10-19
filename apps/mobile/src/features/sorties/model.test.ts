import type { MyApplication, MyStaffEvent, MyTicket } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import {
  applicationAccesses,
  arrivalPhrase,
  barDay,
  inFloatingWindow,
  nextAccessOf,
  staffAccesses,
  ticketAccesses,
  ticketsPast,
  ticketsUpcoming,
  waitlistPhrase,
} from "./model";

const NOW = new Date("2026-10-18T10:00:00Z");
const DAY = 86_400_000;
const at = (days: number, hours = 0) => new Date(NOW.getTime() + days * DAY + hours * 3_600_000).toISOString();

const app = (id: string, days: number, status: MyApplication["status"] = "accepted") =>
  ({
    id,
    status,
    event: { id: `e-${id}`, slug: id, title: `Événement ${id}`, startsAt: at(days), endsAt: at(days, 4) },
  }) as unknown as MyApplication;

const ticket = (id: string, days: number, status: MyTicket["status"] = "valid") =>
  ({
    id,
    status,
    event: { slug: id, title: `Billet ${id}`, startsAt: at(days), endsAt: at(days, 4) },
  }) as unknown as MyTicket;

const staff = (id: string, days: number, presence: MyStaffEvent["presence"], open = false) =>
  ({
    presence,
    staffModeOpen: open,
    event: { id, slug: id, title: `Mission ${id}`, startsAt: at(days), endsAt: at(days, 4) },
  }) as unknown as MyStaffEvent;

describe("créneau d'arrivée", () => {
  it("dit la plage ou « dès », sinon rien", () => {
    expect(arrivalPhrase({ from: "18:30", to: "19:15", strict: true, note: null })).toBe("arrivée 18 h 30 – 19 h 15");
    expect(arrivalPhrase({ from: "19:30", to: null, strict: false, note: null })).toBe("arrivée dès 19 h 30");
    expect(arrivalPhrase(null)).toBeNull();
    expect(arrivalPhrase(undefined)).toBeNull();
  });

  it("la liste d'attente annonce les délais réels des règles", () => {
    expect(waitlistPhrase).toContain("24 h");
    expect(waitlistPhrase).toContain("3 h la veille");
    expect(waitlistPhrase).toContain("2 h le jour J");
  });
});

describe("fenêtre de l'accès flottant : de J-7 à J+1", () => {
  it("J-8 : non ; J-7 : oui ; le jour même : oui ; 20 h après le début : oui ; J+2 : non", () => {
    expect(inFloatingWindow(at(8), NOW)).toBe(false);
    expect(inFloatingWindow(at(7), NOW)).toBe(true);
    expect(inFloatingWindow(at(0, 1), NOW)).toBe(true);
    expect(inFloatingWindow(at(-1, 4), NOW)).toBe(true);
    expect(inFloatingWindow(at(-2), NOW)).toBe(false);
  });

  it("prend l'accès le plus proche, toutes sortes confondues", () => {
    const items = [
      ...applicationAccesses([app("a", 6), app("attente", 1, "pending")]),
      ...ticketAccesses([ticket("t", 3), ticket("vieux", -5)], NOW),
      ...staffAccesses([staff("s", 5, "present")], NOW),
    ];
    // La candidature en attente n'est pas un accès ; le billet du 3e jour passe avant la retenue du 6e.
    expect(items.map((i) => i.key)).toEqual(["app-a", "ticket-t", "staff-s"]);
    expect(nextAccessOf(items, NOW)?.key).toBe("ticket-t");
    expect(nextAccessOf(items, NOW)?.href).toBe("/billets");
  });

  it("une place où l'on est déjà entré n'est plus un accès", () => {
    const entered = { ...app("e", 0), checkedInAt: at(0) } as MyApplication;
    expect(applicationAccesses([entered])).toEqual([]);
  });

  it("à égalité de date, la candidature passe avant le billet", () => {
    const items = [...ticketAccesses([ticket("t", 2)], NOW), ...applicationAccesses([app("a", 2)])];
    expect(nextAccessOf(items, NOW)?.kind).toBe("application");
  });

  it("rien dans la fenêtre : pas de barre", () => {
    expect(nextAccessOf(applicationAccesses([app("loin", 12)]), NOW)).toBeNull();
    expect(nextAccessOf([], NOW)).toBeNull();
  });

  it("la mission staff : refusée = pas d'accès ; le mode staff ouvert mène à l'écran du mode staff", () => {
    expect(staffAccesses([staff("s", 2, "absent")], NOW)).toEqual([]);
    expect(staffAccesses([staff("s", 2, "unknown", true)], NOW)[0]?.href).toBe("/staff/s");
    expect(staffAccesses([staff("s", 2, "present", false)], NOW)[0]?.href).toBe("/sorties");
  });
});

describe("billets", () => {
  it("à venir = valables et pas finis ; passés = utilisés ou finis", () => {
    const list = [ticket("a", 2), ticket("b", -3), ticket("c", 2, "used")];
    expect(ticketsUpcoming(list, NOW).map((x) => x.id)).toEqual(["a"]);
    expect(ticketsPast(list, NOW).map((x) => x.id)).toEqual(["b", "c"]);
  });
});

describe("barDay", () => {
  it("« Sam. 24 » en heure de Paris", () => {
    expect(barDay("2026-10-24T17:00:00Z")).toBe("Sam. 24");
    expect(barDay("2026-10-24T21:30:00Z")).toBe("Sam. 24");
    // 22 h 30 UTC = 0 h 30 à Paris le lendemain (heure d'été jusqu'au 25 octobre 2026).
    expect(barDay("2026-10-24T22:30:00Z")).toBe("Dim. 25");
  });
});

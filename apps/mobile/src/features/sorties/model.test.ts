import type { MyApplication, MyStaffEvent, MyTicket } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import {
  applicationAccesses,
  arrivalPhrase,
  barDay,
  inFloatingWindow,
  liveApplications,
  nextAccessOf,
  staffAccesses,
  staffUpcoming,
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
    event: { id: `e-${id}`, slug: id, title: `Billet ${id}`, startsAt: at(days), endsAt: at(days, 4) },
  }) as unknown as MyTicket;

const staff = (id: string, days: number, presence: MyStaffEvent["presence"], open = false) =>
  ({
    presence,
    staffModeOpen: open,
    // Fermeture du mode staff à J+1 (`staffModeClosesAt` de l'API).
    staffModeClosesAt: at(days + 1, 4),
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

describe("fenêtre de l'accès flottant : jours calendaires, de J-7 au lendemain de la fin", () => {
  const win = (startsAt: string, endsAt: string, now: string) => inFloatingWindow(startsAt, endsAt, new Date(now));

  it("J-7 dès le matin, même pour un événement du soir ; J-8 non", () => {
    // Événement le 25/10 à 19 h (Paris) ; le 18/10 à 8 h (Paris) il reste plus de sept jours en durée, mais c'est J-7.
    expect(win("2026-10-25T17:00:00Z", "2026-10-25T21:00:00Z", "2026-10-18T06:00:00Z")).toBe(true);
    expect(win("2026-10-25T17:00:00Z", "2026-10-25T21:00:00Z", "2026-10-17T22:00:00Z")).toBe(true);
    // 17/10 à 22 h 30 (Paris) : encore J-8 ; minuit passé, J-7.
    expect(win("2026-10-25T17:00:00Z", "2026-10-25T21:00:00Z", "2026-10-17T20:30:00Z")).toBe(false);
  });

  it("un événement de plusieurs jours reste tant qu'il dure, puis un jour de plus", () => {
    const start = "2026-10-14T08:00:00Z";
    const end = "2026-10-20T20:00:00Z";
    expect(win(start, end, "2026-10-18T10:00:00Z")).toBe(true);
    expect(win(start, end, "2026-10-21T10:00:00Z")).toBe(true);
    expect(win(start, end, "2026-10-22T10:00:00Z")).toBe(false);
  });

  it("un événement d'un jour : encore là le lendemain, plus le surlendemain", () => {
    const start = "2026-10-17T17:00:00Z";
    const end = "2026-10-17T21:00:00Z";
    expect(win(start, end, "2026-10-18T10:00:00Z")).toBe(true);
    expect(win(start, end, "2026-10-19T10:00:00Z")).toBe(false);
  });

  it("mission et accréditation portent le vrai `endsAt`", () => {
    const item = (kind: "mission" | "accreditation") => ({
      key: kind,
      kind,
      startsAt: at(-1),
      endsAt: at(1),
      title: kind,
      href: "/",
    });
    expect(nextAccessOf([item("mission")], NOW)?.kind).toBe("mission");
    expect(nextAccessOf([item("accreditation")], NOW)?.kind).toBe("accreditation");
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

describe("billets (lot 59c : règles du site, `rules/sorties`)", () => {
  it("à venir = valables ou contrôlés, tant que l'événement n'est pas fini ; passés = événement fini", () => {
    const list = [ticket("a", 2), ticket("b", -3), ticket("c", 2, "used"), ticket("d", 2, "cancelled")];
    expect(ticketsUpcoming(list, NOW).map((x) => x.id)).toEqual(["a", "c"]);
    expect(ticketsPast(list, NOW).map((x) => x.id)).toEqual(["b"]);
  });

  it("billet contrôlé pendant l'événement : encore à venir (vote), passé à la fin", () => {
    // L'événement a commencé il y a une heure et finit dans trois.
    const during = ticket("j", 0, "used");
    const started = new Date(NOW.getTime() + 3_600_000);
    expect(ticketsUpcoming([during], started).map((x) => x.id)).toEqual(["j"]);
    expect(ticketsPast([during], started)).toEqual([]);
    const ended = new Date(NOW.getTime() + 4 * 3_600_000);
    expect(ticketsUpcoming([during], ended)).toEqual([]);
    expect(ticketsPast([during], ended).map((x) => x.id)).toEqual(["j"]);
  });

  it("un billet contrôlé ne revient pas dans la barre d'accès", () => {
    expect(ticketAccesses([ticket("c", 0, "used"), ticket("v", 0)], NOW).map((i) => i.key)).toEqual(["ticket-v"]);
  });
});

describe("missions staff (lot 59c) : listées jusqu'à J+1, comme le site", () => {
  it("après la fin de l'événement, la mission reste jusqu'à la fermeture du mode staff", () => {
    const mission = staff("m", 0, "present", true);
    const afterEnd = new Date(NOW.getTime() + 5 * 3_600_000);
    expect(staffUpcoming([mission], afterEnd).map((s) => s.event.id)).toEqual(["m"]);
    const closed = new Date(NOW.getTime() + DAY + 4 * 3_600_000);
    expect(staffUpcoming([mission], closed)).toEqual([]);
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

describe("candidatures vivantes", () => {
  it("ni refusées, ni retirées, ni expirées, ni annulées", () => {
    const list = ["pending", "accepted", "refused", "withdrawn", "expired", "cancelled", "awaiting_member"].map(
      (s, i) => app(`x${i}`, 3, s as MyApplication["status"]),
    );
    expect(liveApplications(list).map((a) => a.status)).toEqual(["pending", "accepted", "awaiting_member"]);
    expect(liveApplications(null)).toEqual([]);
  });
});

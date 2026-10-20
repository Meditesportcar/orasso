import type { MyApplication, MyStaffEvent, MyTicket, RecapListItem } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { readyRecaps, votableEvents } from "./entries";

const now = new Date("2026-10-24T20:00:00.000Z");
const during = { startsAt: "2026-10-24T17:00:00.000Z", endsAt: "2026-10-24T22:00:00.000Z" };
const ended = { startsAt: "2026-10-23T17:00:00.000Z", endsAt: "2026-10-23T22:00:00.000Z" };
const tomorrow = { startsAt: "2026-10-25T17:00:00.000Z", endsAt: "2026-10-25T22:00:00.000Z" };

const app = (id: string, over: Partial<MyApplication> = {}, ev = during) =>
  ({
    id,
    status: "accepted",
    checkedInAt: "2026-10-24T17:30:00.000Z",
    event: { id: `e-${id}`, title: `Ev ${id}`, ...ev },
    ...over,
  }) as unknown as MyApplication;
const ticket = (id: string, status: string, ev = during) =>
  ({ id, status, event: { id: `e-${id}`, title: `Ev ${id}`, ...ev } }) as unknown as MyTicket;
const staff = (id: string, presence: string, ev = during) =>
  ({ presence, event: { id: `e-${id}`, title: `Ev ${id}`, ...ev } }) as unknown as MyStaffEvent;

describe("événements où l'on peut voter", () => {
  it("un véhicule pointé, un billet contrôlé, le staff présent : pendant l'événement seulement", () => {
    const list = votableEvents(
      {
        applications: [app("a"), app("b", { checkedInAt: null }), app("c", {}, ended), app("d", {}, tomorrow)],
        tickets: [ticket("t", "used"), ticket("u", "valid")],
        staff: [staff("s", "present"), staff("x", "unknown")],
      },
      now,
    );
    expect(list.map((e) => e.eventId)).toEqual(["e-a", "e-d", "e-t", "e-s"]);
  });

  it("un événement n'apparaît qu'une fois", () => {
    const a = app("a");
    expect(votableEvents({ applications: [a, a], tickets: [{ ...ticket("a", "used") }] }, now)).toHaveLength(1);
  });
});

describe("récaps prêts", () => {
  it("à partir de readyAt, le plus récent d'abord", () => {
    const r = (id: string, readyAt: string, endsAt: string) =>
      ({ eventId: id, readyAt, endsAt }) as unknown as RecapListItem;
    const out = readyRecaps(
      [
        r("old", "2026-10-01T08:00:00.000Z", "2026-09-30T22:00:00.000Z"),
        r("new", "2026-10-20T08:00:00.000Z", "2026-10-19T22:00:00.000Z"),
        r("later", "2026-10-30T08:00:00.000Z", "2026-10-29T22:00:00.000Z"),
      ],
      now,
    );
    expect(out.map((x) => x.eventId)).toEqual(["new", "old"]);
  });
});

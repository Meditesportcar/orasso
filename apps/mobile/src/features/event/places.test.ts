// « Ta place » sur plusieurs jours (lot M4, tour 2) : l'accès qui sert maintenant d'abord.
import { fromWallTime, type MyApplication } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { orderPlaces, usedNow } from "./places";

const at = (day: number, hour: number) => fromWallTime({ year: 2026, month: 10, day, hour, minute: 0 });

const app = (id: string, over: Partial<MyApplication> = {}, day: number | null = null): MyApplication =>
  ({
    id,
    status: "accepted",
    event: {
      id: "ev",
      slug: "weekend",
      title: "Week-end",
      format: "gathering",
      startsAt: at(24, 10).toISOString(),
      endsAt: at(25, 18).toISOString(),
      city: null,
      status: "published",
    },
    vehicle: null,
    day:
      day === null
        ? null
        : {
            id: `d${day}`,
            date: `2026-10-${day}`,
            startsAt: at(day, 10).toISOString(),
            endsAt: at(day, 18).toISOString(),
          },
    checkedInAt: null,
    ...over,
  }) as MyApplication;

describe("« Ta place » : quel accès montrer", () => {
  it("deux journées retenues : la première une fois pointée passe après la seconde (« Mon QR » reste)", () => {
    const sat = app("sam", { checkedInAt: at(24, 11).toISOString() }, 24);
    const sun = app("dim", {}, 25);
    expect(orderPlaces([sat, sun], "ev", at(24, 12)).map((a) => a.id)).toEqual(["dim", "sam"]);
    // Avant d'entrer samedi : samedi d'abord.
    const satFresh = app("sam", {}, 24);
    expect(orderPlaces([sun, satFresh], "ev", at(24, 9)).map((a) => a.id)).toEqual(["sam", "dim"]);
    // Samedi fini sans être venu : dimanche d'abord.
    expect(orderPlaces([satFresh, sun], "ev", at(24, 20)).map((a) => a.id)).toEqual(["dim", "sam"]);
  });

  it("un accès retenu passe avant une candidature en cours ; une offre avant l'attente", () => {
    const pending = app("att", { status: "pending" }, 24);
    const offered = app("off", { status: "offered" }, 24);
    const accepted = app("ret", {}, 25);
    const refused = app("ref", { status: "refused" }, 24);
    expect(orderPlaces([pending, refused, offered, accepted], "ev", at(23, 9)).map((a) => a.id)).toEqual([
      "ret",
      "off",
      "att",
    ]);
  });

  it("pass de tout l'événement pointé hier : l'entrée vaut encore aujourd'hui, jusqu'à la fin de l'accès (lot R7-0, tour 2)", () => {
    const whole = app("tout", { checkedInAt: at(24, 11).toISOString() });
    expect(usedNow(whole, at(24, 15))).toBe(true);
    // Le lendemain matin : toujours « entré », le bouton principal ne redevient pas « Mon QR ».
    expect(usedNow(whole, at(25, 9))).toBe(true);
    expect(orderPlaces([whole, app("autre", { status: "pending" })], "ev", at(25, 9)).map((a) => a.id)).toEqual([
      "autre",
      "tout",
    ]);
    // Pas encore pointé : le QR sert.
    expect(usedNow(app("tout"), at(25, 9))).toBe(false);
    // Accès fermé (J+1 à 0 h) : plus rien à présenter.
    expect(usedNow(whole, at(26, 0))).toBe(false);
  });

  it("un jour choisi, ou un événement d'un jour : pointé, c'est fait", () => {
    expect(usedNow(app("sam", { checkedInAt: at(24, 11).toISOString() }, 24), at(24, 15))).toBe(true);
    const oneDay = app("un", { checkedInAt: at(24, 11).toISOString() });
    oneDay.event.endsAt = at(24, 18).toISOString();
    expect(usedNow(oneDay, at(24, 12))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { homeWidgetIds, homeWidgetOffered, NEARBY_STATIONS_ENABLED } from "../home";
import { isEventOver, notOver, upcomingEndBound } from "./explore";

const HOUR = 3_600_000;
const now = new Date();
const at = (ms: number) => new Date(now.getTime() + ms).toISOString();

describe("Explorer : un événement terminé ne se montre plus (lot R1)", () => {
  it("terminé quand sa fin est passée, plusieurs jours compris (la fin du dernier jour)", () => {
    expect(isEventOver({ endsAt: at(-HOUR) }, now)).toBe(true);
    expect(isEventOver({ endsAt: at(HOUR) }, now)).toBe(false);
    // Commencé hier, fini demain (plusieurs jours) : encore là.
    expect(isEventOver({ endsAt: new Date(now.getTime() + 24 * HOUR) }, now)).toBe(false);
    // Date illisible : on ne cache rien.
    expect(isEventOver({ endsAt: "?" }, now)).toBe(false);
  });

  it("une liste du cache perd ses événements finis, dans le même ordre", () => {
    const list = [
      { id: "a", endsAt: at(2 * HOUR) },
      { id: "b", endsAt: at(-2 * HOUR) },
      { id: "c", endsAt: at(5 * HOUR) },
    ];
    expect(notOver(list, now).map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("la borne basse des « à venir » ne remonte jamais avant maintenant (« Ce week-end » le dimanche)", () => {
    const saturday = new Date(now.getTime() - 30 * HOUR);
    expect(upcomingEndBound(saturday, now)).toBe(now);
    const later = new Date(now.getTime() + 30 * HOUR);
    expect(upcomingEndBound(later, now)).toBe(later);
    expect(upcomingEndBound(undefined, now)).toBe(now);
  });
});

describe("stations de lavage et de carburant retirées pour l'instant (lot R1, décision de Damien)", () => {
  it("le réglage est coupé : ni lavage ni carburant, les autres widgets restent", () => {
    expect(NEARBY_STATIONS_ENABLED).toBe(false);
    expect(homeWidgetIds.filter((id) => !homeWidgetOffered(id))).toEqual(["wash", "fuel"]);
    expect(homeWidgetIds.every((id) => homeWidgetOffered(id, true))).toBe(true);
  });
});

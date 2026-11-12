import { spotEnded } from "@orasso/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { applyDateHeader, resetServerSkewForTests, serverNowMs } from "../../lib/clock";
import { appLinkOf } from "../../lib/links";

describe("lien d un rendez-vous au spot (notification)", () => {
  const id = "0b9d6a3e-4c2f-4d1a-9a1b-3f2e8c7d5a10";
  it("/app/spot/<id> mène à /spot/<id>", () => {
    expect(appLinkOf(`/app/spot/${id}`)).toBe(`/spot/${id}`);
  });
  it("refuse un identifiant mal formé ou un autre chemin", () => {
    expect(appLinkOf("/app/spot/abc")).toBeNull();
    expect(appLinkOf(`/app/spot/${id}/plus`)).toBeNull();
    expect(appLinkOf(`https://exemple.fr/app/spot/${id}`)).toBeNull();
  });
});

// Lot R7i, tour 3 : la fin d'un rendez-vous se juge à l'heure du serveur, pas à la pendule de l'appareil.
describe("fin locale à l'heure du serveur", () => {
  const ends = Date.parse("2026-11-10T12:00:00.000Z");
  const meetup = { phase: "live" as const, endsAt: new Date(ends).toISOString() };

  // Horloge figée (dette R7 § 9) : le test ne dépend plus de l'heure à laquelle il tourne.
  afterEach(() => vi.useRealTimers());

  // Imports statiques (plus d'`import()` dans le test) : sous charge, l'import à froid dépassait le délai de 5 s du test.
  it("un téléphone en retard de 40 min : le rendez-vous est fini à l'heure du serveur, lieu masqué", () => {
    resetServerSkewForTests();
    // Il est 12:00:05 pour le serveur ; le téléphone lit 11:20:05.
    const deviceNow = ends + 5_000 - 40 * 60_000;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(deviceNow);
    expect(spotEnded(meetup, Date.now())).toBe(false);
    expect(applyDateHeader(new Date(ends + 5_000 - 500).toUTCString(), deviceNow - 100, deviceNow + 100)).toBe(true);
    expect(serverNowMs()).toBeGreaterThanOrEqual(ends);
    expect(spotEnded(meetup, serverNowMs())).toBe(true);
    vi.useRealTimers();
    resetServerSkewForTests();
  });
});

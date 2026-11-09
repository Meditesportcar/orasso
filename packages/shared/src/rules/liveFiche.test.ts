import { describe, expect, it } from "vitest";

import { presenceLabels } from "../labels/presence.fr";
import type { EventLive } from "../schemas/presence";
import {
  canOfferPresence,
  liveAt,
  liveOnSiteLine,
  liveRunning,
  liveVotesLabel,
  nextPresenceBoundary,
} from "./liveFiche";

const running: EventLive = {
  phase: "running",
  dayIndex: 2,
  dayCount: 4,
  onSiteCount: 11,
  acceptedCount: 14,
  myPresence: null,
  canValidatePresence: true,
  votesOpen: 3,
  organizerStoryAvailable: false,
};
const after: EventLive = { ...running, phase: "after", onSiteCount: null, acceptedCount: null };
const before: EventLive = { ...running, phase: "before", onSiteCount: null, acceptedCount: null, votesOpen: 0 };

describe("la fiche pendant l'événement (lot R7d2)", () => {
  it("« 11 sur place, sur 14 retenues » seulement pendant, jamais calculé", () => {
    expect(liveOnSiteLine(running)).toBe("11 sur place, sur 14 retenues");
    expect(liveOnSiteLine({ ...running, acceptedCount: 1 })).toBe("11 sur place, sur 1 retenue");
    expect(liveOnSiteLine({ ...running, onSiteCount: 0 })).toBe("0 sur place, sur 14 retenues");
    // Règle des absents : après la fin, avant le début, ou nombres absents : rien.
    expect(liveOnSiteLine(after)).toBeNull();
    expect(liveOnSiteLine(before)).toBeNull();
    expect(liveOnSiteLine({ ...running, onSiteCount: null })).toBeNull();
    expect(liveOnSiteLine({ ...running, acceptedCount: null })).toBeNull();
    // Une valeur de l'événement en cours ne survit pas à la phase : la phase est lue avec les nombres.
    expect(liveOnSiteLine({ ...after, onSiteCount: 11, acceptedCount: 14 })).toBeNull();
    expect(liveOnSiteLine(undefined)).toBeNull();
  });

  it("« Votes · N ouverts » seulement une fois entré, pendant, avec au moins un vote ouvert", () => {
    expect(liveVotesLabel({ ...running, myPresence: "checked_in" })).toBe("Votes · 3 ouverts");
    expect(liveVotesLabel({ ...running, myPresence: "gps", votesOpen: 1 })).toBe("Votes · 1 ouvert");
    expect(liveVotesLabel({ ...running, myPresence: "ticket" })).toBe(presenceLabels.votesOpen(3));
    expect(liveVotesLabel(running)).toBeNull();
    expect(liveVotesLabel({ ...running, myPresence: "gps", votesOpen: 0 })).toBeNull();
    expect(liveVotesLabel({ ...after, myPresence: "gps", votesOpen: 2 })).toBeNull();
    expect(liveVotesLabel(null)).toBeNull();
  });

  const ok = { signedIn: true, eligibleProfile: true, holdsVehicleSlot: false };
  it("« Je suis sur place » : pendant, pas encore présent, sans place de véhicule, connecté", () => {
    expect(canOfferPresence(running, ok)).toBe(true);
    expect(canOfferPresence({ ...running, myPresence: "gps" }, ok)).toBe(false);
    expect(canOfferPresence({ ...running, myPresence: "checked_in" }, ok)).toBe(false);
    expect(canOfferPresence(running, { ...ok, holdsVehicleSlot: true })).toBe(false);
    expect(canOfferPresence(running, { ...ok, signedIn: false })).toBe(false);
    expect(canOfferPresence(running, { ...ok, eligibleProfile: false })).toBe(false);
    // L'API ne l'accepterait pas (fermé au public, billetterie externe, entrée payante, billet payant, nuit) : pas de bouton.
    expect(canOfferPresence({ ...running, canValidatePresence: false }, ok)).toBe(false);
    expect(canOfferPresence(before, ok)).toBe(false);
    expect(canOfferPresence(after, ok)).toBe(false);
    expect(liveRunning(running)).toBe(true);
    expect(liveRunning(after)).toBe(false);
    expect(liveRunning(null)).toBe(false);
  });

  it("garde d'heure : passé la fin, un écran resté ouvert perd compteurs, votes et bouton GPS", () => {
    const end = new Date("2026-11-07T18:00:00Z");
    const mine = { ...running, myPresence: "gps" as const };
    expect(liveAt(mine, end, end.getTime() - 1)).toBe(mine);
    const late = liveAt(mine, end, end.getTime());
    expect(late).toMatchObject({ phase: "after", onSiteCount: null, acceptedCount: null, votesOpen: 0 });
    expect(liveOnSiteLine(late)).toBeNull();
    expect(liveVotesLabel(late)).toBeNull();
    expect(canOfferPresence(liveAt(running, end, end.getTime() + 5_000), ok)).toBe(false);
    expect(liveAt(before, end, end.getTime() + 1)).toBe(before);
    expect(liveAt(null, end, 0)).toBeNull();
  });

  it("fermeture d'une journée : le bouton GPS seul disparaît à la fin du jour déclaré, les compteurs restent", () => {
    const day = (d: number) => ({
      startsAt: new Date(`2026-11-0${d}T08:00:00Z`),
      endsAt: new Date(`2026-11-0${d}T17:00:00Z`),
    });
    const event = { endsAt: day(8).endsAt, startsAt: day(7).startsAt, days: [day(7), day(8)] };
    const mid = new Date("2026-11-07T12:00:00Z").getTime();
    expect(liveAt(running, event, mid)).toBe(running);
    const night = liveAt(running, event, new Date("2026-11-07T22:00:00Z").getTime());
    expect(night).toMatchObject({ phase: "running", canValidatePresence: false, onSiteCount: 11 });
    // 30 minutes avant le jour 2 la fenêtre est ouverte : la valeur lue est gardée.
    const early = new Date("2026-11-08T07:45:00Z").getTime();
    expect(liveAt(running, event, early)).toBe(running);
  });

  it("prochaine frontière : fermeture du jour, ouverture du suivant (30 min avant), fin", () => {
    const d1 = { startsAt: new Date("2026-11-07T08:00:00Z"), endsAt: new Date("2026-11-07T17:00:00Z") };
    const d2 = { startsAt: new Date("2026-11-08T08:00:00Z"), endsAt: new Date("2026-11-08T17:00:00Z") };
    const event = { endsAt: d2.endsAt, days: [d1, d2] };
    const at = (iso: string) => new Date(iso).getTime();
    expect(nextPresenceBoundary(event, at("2026-11-07T12:00:00Z"))).toBe(at("2026-11-07T17:00:00Z"));
    expect(nextPresenceBoundary(event, at("2026-11-07T18:00:00Z"))).toBe(at("2026-11-08T07:30:00Z"));
    expect(nextPresenceBoundary(event, at("2026-11-08T12:00:00Z"))).toBe(at("2026-11-08T17:00:00Z"));
    expect(nextPresenceBoundary(event, at("2026-11-08T18:00:00Z"))).toBeNull();
  });
});

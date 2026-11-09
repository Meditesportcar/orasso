import { describe, expect, it } from "vitest";

import { presenceLabels } from "../labels/presence.fr";
import type { EventLive } from "../schemas/presence";
import { canOfferPresence, liveAt, liveOnSiteLine, liveRunning, liveVotesLabel } from "./liveFiche";

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
});

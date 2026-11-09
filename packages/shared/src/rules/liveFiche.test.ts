import { describe, expect, it } from "vitest";

import { presenceLabels } from "../labels/presence.fr";
import type { EventLive } from "../schemas/presence";
import { canOfferPresence, liveOnSiteLine, liveRunning, liveVotesLabel } from "./liveFiche";

const running: EventLive = {
  phase: "running",
  dayIndex: 2,
  dayCount: 4,
  onSiteCount: 11,
  acceptedCount: 14,
  myPresence: null,
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

  it("« Je suis sur place » : pendant, pas encore présent, sans place de véhicule, connecté", () => {
    const ok = { signedIn: true, eligibleProfile: true, holdsVehicleSlot: false };
    expect(canOfferPresence(running, ok)).toBe(true);
    expect(canOfferPresence({ ...running, myPresence: "gps" }, ok)).toBe(false);
    expect(canOfferPresence({ ...running, myPresence: "checked_in" }, ok)).toBe(false);
    expect(canOfferPresence(running, { ...ok, holdsVehicleSlot: true })).toBe(false);
    expect(canOfferPresence(running, { ...ok, signedIn: false })).toBe(false);
    expect(canOfferPresence(running, { ...ok, eligibleProfile: false })).toBe(false);
    expect(canOfferPresence(before, ok)).toBe(false);
    expect(canOfferPresence(after, ok)).toBe(false);
    expect(liveRunning(running)).toBe(true);
    expect(liveRunning(after)).toBe(false);
    expect(liveRunning(null)).toBe(false);
  });
});

// Lot R8n1, tour 2 : l'annulation est livrée sans condition de place ; heures calmes de l'Essentiel urgent.
import { describe, expect, it } from "vitest";

import {
  deliversNotification,
  ESSENTIAL_URGENT_WITHIN_MS,
  essentialNeedsPlace,
  essentialQuietOverride,
} from "./eventNotifications";

describe("annulation et heures calmes", () => {
  it("l'annulation est livrée sans condition de place (les places sont annulées avant la livraison)", () => {
    expect(
      deliversNotification({
        prefs: { event: false },
        mutedTypes: ["event_cancelled"],
        type: "event_cancelled",
        hasEventId: true,
        hasPlace: false,
      }),
    ).toBe(true);
    expect(essentialNeedsPlace("event_cancelled", true)).toBe(false);
  });

  it("annulation et modification passent outre les heures calmes à moins de 12 h du début, pas les autres", () => {
    expect(essentialQuietOverride("event_cancelled")).toEqual({ within: ESSENTIAL_URGENT_WITHIN_MS });
    expect(essentialQuietOverride("event_updated")).toEqual({ within: 12 * 3_600_000 });
    expect(essentialQuietOverride("event_important")).toEqual({ within: 12 * 3_600_000 });
    expect(essentialQuietOverride("event_reminder_eve")).toBeUndefined();
    expect(essentialQuietOverride("event_news_digest")).toBeUndefined();
  });

  it("pas pour un événement terminé (tour 4)", () => {
    const now = new Date("2026-11-10T22:00:00Z");
    expect(essentialQuietOverride("event_important", { endsAt: new Date(now.getTime() - 1000), now })).toBeUndefined();
    expect(essentialQuietOverride("event_important", { endsAt: new Date(now.getTime() + 1000), now })).toEqual({
      within: ESSENTIAL_URGENT_WITHIN_MS,
    });
  });
});

import { describe, expect, it } from "vitest";
import { type TrackWidths, trackLayout } from "./trackLayout";

describe("trackLayout", () => {
  it("lit la largeur avant que l'événement soit recyclé (mise à jour d'état exécutée après)", () => {
    let pending: ((w: TrackWidths) => TrackWidths) | null = null;
    const setWidths = (update: (w: TrackWidths) => TrackWidths) => {
      pending = update; // React exécute la mise à jour plus tard
    };
    const event = { nativeEvent: { layout: { width: 120 } } as { layout: { width: number } } | null };
    trackLayout(setWidths, 1)(event as { nativeEvent: { layout: { width: number } } });
    // Recyclage de l'événement par React Native : nativeEvent est vidé.
    event.nativeEvent = null;
    expect(pending).not.toBeNull();
    expect((pending as unknown as (w: TrackWidths) => TrackWidths)({ 0: 80 })).toEqual({ 0: 80, 1: 120 });
  });
});

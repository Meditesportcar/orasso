import type { VoteView } from "@orasso/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { tickClock } from "./useVoteClock";
import { confirmationIsStale, eventAfterVote } from "./voteFallback";

const voted = { title: "Plus belle japonaise" } as VoteView;

describe("confirmation de la voix quand la relecture échoue", () => {
  it("l'événement non relu est retrouvé par l'action : l'écran reste, avec « Réessayer »", () => {
    const event = eventAfterVote(null, { ok: true, eventId: "e1" }, "lydia", voted);
    expect(event).toEqual({ id: "e1", slug: "lydia", title: "Plus belle japonaise" });
    expect(confirmationIsStale({ vote: { id: "v" }, event: null }, voted)).toBe(true);
    expect(confirmationIsStale({ vote: null, event: { id: "e1" } }, voted)).toBe(true);
  });
  it("sans voix confirmée, rien n'est inventé", () => {
    expect(eventAfterVote(null, { ok: false, eventId: "e1" }, "lydia", null)).toBeNull();
    expect(confirmationIsStale({ vote: null, event: null }, null)).toBe(false);
  });
  it("tout relu : l'événement du chargeur, pas de relecture à réessayer", () => {
    const loaded = { id: "e2", slug: "lydia", title: "Lydia" };
    expect(eventAfterVote(loaded, { ok: true, eventId: "e1" }, "lydia", voted)).toBe(loaded);
    expect(confirmationIsStale({ vote: {}, event: loaded }, voted)).toBe(false);
  });
});

describe("compte à rebours", () => {
  afterEach(() => vi.useRealTimers());
  it("avance seul, sans message du canal", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const seen: number[] = [];
    const stop = tickClock(
      30_000,
      () => Date.now(),
      (d) => seen.push(d.getTime()),
    );
    vi.advanceTimersByTime(95_000);
    expect(seen).toEqual([30_000, 60_000, 90_000]);
    stop();
    vi.advanceTimersByTime(60_000);
    expect(seen).toHaveLength(3);
  });
});

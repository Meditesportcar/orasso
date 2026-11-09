import { afterEach, describe, expect, it, vi } from "vitest";

import { resetClockForTests, setClockOffset } from "../../../lib/clock";
import { readStamp, staleSince } from "./votesFreshness";

afterEach(() => {
  vi.useRealTimers();
  resetClockForTests();
});

describe("staleSince", () => {
  it("simulation avancÃ©e de 5 jours : des donnÃ©es tout juste lues ne sont pas annoncÃ©es vieilles de milliers de minutes", () => {
    setClockOffset(5 * 24 * 60 * 60_000);
    const loadedAt = readStamp();
    expect(staleSince(loadedAt, true, true)).toBe(0);
  });

  it("avec un dÃ©calage non nul, l'Ã¢ge est celui qui s'est Ã©coulÃ© depuis la lecture", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T10:00:00Z"));
    setClockOffset(3 * 24 * 60 * 60_000);
    const loadedAt = readStamp();
    vi.setSystemTime(new Date("2026-11-09T10:04:30Z"));
    expect(staleSince(loadedAt, true, true)).toBe(4);
  });

  it("rien de pÃ©rimÃ© sans erreur, sans donnÃ©es ou sans lecture", () => {
    const loadedAt = readStamp();
    expect(staleSince(loadedAt, false, true)).toBeNull();
    expect(staleSince(loadedAt, true, false)).toBeNull();
    expect(staleSince(null, true, true)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
  canContestSanction,
  countsForAutoSuspension,
  isSanctionActive,
  MODERATION,
  retainUntil,
  type SanctionFacts,
  sanctionEnds,
  shouldAutoSuspend,
} from "./moderation";

const DAY = 86_400_000;
const now = new Date("2026-10-17T13:00:00.000Z");

describe("suspension automatique (S39, S40)", () => {
  it("un compte de 7 jours au moins, sans signalements abusifs, compte", () => {
    expect(
      countsForAutoSuspension({ accountCreatedAt: new Date(now.getTime() - 7 * DAY), dismissedAbusive: 0 }, now),
    ).toBe(true);
  });
  it("un compte récent ne compte pas", () => {
    expect(
      countsForAutoSuspension(
        { accountCreatedAt: new Date(now.getTime() - 7 * DAY + 60_000), dismissedAbusive: 0 },
        now,
      ),
    ).toBe(false);
  });
  it("deux signalements abusifs : ne compte plus ; un seul : compte encore", () => {
    const old = new Date(now.getTime() - 100 * DAY);
    expect(countsForAutoSuspension({ accountCreatedAt: old, dismissedAbusive: 1 }, now)).toBe(true);
    expect(countsForAutoSuspension({ accountCreatedAt: old, dismissedAbusive: 2 }, now)).toBe(false);
  });
  it("seuil de 3 signaleurs distincts", () => {
    expect(shouldAutoSuspend(2)).toBe(false);
    expect(shouldAutoSuspend(3)).toBe(true);
    expect(MODERATION.autoSuspendWindowMs).toBe(DAY);
  });
});

describe("sanctions", () => {
  it("durées", () => {
    expect(sanctionEnds("warning", now)?.getTime()).toBe(now.getTime());
    expect(sanctionEnds("suspension_7d", now)?.getTime()).toBe(now.getTime() + 7 * DAY);
    expect(sanctionEnds("suspension_30d", now)?.getTime()).toBe(now.getTime() + 30 * DAY);
    expect(sanctionEnds("ban", now)).toBeNull();
  });

  const base: SanctionFacts = {
    kind: "suspension_7d",
    startsAt: now,
    endsAt: new Date(now.getTime() + 7 * DAY),
    liftedAt: null,
    contestStatus: "none",
  };

  it("active : suspension en cours ou bannissement ; jamais un avertissement ni une sanction levée", () => {
    expect(isSanctionActive(base, now)).toBe(true);
    expect(isSanctionActive(base, new Date(now.getTime() + 8 * DAY))).toBe(false);
    expect(isSanctionActive({ ...base, kind: "ban", endsAt: null }, now)).toBe(true);
    expect(isSanctionActive({ ...base, kind: "warning", endsAt: now }, now)).toBe(false);
    expect(isSanctionActive({ ...base, liftedAt: now }, now)).toBe(false);
  });

  it("contestation unique, pendant la sanction et 30 jours après", () => {
    expect(canContestSanction(base, now)).toBe(true);
    expect(canContestSanction(base, new Date(now.getTime() + 37 * DAY))).toBe(true);
    expect(canContestSanction(base, new Date(now.getTime() + 37 * DAY + 1))).toBe(false);
    expect(canContestSanction({ ...base, contestStatus: "pending" }, now)).toBe(false);
    expect(canContestSanction({ ...base, contestStatus: "upheld" }, now)).toBe(false);
    expect(canContestSanction({ ...base, liftedAt: now }, now)).toBe(false);
    expect(canContestSanction({ ...base, kind: "ban", endsAt: null }, new Date(now.getTime() + 400 * DAY))).toBe(true);
  });

  it("conservation : un an après la décision", () => {
    expect(retainUntil(now).toISOString()).toBe("2027-10-17T13:00:00.000Z");
  });
});

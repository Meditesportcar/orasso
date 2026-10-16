import { describe, expect, it } from "vitest";
import { departments, emailAlwaysTypes, notificationTypes } from "../enums";
import { departmentCentroids, distanceKm, profilePosition } from "../geo";
import { mutableTypesByFamily, shouldDeliver } from "./notifications";

describe("préférences de notification (lot 15)", () => {
  it("famille coupée → rien ; type coupé → rien ; le reste passe", () => {
    expect(shouldDeliver({ event: false }, [], "new_event_followed")).toBe(false);
    expect(shouldDeliver({ event: true }, ["new_event_followed"], "new_event_followed")).toBe(false);
    expect(shouldDeliver({ event: true }, ["preview_open"], "new_event_followed")).toBe(true);
    expect(shouldDeliver(null, null, "points_awarded")).toBe(true);
  });

  it("staff et sécurité du compte ne se coupent jamais", () => {
    expect(shouldDeliver({ staff: false }, ["staff_alert"], "staff_alert")).toBe(true);
    expect(shouldDeliver({}, ["security_new_login"], "security_new_login")).toBe(true);
    expect(mutableTypesByFamily().account).toBeUndefined();
    expect(mutableTypesByFamily().event).toContain("event_nearby_interest");
  });

  it("types fusionnés par domaine, e-mail toujours pour la sécurité", () => {
    expect(notificationTypes.security_new_login).toBe("account");
    expect(notificationTypes.referral_confirmed).toBe("grade");
    expect(emailAlwaysTypes).toEqual(
      expect.arrayContaining(["event_reminder_week", "staff_presence_reminder", "security_password_changed"]),
    );
  });
});

describe("géographie au département", () => {
  it("un centre par département, distances plausibles", () => {
    for (const d of departments) expect(departmentCentroids[d], d).toBeTruthy();
    expect(Object.keys(departmentCentroids)).toHaveLength(departments.length);
    const perpignan = profilePosition(["66"]);
    const montpellier = profilePosition(["34"]);
    expect(distanceKm(perpignan!, montpellier!)).toBeGreaterThan(100);
    expect(distanceKm(perpignan!, montpellier!)).toBeLessThan(180);
    expect(profilePosition([])).toBeNull();
  });
});

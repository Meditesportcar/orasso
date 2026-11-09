import { describe, expect, it } from "vitest";

import { approximateOnly } from "./presencePermission";

describe("permission de position de « Je suis sur place »", () => {
  it("approximative (Android coarse, iOS reduced) : on ne mesure pas", () => {
    expect(approximateOnly({ status: "granted", android: { accuracy: "coarse" } })).toBe(true);
    expect(approximateOnly({ status: "granted", ios: { accuracy: "reduced" } })).toBe(true);
  });
  it("exacte ou sans détail : on mesure", () => {
    expect(approximateOnly({ status: "granted", android: { accuracy: "fine" } })).toBe(false);
    expect(approximateOnly({ status: "granted", ios: { accuracy: "full" } })).toBe(false);
    expect(approximateOnly({ status: "granted" })).toBe(false);
    expect(approximateOnly({ status: "granted", android: null, ios: null })).toBe(false);
  });
});

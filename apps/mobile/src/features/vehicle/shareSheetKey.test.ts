import { describe, expect, it } from "vitest";

import { shareSheetKey } from "./shareSheetKey";

describe("clé de la feuille de partage", () => {
  it("change avec la version (floutage) et avec le véhicule", () => {
    expect(shareSheetKey("v1", "100-3-abc")).toBe(shareSheetKey("v1", "100-3-abc"));
    expect(shareSheetKey("v1", "100-3-abc")).not.toBe(shareSheetKey("v1", "200-3-abc"));
    expect(shareSheetKey("v1", "100-3-abc")).not.toBe(shareSheetKey("v2", "100-3-abc"));
  });
});

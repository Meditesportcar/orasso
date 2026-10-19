import { describe, expect, it } from "vitest";

import { departmentCentroids, regionDepartments, regions, travelMinutes } from "./geo";

describe("régions (lot 45)", () => {
  it("13 régions qui couvrent chaque département métropolitain une seule fois", () => {
    expect(regions).toHaveLength(13);
    const all = regions.flatMap((r) => r.departments);
    const metro = Object.keys(departmentCentroids).filter((d) => d.length === 2);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual([...metro].sort());
    expect(regionDepartments("OCC")).toContain("66");
    expect(regionDepartments("XYZ")).toEqual([]);
  });

  it("temps de route : 70 km/h à vol d'oiseau, au quart d'heure ; null sans secteur ni lieu", () => {
    const toulouse = { lat: 43.6045, lng: 1.4442 };
    const minutes = travelMinutes(["66"], toulouse) as number;
    expect(minutes % 15).toBe(0);
    expect(minutes).toBeGreaterThanOrEqual(120);
    expect(minutes).toBeLessThanOrEqual(210);
    expect(travelMinutes([], toulouse)).toBeNull();
    expect(travelMinutes(["66"], null)).toBeNull();
  });
});

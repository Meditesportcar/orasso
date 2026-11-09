import { describe, expect, it } from "vitest";
import { statsSurfaces } from "./home";

const none = { impressions: 0, clicks: 0 };

describe("statsSurfaces", () => {
  it("montre les endroits diffusés, même sans statistiques", () => {
    expect(statsSurfaces({ surfaces: ["home"], bySurface: { home: none, feed: none } })).toEqual(["home"]);
  });
  it("montre aussi un endroit décoché qui a des statistiques passées (affichages ou clics)", () => {
    expect(
      statsSurfaces({ surfaces: ["home"], bySurface: { home: none, feed: { impressions: 3, clicks: 0 } } }),
    ).toEqual(["home", "feed"]);
    expect(
      statsSurfaces({ surfaces: ["feed"], bySurface: { home: { impressions: 0, clicks: 1 }, feed: none } }),
    ).toEqual(["home", "feed"]);
  });
  it("cache un endroit décoché sans aucune statistique", () => {
    expect(statsSurfaces({ surfaces: ["feed"], bySurface: { home: none, feed: none } })).toEqual(["feed"]);
  });
});

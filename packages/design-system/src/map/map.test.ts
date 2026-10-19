import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { describe, expect, it } from "vitest";

import { THEME_IDS, tokens } from "../tokens";
import { HATCH_SIZE, hatchImage, hatchPngDataUri } from "./hatch";
import { clusterPins, pinDateLabel } from "./pins";
import {
  MAP_FALLBACK_FONTSTACK,
  MAP_FONTSTACK,
  MAP_SOURCE_ID,
  mapAttribution,
  mapFallbackRaster,
  mapStyle,
  OPENFREEMAP_URL,
} from "./style";

/** Toutes les chaînes « couleur » d'un style (paint), expressions comprises. */
function colorsOf(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string" && /^(#|rgba?\(|hsla?\()/.test(value)) out.push(value);
  else if (Array.isArray(value)) for (const v of value) colorsOf(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) colorsOf(v, out);
  return out;
}

describe("style de carte Orasso (lot 44)", () => {
  for (const theme of THEME_IDS) {
    it(`${theme} : style MapLibre valide, nommé, sur OpenFreeMap`, () => {
      const style = mapStyle(theme, { glyphsOrigin: "https://dev.orasso.fr/" });
      expect(validateStyleMin(style)).toEqual([]);
      expect(style.name).toBe(`orasso-${theme}`);
      expect(style.glyphs).toBe("https://dev.orasso.fr/map-fonts/{fontstack}/{range}.pbf");
      const source = style.sources[MAP_SOURCE_ID] as { url: string; attribution: string };
      expect(source.url).toBe(OPENFREEMAP_URL);
      expect(source.attribution).toBe(mapAttribution);
      for (const credit of ["OpenFreeMap", "OpenMapTiles", "OpenStreetMap"]) expect(mapAttribution).toContain(credit);
      const fonts = style.layers.flatMap((l) =>
        "layout" in l ? ((l.layout as Record<string, unknown>)?.["text-font"] ?? []) : [],
      );
      expect(new Set(fonts as string[])).toEqual(new Set([MAP_FONTSTACK]));
    });

    it(`${theme} : toutes les couleurs viennent des jetons`, () => {
      const allowed = new Set<string>(Object.values(tokens.color[theme]));
      const colors = colorsOf(mapStyle(theme).layers.map((l) => ("paint" in l ? l.paint : null)));
      expect(colors.length).toBeGreaterThan(10);
      for (const c of colors) expect(allowed.has(c), `${c} (${theme}) n'est pas un jeton`).toBe(true);
      const c = tokens.color[theme];
      const paintOf = (id: string) =>
        mapStyle(theme).layers.find((l) => l.id === id) as { paint: Record<string, unknown> };
      expect(paintOf("land").paint["background-color"]).toBe(c.mapLand);
      expect(paintOf("water").paint["fill-color"]).toBe(c.mapSea);
      expect(paintOf("water-hatch").paint["fill-pattern"]).toBe(`hatch-${theme}`);
      expect(paintOf("road-primary").paint["line-color"]).toBe(c.mapRoad);
      expect(paintOf("place-city").paint["text-color"]).toBe(c.mapLabel);
    });

    it(`${theme} : repli raster valide, glyphes d'OpenFreeMap sans origine`, () => {
      const raster = mapFallbackRaster(theme);
      expect(validateStyleMin(raster)).toEqual([]);
      expect(raster.name).toBe(`orasso-${theme}-raster`);
      const bare = mapStyle(theme, { tilesUrl: "https://invalide.test/planet" });
      expect(bare.glyphs).toContain("tiles.openfreemap.org/fonts");
      expect((bare.sources[MAP_SOURCE_ID] as { url: string }).url).toBe("https://invalide.test/planet");
      expect(JSON.stringify(bare)).toContain(MAP_FALLBACK_FONTSTACK);
    });

    it(`${theme} : hachures 8 × 8 couleur map-label à 35 %, en PNG`, () => {
      const img = hatchImage(theme);
      expect(img.width).toBe(HATCH_SIZE);
      expect(img.data.length).toBe(HATCH_SIZE * HATCH_SIZE * 4);
      const hex = tokens.color[theme].mapLabel.replace("#", "");
      const row = (HATCH_SIZE / 2) * HATCH_SIZE * 4;
      expect([img.data[row], img.data[row + 1], img.data[row + 2]]).toEqual(
        [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)),
      );
      expect(img.data[row + 3]).toBe(Math.round(255 * 0.35));
      expect(img.data[3]).toBe(0);
      const png = Buffer.from(hatchPngDataUri(theme).replace("data:image/png;base64,", ""), "base64");
      expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    });
  }

  it("étiquette d'événement : jour et date à Paris", () => {
    expect(pinDateLabel("2026-10-24T17:00:00Z")).toBe("SAM 24");
    // 23 h 30 à Paris le dimanche 25 = 22 h 30 UTC (heure d'hiver).
    expect(pinDateLabel("2026-10-25T22:30:00Z")).toBe("DIM 25");
  });

  it("regroupe les points proches selon le zoom", () => {
    const pts = [
      { id: "canet", lat: 42.7, lng: 3.03 },
      { id: "perpignan", lat: 42.69, lng: 2.89 },
      { id: "narbonne", lat: 43.18, lng: 3.0 },
    ];
    expect(clusterPins(pts, 5).map((g) => g.items.length)).toEqual([3]);
    expect(clusterPins(pts, 5)[0]?.id).toBe("group:canet");
    expect(clusterPins(pts, 7).map((g) => g.items.length)).toEqual([2, 1]);
    expect(clusterPins(pts, 10).map((g) => g.id)).toEqual(["canet", "perpignan", "narbonne"]);
  });
});

describe("aucune couleur en dur dans les fichiers de carte", () => {
  const repo = resolve(import.meta.dirname, "../../../..");
  const mapDir = resolve(import.meta.dirname);
  const files = [
    ...readdirSync(mapDir)
      .filter((f) => /\.(ts|tsx|css)$/.test(f) && !f.endsWith(".test.ts"))
      .map((f) => resolve(mapDir, f)),
    resolve(repo, "apps/web/app/components/EventMap.tsx"),
    resolve(repo, "apps/web/app/components/EventsMap.tsx"),
    resolve(repo, "apps/web/app/components/ProsMap.tsx"),
    resolve(repo, "apps/mobile/src/features/explorer/ExplorerMap.tsx"),
    resolve(repo, "apps/mobile/src/features/explorer/ExplorerMap.web.tsx"),
    resolve(repo, "apps/mobile/src/features/explorer/mapPins.ts"),
  ];
  for (const file of files) {
    it(file.replace(repo, "").replaceAll("\\", "/"), () => {
      const text = readFileSync(file, "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
      expect(text.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g)).toBeNull();
    });
  }
});

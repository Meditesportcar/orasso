// Style de carte Orasso (lot 44, ARCHITECTURE-DA-V2 § 2.3, prototype `s-map`) : « terre en béton ou en sable, mer
// hachurée, noms en Archivo étroit, pas de rotation, carte qui suit le thème ». Un style MapLibre (JSON) par thème, à
// partir des seuls jetons `map-*` (et de la moutarde pour les autoroutes, comme « La Catalane » du prototype).
// Tuiles vectorielles OpenFreeMap (schéma OpenMapTiles, gratuit, sans clé : V3, H5) ; repli sur les tuiles raster
// OpenStreetMap quand la source échoue (`MAP_FALLBACK_RASTER`, branché par la carte web et la carte native).
// Fonctions pures : pas de MapLibre ici, seulement des objets ; le site et l'appli les donnent à leur carte.
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";

import { type ThemeId, tokens } from "../tokens";

/** Tuiles vectorielles OpenFreeMap (TileJSON, schéma OpenMapTiles). */
export const OPENFREEMAP_URL = "https://tiles.openfreemap.org/planet";
/** Glyphes d'OpenFreeMap : repli quand le site (qui sert l'Archivo étroit) n'est pas connu. */
export const OPENFREEMAP_GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
/** Pile de polices servie par le site (`apps/web/public/map-fonts/Archivo Narrow/`, script `build-map-glyphs.mjs`). */
export const MAP_FONTSTACK = "Archivo Narrow";
/** Police de repli d'OpenFreeMap. */
export const MAP_FALLBACK_FONTSTACK = "Noto Sans Regular";
/** Identifiant de la source vectorielle : l'erreur de cette source déclenche le repli raster. */
export const MAP_SOURCE_ID = "openmaptiles";

/** Crédit obligatoire des tuiles (V3) : affiché par le contrôle d'attribution de la carte. */
export const mapAttribution =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">© OpenFreeMap</a> · ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>';
/** Le même crédit, en texte (appli). */
export const mapAttributionText = "© OpenFreeMap · © OpenMapTiles · © OpenStreetMap";

/** Nom du style d'un thème (`map.getStyle().name`, vérifié par la recette). */
export const mapStyleName = (theme: ThemeId): string => `orasso-${theme}`;
/** Nom de l'image des hachures de la mer, propre au thème (la couleur change avec lui). */
export const hatchImageId = (theme: ThemeId): string => `hatch-${theme}`;

export type MapStyleOptions = {
  /**
   * Origine du site qui sert les glyphes Archivo étroit (`https://dev.orasso.fr`, `http://localhost:5613`) ; absente :
   * glyphes et police d'OpenFreeMap (Noto Sans).
   */
  glyphsOrigin?: string | null;
  /** Adresse TileJSON des tuiles vectorielles (défaut : OpenFreeMap ; la recette en passe une fausse pour le repli). */
  tilesUrl?: string | null;
};

/** Couleurs d'un thème : uniquement des jetons. */
function palette(theme: ThemeId) {
  const c = tokens.color[theme];
  return {
    land: c.mapLand,
    land2: c.mapLand2,
    sea: c.mapSea,
    road: c.mapRoad,
    label: c.mapLabel,
    motorway: c.accent,
  };
}

const zoomed = (stops: Array<[number, number]>) => ["interpolate", ["exponential", 1.4], ["zoom"], ...stops.flat()];

/** Style MapLibre d'Orasso pour un thème. */
export function mapStyle(theme: ThemeId, options: MapStyleOptions = {}): StyleSpecification {
  const p = palette(theme);
  const origin = options.glyphsOrigin?.replace(/\/+$/, "") || null;
  const font = origin ? MAP_FONTSTACK : MAP_FALLBACK_FONTSTACK;
  const name = ["coalesce", ["get", "name:fr"], ["get", "name:latin"], ["get", "name"]];
  const label = {
    "text-font": [font],
    "text-field": name,
    "text-transform": "uppercase",
    "text-letter-spacing": 0.18,
    "text-max-width": 8,
  };
  const labelPaint = { "text-color": p.label, "text-halo-color": p.land, "text-halo-width": 1.4 };
  return {
    version: 8,
    name: mapStyleName(theme),
    metadata: { "orasso:theme": theme },
    glyphs: origin ? `${origin}/map-fonts/{fontstack}/{range}.pbf` : OPENFREEMAP_GLYPHS,
    sources: {
      [MAP_SOURCE_ID]: {
        type: "vector",
        url: options.tilesUrl || OPENFREEMAP_URL,
        attribution: mapAttribution,
      },
    },
    layers: [
      { id: "land", type: "background", paint: { "background-color": p.land } },
      {
        id: "landcover",
        type: "fill",
        source: MAP_SOURCE_ID,
        "source-layer": "landcover",
        filter: ["in", ["get", "class"], ["literal", ["wood", "grass", "farmland", "wetland"]]],
        paint: { "fill-color": p.land2, "fill-opacity": 0.45 },
      },
      {
        id: "landuse",
        type: "fill",
        source: MAP_SOURCE_ID,
        "source-layer": "landuse",
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["residential", "suburb", "neighbourhood", "commercial", "industrial", "retail"]],
        ],
        paint: { "fill-color": p.land2 },
      },
      {
        id: "building",
        type: "fill",
        source: MAP_SOURCE_ID,
        "source-layer": "building",
        minzoom: 14,
        paint: { "fill-color": p.land2, "fill-outline-color": p.land },
      },
      {
        id: "water",
        type: "fill",
        source: MAP_SOURCE_ID,
        "source-layer": "water",
        paint: { "fill-color": p.sea },
      },
      {
        // Les hachures de la mer, par-dessus l'aplat : si l'image manque, l'aplat reste.
        id: "water-hatch",
        type: "fill",
        source: MAP_SOURCE_ID,
        "source-layer": "water",
        paint: { "fill-pattern": hatchImageId(theme) },
      },
      {
        id: "waterway",
        type: "line",
        source: MAP_SOURCE_ID,
        "source-layer": "waterway",
        minzoom: 8,
        paint: {
          "line-color": p.sea,
          "line-width": zoomed([
            [8, 0.6],
            [14, 2.4],
          ]),
        },
      },
      {
        id: "boundary",
        type: "line",
        source: MAP_SOURCE_ID,
        "source-layer": "boundary",
        filter: ["all", ["<=", ["get", "admin_level"], 6], ["!=", ["get", "maritime"], 1]],
        paint: {
          "line-color": p.label,
          "line-opacity": ["case", ["<=", ["get", "admin_level"], 2], 0.55, 0.3],
          "line-width": ["case", ["<=", ["get", "admin_level"], 2], 1.2, 0.8],
          "line-dasharray": [4, 3],
        },
      },
      {
        id: "road-minor",
        type: "line",
        source: MAP_SOURCE_ID,
        "source-layer": "transportation",
        minzoom: 12,
        filter: ["in", ["get", "class"], ["literal", ["minor", "service", "track"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": p.road,
          "line-opacity": 0.3,
          "line-width": zoomed([
            [12, 0.4],
            [18, 6],
          ]),
        },
      },
      {
        id: "road-secondary",
        type: "line",
        source: MAP_SOURCE_ID,
        "source-layer": "transportation",
        minzoom: 8,
        filter: ["in", ["get", "class"], ["literal", ["secondary", "tertiary"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": p.road,
          "line-opacity": 0.5,
          "line-width": zoomed([
            [8, 0.5],
            [18, 10],
          ]),
        },
      },
      {
        id: "road-primary",
        type: "line",
        source: MAP_SOURCE_ID,
        "source-layer": "transportation",
        minzoom: 6,
        filter: ["in", ["get", "class"], ["literal", ["primary", "trunk"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": p.road,
          "line-opacity": 0.65,
          "line-width": zoomed([
            [6, 0.6],
            [18, 14],
          ]),
        },
      },
      {
        // Autoroutes en moutarde : « La Catalane » (A9) du prototype, bordée de la couleur de la terre.
        id: "road-motorway-casing",
        type: "line",
        source: MAP_SOURCE_ID,
        "source-layer": "transportation",
        minzoom: 5,
        filter: ["==", ["get", "class"], "motorway"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": p.land,
          "line-width": zoomed([
            [5, 2],
            [18, 22],
          ]),
        },
      },
      {
        id: "road-motorway",
        type: "line",
        source: MAP_SOURCE_ID,
        "source-layer": "transportation",
        minzoom: 5,
        filter: ["==", ["get", "class"], "motorway"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": p.motorway,
          "line-width": zoomed([
            [5, 0.8],
            [18, 12],
          ]),
        },
      },
      {
        id: "water-name",
        type: "symbol",
        source: MAP_SOURCE_ID,
        "source-layer": "water_name",
        layout: {
          ...label,
          "text-size": zoomed([
            [3, 9],
            [10, 13],
          ]),
          "text-letter-spacing": 0.3,
        },
        paint: labelPaint,
      },
      {
        id: "place-village",
        type: "symbol",
        source: MAP_SOURCE_ID,
        "source-layer": "place",
        minzoom: 10,
        filter: ["in", ["get", "class"], ["literal", ["village", "suburb", "hamlet"]]],
        layout: {
          ...label,
          "text-size": zoomed([
            [10, 9],
            [16, 13],
          ]),
        },
        paint: labelPaint,
      },
      {
        id: "place-town",
        type: "symbol",
        source: MAP_SOURCE_ID,
        "source-layer": "place",
        minzoom: 7,
        filter: ["==", ["get", "class"], "town"],
        layout: {
          ...label,
          "text-size": zoomed([
            [7, 9],
            [14, 15],
          ]),
        },
        paint: labelPaint,
      },
      {
        id: "place-city",
        type: "symbol",
        source: MAP_SOURCE_ID,
        "source-layer": "place",
        minzoom: 4,
        filter: ["==", ["get", "class"], "city"],
        layout: {
          ...label,
          "text-size": zoomed([
            [4, 10],
            [12, 18],
          ]),
        },
        paint: labelPaint,
      },
    ],
  } as StyleSpecification;
}

/**
 * Repli quand OpenFreeMap ne répond pas : les tuiles raster d'OpenStreetMap (l'ancien fond, moins beau, mais une carte
 * quand même). Même nom que le style du thème, suffixé `-raster`.
 */
export function mapFallbackRaster(theme: ThemeId): StyleSpecification {
  return {
    version: 8,
    name: `${mapStyleName(theme)}-raster`,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution:
          '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>',
      },
    },
    layers: [
      { id: "land", type: "background", paint: { "background-color": palette(theme).land } },
      { id: "osm", type: "raster", source: "osm" },
    ],
  };
}

/** Le style raster de repli, tel que les cartes l'avaient avant le lot 44 (fond OpenStreetMap seul). */
export const MAP_FALLBACK_RASTER: StyleSpecification = mapFallbackRaster("beton");

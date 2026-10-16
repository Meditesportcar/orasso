// Carte de l'Explorer : les épingles et la vue de départ, en fonctions pures (testées). Une épingle n'existe que pour ce
// qui est public par nature (un événement publié, un pro publié) et qui a une position : jamais une personne.
import { type EventCard, eventFormatLabels, type ProCard, proActivityLabels } from "@orasso/shared";

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle: string;
  /** Route de l'appli ouverte par « Ouvrir la fiche ». */
  href: string;
};

type LngLat = [number, number];
export type MapView = { center: LngLat; zoom: number } | { bounds: [number, number, number, number] };

/** Centre de la France métropolitaine, quand il n'y a rien à montrer. */
export const FRANCE_VIEW: MapView = { center: [2.35, 46.6], zoom: 4.6 };

export function eventPins(events: EventCard[]): MapPin[] {
  return events.flatMap((e) =>
    e.lat !== null && e.lng !== null
      ? [
          {
            id: e.id,
            lat: e.lat,
            lng: e.lng,
            title: e.title,
            subtitle: [eventFormatLabels[e.format], e.city].filter(Boolean).join(" · "),
            href: `/e/${e.slug}`,
          },
        ]
      : [],
  );
}

export function proPins(pros: ProCard[]): MapPin[] {
  return pros.flatMap((p) =>
    p.lat !== null && p.lng !== null
      ? [
          {
            id: p.slug,
            lat: p.lat,
            lng: p.lng,
            title: p.name,
            subtitle: [p.activities.map((a) => proActivityLabels[a]).join(" · "), p.city].filter(Boolean).join(" · "),
            href: `/p/${p.slug}`,
          },
        ]
      : [],
  );
}

/** Vue de départ : la France sans épingle, un zoom de ville avec une seule, sinon le cadre qui les contient toutes. */
export function viewFor(pins: readonly MapPin[]): MapView {
  const first = pins[0];
  if (!first) return FRANCE_VIEW;
  if (pins.length === 1) return { center: [first.lng, first.lat], zoom: 10 };
  let west = first.lng;
  let east = first.lng;
  let south = first.lat;
  let north = first.lat;
  for (const p of pins) {
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  // Toutes au même endroit : un cadre vide ne se montre pas, on zoome comme pour une seule.
  if (west === east && south === north) return { center: [west, south], zoom: 10 };
  return { bounds: [west, south, east, north] };
}

/** Clé qui change quand les épingles changent : la carte repart alors de la vue qui convient. */
export const pinsKey = (pins: readonly MapPin[]): string => pins.map((p) => p.id).join("|");

/** Même fond de carte que le site (tuiles OpenStreetMap, trame raster). */
export const OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap",
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
};

// Carte de l'Explorer : les épingles et la vue de départ, en fonctions pures (testées). Une épingle n'existe que pour ce
// qui est public par nature (un événement publié, un pro publié) et qui a une position : jamais une personne.
// Lot 44 : l'épingle porte son genre (étiquette datée d'un événement, plaque d'un pro) et son texte ; le fond de carte
// est le style Orasso du paquet de style (`mapStyle`, repli raster compris).
import { pinDateLabel } from "@orasso/design-system";
import { type EventCard, eventFormatLabels, type LatLng, type ProCard, proActivityLabels } from "@orasso/shared";
import type { ReactNode } from "react";

export type MapPin = {
  id: string;
  kind: "event" | "pro";
  /** Texte du marqueur : « SAM 24 » (événement), le nom (pro). */
  label: string;
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
            kind: "event" as const,
            label: pinDateLabel(e.startsAt),
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
            kind: "pro" as const,
            label: p.name,
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
export function viewFor(pins: readonly Pick<MapPin, "lat" | "lng">[]): MapView {
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
export const pinsKey = (pins: readonly Pick<MapPin, "id">[]): string => pins.map((p) => p.id).join("|");

/**
 * Origine du site qui sert les glyphes Archivo étroit : `EXPO_PUBLIC_SITE_URL` seulement (l'API ne les sert pas) ;
 * vide : glyphes et police d'OpenFreeMap (Noto Sans), pour que les noms s'affichent quand même.
 */
export function mapGlyphsOrigin(): string | null {
  const raw = process.env.EXPO_PUBLIC_SITE_URL || "";
  return raw ? raw.replace(/\/+$/, "") : null;
}

/** Adresse des tuiles vectorielles remplacée pour la recette du repli (`EXPO_PUBLIC_MAP_TILES_URL`). */
export const mapTilesUrl = (): string | null => process.env.EXPO_PUBLIC_MAP_TILES_URL || null;

/** Barres du haut et du bas d'un onglet (px, environ) : ce qui ne défile pas autour de la page. */
export const MAP_CHROME = 150;
/**
 * Hauteur de la carte : 55 % de l'écran (420 px avant le lot 59c, trop petite au téléphone), 520 px au plus, et au
 * moins 30 % de l'écran laissé à la page qui défile hors de la carte (lot 59c, tour 2 : petit téléphone) ; 280 px au
 * moins. À juger sur l'APK.
 */
export const mapHeight = (screenHeight: number) =>
  Math.round(Math.max(280, Math.min(520, screenHeight * 0.55, screenHeight * 0.7 - MAP_CHROME)));

/** Propriétés communes de la carte (téléphone et navigateur). */
export type ExplorerMapProps = {
  pins: MapPin[];
  /** Position de l'appareil (point bleu), seulement si elle est activée. */
  me?: LatLng | null;
  selectedId?: string | null;
  onSelect: (pin: MapPin) => void;
  /** Pastille de lieux confondus (un circuit, plusieurs dates) : la liste de ses épingles. */
  onSelectGroup?: (pins: MapPin[]) => void;
  /** Aperçu sous la carte (la carte de l'événement touché). */
  children?: ReactNode;
  /**
   * Faire défiler la page jusqu'à l'aperçu après un toucher (par défaut). `false` sur la fiche d'un événement : la carte
   * n'y montre que lui et le toucher ne fait rien (lot 59c, tour 2).
   */
  reveal?: boolean;
};

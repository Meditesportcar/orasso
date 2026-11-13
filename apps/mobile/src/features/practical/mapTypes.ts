// Propriétés communes de la carte de « Pratique » (téléphone et navigateur), lot R8q ; petit lot de fin F : la carte suit la zone
// (elle dit sa vue à la fin de chaque geste), regroupe ses épingles et montre un voile sur ce qui n'est pas encore chargé.
import type { LatLng, MapViewport, PracticalKind, PracticalZone, ZoneCover } from "@orasso/shared";

/** Un lieu sur la carte : seulement ce que l'écran en montre (sorte, nom, position). */
export type PracticalPin = { id: string; kind: PracticalKind; title: string; lat: number; lng: number };

/** Un ordre à la caméra (le numéro change à chaque ordre) : aller à une vue, ou cadrer des lieux. */
export type MapCommand = { seq: number } & ({ view: MapViewport } | { fit: LatLng[] });

export type PracticalMapProps = {
  /** Les lieux à montrer (sorte et texte déjà filtrés) : la carte garde ceux de sa vue et les regroupe. */
  pins: PracticalPin[];
  /** D'où l'on part : mon point (position ou ville), l'épingle de l'événement, ou la ville cherchée. */
  origin: { kind: "me" | "outing" | "searched"; at: LatLng } | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Une pastille de lieux à la même adresse (ou au zoom maximal) : leurs identifiants. */
  onGroup: (ids: string[]) => void;
  /** La vue de départ (8 km autour de l'origine). */
  initial: MapViewport;
  command: MapCommand | null;
  /** Ce qui est déjà chargé : le reste est couvert d'un voile léger. */
  cover: readonly ZoneCover[];
  /** Fin d'un geste, et première mise en page : la zone regardée. */
  onView: (zone: PracticalZone, zoom: number) => void;
  /** Hauteur de la carte (px). Absent : la carte remplit son cadre (le site, en deux colonnes). */
  height?: number;
};

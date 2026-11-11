// Propriétés communes de la carte de « Pratique » (téléphone et navigateur), lot R8q.
import type { LatLng, PracticalKind } from "@orasso/shared";

/** Un lieu sur la carte : seulement ce que l'écran en montre (sorte, nom, position). */
export type PracticalPin = { id: string; kind: PracticalKind; title: string; lat: number; lng: number };

export type PracticalMapProps = {
  pins: PracticalPin[];
  /** D'où l'on part : mon point (position ou ville) ou l'épingle de l'événement (sortie). */
  origin: { kind: "me" | "outing"; at: LatLng } | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Hauteur de la carte (px). */
  height: number;
};

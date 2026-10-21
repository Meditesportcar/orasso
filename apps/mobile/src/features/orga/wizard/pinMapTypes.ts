// Carte à épingle de l'assistant (lot 53) : ce que reçoivent `PinMap.tsx` (téléphone) et `PinMap.web.tsx` (navigateur).

/** Centre par défaut quand aucune adresse n'est encore placée (Perpignan). */
export const DEFAULT_PIN = { lat: 42.6887, lng: 2.8948 } as const;

export type PinMapProps = {
  lat: number | null;
  lng: number | null;
  /** Nouvelle position de l'épingle (glissée, ou carte touchée / déplacée sous l'épingle). */
  onMove: (lat: number, lng: number) => void;
  label: string;
};

/** Ce que la carte native dit d'un mouvement (`onRegionWillChange` / `onRegionDidChange` de MapLibre). */
export type RegionChange = { center?: readonly number[] | null; userInteraction?: boolean | null };

/**
 * Position retenue à la fin d'un mouvement de la carte (relecture du lot 53) : seulement après un geste de
 * l'utilisateur (`userInteraction` au début ou à la fin du mouvement) ; l'ouverture sur le centre par défaut et les
 * déplacements programmés (adresse trouvée) ne posent jamais de position.
 */
export function pinFromRegion(change: RegionChange | null | undefined, gestureStarted: boolean) {
  const center = change?.center;
  if (!center || center.length < 2 || !(gestureStarted || change?.userInteraction)) return null;
  const [lng, lat] = center as [number, number];
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

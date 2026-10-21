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

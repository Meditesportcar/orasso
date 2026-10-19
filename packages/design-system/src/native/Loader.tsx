// L'ancien indicateur de chargement du kit (lot 04 : la voiture qui se gare en boucle). Lot 39 (DA v2, écart 5) :
// remplacé par OLoader, le O vivant (olive/OLoader.tsx) ; `Loader` en reste un alias déprécié, retiré au lot 58.
// La voiture du logo (AnimatedCar) et les images clés vivent désormais dans olive/brandCar.tsx.

import { OLoader, type OLoaderProps } from "./olive/OLoader";

export { AnimatedCar, curveOf, keyframeSteps } from "./olive/brandCar";

/** @deprecated Lot 39 : utiliser `OLoader` (le O vivant). Alias retiré au lot 58. */
export const Loader = OLoader;
/** @deprecated Lot 39 : utiliser `OLoaderProps`. Retiré au lot 58. */
export type LoaderProps = OLoaderProps;

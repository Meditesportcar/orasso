// La grille ne charge que les images proches de l'écran : une seule écoute du défilement pour toute la grille (un « tic » qui
// avance au plus toutes les 150 ms), et chaque vignette se remesure à chaque tic. Hors d'une page qui défile, tout est « proche ».
import { isNearViewport } from "@orasso/shared";
import { type RefObject, useEffect, useState } from "react";
import { Dimensions, type View } from "react-native";

import { useScrollAssist } from "@/ui/ScrollAssist";

/** Le tic de défilement de la page (0 sans page qui défile). */
export function useScrollTick(): number {
  const assist = useScrollAssist();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!assist) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = assist.watchScroll(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        setTick((n) => n + 1);
      }, 150);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [assist]);
  return tick;
}

/** La vignette est-elle à moins d'un écran de la fenêtre ? Mesurée au montage et à chaque tic. */
export function useNearScreen(box: RefObject<View | null>, tick: number): boolean {
  const assist = useScrollAssist();
  const [near, setNear] = useState(!assist);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` relance la mesure à chaque défilement.
  useEffect(() => {
    if (!assist) return;
    box.current?.measureInWindow((_x, y, _w, h) => {
      // Une vignette devenue proche reste chargée : pas de relecture des photos à chaque aller-retour.
      if (isNearViewport(y, h, Dimensions.get("window").height)) setNear(true);
    });
  }, [assist, box, tick]);
  return near;
}

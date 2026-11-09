// Pages qui ont quitté la barre d'onglets (Sorties, Garage : lot R7a1) et que plusieurs écrans ouvrent par-dessus la barre.
// Une seule exemplaire dans la pile : Sorties → événement → « Ma candidature » → Sorties revient à la page déjà ouverte
// (`dismissTo`) au lieu d'en empiler une seconde ; sinon elle s'ouvre (`push`). `dismissTo` seul ne le fait pas (hors de
// la pile, il n'ouvre rien : constaté sur le web compilé), d'où ce registre des pages montées.
import { useEffect } from "react";

const mounted = new Map<string, number>();

/** À poser dans la page : elle est dans la pile tant qu'elle est montée. */
export function useStandalonePage(path: string) {
  useEffect(() => {
    mounted.set(path, (mounted.get(path) ?? 0) + 1);
    return () => {
      const left = (mounted.get(path) ?? 1) - 1;
      if (left > 0) mounted.set(path, left);
      else mounted.delete(path);
    };
  }, [path]);
}

export function isStandaloneOpen(path: string): boolean {
  return mounted.has(path);
}

type Pusher = { push: (href: never) => void; dismissTo: (href: never) => void };

/** Ouvre la page par-dessus la barre, ou revient à celle qui est déjà dans la pile. */
export function openStandalone(router: Pusher, path: string) {
  const base = path.split("?")[0] ?? path;
  if (isStandaloneOpen(base)) router.dismissTo(path as never);
  else router.push(path as never);
}

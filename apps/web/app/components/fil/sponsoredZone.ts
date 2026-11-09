// La zone utile du site pour compter une carte « Sponsorisé » (lot R7k2, tour 4) : sous la barre du haut (`.app__bar`,
// collée en haut) et au-dessus de la barre d'onglets (`.app__tabs`, fixée en bas), pas la fenêtre entière.
// Fonctions pures (mesures passées en paramètres) pour être testées sans navigateur.
import { countsAsSeen } from "@orasso/shared";

export type Zone = { top: number; bottom: number };

/** La zone utile : du bas de la barre du haut au haut de la barre d'onglets (absentes : le bord de la fenêtre). */
export function usefulZone(barBottom: number | null, tabsTop: number | null, viewportHeight: number): Zone {
  const top = Math.min(Math.max(barBottom ?? 0, 0), viewportHeight);
  const bottom = Math.max(Math.min(tabsTop ?? viewportHeight, viewportHeight), top);
  return { top, bottom };
}

/** Le `rootMargin` de l'observateur qui réduit la fenêtre à la zone utile (valeurs négatives en pixels). */
export function rootMarginFor(zone: Zone, viewportHeight: number): string {
  return `-${Math.round(zone.top)}px 0px -${Math.round(Math.max(viewportHeight - zone.bottom, 0))}px 0px`;
}

/** Mesure la zone utile dans le document en cours. */
export function readZone(doc: Document, win: { innerHeight: number }): Zone {
  const bar = doc.querySelector(".app__bar")?.getBoundingClientRect();
  const tabs = doc.querySelector(".app__tabs")?.getBoundingClientRect();
  return usefulZone(bar ? bar.bottom : null, tabs ? tabs.top : null, win.innerHeight);
}

/** La carte est vue (50 %, ou 30 % d'une carte plus haute que la zone) dans la zone donnée. */
export const seenIn = (top: number, height: number, zone: Zone) => countsAsSeen(top, height, zone.top, zone.bottom);

/**
 * Le relais du défilement pour une carte que l'observateur ne peut pas confirmer (carte plus haute que la zone : la
 * part exigée peut tomber entre deux seuils). `touch()` : la carte touche la zone sans être comptée, la mesure démarre ;
 * chaque `tick()` (une par image) mesure : vue = `onSeen` ; sortie de la zone = la mesure s'arrête (l'observateur
 * rappellera à la prochaine entrée).
 */
export function createScrollRelay(opts: {
  measure: () => { top: number; height: number; zone: Zone };
  onSeen: () => void;
  onActive: (active: boolean) => void;
}) {
  let active = false;
  const setActive = (v: boolean) => {
    if (active === v) return;
    active = v;
    opts.onActive(v);
  };
  return {
    touch() {
      setActive(true);
    },
    tick() {
      if (!active) return;
      const { top, height, zone } = opts.measure();
      if (seenIn(top, height, zone)) {
        setActive(false);
        opts.onSeen();
        return;
      }
      if (top + height <= zone.top || top >= zone.bottom) setActive(false);
    },
    stop() {
      setActive(false);
    },
    isActive: () => active,
  };
}

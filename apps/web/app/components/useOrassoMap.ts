// Carte Orasso du site (lot 44) : MapLibre chargé dans le navigateur seulement (le serveur ne rend que le cadre), au
// style du thème courant (Béton, Sable ou Automatique), suivi en direct ; glyphes Archivo étroit servis par le site
// lui-même (`public/map-fonts/`) ; repli raster si OpenFreeMap ne répond pas (dans `createOrassoMap`).
// `VITE_MAP_TILES_URL` remplace l'adresse des tuiles (recette du repli : une adresse fausse).
import { createOrassoMap, type OrassoMap, useTheme } from "@orasso/design-system/web";
// MapLibre 6 cherche son worker par une adresse calculée à l'exécution (`./maplibre-gl-worker.mjs` à côté de son
// propre fichier) : la compilation du site ne le voit pas et ne le copie pas, la carte en ligne restait vide
// (« Worker failed to load », retour de Damien du 27/10). L'adresse du fichier copié lui est donnée ici.
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { type RefObject, useEffect, useRef, useState } from "react";

type MapLibre = typeof import("maplibre-gl");

export type MapReady = (maplibre: MapLibre, handle: OrassoMap) => (() => void) | undefined;

/**
 * Crée la carte dans `container` quand le composant est monté ; `onReady` pose les marqueurs (et rend de quoi les
 * retirer). La carte est recréée quand `data` change (valeur stable : tableau mémorisé, texte). Renvoie `true` si MapLibre n'a pas pu se charger.
 */
export function useOrassoMap(
  container: RefObject<HTMLElement | null>,
  view: { center: [number, number]; zoom: number },
  onReady: MapReady,
  data: unknown,
): boolean {
  const { theme } = useTheme();
  const [failed, setFailed] = useState(false);
  const handle = useRef<OrassoMap | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // biome-ignore lint/correctness/useExhaustiveDependencies: la carte se recrée seulement quand les données changent.
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        if (cancelled || !container.current) return;
        if (maplibre.getWorkerUrl() !== maplibreWorkerUrl) maplibre.setWorkerUrl(maplibreWorkerUrl);
        const created = createOrassoMap(maplibre, container.current, {
          theme: themeRef.current,
          glyphsOrigin: window.location.origin,
          tilesUrl: (import.meta.env.VITE_MAP_TILES_URL as string | undefined) || null,
          center: view.center,
          zoom: view.zoom,
        });
        handle.current = created;
        cleanup = onReady(maplibre, created);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      cleanup?.();
      handle.current?.map.remove();
      handle.current = null;
    };
  }, [data]);

  // La carte suit le thème sans être recréée.
  useEffect(() => {
    handle.current?.setTheme(theme);
  }, [theme]);

  return failed;
}

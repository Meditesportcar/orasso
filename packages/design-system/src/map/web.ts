// Carte Orasso dans un navigateur (lot 44) : une carte MapLibre GL JS au style du thème, sans rotation ni inclinaison,
// les hachures de la mer, le repli raster quand OpenFreeMap ne répond pas, et les marqueurs v2 en éléments DOM
// (étiquette inclinée datée, pastille de groupe, plaque de pro, point « toi »). Utilisée par le site (`EventMap`,
// `EventsMap`, `ProsMap`) et par l'appli dans un navigateur (`ExplorerMap.web.tsx`). MapLibre est passé en paramètre
// (chargé à la demande par l'appelant, jamais au rendu serveur) : ce module n'en dépend pas à l'exécution.
import type { Map as MapLibreMap, Marker } from "maplibre-gl";

import { type ThemeId, tokens } from "../tokens";
import { hatchImage } from "./hatch";
import { clusterLabel, clusterPins, GROUP_MAX_ZOOM, isStacked, type MapPoint } from "./pins";
import { chooseMapStyle, probedVectorTiles, probeVectorTiles, shouldFallBack } from "./probe";
import { MAP_SOURCE_ID, type MapStyleOptions, mapFallbackRaster, mapStyle } from "./style";

type MapLibre = typeof import("maplibre-gl");

export type OrassoMapOptions = MapStyleOptions & {
  theme: ThemeId;
  center?: [number, number];
  zoom?: number;
};

export type OrassoMap = {
  map: MapLibreMap;
  /** Change le thème (la carte suit le thème du site ou de l'appli, en direct). */
  setTheme: (theme: ThemeId) => void;
  /** Vrai quand la carte est passée sur le repli raster. */
  fellBack: () => boolean;
};

/** Crée la carte dans `container`. Le crédit des tuiles est affiché par le contrôle d'attribution (replié). */
export function createOrassoMap(maplibre: MapLibre, container: HTMLElement, options: OrassoMapOptions): OrassoMap {
  let theme = options.theme;
  // Déjà su dans la session que les tuiles vectorielles ne répondent pas : raster d'emblée.
  let fell = probedVectorTiles(options.tilesUrl) === false;
  let tileFailures = 0;
  const map = new maplibre.Map({
    container,
    style: chooseMapStyle(theme, options, !fell),
    center: options.center ?? [2.35, 46.6],
    zoom: options.zoom ?? 4.6,
    // Pas de rotation ni d'inclinaison (prototype `s-map`) : on se déplace et on zoome, c'est tout.
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxPitch: 0,
    attributionControl: { compact: true },
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  // Le nom du style chargé (`orasso-beton`, `orasso-sable-raster`…) sur le cadre : lu par la recette.
  map.on("styledata", () => {
    container.dataset.mapStyle = map.getStyle()?.name ?? "";
  });
  // Les hachures sont propres au thème (`hatch-beton`, `hatch-sable`) : ajoutées dès que le style les demande.
  map.setMissingStyleImageResolver((id) => {
    if (!id.startsWith("hatch-") || map.hasImage(id)) return;
    map.addImage(id, hatchImage(id === "hatch-sable" ? "sable" : "beton"), { pixelRatio: 1 });
  });
  const fallBack = (why: string) => {
    if (fell) return;
    fell = true;
    console.warn(`[carte] tuiles vectorielles indisponibles (${why}) : repli raster OSM`);
    map.setStyle(mapFallbackRaster(theme), { diff: false });
  };
  // Repli décidé d'abord par la demande du TileJSON (délai 3 s, gardée pour la session).
  if (!fell) void probeVectorTiles(options.tilesUrl).then((ok) => ok || fallBack("TileJSON sans réponse"));
  // Puis, en cours de route : erreur de la source elle-même, ou plusieurs tuiles d'affilée ; une tuile isolée (4G
  // faible) ne fait pas basculer toute la visite.
  map.on("data", (e) => {
    const d = e as unknown as { sourceId?: string; tile?: unknown };
    if (d.sourceId === MAP_SOURCE_ID && d.tile) tileFailures = 0;
  });
  map.on("error", (e: { sourceId?: string; tile?: unknown; error?: { message?: string } }) => {
    if (fell || e.sourceId !== MAP_SOURCE_ID) return;
    if (e.tile) tileFailures += 1;
    if (shouldFallBack(e, tileFailures)) fallBack(e.error?.message ?? "erreur");
  });
  return {
    map,
    setTheme(next) {
      if (next === theme) return;
      theme = next;
      map.setStyle(fell ? mapFallbackRaster(next) : mapStyle(next, options), { diff: false });
    },
    fellBack: () => fell,
  };
}

/** Un marqueur : un événement (étiquette datée), un pro (plaque), ou toi (point). */
export type WebPin = MapPoint & {
  kind: "event" | "pro" | "me";
  /** Texte de l'étiquette : « SAM 24 » (événement), le nom (pro). */
  label: string;
  /** Nom complet, lu par les lecteurs d'écran. */
  title: string;
};

export type PinOptions = {
  /** Toucher un marqueur (pas un groupe : un groupe zoome). */
  onSelect?: (pin: WebPin) => void;
  /** Bulle facultative ouverte au toucher (le site y met le lien vers la page). */
  popupFor?: (pin: WebPin) => HTMLElement | null;
  /**
   * Toucher une pastille de lieux confondus (ou au zoom maximal) : la liste de ses lieux. Absent : une bulle avec les
   * `popupFor` de chacun.
   */
  onGroup?: (pins: WebPin[]) => void;
};

function eventElement(pin: WebPin, hot: boolean): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `o-mappin o-mappin--event${hot ? " is-hot" : ""}`;
  el.dataset.testid = "map-marker";
  el.setAttribute("aria-label", pin.title);
  const tag = document.createElement("span");
  tag.className = "o-mappin__tag";
  tag.textContent = pin.label;
  const tip = document.createElement("span");
  tip.className = "o-mappin__tip";
  el.append(tag, tip);
  return el;
}

function proElement(pin: WebPin): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "o-mappin o-mappin--pro";
  el.dataset.testid = "map-marker";
  el.setAttribute("aria-label", pin.title);
  el.textContent = pin.label;
  return el;
}

function meElement(): HTMLElement {
  const el = document.createElement("span");
  el.className = "o-mappin o-mappin--me";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "Ta position");
  return el;
}

function clusterElement(count: number, kind?: "event" | "pro"): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.dataset.testid = "map-cluster";
  // Lot R2 (maquette R2.8) : une pastille d'événements (ou de pros) le dit : « 2 ÉVÉNEMENTS ».
  if (kind) {
    const label = clusterLabel(count, kind);
    el.className = "o-mappin o-mappin--group";
    el.setAttribute("aria-label", `${label.toLowerCase()} : zoomer`);
    const tag = document.createElement("span");
    tag.className = "o-mappin__tag";
    tag.textContent = label;
    const tip = document.createElement("span");
    tip.className = "o-mappin__tip";
    el.append(tag, tip);
    return el;
  }
  el.className = "o-mappin o-mappin--cluster";
  el.setAttribute("aria-label", `${count} lieux : zoomer`);
  el.textContent = String(count);
  return el;
}

/**
 * Pose les marqueurs et les regroupe selon le zoom (pastille avec le nombre ; la toucher rapproche). Renvoie de quoi les
 * remplacer (`update`) et les retirer (`remove`).
 */
export function placePins(maplibre: MapLibre, map: MapLibreMap, initial: WebPin[], options: PinOptions = {}) {
  let pins = initial;
  let selected: string | null = null;
  let markers: Marker[] = [];
  let lastZoom = -1;

  const draw = () => {
    for (const m of markers) m.remove();
    markers = [];
    const zoom = Math.round(map.getZoom());
    lastZoom = zoom;
    const me = pins.filter((p) => p.kind === "me");
    const others = pins.filter((p) => p.kind !== "me");
    for (const group of clusterPins(others, zoom)) {
      const first = group.items[0] as WebPin;
      let el: HTMLElement;
      let groupPopup: import("maplibre-gl").Popup | null = null;
      if (group.items.length > 1) {
        const items = group.items as WebPin[];
        const kind = items.every((p) => p.kind === "event")
          ? "event"
          : items.every((p) => p.kind === "pro")
            ? "pro"
            : undefined;
        el = clusterElement(group.items.length, kind);
        const stacked = isStacked(group, map.getZoom());
        el.addEventListener("click", () => {
          if (!stacked) {
            map.easeTo({ center: [group.lng, group.lat], zoom: Math.min(map.getZoom() + 2, GROUP_MAX_ZOOM) });
          } else if (options.onGroup) options.onGroup(items);
        });
        if (stacked && !options.onGroup && options.popupFor) {
          const list = document.createElement("div");
          list.className = "o-mappin-list";
          list.dataset.testid = "map-group-list";
          for (const item of items) {
            const entry = options.popupFor(item);
            if (entry) list.append(entry);
          }
          groupPopup = new maplibre.Popup({ offset: 18, closeButton: false }).setDOMContent(list);
        }
      } else {
        el = first.kind === "pro" ? proElement(first) : eventElement(first, first.id === selected);
        el.addEventListener("click", () => {
          selected = first.id;
          options.onSelect?.(first);
          for (const node of el.parentElement?.querySelectorAll(".o-mappin--event.is-hot") ?? []) {
            node.classList.remove("is-hot");
          }
          if (first.kind === "event") el.classList.add("is-hot");
        });
      }
      const marker = new maplibre.Marker({ element: el, anchor: "bottom" }).setLngLat([group.lng, group.lat]);
      const popup = group.items.length === 1 ? options.popupFor?.(first) : null;
      if (groupPopup) marker.setPopup(groupPopup);
      if (popup) marker.setPopup(new maplibre.Popup({ offset: 18, closeButton: false }).setDOMContent(popup));
      markers.push(marker.addTo(map));
    }
    for (const p of me) {
      markers.push(new maplibre.Marker({ element: meElement() }).setLngLat([p.lng, p.lat]).addTo(map));
    }
  };

  const onZoom = () => {
    if (Math.round(map.getZoom()) !== lastZoom) draw();
  };
  map.on("zoomend", onZoom);
  draw();
  return {
    update(next: WebPin[]) {
      pins = next;
      draw();
    },
    remove() {
      map.off("zoomend", onZoom);
      for (const m of markers) m.remove();
      markers = [];
    },
  };
}

/**
 * Variables CSS des marqueurs (`map.css`) pour une page qui n'a pas `tokens.css` (l'appli dans un navigateur) : à poser
 * sur le cadre de la carte.
 */
export function mapCssVars(theme: ThemeId): Record<string, string> {
  const c = tokens.color[theme];
  return {
    "--map-land": c.mapLand,
    "--map-road": c.mapRoad,
    "--accent": c.accent,
    "--accent-ink": c.accentInk,
    "--night": c.night,
    "--night-ink": c.nightInk,
    "--status-waitlist": c.statusWaitlist,
    "--shadow-card": tokens.shadow[theme].shadowCard,
    "--radius-sm": `${tokens.radius.radiusSm}px`,
    "--radius-pill": `${tokens.radius.radiusPill}px`,
    "--font-narrow": "Archivo-Narrow-Bold, Archivo, sans-serif",
    "--stretch-narrow": "normal",
    "--type-label-size": `${tokens.type.label.fontSize}px`,
    "--type-caption-size": `${tokens.type.caption.fontSize}px`,
    "--skew": tokens.geometry.skew,
  };
}

/** Cadre une liste de points : un seul → zoom de ville ; plusieurs → le cadre qui les contient. */
export function fitPoints(maplibre: MapLibre, map: MapLibreMap, points: readonly MapPoint[]): void {
  const first = points[0];
  if (!first) return;
  if (points.length === 1) {
    map.jumpTo({ center: [first.lng, first.lat], zoom: 10 });
    return;
  }
  const bounds = new maplibre.LngLatBounds();
  for (const p of points) bounds.extend([p.lng, p.lat]);
  map.fitBounds(bounds, { padding: 48, maxZoom: 11, duration: 0 });
}

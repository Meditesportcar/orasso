// Petit lot de fin F : le cœur de « Pratique » qui suit la zone (option C « Hybride »), le même sur le site et dans l'appli, sans
// dépendance : la lecture, la visibilité et l'horloge sont injectées. Il garde EN MÉMOIRE de l'écran (jamais écrit) les lieux reçus et ce
// qui est déjà chargé (disques d'ouverture, carrés des zones demandées). Un geste sur la carte ne lit rien : il met à jour la vue ;
// `searchHere` (l'appui sur « Rechercher dans cette zone ») est la seule lecture, et la zone demandée est la zone regardée élargie d'une
// demi-zone. Un chargement en cours côté API (`loading`) est relu à intervalles espacés et bornés (`readCycle`), puis « Réessayer ».
// Tour 2 : le contrôleur est rattaché à la session de l'écran (`reset`, `attach`/`dispose` réentrants), une réponse complète remplace son
// emprise, une coupe est toujours signalée, une réponse tardive qui ne concerne plus la vue ne bloque rien.

import { distanceKm } from "../geo";
import { PRACTICAL_MAX, PRACTICAL_RADIUS_KM, type PracticalData, type PracticalPlace } from "./practical";
import {
  coverContains,
  PRACTICAL_STORE_MAX,
  type PracticalZone,
  replaceInStore,
  viewCovered,
  type ZoneCover,
  zoneCenter,
  zoneContains,
  zoneForRequest,
  zoneTooBig,
} from "./practicalZone";
import { createReadCycle } from "./readCycle";

export type ZoneState = {
  places: ReadonlyMap<string, PracticalPlace>;
  cover: readonly ZoneCover[];
  /** La zone regardée sur la carte (fin du dernier geste). */
  view: PracticalZone | null;
  /** Une lecture est en vol, ou une relecture de la même zone est attendue (« Recherche… », le bouton est occupé). */
  loading: boolean;
  /** La zone demandée par la dernière recherche (carré de 0,1°) : le bouton redevient actif quand la vue en sort. */
  asked: PracticalZone | null;
  /** « Réessayer » : la lecture a échoué, ou ses relectures sont épuisées. */
  failed: boolean;
  /** Le réseau n'a pas répondu (hors ligne) : « Hors ligne : voici ce que ton téléphone a gardé. » */
  offline: boolean;
  /** L'API a refusé la zone regardée (4xx, hors de France par exemple) : jamais relue, aucun bouton tant que la vue ne change pas. */
  refused: boolean;
  /** La zone resserrée sur la vue est elle aussi revenue coupée (trop de lieux) : aucun bouton, « Trop de lieux ici : zoome davantage. ». */
  tooDense: boolean;
};

export type ZoneDeps = {
  /** Lit une zone ; `cursor` : la page suivante de la même zone (rendue par l'API quand la réponse est coupée). */
  read: (zone: PracticalZone, cursor?: string) => Promise<PracticalData>;
  /** L'écran est-il visible (focus, appli au premier plan) ? */
  visible: () => boolean;
  /** Le statut HTTP d'une erreur de lecture (0 : réseau), `null` pour une exception qui n'est pas une réponse du serveur. */
  statusOf: (error: unknown) => number | null;
  /** Une exception inconnue : à signaler (Sentry). */
  onUnknown?: (error: unknown) => void;
  now?: () => number;
};

/** Faut-il proposer « Rechercher dans cette zone » ? La zone regardée n'est pas toute chargée, elle n'est pas trop grande, l'API ne l'a pas refusée. */
export const zoneNeedsSearch = (
  s: Pick<ZoneState, "view" | "cover"> & { refused?: boolean; tooDense?: boolean },
): boolean => s.view !== null && !s.refused && !s.tooDense && !zoneTooBig(s.view) && !viewCovered(s.cover, s.view);

/** « Zoome sur un secteur pour voir ses lieux. » : la zone regardée dépasse 60 km. */
export const zoneIsTooWide = (s: Pick<ZoneState, "view">): boolean => s.view !== null && zoneTooBig(s.view);

const zoneEquals = (a: PracticalZone, b: PracticalZone) =>
  a.south === b.south && a.west === b.west && a.north === b.north && a.east === b.east;
const insideZone = (outer: PracticalZone | null, view: PracticalZone) =>
  outer !== null &&
  [view.south, view.north].every((lat) => [view.west, view.east].every((lng) => zoneContains(outer, { lat, lng })));

/**
 * Ce qu'une réponse couvre : sans coupe, toute son emprise (`whole`) ; coupée, seulement le disque dont tous les lieux sont servis
 * (`coveredKm` envoyé par l'API ; à défaut, ancien serveur : le rayon du plus lointain lieu reçu quand 200 sont arrivés).
 */
/** Une réponse est-elle coupée ? Zone (sans origine) : `truncated` seul (une dernière page de 200 lieux exactement est complète) ; ouverture : aussi 200 lieux reçus. */
const isCut = (data: PracticalData): boolean =>
  data.truncated === true || (data.origin !== null && data.places.length >= PRACTICAL_MAX);

function coveredBy(data: PracticalData, centre: { lat: number; lng: number }, whole: ZoneCover): ZoneCover[] {
  const cut = isCut(data);
  if (!cut) return [whole];
  // Réponse coupée et répartie par case : toute la zone est chargée, sauf les cases dont tous les lieux n'ont pas été servis.
  if (whole.t === "rect" && data.partialCells) {
    return [{ ...whole, except: new Set(data.partialCells.map(([i, j]) => `${i},${j}`)) }];
  }
  const reach = data.coveredKm ?? Math.max(0, ...data.places.map((p) => distanceKm(centre, p))) * 0.98;
  return reach > 0 ? [{ t: "disk", ...centre, km: Math.min(reach, whole.t === "disk" ? whole.km : reach) }] : [];
}

export function createPracticalZone(deps: ZoneDeps) {
  const blank = (view: PracticalZone | null): ZoneState => ({
    places: new Map(),
    cover: [],
    view,
    asked: null,
    loading: false,
    failed: false,
    offline: false,
    refused: false,
    tooDense: false,
  });
  let state: ZoneState = blank(null);
  const listeners = new Set<() => void>();
  const seen = new WeakSet<object>();
  let asked: PracticalZone | null = null;
  /** La zone demandée est la version resserrée (déjà une zone coupée) : si elle revient coupée, il y a trop de lieux pour ce zoom. */
  let askedTight = false;
  /** Les zones demandées dont la réponse a été coupée : une recherche dedans ne s'élargit plus (la zone se resserre sur la vue). */
  let dense: PracticalZone[] = [];
  /** La suite de la dernière zone coupée : sa page suivante (jamais lue seule, seulement à l'appui sur le bouton). */
  let pageState: { zone: PracticalZone; token: string } | null = null;
  /** Le curseur de la lecture en cours ou du dernier échec (« Réessayer » relit la même page). */
  let cursorUsed: string | undefined;
  /** Les lieux reçus par les pages de la série en cours (page 0 et suivantes) : une case complétée remplace les ANCIENNES lectures, jamais ceux-ci. */
  let seriesIds = new Set<string>();
  let resumeTimer: ReturnType<typeof setTimeout> | null = null;
  const clearResume = () => {
    if (resumeTimer !== null) clearTimeout(resumeTimer);
    resumeTimer = null;
  };
  let reading = false;
  let lastFailureAt = 0;
  let alive = true;
  let generation = 0;

  const set = (patch: Partial<ZoneState>) => {
    state = { ...state, ...patch };
    for (const l of listeners) l();
  };

  const cycle = createReadCycle({
    run: () => void load(),
    visible: deps.visible,
    now: deps.now,
  });

  /** Garde la mémoire et la couverture ensemble : au-delà du plafond, tout le reste est évincé d'un coup (jamais une couverture sans ses lieux). */
  const store = (
    gone: (p: PracticalPlace) => boolean,
    incoming: readonly PracticalPlace[],
    covered: readonly ZoneCover[],
    /** Une page suivante d'une zone : ses lieux déjà en mémoire sont gardés, l'éviction vise d'abord les autres zones. */
    keepZone?: PracticalZone,
  ): Pick<ZoneState, "places" | "cover"> & { restart?: true } => {
    const places = replaceInStore(state.places, gone, incoming);
    const remaining = [...state.places.values()].filter((p) => !gone(p));
    const known = new Set(remaining.map((p) => p.id));
    const total = remaining.length + incoming.filter((p) => !known.has(p.id)).length;
    if (total > PRACTICAL_STORE_MAX) {
      if (keepZone) {
        // Les lieux de la zone (pages précédentes comprises) restent ; les autres zones sortent, avec leur couverture.
        const inZone = remaining.filter((p) => zoneContains(keepZone, p));
        const have = new Set(inZone.map((p) => p.id));
        const size = inZone.length + incoming.filter((p) => !have.has(p.id)).length;
        if (size <= PRACTICAL_STORE_MAX) {
          const merged = replaceInStore(new Map(inZone.map((p) => [p.id, p])), () => false, incoming);
          const sameZone = state.cover.filter((c) => c.t === "rect" && zoneEquals(c.zone, keepZone));
          return { places: merged, cover: [...sameZone, ...covered] };
        }
        // Impossible : rien n'est déclaré couvert, on repart de la première page.
        return { places: replaceInStore(new Map(), () => true, incoming), cover: [], restart: true };
      }
      // Le plafond est dépassé : des lieux sortiraient. On ne garde que ce que cette réponse apporte et sa couverture, tout le reste (lieux
      // et couverture) est évincé ensemble : jamais une zone « chargée » dont les lieux manquent.
      return { places: replaceInStore(new Map(), () => true, incoming), cover: [...covered] };
    }
    return { places, cover: [...state.cover, ...covered] };
  };

  async function load(): Promise<void> {
    const zone = asked;
    if (!zone || reading || !alive) return;
    clearResume();
    const cursor = cursorUsed;
    reading = true;
    const gen = generation;
    const token = cycle.begin();
    set({ loading: true });
    try {
      const data = await deps.read(zone, cursor);
      if (gen !== generation) return;
      reading = false;
      if (!alive || !cycle.current(token)) return;
      const view = state.view;
      // « Ailleurs » : la recherche a été abandonnée (`asked` n'est plus cette zone) ou la vue est sortie de la zone demandée.
      const away = asked !== zone || (view !== null && !insideZone(zone, view));
      if (!data.partial && !data.loading) {
        // Lecture complète : elle REMPLACE les lieux de son emprise (une station vue seule puis fusionnée n'existe qu'une fois) ; la zone
        // demandée est chargée, sauf si la réponse est coupée (plus de 200 lieux, ou plus de 12 départements) : seul le disque couvert l'est.
        const cut = isCut(data);
        const covered = coveredBy(data, zoneCenter(zone), { t: "rect", zone });
        if (cut) dense = [...dense, zone];
        // Les anciennes entrées de l'emprise GARANTIE (zone entière, ou disque et cases servis si la réponse est coupée) sont remplacées.
        // Une page suivante (curseur) AJOUTE ses lieux à ceux des pages précédentes de la même zone : rien n'est remplacé.
        if (cursor === undefined) seriesIds = new Set();
        for (const p of data.places) seriesIds.add(p.id);
        const next = store(
          (p) => coverContains(covered, p) && !seriesIds.has(p.id),
          data.places,
          covered,
          cursor !== undefined ? zone : undefined,
        );
        if (next.restart) pageState = null;
        if (!away && !next.restart) pageState = cut && data.nextCursor ? { zone, token: data.nextCursor } : null;
        // Toujours coupé après un resserrement : des cases de la vue ne seront jamais complètes à ce zoom.
        // (Seulement si la réponse concerne toujours la recherche et la vue courantes, et s'il n'y a plus de page suivante.)
        const crowded =
          !away && cut && !data.nextCursor && askedTight && view !== null && !viewCovered(next.cover, view);
        set({
          ...next,
          loading: false,
          failed: false,
          offline: false,
          refused: false,
          tooDense: crowded,
        });
        cycle.settled("complete");
        return;
      }
      // Lieux encore partiels : gardés, mais la zone n'est pas « chargée ».
      const kept = store(() => false, data.places, []);
      if (away) {
        // La vue est ailleurs : plus de relecture de cette zone, le bouton est libre pour la zone regardée.
        cycle.manual();
        asked = null;
        set({ ...kept, asked: null, loading: false, failed: false, offline: false });
        return;
      }
      cycle.settled(data.loading ? "loading" : "partialOnce");
      set(
        cycle.exhausted()
          ? { ...kept, loading: false, failed: true, offline: false }
          : { ...kept, loading: true, failed: false, offline: false },
      );
    } catch (error) {
      if (gen !== generation) return;
      reading = false;
      if (!alive || !cycle.current(token)) return;
      const status = deps.statusOf(error);
      if (status === 409 && cursor !== undefined && asked === zone) {
        // Les données ont changé entre deux pages : on repart de la première page de la même zone (les lieux lus remplacent les anciens).
        pageState = null;
        cursorUsed = undefined;
        void load();
        return;
      }
      if (status === null) deps.onUnknown?.(error);
      // Aucune relance automatique d'un échec : « Réessayer » (le calendrier de `readCycle` ne s'applique qu'aux chargements).
      cycle.settled("unknown");
      const view = state.view;
      if (asked !== zone || (view !== null && !insideZone(zone, view))) {
        // La vue est ailleurs : l'échec concernait l'ancienne zone, il n'est pas montré.
        asked = null;
        set({ asked: null, loading: false, failed: false, offline: false });
        return;
      }
      // Un refus (4xx autre que 408 et 429) n'est jamais relu : la même zone serait refusée de la même façon.
      lastFailureAt = (deps.now ?? Date.now)();
      const refused = status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429;
      set({ loading: false, failed: !refused, offline: status === 0, refused });
    }
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /**
     * Une lecture d'ouverture (ville, position, sortie) : ses lieux sont gardés ; une lecture complète couvre ses 30 km et REMPLACE les lieux
     * de ce disque ; une lecture coupée (200 lieux) ne couvre que le rayon dont tous les lieux sont servis.
     */
    ingest(data: PracticalData) {
      if (!alive || seen.has(data)) return;
      seen.add(data);
      const o = data.origin;
      if (!o || data.partial) {
        set(store(() => false, data.places, []));
        return;
      }
      const inDisk = (p: PracticalPlace) => distanceKm(o, p) <= PRACTICAL_RADIUS_KM;
      const covered = coveredBy(data, o, { t: "disk", lat: o.lat, lng: o.lng, km: PRACTICAL_RADIUS_KM });
      const cut = isCut(data);
      const known = covered.every(
        (c) =>
          c.t === "disk" &&
          state.cover.some((k) => k.t === "disk" && k.lat === c.lat && k.lng === c.lng && k.km >= c.km),
      );
      set(store((p) => (cut ? coverContains(covered, p) : inDisk(p)), data.places, known ? [] : covered));
    },
    /** Fin d'un geste sur la carte : la zone regardée. Ne lit rien. */
    setView(view: PracticalZone) {
      const v = state.view;
      if (v && zoneEquals(v, view)) return;
      // La vue change : un refus de l'API ne vaut plus pour la nouvelle zone.
      const patch: Partial<ZoneState> = { view, refused: false, tooDense: false };
      // La vue sort de la zone demandée : une relecture attendue de l'ancienne zone est abandonnée (le bouton redevient actif pour la
      // nouvelle) et un échec ne se rejoue pas sur l'ancienne zone (« Réessayer » : un seul appui pour la zone regardée).
      if (!insideZone(asked, view) && (state.failed || state.loading)) {
        // Une lecture en vol garde son tour (sa réponse sera jugée « vue ailleurs » à son arrivée) ; sinon la relecture attendue est abandonnée.
        if (!reading) {
          generation += 1;
          cycle.manual();
        }
        asked = null;
        Object.assign(patch, { asked: null, failed: false, offline: false, ...(reading ? {} : { loading: false }) });
      }
      set(patch);
    },
    /** Appui sur « Rechercher dans cette zone » (ou ville cherchée hors du chargé). Sans effet si la zone est trop grande ou déjà chargée. */
    searchHere(): boolean {
      const v = state.view;
      if (!v || reading || !alive || state.refused || state.tooDense || zoneTooBig(v) || viewCovered(state.cover, v))
        return false;
      // Une zone déjà coupée (trop de lieux) : on ne l'élargit plus, la zone se resserre sur la vue (toujours en cases entières).
      const centre = zoneCenter(v);
      clearResume();
      if (pageState && insideZone(pageState.zone, v)) {
        // La vue touche une case incomplète de la dernière zone coupée : la page suivante de CETTE zone (rien de géographique de plus).
        asked = pageState.zone;
        cursorUsed = pageState.token;
        // (La série garde sa nature : zone large ou resserrée.)
      } else {
        pageState = null;
        cursorUsed = undefined;
        const tight = dense.some((d) => zoneContains(d, centre));
        asked = zoneForRequest(v, !tight);
        askedTight = tight;
      }
      state = { ...state, asked, refused: false, tooDense: false };
      generation += 1;
      cycle.manual();
      void load();
      return true;
    },
    /** « Réessayer » : la dernière zone demandée si la vue y est encore, sinon une NOUVELLE recherche sur la zone regardée. */
    retry(): boolean {
      if (reading) return false;
      clearResume();
      const v = state.view;
      if (!asked || (v !== null && !insideZone(asked, v))) return this.searchHere();
      generation += 1;
      cycle.manual();
      void load();
      return true;
    },
    /** Retour sur l'écran : une relecture due part (au plus tôt à 15 s de la précédente). */
    resume() {
      // Un échec réseau n'est pas une erreur inconnue : au retour (réseau, onglet, appli), la zone regardée est relue UNE fois, jamais en boucle.
      // Avant 15 s depuis l'échec, UNE relance est programmée au délai restant (un retour rapide ne perd pas la relance).
      if (alive && !reading && state.failed && deps.visible()) {
        const wait = Math.max(0, 15_000 - ((deps.now ?? Date.now)() - lastFailureAt));
        if (wait <= 0) {
          this.retry();
        } else if (resumeTimer === null) {
          resumeTimer = setTimeout(() => {
            resumeTimer = null;
            if (alive && !reading && state.failed && deps.visible()) this.retry();
          }, wait);
        }
        return;
      }
      cycle.resume();
    },
    /** Un lieu est-il dans ce qui est chargé ? */
    covers: (p: { lat: number; lng: number }) => coverContains(state.cover, p),
    /** L'écran est monté (réentrant : un montage double, comme `StrictMode`, rend le contrôleur vivant). */
    attach() {
      alive = true;
    },
    /** L'écran est démonté : plus aucune réponse n'est appliquée ; `attach` le réveille. */
    dispose() {
      clearResume();
      alive = false;
      generation += 1;
      reading = false;
      cycle.dispose();
    },
    /** Une autre session : la mémoire, la recherche et les relectures repartent à zéro, aucune réponse tardive n'est appliquée. */
    reset() {
      generation += 1;
      asked = null;
      dense = [];
      pageState = null;
      cursorUsed = undefined;
      clearResume();
      askedTight = false;
      reading = false;
      cycle.reset();
      state = blank(state.view);
      for (const l of listeners) l();
    },
  };
}
export type PracticalZoneController = ReturnType<typeof createPracticalZone>;

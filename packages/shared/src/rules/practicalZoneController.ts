// Petit lot de fin F : le cœur de « Pratique » qui suit la zone (option C « Hybride »), le même sur le site et dans l'appli, sans
// dépendance : la lecture, la visibilité et l'horloge sont injectées. Il garde EN MÉMOIRE de l'écran (jamais écrit) les lieux reçus et ce
// qui est déjà chargé (disques d'ouverture, carrés des zones demandées). Un geste sur la carte ne lit rien : il met à jour la vue ;
// `searchHere` (l'appui sur « Rechercher dans cette zone ») est la seule lecture, et la zone demandée est la zone regardée élargie d'une
// demi-zone. Un chargement en cours côté API (`loading`) est relu à intervalles espacés et bornés (`readCycle`), puis « Réessayer ».
import type { PracticalData, PracticalPlace } from "./practical";
import { PRACTICAL_RADIUS_KM } from "./practical";
import {
  coverContains,
  mergeStore,
  type PracticalZone,
  viewCovered,
  type ZoneCover,
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
  /** « Réessayer » : la lecture a échoué, ou ses relectures sont épuisées. */
  failed: boolean;
  /** Le réseau n'a pas répondu (hors ligne) : « Hors ligne : voici ce que ton téléphone a gardé. » */
  offline: boolean;
};

export type ZoneDeps = {
  read: (zone: PracticalZone) => Promise<PracticalData>;
  /** L'écran est-il visible (focus, appli au premier plan) ? */
  visible: () => boolean;
  /** Le statut HTTP d'une erreur de lecture (0 : réseau), `null` pour une exception qui n'est pas une réponse du serveur. */
  statusOf: (error: unknown) => number | null;
  /** Une exception inconnue : à signaler (Sentry). */
  onUnknown?: (error: unknown) => void;
  now?: () => number;
};

/** Faut-il proposer « Rechercher dans cette zone » ? La zone regardée n'est pas toute chargée, et elle n'est pas trop grande. */
export const zoneNeedsSearch = (s: Pick<ZoneState, "view" | "cover">): boolean =>
  s.view !== null && !zoneTooBig(s.view) && !viewCovered(s.cover, s.view);

/** « Zoome sur un secteur pour voir ses lieux. » : la zone regardée dépasse 60 km. */
export const zoneIsTooWide = (s: Pick<ZoneState, "view">): boolean => s.view !== null && zoneTooBig(s.view);

export function createPracticalZone(deps: ZoneDeps) {
  let state: ZoneState = { places: new Map(), cover: [], view: null, loading: false, failed: false, offline: false };
  const listeners = new Set<() => void>();
  const seen = new WeakSet<object>();
  let asked: PracticalZone | null = null;
  let reading = false;
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

  async function load(): Promise<void> {
    const zone = asked;
    if (!zone || reading || !alive) return;
    reading = true;
    const gen = generation;
    const token = cycle.begin();
    set({ loading: true });
    try {
      const data = await deps.read(zone);
      reading = false;
      if (!alive || gen !== generation || !cycle.current(token)) return;
      const places = mergeStore(state.places, data.places);
      if (!data.partial && !data.loading) {
        // Lecture complète : la zone demandée est chargée ; les gestes suivants dedans restent sur le téléphone.
        set({ places, cover: [...state.cover, { t: "rect", zone }], loading: false, failed: false, offline: false });
        cycle.settled("complete");
        return;
      }
      // Lieux encore partiels : ils sont gardés, mais la zone n'est pas « chargée » ; relecture espacée de la même zone, bornée.
      cycle.settled(data.loading ? "loading" : "partialOnce");
      set(
        cycle.exhausted()
          ? { places, loading: false, failed: true, offline: false }
          : { places, loading: true, failed: false, offline: false },
      );
    } catch (error) {
      reading = false;
      if (!alive || gen !== generation || !cycle.current(token)) return;
      const status = deps.statusOf(error);
      if (status === null) deps.onUnknown?.(error);
      // Aucune relance automatique d'un échec : « Réessayer » (le calendrier de `readCycle` ne s'applique qu'aux chargements).
      cycle.settled("unknown");
      set({ loading: false, failed: true, offline: status === 0 });
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
    /** Une lecture d'ouverture (ville, position, sortie) : ses lieux sont gardés ; une lecture complète couvre ses 30 km. */
    ingest(data: PracticalData) {
      if (seen.has(data)) return;
      seen.add(data);
      const places = mergeStore(state.places, data.places);
      const o = data.origin;
      const known = o && state.cover.some((c) => c.t === "disk" && c.lat === o.lat && c.lng === o.lng);
      const cover: readonly ZoneCover[] =
        !data.partial && o && !known
          ? [...state.cover, { t: "disk", lat: o.lat, lng: o.lng, km: PRACTICAL_RADIUS_KM }]
          : state.cover;
      set({ places, cover });
    },
    /** Fin d'un geste sur la carte : la zone regardée. Ne lit rien. */
    setView(view: PracticalZone) {
      const v = state.view;
      if (v && v.south === view.south && v.west === view.west && v.north === view.north && v.east === view.east) return;
      set({ view });
    },
    /** Appui sur « Rechercher dans cette zone » (ou ville cherchée hors du chargé). Sans effet si la zone est trop grande ou déjà chargée. */
    searchHere(): boolean {
      const v = state.view;
      if (!v || reading || zoneTooBig(v) || viewCovered(state.cover, v)) return false;
      asked = zoneForRequest(v);
      generation += 1;
      cycle.manual();
      void load();
      return true;
    },
    /** « Réessayer » : la dernière zone demandée, tout repart à zéro. */
    retry(): boolean {
      if (reading) return false;
      if (!asked) return this.searchHere();
      generation += 1;
      cycle.manual();
      void load();
      return true;
    },
    /** Retour sur l'écran : une relecture due part (au plus tôt à 15 s de la précédente). */
    resume() {
      cycle.resume();
    },
    /** Un lieu est-il dans ce qui est chargé ? */
    covers: (p: { lat: number; lng: number }) => coverContains(state.cover, p),
    /** Autre compte ou fermeture de l'écran : tout est oublié. */
    dispose() {
      alive = false;
      generation += 1;
      cycle.dispose();
      listeners.clear();
    },
    /** Une autre session : la mémoire et les relectures repartent à zéro. */
    reset() {
      generation += 1;
      asked = null;
      reading = false;
      cycle.reset();
      state = { places: new Map(), cover: [], view: state.view, loading: false, failed: false, offline: false };
      for (const l of listeners) l();
    },
  };
}
export type PracticalZoneController = ReturnType<typeof createPracticalZone>;

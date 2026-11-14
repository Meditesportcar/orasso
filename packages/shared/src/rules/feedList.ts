// L'écran du Fil, sans React ni réseau (lot R7e2, testé par `feedList.test.ts`) : l'état de la liste (pages au curseur,
// `reset` de l'API), les genres de carte qu'on sait dessiner, et ce qui bloque « Publier au Fil ».
import { feedScreenLabels as L } from "../labels/feedScreen.fr";
import type { FeedCard, FeedPage, FeedPostView } from "../schemas/feed";
import {
  FEED_SEEN_AT_MAX_AGE_MS,
  FEED_SEEN_BATCH_MAX,
  FEED_SEEN_QUEUE_MAX,
  type FeedSeenAction,
} from "../schemas/feedSeen";
import { MAX_PLATE_RECTS, type PlateRect } from "../schemas/vehicle";
import {
  FEED_ASPECT_RATIOS,
  FEED_CAPTION_MAX,
  FEED_PHOTO_SIDE,
  FEED_POST_PHOTOS_MAX,
  type FeedAspect,
  type FeedCardKind,
  type FeedFilter,
} from "./feed";
import { nextPlateFrame } from "./plateFrame";

// --- La liste -------------------------------------------------------------------------------------------------------

/** Ce que l'écran tient : la liste affichée d'un filtre et le curseur (opaque) de la page suivante. */
export type FeedListState = {
  filter: FeedFilter;
  items: FeedCard[];
  nextCursor: string | null;
  /** Le rail « Ça plaît en ce moment » de la première page (R8c1) ; il ne change pas pendant le parcours. */
  hot?: FeedCard<"feed_post">[];
  /** L'instant du parcours (`FeedPage.ref`) : base de la pastille « Nouvelles publications ». */
  ref?: string;
};

export const emptyFeedList = (filter: FeedFilter): FeedListState => ({ filter, items: [], nextCursor: null, hot: [] });

/** La première place d'une carte « Sponsorisé » dans la liste affichée (0 = première) : la 4e, jamais avant (D38). */
export const SPONSORED_MIN_INDEX = 3;

/**
 * Garde « jamais avant la 4e place » sur la liste **affichée** (lot R7k2, tour 2) : si des cartes sortent de la liste
 * (« Supprimer »), une carte « Sponsorisé » ne remonte pas parmi les trois premières ; elle descend à la 4e place, ou
 * disparaît quand il y a moins de trois autres cartes. Les autres cartes gardent leur ordre.
 */
export function sponsoredNotBeforeFourth(items: readonly FeedCard[]): FeedCard[] {
  if (!items.some((c, i) => i < SPONSORED_MIN_INDEX && c.kind === "sponsored")) return [...items];
  // Les trois premières places reviennent aux trois premières cartes non sponsorisées ; tout le reste suit dans son ordre
  // (une 2e carte « Sponsorisé » qui remonterait à son tour ne passe donc jamais devant non plus).
  const head: FeedCard[] = items.filter((c) => c.kind !== "sponsored").slice(0, SPONSORED_MIN_INDEX);
  if (head.length < SPONSORED_MIN_INDEX) return head;
  return [...head, ...items.filter((c) => !head.includes(c))];
}

/** Retire de la liste toutes les cartes « Sponsorisé » d'un emplacement (l'API l'a refusé : une carte, ou toutes ses reprises). */
export const withoutPlacement = (items: readonly FeedCard[], placementId: string): FeedCard[] =>
  items.filter((c) => !(c.kind === "sponsored" && c.payload.id === placementId));

/** Ajoute des cartes sans doublon (l'identifiant d'une carte est stable d'une page à l'autre). */
export function appendCards(current: readonly FeedCard[], next: readonly FeedCard[]): FeedCard[] {
  const seen = new Set(current.map((c) => c.id));
  const out = [...current];
  // Aussi à l'intérieur de la page reçue (filet : un rognage a pu faire servir deux fois la même carte dans une réponse).
  for (const c of next) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

/**
 * Applique une page lue. Première page (aucun curseur envoyé) ou `reset: true` (le contexte de la personne a changé en
 * plein parcours : le curseur envoyé est abandonné) : la liste est **remplacée**, jamais complétée. Sinon, la page
 * s'ajoute à la suite. Une page d'un autre filtre que celui affiché est ignorée (`null`). `scrollTop` : remonter en haut
 * (un `reset` en cours de parcours).
 */
export function applyFeedPage(
  state: FeedListState,
  page: Pick<FeedPage, "items" | "nextCursor" | "filter" | "reset"> & Partial<Pick<FeedPage, "hot" | "ref">>,
  sentCursor: string | null,
): { state: FeedListState; scrollTop: boolean } | null {
  if (page.filter !== state.filter) return null;
  if (!sentCursor || page.reset) {
    return {
      state: {
        filter: state.filter,
        items: appendCards([], page.items),
        nextCursor: page.nextCursor,
        hot: page.hot ? [...page.hot] : [],
        ...(page.ref ? { ref: page.ref } : {}),
      },
      scrollTop: Boolean(page.reset && sentCursor),
    };
  }
  return {
    state: {
      ...state,
      items: appendCards(state.items, page.items),
      nextCursor: page.nextCursor,
    },
    scrollTop: false,
  };
}

/**
 * Place de « Tu es à jour » : l'index de la première carte vue sans interaction (`seen: true`), ou -1 s'il n'y en a pas.
 * 0 : tout est vu, la ligne est en tête. Le serveur range les cartes vues après les autres : la frontière est unique.
 */
export function caughtUpIndex(items: readonly Pick<FeedCard, "seen">[]): number {
  return items.findIndex((c) => c.seen === true);
}

/** Une carte vue (ou ouverte, partagée) à envoyer à `POST /me/fil/seen`. */
export type SeenEntry = { id: string; action: FeedSeenAction; at?: string };

/**
 * La file des cartes vues, prête à partir : sans doublon (une carte : la plus forte action, l'heure la plus ancienne),
 * sans « Sponsorisé » (jamais retenu), 200 au plus (les plus récentes), puis `send` = les 50 premières d'un envoi, `rest` = la suite.
 */
export function seenBatch(queue: readonly SeenEntry[]): { send: SeenEntry[]; rest: SeenEntry[] } {
  const byId = new Map<string, SeenEntry>();
  for (const e of queue) {
    if (e.id.startsWith("sponsored:")) continue;
    const old = byId.get(e.id);
    if (!old) {
      byId.set(e.id, { ...e });
      continue;
    }
    if (e.action !== "view") old.action = e.action;
    if (e.at && (!old.at || e.at < old.at)) old.at = e.at;
  }
  const all = [...byId.values()].slice(-FEED_SEEN_QUEUE_MAX);
  return { send: all.slice(0, FEED_SEEN_BATCH_MAX), rest: all.slice(FEED_SEEN_BATCH_MAX) };
}

// --- Cartes vues : ce que l'écran suit, puis envoie (R8c2) -------------------------------------------------------------

/** Une carte compte comme « vue » quand la moitié au moins en est visible, sans interruption, pendant une seconde. */
export const SEEN_DWELL_MS = 1000;
export const SEEN_VISIBLE_SHARE = 0.5;
/** Envoi toutes les 10 secondes, à la sortie du Fil et au passage en arrière-plan. */
export const SEEN_FLUSH_EVERY_MS = 10_000;
/** Après un échec (429, réseau, serveur), pas de nouvel essai avant 60 s ; le délai double, 15 min au plus. */
export const SEEN_RETRY_BASE_MS = 60_000;
export const SEEN_RETRY_MAX_MS = 15 * 60_000;

const SEEN_ID = /^[a-z_]+:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * L'identifiant d'une carte que `POST /me/fil/seen` retient : `genre:uuid`, jamais `sponsored`. L'API refuse tout le lot si un
 * seul identifiant est inconnu : on n'envoie que ceux-là (un genre à identifiant d'une autre forme n'est pas suivi).
 */
export const isSeenCardId = (id: string): boolean => SEEN_ID.test(id) && !id.startsWith("sponsored:");

/**
 * Une carte est-elle assez visible pour compter ? `top` et `height` : la carte ; `areaTop`, `areaBottom` : la zone utile de
 * l'écran (sous la bande, au-dessus de la barre d'onglets). La moitié de la carte (ou la moitié de la zone pour une carte
 * plus haute qu'elle) doit être dans la zone.
 */
export function isVisibleEnough(top: number, height: number, areaTop: number, areaBottom: number): boolean {
  if (!(height > 0) || !(areaBottom > areaTop)) return false;
  const shown = Math.min(top + height, areaBottom) - Math.max(top, areaTop);
  return shown >= SEEN_VISIBLE_SHARE * Math.min(height, areaBottom - areaTop);
}

/**
 * Le temps de présence des cartes : `observe(visibles, maintenant)` dit lesquelles viennent de rester visibles une seconde
 * d'affilée. Une carte qui sort de la vue repart de zéro ; une carte déjà annoncée ne l'est plus (jusqu'à `reset`).
 */
export function createSeenDwell(dwellMs: number = SEEN_DWELL_MS) {
  const since = new Map<string, number>();
  const done = new Set<string>();
  return {
    observe(visible: Iterable<string>, now: number): string[] {
      const current = new Set(visible);
      for (const id of [...since.keys()]) if (!current.has(id)) since.delete(id);
      const ready: string[] = [];
      for (const id of current) {
        if (done.has(id)) continue;
        const start = since.get(id);
        if (start === undefined) since.set(id, now);
        else if (now - start >= dwellMs) {
          since.delete(id);
          done.add(id);
          ready.push(id);
        }
      }
      return ready;
    },
    /** Une nouvelle liste (autre onglet, actualisation) : tout repart. */
    reset(): void {
      since.clear();
      done.clear();
    },
  };
}

/** Le résultat d'un envoi : `ok` (204), `drop` (refus définitif : 400, le lot est abandonné), `retry` (429, réseau, serveur). */
export type SeenSendResult = "ok" | "drop" | "retry";

/**
 * La file des cartes vues. `add` dédoublonne (`seenBatch`) ; `flush` envoie par lots de 50, sans file jamais plus longue que
 * 200, sans entrée plus vieille que 24 h ; un échec remet le lot en tête et repousse le prochain essai (pas de boucle serrée).
 * `now` et `send` sont donnés : aucune horloge ni réseau ici.
 */
export function createSeenQueue(opts: { send: (batch: SeenEntry[]) => Promise<SeenSendResult>; now: () => number }) {
  let entries: SeenEntry[] = [];
  let retryAt = 0;
  let failures = 0;
  let inFlight = false;
  /** Le lot parti sans réponse : il reste dans l'état gardé (`snapshot`) jusqu'à l'acquittement. */
  let sending: SeenEntry[] = [];
  const normalize = (list: readonly SeenEntry[]): SeenEntry[] => {
    const { send, rest } = seenBatch(list);
    return [...send, ...rest];
  };
  const fresh = (list: readonly SeenEntry[]): SeenEntry[] => {
    const limit = opts.now() - FEED_SEEN_AT_MAX_AGE_MS;
    return list.filter((e) => {
      const at = e.at ? Date.parse(e.at) : Number.NaN;
      return Number.isNaN(at) || at >= limit;
    });
  };
  return {
    add(id: string, action: FeedSeenAction): void {
      if (!isSeenCardId(id)) return;
      entries = normalize([...entries, { id, action, at: new Date(opts.now()).toISOString() }]);
    },
    /** Remet en file des entrées gardées (reprise après un redémarrage de l'appli). */
    restore(saved: readonly SeenEntry[]): void {
      entries = normalize(fresh([...saved.filter((e) => isSeenCardId(e.id)), ...entries]));
    },
    snapshot(): SeenEntry[] {
      entries = fresh(entries);
      return normalize(fresh([...sending, ...entries]));
    },
    size: (): number => entries.length,
    /** Vrai : tout est parti (ou rien à envoyer). Faux : un envoi a échoué, ou on attend le prochain essai. */
    async flush(): Promise<boolean> {
      if (inFlight) return false;
      if (opts.now() < retryAt) return false;
      inFlight = true;
      try {
        entries = fresh(entries);
        while (entries.length > 0) {
          const { send, rest } = seenBatch(entries);
          if (send.length === 0) {
            entries = [];
            break;
          }
          entries = rest;
          sending = send;
          let result: SeenSendResult;
          try {
            result = await opts.send(send);
          } catch {
            result = "retry";
          }
          sending = [];
          if (result === "retry") {
            entries = normalize([...send, ...entries]);
            failures += 1;
            retryAt = opts.now() + Math.min(SEEN_RETRY_MAX_MS, SEEN_RETRY_BASE_MS * 2 ** (failures - 1));
            return false;
          }
          failures = 0;
        }
        return true;
      } finally {
        inFlight = false;
      }
    },
  };
}

// --- Hors ligne : la copie du Fil (R8c2) --------------------------------------------------------------------------------

/** Cartes gardées par onglet pour l'affichage sans réseau. */
export const FEED_COPY_MAX = 40;

/**
 * Ce que le téléphone garde d'une première page : 40 cartes au plus, **sans** `spot_meetup` (un lieu : jamais gardé, règle
 * R7i) ni `sponsored` (le comptage se fait en ligne, jamais d'une copie).
 */
export function feedCopyCards(items: readonly FeedCard[]): FeedCard[] {
  return items.filter((c) => c.kind !== "spot_meetup" && c.kind !== "sponsored").slice(0, FEED_COPY_MAX);
}

/**
 * La copie gardée d'un onglet : sa clé dans `offlineCopy`. Lot R9n (T20) : rangée par acteur — la copie d'une casquette (clé d'auteur
 * `s:…`, `p:…`…) n'écrase pas celle de la personne, ni celle d'une autre casquette.
 */
export const feedCopyKey = (filter: FeedFilter, actor: string | null = null): string =>
  actor ? `fil.${actor}.${filter}` : `fil.${filter}`;

/** Une copie relue du disque : seulement des cartes bien formées du bon onglet, filtrées de nouveau (elle peut venir d'une version plus ancienne). */
export function parseFeedCopy(raw: unknown, filter: FeedFilter): FeedCard[] | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { filter?: unknown; items?: unknown };
  if (r.filter !== filter || !Array.isArray(r.items)) return null;
  const items = r.items.filter(
    (c): c is FeedCard =>
      Boolean(c) &&
      typeof (c as FeedCard).id === "string" &&
      typeof (c as FeedCard).kind === "string" &&
      typeof (c as FeedCard).at === "string" &&
      Boolean((c as FeedCard).payload),
  );
  return feedCopyCards(items);
}

/** Genres que le Fil dessine (lot R7e2, puis `spot_meetup` du lot R7i, `sponsored` du lot R7k2 et `memory` du lot R7j) : plus aucun n'est réservé. */
export const FEED_KINDS_DRAWN: readonly FeedCardKind[] = [
  "event_recommended",
  "vehicle_public",
  "lineup",
  "vote_result",
  "announcement",
  "pro",
  "feed_post",
  "spot_meetup",
  "sponsored",
  // Lot R7j : la carte « Souvenir » est dessinée (appli et site).
  "memory",
  // Lot R9e : la carte « album » est dessinée (appli et site) ; l'API ne la sert qu'avec `?cards=album`.
  "album",
];

/** Une carte d'un genre réservé à un autre lot : rendue par `UnknownCard` tant que ce lot n'est pas fusionné. */
export const isFeedKindReserved = (kind: FeedCardKind): boolean => !FEED_KINDS_DRAWN.includes(kind);

// --- Publier au Fil -------------------------------------------------------------------------------------------------

/** Une photo du brouillon : sa décision de plaque (cadres posés, ou « aucune plaque visible » confirmée). */
export type DraftFeedPhoto = {
  rects: readonly PlateRect[];
  noPlate: boolean;
};

const sameRect = (a: PlateRect, b: PlateRect) =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && (a.angle ?? 0) === (b.angle ?? 0);

/**
 * Un cadre ajouté à la main (« Ajouter un cadre ») naît à une place connue (`nextPlateFrame`) : tant qu'il y est encore,
 * il n'a pas été placé sur la plaque et ne compte pas comme une décision. Déplacé, agrandi ou tourné, il compte. Un cadre
 * posé par la détection compte tel quel (il ne tombe jamais sur ces places). Pas d'état à garder : l'appli et le site
 * jugent le même tableau de cadres.
 */
export function isUntouchedFrame(r: PlateRect): boolean {
  for (let k = 0; k < MAX_PLATE_RECTS; k++) {
    if (sameRect(r, nextPlateFrame(new Array<PlateRect>(k)))) return true;
  }
  return false;
}

/** Des cadres posés, tous placés (aucun cadre ajouté à la main et resté où il est né). */
export const framesPlaced = (rects: readonly PlateRect[]): boolean => rects.length > 0 && !rects.some(isUntouchedFrame);

export const feedPhotoDecided = (p: DraftFeedPhoto): boolean => p.noPlate || framesPlaced(p.rects);

/**
 * Ajoute les cadres repérés par la détection à ceux déjà posés : l'union, sans doublon (deux cadres qui se recouvrent à
 * plus de moitié sont le même), `MAX_PLATE_RECTS` au plus. Un cadre existant n'est jamais retiré ni déplacé.
 */
export function mergeDetectedFrames(current: readonly PlateRect[], found: readonly PlateRect[]): PlateRect[] {
  const out = [...current];
  const overlap = (a: PlateRect, b: PlateRect) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (w <= 0 || h <= 0) return 0;
    return (w * h) / (a.w * a.h + b.w * b.h - w * h);
  };
  for (const f of found) {
    if (out.length >= MAX_PLATE_RECTS) break;
    if (!out.some((r) => overlap(r, f) > 0.5)) out.push(f);
  }
  return out;
}

/** Index (0…) de la première photo sans décision de plaque, ou -1. */
export const firstUndecidedPhoto = (photos: readonly DraftFeedPhoto[]): number =>
  photos.findIndex((p) => !feedPhotoDecided(p));

/**
 * Ce qui empêche de publier, en une ligne qui dit quoi (jamais un bouton principal grisé sans raison), ou `null`.
 * Une décision de plaque est obligatoire pour chaque photo.
 */
export function publishIssue(draft: {
  photos: readonly DraftFeedPhoto[];
  caption: string;
  preparing?: boolean;
}): string | null {
  if (draft.preparing) return L.preparing;
  if (draft.photos.length === 0) return L.missingPhoto;
  if (draft.photos.length > FEED_POST_PHOTOS_MAX) return "Six photos au plus.";
  const open = firstUndecidedPhoto(draft.photos);
  if (open >= 0) {
    const p = draft.photos[open] as DraftFeedPhoto;
    return p.rects.length > 0 ? L.placeFrame(open + 1) : L.missingPlate(open + 1);
  }
  if (draft.caption.trim().length > FEED_CAPTION_MAX) return L.captionTooLong;
  return null;
}

/** Le corps de `POST /me/feed-posts` : des cadres à flouter, ou « aucune plaque visible » confirmée, par photo. */
export function feedPostBody(draft: {
  photos: readonly (DraftFeedPhoto & { uploadKey: string })[];
  caption: string;
  aspect: FeedAspect;
  vehicleId: string | null;
  eventId: string | null;
  clientId: string;
  /** Mention « Collaboration commerciale » posée à la main (R7m2) ; un partenaire actif cité est posé par l'API. */
  commercialPartnerId?: string | null;
}) {
  return {
    caption: draft.caption.trim() || null,
    vehicleId: draft.vehicleId,
    eventId: draft.eventId,
    aspect: draft.aspect,
    clientId: draft.clientId,
    ...(draft.commercialPartnerId ? { commercialPartnerId: draft.commercialPartnerId } : {}),
    photos: draft.photos.map((p) =>
      p.rects.length
        ? { uploadKey: p.uploadKey, plateRects: [...p.rects], noPlateConfirmed: false }
        : { uploadKey: p.uploadKey, plateRects: null, noPlateConfirmed: true },
    ),
  };
}

/**
 * Événements où j'ai une place (candidature retenue, événement publié et pas « sur invitation » : l'API refuse les autres,
 * `eventSummariesByIds`), sans doublon, du plus proche au plus lointain.
 */
export function eventsWithPlace(
  applications: readonly {
    status: string;
    event: { id: string; title: string; startsAt: string; status: string; admission?: string };
  }[],
): { id: string; title: string; startsAt: string }[] {
  const seen = new Set<string>();
  const out: { id: string; title: string; startsAt: string }[] = [];
  for (const a of applications) {
    if (a.status !== "accepted" || a.event.status !== "published" || a.event.admission === "invite_only") continue;
    if (seen.has(a.event.id)) continue;
    seen.add(a.event.id);
    out.push({ id: a.event.id, title: a.event.title, startsAt: a.event.startsAt });
  }
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 10);
}

/**
 * Recadrage d'une photo au format d'une publication (`cropAspect` de l'appli, canvas du site) : le plus grand cadre de ce
 * format qui tient dans la photo, centré (`focus` : le centre voulu, 0 à 1, borné pour que le cadre reste dans la photo),
 * et la taille de sortie (côté le plus long 1350, ou 1080 pour le carré), au format à moins d'un pixel près.
 */
export function feedCropPlan(
  width: number,
  height: number,
  aspect: FeedAspect | number,
  focus: { x: number; y: number } = { x: 0.5, y: 0.5 },
): { originX: number; originY: number; width: number; height: number; outWidth: number; outHeight: number } {
  const ratio = typeof aspect === "number" ? aspect : FEED_ASPECT_RATIOS[aspect];
  const wide = width / height > ratio;
  const cropW = Math.max(1, Math.round(wide ? height * ratio : width));
  const cropH = Math.max(1, Math.round(wide ? height : width / ratio));
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const originX = Math.round(clamp(focus.x * width - cropW / 2, 0, width - cropW));
  const originY = Math.round(clamp(focus.y * height - cropH / 2, 0, height - cropH));
  const longest = ratio === 1 ? 1080 : FEED_PHOTO_SIDE;
  const outWidth = ratio >= 1 ? longest : Math.round(longest * ratio);
  const outHeight = ratio >= 1 ? Math.round(longest / ratio) : longest;
  return { originX, originY, width: cropW, height: cropH, outWidth, outHeight };
}

/** (espace insécable avant l'unité : « il y a 20 h » ne se coupe jamais entre le nombre et l'unité.) « à l'instant », « il y a 5 min », « il y a 3 h », « hier », « il y a 4 j », puis « 2 sept. » : la petite ligne d'une carte. */
export function feedAgo(at: string | Date, now: Date): string {
  const ms = now.getTime() - new Date(at).getTime();
  if (ms < 60_000) return "à l'instant";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} j`;
  return new Date(at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });
}

// --- Ma publication, juste après l'envoi ------------------------------------------------------------------------------

/**
 * La carte de ma publication, faite de la réponse de `POST /me/feed-posts` (l'API ne met jamais mes propres publications
 * dans « Abonnements » : l'écran la garde en tête de la liste affichée). Même identifiant que celui de l'API
 * (`feed_post:<id>`) : si une relecture la rend (« Pour toi »), elle ne s'affiche qu'une fois.
 */
export function publishedCard(post: FeedPostView): FeedCard<"feed_post"> {
  return {
    id: `feed_post:${post.id}`,
    kind: "feed_post",
    reason: { code: "following_author", label: L.publishedReason },
    at: post.createdAt,
    payload: { post: { ...post, mine: true } },
    seen: false,
  };
}

/**
 * Ma publication n'est en tête que juste après l'envoi (R8c2 : plus de 24 h) : l'appli la garde le temps de la visite du Fil,
 * le site dans l'onglet. Un reste plus ancien qu'une heure (envoi jamais suivi d'un retour au Fil) n'est plus « à l'envoi ».
 */
export const FEED_JUST_PUBLISHED_MS = 60 * 60 * 1000;

/** Mes cartes d'envoi encore « juste publiées » (une date illisible ou future compte comme récente). */
export function justPublished(mine: readonly FeedCard[], now: number): FeedCard[] {
  return mine.filter((c) => {
    const at = Date.parse(c.at);
    return Number.isNaN(at) || now - at < FEED_JUST_PUBLISHED_MS;
  });
}

/**
 * La liste affichée : mes publications juste envoyées **en tête** (R8c2), puis la page de l'API. Si l'API a rendu la même carte
 * (même identifiant, ce que fait « Abonnements »), ses données sont gardées (compteurs, légende) mais la raison reste « Ta
 * publication » (maquette R8.7 : l'API n'a pas de raison propre pour elle) ; la carte monte en tête, le bandeau « Publié sur
 * ton profil » parle d'elle. Sans doublon.
 */
export function withMyPublished(items: readonly FeedCard[], mine: readonly FeedCard[]): FeedCard[] {
  if (!mine.length) return [...items];
  const byId = new Map(items.map((c) => [c.id, c]));
  const head = mine.map((c) => {
    const api = byId.get(c.id);
    return api ? ({ ...api, reason: c.reason } as FeedCard) : c;
  });
  const pinned = new Set(head.map((c) => c.id));
  return [...head, ...items.filter((c) => !pinned.has(c.id))];
}

// --- Réessayer ----------------------------------------------------------------------------------------------------------

/** D'où vient l'erreur affichée : l'actualisation (première page) ou « Voir plus » (page suivante). */
export type FeedErrorSource = "reload" | "more";

/** Ce que « Réessayer » relance : l'actualisation qui a échoué se relit depuis la première page, jamais `loadMore`. */
export const feedRetryAction = (source: FeedErrorSource | null): "reload" | "loadMore" =>
  source === "more" ? "loadMore" : "reload";

// --- Mémoire des photos (lot R7e2, tour 2) ---------------------------------------------------------------------------

/**
 * Les diapositives d'une publication qu'on charge : la visible et la suivante seulement, et rien du tout quand la carte
 * est loin de l'écran (ses photos en mémoire sont alors libérées : un long défilement ne les garde pas toutes).
 */
export function slidesToLoad(index: number, count: number, near: boolean): number[] {
  if (!near || count <= 0) return [];
  const first = Math.min(Math.max(0, index), count - 1);
  return first + 1 < count ? [first, first + 1] : [first];
}

/** Une carte (position `top` et hauteur à l'écran) est « près de l'écran » à moins de `margin` px de la fenêtre (haut ou bas). */
export const isNearViewport = (top: number, height: number, viewport: number, margin = viewport): boolean =>
  top + height > -margin && top < viewport + margin;

// L'écran du Fil, sans React ni réseau (lot R7e2, testé par `feedList.test.ts`) : l'état de la liste (pages au curseur,
// `reset` de l'API), les genres de carte qu'on sait dessiner, et ce qui bloque « Publier au Fil ».
import { feedScreenLabels as L } from "../labels/feedScreen.fr";
import type { FeedCard, FeedPage } from "../schemas/feed";
import type { PlateRect } from "../schemas/vehicle";
import {
  FEED_ASPECT_RATIOS,
  FEED_CAPTION_MAX,
  FEED_PHOTO_SIDE,
  FEED_POST_PHOTOS_MAX,
  type FeedAspect,
  type FeedCardKind,
  type FeedFilter,
} from "./feed";

// --- La liste -------------------------------------------------------------------------------------------------------

/** Ce que l'écran tient : la liste affichée d'un filtre et le curseur (opaque) de la page suivante. */
export type FeedListState = {
  filter: FeedFilter;
  items: FeedCard[];
  nextCursor: string | null;
};

export const emptyFeedList = (filter: FeedFilter): FeedListState => ({ filter, items: [], nextCursor: null });

/** Ajoute des cartes sans doublon (l'identifiant d'une carte est stable d'une page à l'autre). */
export function appendCards(current: readonly FeedCard[], next: readonly FeedCard[]): FeedCard[] {
  const seen = new Set(current.map((c) => c.id));
  return [...current, ...next.filter((c) => !seen.has(c.id))];
}

/**
 * Applique une page lue. Première page (aucun curseur envoyé) ou `reset: true` (le contexte de la personne a changé en
 * plein parcours : le curseur envoyé est abandonné) : la liste est **remplacée**, jamais complétée. Sinon, la page
 * s'ajoute à la suite. Une page d'un autre filtre que celui affiché est ignorée (`null`). `scrollTop` : remonter en haut
 * (un `reset` en cours de parcours).
 */
export function applyFeedPage(
  state: FeedListState,
  page: Pick<FeedPage, "items" | "nextCursor" | "filter" | "reset">,
  sentCursor: string | null,
): { state: FeedListState; scrollTop: boolean } | null {
  if (page.filter !== state.filter) return null;
  if (!sentCursor || page.reset) {
    return {
      state: { filter: state.filter, items: [...page.items], nextCursor: page.nextCursor },
      scrollTop: Boolean(page.reset && sentCursor),
    };
  }
  return {
    state: { filter: state.filter, items: appendCards(state.items, page.items), nextCursor: page.nextCursor },
    scrollTop: false,
  };
}

/** Genres que l'écran du lot R7e2 dessine lui-même ; les autres (`spot_meetup`, `memory`, `sponsored`) sont réservés. */
export const FEED_KINDS_DRAWN: readonly FeedCardKind[] = [
  "event_recommended",
  "vehicle_public",
  "lineup",
  "vote_result",
  "announcement",
  "pro",
  "feed_post",
];

/** Une carte d'un genre réservé à un autre lot : rendue par `UnknownCard` tant que ce lot n'est pas fusionné. */
export const isFeedKindReserved = (kind: FeedCardKind): boolean => !FEED_KINDS_DRAWN.includes(kind);

// --- Publier au Fil -------------------------------------------------------------------------------------------------

/** Une photo du brouillon : sa décision de plaque (cadres posés, ou « aucune plaque visible » confirmée). */
export type DraftFeedPhoto = {
  rects: readonly PlateRect[];
  noPlate: boolean;
};

export const feedPhotoDecided = (p: DraftFeedPhoto): boolean => p.rects.length > 0 || p.noPlate;

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
  if (open >= 0) return L.missingPlate(open + 1);
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
}) {
  return {
    caption: draft.caption.trim() || null,
    vehicleId: draft.vehicleId,
    eventId: draft.eventId,
    aspect: draft.aspect,
    clientId: draft.clientId,
    photos: draft.photos.map((p) =>
      p.rects.length
        ? { uploadKey: p.uploadKey, plateRects: [...p.rects], noPlateConfirmed: false }
        : { uploadKey: p.uploadKey, plateRects: null, noPlateConfirmed: true },
    ),
  };
}

/** Événements où j'ai une place (candidature retenue, événement publié), sans doublon, du plus proche au plus lointain. */
export function eventsWithPlace(
  applications: readonly { status: string; event: { id: string; title: string; startsAt: string; status: string } }[],
): { id: string; title: string; startsAt: string }[] {
  const seen = new Set<string>();
  const out: { id: string; title: string; startsAt: string }[] = [];
  for (const a of applications) {
    if (a.status !== "accepted" || a.event.status !== "published" || seen.has(a.event.id)) continue;
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

/** « à l'instant », « il y a 5 min », « il y a 3 h », « hier », « il y a 4 j », puis « 2 sept. » : la petite ligne d'une carte. */
export function feedAgo(at: string | Date, now: Date): string {
  const ms = now.getTime() - new Date(at).getTime();
  if (ms < 60_000) return "à l'instant";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} j`;
  return new Date(at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });
}

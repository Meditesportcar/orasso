// Les règles d'écran de l'onglet « Publications » d'un profil et de la page d'une publication seule (vague R8, lot R8b2,
// maquette R8.1 `pr-profil` et R8.6 `pu-publi`). Pures : le site et l'appli les lisent, aucune n'est écrite dans un écran.
import { BUSINESS_TIMEZONE } from "../enums";
import type { ProfileTab } from "../labels/profile-tabs.fr";
import { publicationsLabels as L } from "../labels/publications.fr";
import type { FeedCard, FeedPostView } from "../schemas/feed";

/** Le compteur d'un profil (`GET /users/:pseudo`) : `null` = liste restreinte (compte privé non suivi), absent = inconnu. */
export type PublicationsCount = { count: number } | null | undefined;

/**
 * L'onglet qui s'ouvre sur un profil sans adresse explicite. « Publications » s'ouvre par défaut sur tous les profils, le mien
 * compris. Chez un autre **sans aucune publication** (`count === 0`) : « Garage », ou « Sorties » sans véhicule. Liste restreinte
 * (`publications` nul) : « Publications », qui montre le panneau « Compte privé » (le même qu'il ait publié ou non). Compteur
 * inconnu (réponse sans le champ) : comme avant la vague, « Garage » ou « Sorties ».
 */
export function profileOpenTab(input: {
  mine: boolean;
  hasGarage: boolean;
  publications: PublicationsCount;
}): ProfileTab {
  if (input.mine) return "publications";
  if (input.publications === null) return "publications";
  if (input.publications === undefined || input.publications.count === 0) return input.hasGarage ? "garage" : "sorties";
  return "publications";
}

/**
 * Les onglets d'un profil, dans l'ordre : « Garage · N » (absent sans véhicule), « Sorties », « Publications ». Une liste
 * restreinte (compte privé non suivi) ne montre que « Publications » : son garage et ses sorties ne sont pas servis.
 */
export function profileTabItems(input: { hasGarage: boolean; restricted: boolean }): ProfileTab[] {
  if (input.restricted) return ["publications"];
  return input.hasGarage ? ["garage", "sorties", "publications"] : ["sorties", "publications"];
}

/** Ce que montre l'onglet quand il n'y a pas de liste : le panneau d'un compte privé, ou l'un des deux états vides. */
export type PublicationsEmpty = "private" | "empty_mine" | "empty_other";
export function publicationsEmptyKind(input: {
  mine: boolean;
  restricted: boolean;
  itemsCount: number;
}): PublicationsEmpty | null {
  if (input.restricted) return "private";
  if (input.itemsCount > 0) return null;
  return input.mine ? "empty_mine" : "empty_other";
}

// --- La vignette de la grille --------------------------------------------------------------------------------------------

export type TileMeta = { date: string; place: string | null };

/** « 12 nov. » ; « 12 nov. 2025 » hors de l'année en cours (à l'heure d'Orasso). */
export function tileDate(iso: string, now: Date): string {
  const at = new Date(iso);
  const year = (d: Date) => Number(d.toLocaleDateString("fr-FR", { year: "numeric", timeZone: BUSINESS_TIMEZONE }));
  const text = at.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    ...(year(at) === year(now) ? {} : { year: "numeric" }),
    timeZone: BUSINESS_TIMEZONE,
  });
  return text.replace(/ /g, " ");
}

/** Sous la photo : la date, puis le lieu (`placeLabel` : la ville de l'événement rattaché, sinon le lieu libre). Aucune pastille. */
export function tileMeta(post: Pick<FeedPostView, "createdAt" | "placeLabel">, now: Date): TileMeta {
  const place = post.placeLabel?.trim() ?? "";
  return { date: tileDate(post.createdAt, now), place: place === "" ? null : place };
}

// --- La légende repliée ----------------------------------------------------------------------------------------------------

/** Une légende se replie après trois lignes (« plus » la déroule, « moins » la replie). */
export const CAPTION_FOLD_LINES = 3;

/**
 * Le pli d'une légende, à partir du nombre de lignes qu'elle occupe une fois dessinée (l'écran le mesure) : repliée seulement si
 * elle dépasse trois lignes ; le bouton est absent quand elle tient.
 */
export function captionFold(input: { lines: number; expanded: boolean }): {
  clamp: boolean;
  toggle: "more" | "less" | null;
} {
  if (input.lines <= CAPTION_FOLD_LINES) return { clamp: false, toggle: null };
  return input.expanded ? { clamp: false, toggle: "less" } : { clamp: true, toggle: "more" };
}

// --- Les deux vues --------------------------------------------------------------------------------------------------------

export const publicationsViewModes = ["grid", "one"] as const;
export type PublicationsViewMode = (typeof publicationsViewModes)[number];
/** Le dernier choix est retenu sur l'appareil (clé de la copie locale). */
export const PUBLICATIONS_VIEW_KEY = "orasso.publications.view";

/** La vue retenue : la grille de deux par défaut (et pour toute valeur inconnue). */
export function viewMode(stored: string | null | undefined): PublicationsViewMode {
  return stored === "one" ? "one" : "grid";
}

/** La suite d'une liste : les nouvelles publications s'ajoutent sans doublon (la liste bouge entre deux pages). */
export function appendUnique<T extends { id: string }>(list: readonly T[], page: readonly T[]): T[] {
  const seen = new Set(list.map((p) => p.id));
  return [...list, ...page.filter((p) => !seen.has(p.id))];
}

// --- Les liens ------------------------------------------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** L'adresse d'une publication seule : l'appli `/publication/<id>`, le site `/app/publication/<id>` ; `?commentaires=1` ouvre la feuille. */
export function publicationPath(id: string, opts: { web?: boolean; comments?: boolean } = {}): string {
  return `${opts.web ? "/app/publication" : "/publication"}/${id}${opts.comments ? "?commentaires=1" : ""}`;
}

/**
 * Une notification qui porte `data.postId` ouvre la publication seule (dette R7f4). Sont exclues celles d'un crew (`crewId` :
 * une publication de crew n'est pas une publication du Fil) et celles dont le lien est autre que le Fil (une « Info importante »
 * mène à sa fiche d'événement). Un `commentId` (commentaire, réponse, flamme, citation) ouvre aussi la feuille des commentaires.
 * `null` : rien à ouvrir de ce côté, l'écran suit son lien ordinaire.
 */
export function publicationLinkOf(data: unknown, opts: { web?: boolean } = {}): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const id = d.postId;
  if (typeof id !== "string" || !UUID.test(id)) return null;
  if (d.crewId !== undefined && d.crewId !== null) return null;
  if (d.link !== undefined && d.link !== null && d.link !== "/app/fil") return null;
  const comments = typeof d.commentId === "string" && d.commentId !== "";
  return publicationPath(id, { web: opts.web, comments });
}

/** Un profil servi par `GET /users/:pseudo` avec le compteur de publications (décoration de R8a2 ; absent d'une réponse plus ancienne). */
export type WithPublications<T> = T & { publications?: { count: number } | null };

/**
 * Une publication dans la carte du Fil (`feed_post`), réutilisée telle quelle par les listes de profil et la page d'une
 * publication seule : la raison du Fil (« Autour de toi ») n'a pas de sens ici, la petite ligne dit où elle se trouve.
 */
export function publicationCard(post: FeedPostView): FeedCard<"feed_post"> {
  return {
    id: `feed_post:${post.id}`,
    kind: "feed_post",
    reason: { code: "following_author", label: post.mine ? L.cardReasonMine : L.cardReasonOther },
    at: post.createdAt,
    payload: { post },
    // « Déjà vu » (R8c1) ne concerne que le parcours du Fil : sur un profil ou une publication seule, jamais de séparation.
    seen: false,
  };
}

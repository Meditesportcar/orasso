// Les règles d'écran de la page d'une structure et de la fiche d'un pro, vues par un visiteur (vague R8, lot R8g, maquettes R8.6
// `pu-publi` et R9.3 `n-page`). Pures : le site et l'appli les lisent, aucune n'est écrite dans un écran. `now` n'intervient pas ici.
import { attachPhraseOf } from "../labels/feedPublish.fr";
import { pagesLabels as L } from "../labels/pages.fr";
import type { AuthorPostsFilter, MentionItem, PageCounts } from "../schemas/feedLists";
import type { StoriesSummary } from "../schemas/stories";

export type PageKind = "structure" | "pro";

/** Les onglets d'une page : « Événements » (structure) ou « Présentation » (pro), puis « Publications » et « Mentions ». */
export type PageTab = "events" | "presentation" | "publications" | "mentions";

/** Le paramètre d'adresse qui porte l'onglet ouvert (`?onglet=`) : un lien partagé ouvre le bon. */
export const PAGE_TAB_PARAM = "onglet";

const SLUG: Record<PageTab, string> = {
  events: "evenements",
  presentation: "presentation",
  publications: "publications",
  mentions: "mentions",
};

/** Le mot de l'adresse pour un onglet (`?onglet=evenements`). */
export const pageTabSlug = (tab: PageTab): string => SLUG[tab];

export type PageTabItem = { id: PageTab; label: string; count: number | null };

const LABEL: Record<PageTab, string> = {
  events: L.tabEvents,
  presentation: L.tabPresentation,
  publications: L.tabPublications,
  mentions: L.tabMentions,
};

/**
 * Les onglets proposés, dans l'ordre. Structure : « Événements », « Publications », « Mentions · N ». Pro : « Présentation »,
 * « Publications », « Mentions · N ». **Sans session** : pas de « Mentions » (l'API ne les sert qu'à un membre connecté) et, pour
 * un pro, pas de « Publications » non plus (T4 : un visiteur ne voit que les publications d'un organisateur). `count` : le nombre
 * de la rangée (« Mentions · N ») ; `null` quand il n'est pas connu (jamais « · 0 » à la place d'une panne).
 */
export function pageTabs(kind: PageKind, input: { session: boolean; mentionsCount?: number | null }): PageTabItem[] {
  const first: PageTab = kind === "structure" ? "events" : "presentation";
  const out: PageTabItem[] = [{ id: first, label: LABEL[first], count: null }];
  if (kind === "pro" && !input.session) return out;
  out.push({ id: "publications", label: LABEL.publications, count: null });
  if (input.session) {
    const n = input.mentionsCount;
    out.push({ id: "mentions", label: LABEL.mentions, count: typeof n === "number" ? n : null });
  }
  return out;
}

/** Les compteurs servis avec la page (décoration de R8a2) : absents d'une réponse plus ancienne, `mentions` absent sans session. */
export type PageCountsInput = {
  publications?: number | null;
  mentions?: number | null;
};

/**
 * L'onglet qui s'ouvre sur une page sans adresse explicite : **« Publications » par défaut** (R9.3), sauf sans aucune publication
 * (ou sans onglet « Publications » : un pro vu sans session) : « Événements » (structure) ou « Présentation » (pro). Compteur
 * inconnu (réponse sans le champ) : comme avant la vague, l'onglet de la fiche d'hier.
 */
export function pageOpenTab(kind: PageKind, counts: PageCountsInput, session: boolean): PageTab {
  const first: PageTab = kind === "structure" ? "events" : "presentation";
  const shown = pageTabs(kind, { session }).some((t) => t.id === "publications");
  if (!shown) return first;
  const n = counts.publications;
  return typeof n === "number" && n > 0 ? "publications" : first;
}

/** Lit `?onglet=` : un onglet que la page propose, sinon `null` (un paramètre invalide est ignoré). */
export function explicitPageTab(kind: PageKind, raw: unknown, session: boolean): PageTab | null {
  if (typeof raw !== "string") return null;
  const found = (Object.keys(SLUG) as PageTab[]).find((t) => SLUG[t] === raw);
  if (!found) return null;
  return pageTabs(kind, { session }).some((t) => t.id === found) ? found : null;
}

/** L'onglet réellement affiché : celui de l'adresse, sinon celui d'ouverture. */
export function pageShownTab(
  kind: PageKind,
  input: { raw?: unknown; counts: PageCountsInput; session: boolean },
): PageTab {
  return explicitPageTab(kind, input.raw, input.session) ?? pageOpenTab(kind, input.counts, input.session);
}

/** Le filtre « Tout · Événements · Hors événement » : la structure seulement. */
export const pageFilters: readonly AuthorPostsFilter[] = ["all", "event", "no_event"] as const;

export function pageFilterLabel(filter: AuthorPostsFilter): string {
  return filter === "event" ? L.filterEvent : filter === "no_event" ? L.filterNoEvent : L.filterAll;
}

/** L'adresse d'un filtre dans `?filtre=` : « Tout » n'a pas de paramètre. */
export const PAGE_FILTER_PARAM = "filtre";
const FILTER_SLUG = { all: "tout", event: "evenements", no_event: "hors-evenement" } as const;
export const pageFilterSlug = (f: AuthorPostsFilter): string => FILTER_SLUG[f];
export function explicitPageFilter(raw: unknown): AuthorPostsFilter {
  const found = pageFilters.find((f) => FILTER_SLUG[f] === raw);
  return found ?? "all";
}

/** Le texte de l'état vide des publications, selon le filtre (le filtre « Tout » dit le nom de la page). */
export function pageEmptyText(filter: AuthorPostsFilter, name: string): string {
  if (filter === "event") return L.emptyEvent;
  if (filter === "no_event") return L.emptyNoEvent;
  return L.emptyText(name);
}

// --- L'en-tête ----------------------------------------------------------------------------------------------------------

export type PageCounter = {
  key: "followers" | "events" | "partners" | "organizers";
  value: number | null;
  label: string;
};

/**
 * La bande de compteurs. Structure : « abonnés », « événements », « partenaires » (les pros partenaires). Pro : « abonnés », puis
 * « partenaires » (les passionnés à partenariat actif : servis aux connectés seulement) et « organisateurs » (les organisateurs
 * partenaires) **seulement quand ils existent** : une case à zéro n'est pas montrée, un nombre non servi non plus. Un nombre
 * dont la lecture a échoué (`null`) garde sa case : « – ».
 */
export function pageCounters(
  kind: PageKind,
  input: {
    followers: number;
    events?: number | null;
    partners?: number | null;
    organizers?: number | null;
  },
): PageCounter[] {
  const cells: PageCounter[] = [{ key: "followers", value: input.followers, label: L.followers(input.followers) }];
  if (kind === "structure") {
    const events = input.events === undefined ? null : input.events;
    cells.push({ key: "events", value: events, label: L.events(events ?? 2) });
    const partners = input.partners === undefined ? null : input.partners;
    cells.push({ key: "partners", value: partners, label: L.partners(partners ?? 2) });
    return cells;
  }
  if (typeof input.partners === "number" && input.partners > 0)
    cells.push({ key: "partners", value: input.partners, label: L.partners(input.partners) });
  if (typeof input.organizers === "number" && input.organizers > 0)
    cells.push({ key: "organizers", value: input.organizers, label: L.organizers(input.organizers) });
  return cells;
}

/** La page telle que l'API la sert : ses stories selon le regard et les compteurs (décorations de R7f1 et R8a2). */
export type WithPageExtras<T> = T & { stories?: StoriesSummary } & PageCounts;

/** Le nombre de publications servi (`undefined` : réponse plus ancienne). */
export const pagePublicationsCount = (p: PageCounts): number | undefined => p.publications?.count;
/** Le nombre de mentions servi (`undefined` : sans session ou réponse plus ancienne). */
export const pageMentionsCount = (p: PageCounts): number | undefined => p.mentions?.count;

/**
 * Un responsable de la page (celui qui peut « Masquer de la page ») : un membre actif non staff de la structure (propriétaire,
 * co-organisateur), le propriétaire de la fiche d'un pro. L'API revérifie chaque écriture (second facteur compris).
 */
export function isPageManager(
  kind: PageKind,
  input: {
    structureId?: string;
    isOwner?: boolean;
    memberships?: readonly { structureId: string; role: string; status: string }[];
  },
): boolean {
  if (kind === "pro") return input.isOwner === true;
  return Boolean(
    input.memberships?.some((m) => m.structureId === input.structureId && m.status === "active" && m.role !== "staff"),
  );
}

// --- Les mentions --------------------------------------------------------------------------------------------------------

/**
 * La ligne d'une mention (R8.6 `menRow`) : sous le nom de l'auteur, ce qu'il a fait. Un rattachement avec verbe dit « était au
 * Rassemblement du Lydia » ou « présent au … » (`attachPhraseOf`) ; une collaboration commerciale porte sa pastille
 * (`commercial`) et n'a pas de phrase ; une citation seule dit « a cité <la page> ».
 */
export function mentionLine(item: MentionItem, pageName: string): { text: string; commercial: boolean } {
  if (item.source === "commercial") return { text: "", commercial: true };
  const a = item.post.attach;
  if (item.source === "attach" && a?.role)
    return { text: attachPhraseOf(a.role, a.phase, a.event.title), commercial: false };
  return { text: L.mentionCited(pageName), commercial: false };
}

// Les règles d'écran de la page d'une structure et de la fiche d'un pro, vues par un visiteur (vague R8, lot R8g, maquettes R8.6
// `pu-publi` et R9.3 `n-page`). Pures : le site et l'appli les lisent, aucune n'est écrite dans un écran. `now` n'intervient pas ici.

import { attachPhraseOf } from "../labels/feedPublish.fr";
import { pagesLabels as L } from "../labels/pages.fr";
import { proOffersLabels } from "../labels/proOffers.fr";
import type { AuthorPostsFilter, MentionItem, PageCounts } from "../schemas/feedLists";
import type { StoriesSummary } from "../schemas/stories";
import { FEED_ASPECT_RATIOS, type FeedAspect, feedAspects } from "./feed";

/** Lot R9b : le prestataire et le média ont leur page, comme la structure et le pro. */
export type PageKind = "structure" | "pro" | "provider" | "media";

/**
 * Les onglets d'une page : « Événements » (structure), « Présentation » (pro), « Prestations » (prestataire) ou « Contenus »
 * (média, R9b), puis « Publications », « Offres » (fiche pro, R9c) et « Mentions ».
 */
export type PageTab = "events" | "presentation" | "publications" | "offers" | "services" | "contents" | "mentions";

/** Le paramètre d'adresse qui porte l'onglet ouvert (`?onglet=`) : un lien partagé ouvre le bon. */
export const PAGE_TAB_PARAM = "onglet";

const SLUG: Record<PageTab, string> = {
  events: "evenements",
  presentation: "presentation",
  publications: "publications",
  offers: "offres",
  services: "prestations",
  contents: "contenus",
  mentions: "mentions",
};

/** Le mot de l'adresse pour un onglet (`?onglet=evenements`). */
export const pageTabSlug = (tab: PageTab): string => SLUG[tab];

export type PageTabItem = { id: PageTab; label: string; count: number | null };

const LABEL: Record<PageTab, string> = {
  events: L.tabEvents,
  presentation: L.tabPresentation,
  publications: L.tabPublications,
  offers: proOffersLabels.tab,
  services: L.tabServices,
  contents: L.tabContents,
  mentions: L.tabMentions,
};

/** L'onglet de la page d'hier : celui qui ne dépend ni de la session ni du nombre de publications. */
const FIRST: Record<PageKind, PageTab> = {
  structure: "events",
  pro: "presentation",
  provider: "services",
  media: "contents",
};

/**
 * Les onglets proposés, dans l'ordre. Structure : « Événements », « Publications », « Mentions · N ». Pro : « Présentation »,
 * « Publications », « Offres » (R9c, avec une session), « Mentions · N ». Prestataire (R9b) : « Publications », « Prestations »,
 * « Mentions · N ». Média : « Publications », « Contenus », « Mentions · N ». **Sans session** : pas de « Mentions » (l'API ne les
 * sert qu'à un membre connecté) et, hors structure, pas de « Publications » non plus (T4 : un visiteur ne voit que les publications
 * d'un organisateur) : un pro n'a que « Présentation », un prestataire que « Prestations », un média que « Contenus ».
 * **`owner`** : le propriétaire d'une fiche pro n'a pas « Présentation » (sa fiche s'ouvre par « Modifier ma fiche ») :
 * « Publications · Offres · Mentions · N ». `count` : le nombre de la rangée (« Mentions · N ») ; `null` quand il n'est pas connu
 * (jamais « · 0 » à la place d'une panne).
 */
export function pageTabs(
  kind: PageKind,
  input: { session: boolean; mentionsCount?: number | null; owner?: boolean },
): PageTabItem[] {
  const item = (id: PageTab, count: number | null = null): PageTabItem => ({ id, label: LABEL[id], count });
  if (!input.session) return kind === "structure" ? [item("events"), item("publications")] : [item(FIRST[kind])];
  const n = input.mentionsCount;
  const mentions = item("mentions", typeof n === "number" ? n : null);
  switch (kind) {
    case "structure":
      return [item("events"), item("publications"), mentions];
    case "pro":
      return input.owner
        ? [item("publications"), item("offers"), mentions]
        : [item("presentation"), item("publications"), item("offers"), mentions];
    case "provider":
      return [item("publications"), item("services"), mentions];
    case "media":
      return [item("publications"), item("contents"), mentions];
  }
}

/** Les compteurs servis avec la page (décoration de R8a2) : absents d'une réponse plus ancienne, `mentions` absent sans session. */
export type PageCountsInput = {
  publications?: number | null;
  mentions?: number | null;
};

/**
 * L'onglet qui s'ouvre sur une page sans adresse explicite : **« Publications » par défaut** (R9.3), sauf sans aucune publication
 * (ou sans onglet « Publications » : un pro, un prestataire ou un média vu sans session) : « Événements » (structure), « Présentation »
 * (pro), « Prestations » (prestataire) ou « Contenus » (média). Compteur inconnu (réponse sans le champ) : comme avant la vague, l'onglet de la fiche d'hier.
 */
export function pageOpenTab(kind: PageKind, counts: PageCountsInput, session: boolean, owner = false): PageTab {
  const tabs = pageTabs(kind, { session, owner });
  // Le propriétaire d'un pro n'a pas « Présentation » : sans publication, son premier onglet est « Offres ».
  const first = tabs.find((t) => t.id !== "publications")?.id ?? FIRST[kind];
  if (!tabs.some((t) => t.id === "publications")) return first;
  const n = counts.publications;
  return typeof n === "number" && n > 0 ? "publications" : first;
}

/** Lit `?onglet=` : un onglet que la page propose, sinon `null` (un paramètre invalide est ignoré). */
export function explicitPageTab(kind: PageKind, raw: unknown, session: boolean, owner = false): PageTab | null {
  if (typeof raw !== "string") return null;
  const found = (Object.keys(SLUG) as PageTab[]).find((t) => SLUG[t] === raw);
  if (!found) return null;
  return pageTabs(kind, { session, owner }).some((t) => t.id === found) ? found : null;
}

/** L'onglet réellement affiché : celui de l'adresse, sinon celui d'ouverture. */
export function pageShownTab(
  kind: PageKind,
  input: { raw?: unknown; counts: PageCountsInput; session: boolean; owner?: boolean },
): PageTab {
  return (
    explicitPageTab(kind, input.raw, input.session, input.owner) ??
    pageOpenTab(kind, input.counts, input.session, input.owner)
  );
}

/** Le filtre « Tout · Événements · Hors événement » : la structure seulement. */
export const pageFilters: readonly AuthorPostsFilter[] = ["all", "event", "no_event"] as const;

export function pageFilterLabel(filter: AuthorPostsFilter): string {
  return filter === "event"
    ? L.filterEvent
    : filter === "no_event"
      ? L.filterNoEvent
      : filter === "offer"
        ? proOffersLabels.tab
        : L.filterAll;
}

/** L'adresse d'un filtre dans `?filtre=` : « Tout » n'a pas de paramètre. */
export const PAGE_FILTER_PARAM = "filtre";
const FILTER_SLUG = { all: "tout", event: "evenements", no_event: "hors-evenement", offer: "offres" } as const;
export const pageFilterSlug = (f: AuthorPostsFilter): string => FILTER_SLUG[f];
export function explicitPageFilter(raw: unknown): AuthorPostsFilter {
  const found = pageFilters.find((f) => FILTER_SLUG[f] === raw);
  return found ?? "all";
}

/** Le texte de l'état vide des publications, selon le filtre (le filtre « Tout » dit le nom de la page). */
export function pageEmptyText(filter: AuthorPostsFilter, name: string): string {
  if (filter === "event") return L.emptyEvent;
  if (filter === "no_event") return L.emptyNoEvent;
  if (filter === "offer") return proOffersLabels.empty;
  return L.emptyText(name);
}

// --- L'en-tête ----------------------------------------------------------------------------------------------------------

export type PageCounter = {
  key: "followers" | "events" | "offers" | "partners" | "organizers" | "missions" | "accreditations" | "publications";
  value: number | null;
  label: string;
};

/**
 * La bande de compteurs (R9b : prestataire « abonnés · missions · organisateurs », média « abonnés · accréditations · publications »).
 * Structure : « abonnés », « événements », « partenaires » (les pros partenaires). Pro : « abonnés », puis
 * « offres en cours » (R9c), « partenaires » (les passionnés à partenariat actif : servis aux connectés seulement) et « organisateurs » (les organisateurs
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
    /** Les offres en cours d'une fiche pro (R9c) : servies aux connectés seulement. */
    offers?: number | null;
    /** Lot R9b : les missions et les organisateurs d'un prestataire (T24), les accréditations et les publications d'un média (T22). */
    missions?: number | null;
    accreditations?: number | null;
    publications?: number | null;
  },
): PageCounter[] {
  const cells: PageCounter[] = [{ key: "followers", value: input.followers, label: L.followers(input.followers) }];
  // Prestataire et média : trois cases toujours là ; un nombre non lu (`null`) garde sa case : « – ».
  if (kind === "provider") {
    const missions = input.missions ?? null;
    const organizers = input.organizers ?? null;
    cells.push({ key: "missions", value: missions, label: L.missions(missions ?? 2) });
    cells.push({ key: "organizers", value: organizers, label: L.organizers(organizers ?? 2) });
    return cells;
  }
  if (kind === "media") {
    const accreditations = input.accreditations ?? null;
    const publications = input.publications ?? null;
    cells.push({ key: "accreditations", value: accreditations, label: L.accreditations(accreditations ?? 2) });
    cells.push({ key: "publications", value: publications, label: L.publicationsCount(publications ?? 2) });
    return cells;
  }
  if (kind === "structure") {
    const events = input.events === undefined ? null : input.events;
    cells.push({ key: "events", value: events, label: L.events(events ?? 2) });
    const partners = input.partners === undefined ? null : input.partners;
    cells.push({ key: "partners", value: partners, label: L.partners(partners ?? 2) });
    return cells;
  }
  if (typeof input.offers === "number" && input.offers > 0)
    cells.push({ key: "offers", value: input.offers, label: proOffersLabels.counter(input.offers) });
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
 * co-organisateur), le propriétaire de la fiche d'un pro, d'un prestataire ou d'un média. L'API revérifie chaque écriture (second facteur compris).
 */
export function isPageManager(
  kind: PageKind,
  input: {
    structureId?: string;
    isOwner?: boolean;
    memberships?: readonly { structureId: string; role: string; status: string }[];
  },
): boolean {
  if (kind !== "structure") return input.isOwner === true;
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

/**
 * Le cadrage d'une publication vue sans session (`PublicPostView` ne porte pas `aspect`) : le format le plus proche de la
 * première photo (toutes les photos d'une publication ont le même). Sans photo : 4:5.
 */
export function aspectOfPhotos(photos: readonly { width: number; height: number }[]): FeedAspect {
  const first = photos[0];
  if (!first || first.height <= 0) return "portrait_4_5";
  const ratio = first.width / first.height;
  return [...feedAspects].sort(
    (a, b) => Math.abs(ratio / FEED_ASPECT_RATIOS[a] - 1) - Math.abs(ratio / FEED_ASPECT_RATIOS[b] - 1),
  )[0] as FeedAspect;
}

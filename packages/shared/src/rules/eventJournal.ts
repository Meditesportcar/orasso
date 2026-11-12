// La fiche d'un événement : ce que montrent le journal, l'ancien fil, « Mentions · N » et le jour J (vague R8, lot R8d, maquette
// R8.5 `e-fiche`). Pures : le site et l'appli les lisent, aucune n'est écrite dans un écran. `now` est toujours passé.
import { BUSINESS_TIMEZONE } from "../enums";
import type { FeedPostView } from "../schemas/feed";
import type { PublicPostView } from "../schemas/feedLists";
import type { AuthorKind } from "./authors";
import { initialPublishChoice, type PublishChoice } from "./feedPublish";

/** Une entrée de l'ancien fil (`AnnouncementView`) : celle qui porte `migratedPostId` est déjà dans le journal. */
export type LegacyEntry = { id: string; migratedPostId?: string | null };

/**
 * Ce qui reste de l'ancien fil sous le journal : consignes, changements de statut, annonces réservées aux inscrits et annonces
 * non reprises. Les annonces reprises (`migratedPostId`) sont dans le journal : elles ne s'affichent pas deux fois. Une API
 * plus ancienne ne pose pas le champ : tout reste affiché. `journalRead` faux : rien n'est caché.
 */
export function remainingFil<T extends LegacyEntry>(items: readonly T[], journalRead = true): T[] {
  // Le journal n'a pas pu être lu (panne, ni réponse ni copie) : l'ancien fil complet, l'information ne disparaît pas des deux côtés.
  if (!journalRead) return [...items];
  return items.filter((i) => !i.migratedPostId);
}

/** Ce que montre la section « Publications » : la liste, l'invitation de l'organisateur (fiche sans publication), ou rien. */
export type JournalSection = "list" | "invite" | "none";
export function journalSection(input: { count: number | null | undefined; manager: boolean }): JournalSection {
  if (typeof input.count === "number" && input.count > 0) return "list";
  return input.manager ? "invite" : "none";
}

/** La ligne « Mentions · N » : seulement avec une session et au moins une mention visible. */
export function showMentionsRow(input: {
  signedIn: boolean;
  count: number | null | undefined;
  /** Responsable de la fiche : le nombre de mentions masquées (la ligne reste tant qu'il y en a). */
  hidden?: number | null;
}): boolean {
  if (!input.signedIn) return false;
  return (typeof input.count === "number" && input.count > 0) || (typeof input.hidden === "number" && input.hidden > 0);
}

/** L'événement est-il fini ? Avant, « j'y serai » ; après, « j'y étais » (et la présence validée). */
export type MentionsPhase = "before" | "after";
export function mentionsPhase(input: { endsAt: string | Date }, now: Date): MentionsPhase {
  return new Date(input.endsAt).getTime() <= now.getTime() ? "after" : "before";
}

/** L'étiquette « Épinglée » d'une publication du journal, et « Inscrits prévenus » quand l'info importante est partie. */
export function journalBadges(post: { pinned: boolean; important: { sentAt: string | null } | null }): {
  pinned: boolean;
  notified: boolean;
} {
  return { pinned: post.pinned, notified: Boolean(post.important?.sentAt) };
}

/** Le geste d'épingle d'un menu de l'organisateur. */
export const pinGesture = (pinned: boolean): "pin" | "unpin" => (pinned ? "unpin" : "pin");

/** La clé de cible d'une mention sur la fiche d'un événement (`PUT|DELETE /mentions/<clé>/<publication>/hidden`). */
export const eventTargetKey = (eventId: string): string => `e:${eventId}`;

/** Un responsable de la fiche peut masquer ; la clé de cible figure dans `manage.hideFrom` de la publication. */
export const canHideFrom = (hideFrom: readonly string[] | undefined, eventId: string): boolean =>
  Boolean(hideFrom?.includes(eventTargetKey(eventId)));

// --- Jour J --------------------------------------------------------------------------------------------------------------

export type NoticeSource = "journal" | "legacy";
export type Notice = { source: NoticeSource; id: string; text: string; at: string; important: boolean };

/**
 * « Dernière nouvelle » du jour J : la plus récente entre la dernière publication du journal et la dernière annonce non
 * reprise. À égalité, la publication du journal.
 */
export function latestNotice(journal: Notice | null, legacy: Notice | null): Notice | null {
  if (!journal) return legacy;
  if (!legacy) return journal;
  // Une « Info importante » du journal (choisie d'aujourd'hui par `lastJournalNotice`) n'est jamais masquée par une annonce plus récente.
  if (journal.important) return journal;
  return new Date(legacy.at).getTime() > new Date(journal.at).getTime() ? legacy : journal;
}

/** La publication du journal la plus récente (par date de création : l'épinglée n'est pas forcément la dernière). */
export function lastJournalNotice(
  items: readonly { id: string; caption: string | null; createdAt: string; important?: unknown }[],
  photoText: string,
  today?: { now: Date; timeZone?: string },
): Notice | null {
  const byDate = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // Une « Info importante » d'aujourd'hui (jour pris dans le fuseau de l'événement) passe devant une publication plus récente.
  const day = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: today?.timeZone ?? BUSINESS_TIMEZONE, dateStyle: "short" }).format(d);
  const important = today
    ? byDate.find((i) => i.important && day(new Date(i.createdAt)) === day(today.now))
    : undefined;
  const latest = important ?? byDate[0];
  if (!latest) return null;
  return {
    source: "journal",
    id: latest.id,
    text: latest.caption?.trim() ? latest.caption : photoText,
    at: latest.createdAt,
    // « Info importante » seulement si elle est d'aujourd'hui (choisie plus haut) : une ancienne ne masque pas une annonce du jour.
    important: Boolean(important),
  };
}

/** La dernière annonce (genre « annonce » seulement) de l'ancien fil. */
export function lastLegacyNotice(
  items: readonly { id: string; kind: string; body: string; publishedAt: string }[],
): Notice | null {
  const latest = [...items]
    .filter((i) => i.kind === "announcement")
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
  return latest
    ? { source: "legacy", id: latest.id, text: latest.body, at: latest.publishedAt, important: false }
    : null;
}

// --- « Sa fiche » ---------------------------------------------------------------------------------------------------------

/**
 * Où mène « Sa fiche » sur une mention « Sur place » : le prestataire (`/providers/<id>`), le pro (`/p/<id>`), la personne
 * (`/u/<pseudo>`), la structure (`/o/<id>`). Un média n'a pas de page publique dans l'appli : pas de bouton.
 */
export function authorFichePath(author: { kind: AuthorKind; key: string; pseudo: string }): string | null {
  const id = author.key.slice(author.key.indexOf(":") + 1);
  switch (author.kind) {
    case "provider":
      return `/providers/${encodeURIComponent(id)}`;
    case "pro":
      return `/p/${encodeURIComponent(id)}`;
    case "structure":
      return `/o/${encodeURIComponent(id)}`;
    case "user":
      return `/u/${encodeURIComponent(author.pseudo)}`;
    default:
      return null;
  }
}

// --- Sans session --------------------------------------------------------------------------------------------------------

/**
 * Une publication du journal vue **sans session** (`PublicPostView`, liste blanche) en `FeedPostView`, pour que les mêmes
 * vignettes et cartes l'affichent. Rien n'est inventé : pas de flamme active (`reactedByMe` faux), pas de commentaires
 * (`commentsOff`), pas de véhicule ni de co-auteur ; l'auteur est la page, jamais la personne. L'écran n'offre ni flamme, ni
 * commentaire, ni menu à un visiteur : ce n'est qu'un format commun.
 */
export function publicToFeedPost(p: PublicPostView): FeedPostView {
  return {
    id: p.id,
    author: {
      key: p.author.key,
      kind: p.author.kind,
      name: p.author.name,
      avatarUrl: p.author.avatarUrl,
      verified: p.author.verified,
      pseudo: p.author.name,
      grade: null,
      official: false,
    },
    caption: p.caption,
    aspect: "portrait_4_5",
    photos: p.photos,
    vehicle: null,
    event: p.attach ? { slug: p.attach.event.slug, title: p.attach.event.title } : null,
    reactionsCount: p.reactionsCount,
    reactedByMe: false,
    createdAt: p.createdAt,
    mine: false,
    commercialPartner: null,
    coAuthor: null,
    attach: p.attach,
    placeLabel: p.placeLabel,
    visual: p.visual,
    important: p.important,
    pinned: p.pinned,
    commentsCount: 0,
    commentsOff: true,
    lastComments: [],
  };
}

// --- « Publier pour cet événement » -------------------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Les valeurs de départ de « Publier » ouvert depuis la fiche de l'événement (`?structure=<id>&evenement=<id>`) : la structure
 * déjà choisie comme auteur (si la personne en est responsable : elle figure dans ses casquettes) et l'événement posé. Une
 * adresse mal formée, une structure qui n'est pas la sienne ou un événement sans structure : les valeurs habituelles. L'écran
 * relâche lui-même un événement que la structure ne peut pas rattacher.
 */
export function publishStartChoice(
  params: { structure?: string | null; evenement?: string | null },
  authors: readonly { key: string; structureId?: string }[],
): PublishChoice {
  const structure = params.structure && UUID.test(params.structure) ? params.structure : null;
  const author = structure ? authors.find((a) => a.structureId === structure) : undefined;
  if (!author) return initialPublishChoice;
  const eventId = params.evenement && UUID.test(params.evenement) ? params.evenement : null;
  return { ...initialPublishChoice, authorKey: author.key, eventId };
}

// La fiche d'un événement : ce que montrent le journal, l'ancien fil, « Mentions · N » et le jour J (vague R8, lot R8d, maquette
// R8.5 `e-fiche`). Pures : le site et l'appli les lisent, aucune n'est écrite dans un écran. `now` est toujours passé.
import type { FeedPostView } from "../schemas/feed";
import type { PublicPostView } from "../schemas/feedLists";
import type { AuthorKind } from "./authors";

/** Une entrée de l'ancien fil (`AnnouncementView`) : celle qui porte `migratedPostId` est déjà dans le journal. */
export type LegacyEntry = { id: string; migratedPostId?: string | null };

/**
 * Ce qui reste de l'ancien fil sous le journal : consignes, changements de statut, annonces réservées aux inscrits et annonces
 * non reprises. Les annonces reprises (`migratedPostId`) sont dans le journal : elles ne s'affichent pas deux fois. Une API
 * plus ancienne ne pose pas le champ : tout reste affiché.
 */
export function remainingFil<T extends LegacyEntry>(items: readonly T[]): T[] {
  return items.filter((i) => !i.migratedPostId);
}

/** Ce que montre la section « Publications » : la liste, l'invitation de l'organisateur (fiche sans publication), ou rien. */
export type JournalSection = "list" | "invite" | "none";
export function journalSection(input: { count: number | null | undefined; manager: boolean }): JournalSection {
  if (typeof input.count === "number" && input.count > 0) return "list";
  return input.manager ? "invite" : "none";
}

/** La ligne « Mentions · N » : seulement avec une session et au moins une mention visible. */
export function showMentionsRow(input: { signedIn: boolean; count: number | null | undefined }): boolean {
  return input.signedIn && typeof input.count === "number" && input.count > 0;
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
  return new Date(legacy.at).getTime() > new Date(journal.at).getTime() ? legacy : journal;
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

// Écran « Publier » (vague R8, lot R8p, ARCHITECTURE-R8 § 2.3), sans React ni réseau (testé par `feedPublish.test.ts`) : au nom
// de qui on publie, pour quel événement, ce qui bloque « Publier », le corps de `POST /me/feed-posts`. Les règles de l'API
// restent les seules à faire foi (droits, rôle déduit, plafond) ; l'écran les annonce sans les décider. Les anciennes règles
// (`publishIssue`, `feedPostBody`, `eventsWithPlace`, dans `feedList.ts`) restent pour l'APK en ligne.
import { BUSINESS_TIMEZONE } from "../enums";
import { publicationErrors } from "../labels/feed.fr";
import {
  attachPhraseOf,
  type PublishDestination,
  publishAuthorHint,
  publishAuthorTitle,
  publishWhereText,
  feedPublishLabels as T,
} from "../labels/feedPublish.fr";
import { feedScreenLabels as L } from "../labels/feedScreen.fr";
import type { AttachableEventItem } from "../schemas/feed";
import type { PersonaEntry } from "../schemas/profile";
import type { StoryPersona } from "./audience";
import { ESSENTIAL_URGENT_WITHIN_MS } from "./eventNotifications";
import { FEED_CAPTION_MAX, FEED_POST_PHOTOS_MAX, type FeedAspect } from "./feed";
import { FEED_CAPTION_PERSONA_MAX, FEED_PLACE_LABEL_MAX, type ImportantReason } from "./feedAttach";
import { type DraftFeedPhoto, firstUndecidedPhoto } from "./feedList";
import { deliverAfter } from "./quietHours";

// --- Au nom de qui ---------------------------------------------------------------------------------------------------

export type PublishIcon = "profile" | "home" | "briefcase" | "truck" | "camera";

/** Une ligne de « Publier en tant que » : une casquette du compte. */
export type PublishAuthor = {
  /** `me`, `structure:<id>`, `pro:<id>`, `provider:<id>`, `media:<id>` : stable d'un chargement à l'autre. */
  key: string;
  persona: StoryPersona;
  structureId?: string;
  proId?: string;
  destination: PublishDestination;
  /** Le nom de la page, ou le pseudo. */
  name: string;
  /** « Moi · Damien_66 », « Roues Libres 66 · ma structure »… */
  title: string;
  hint: string;
  icon: PublishIcon;
  logoUrl: string | null;
};

const ICON_OF: Record<PublishDestination, PublishIcon> = {
  me: "profile",
  structure: "home",
  pro: "briefcase",
  provider: "truck",
  media: "camera",
};
const RANK: Record<string, number> = { organizer: 0, pro: 1, provider: 2, media: 3 };
const DESTINATION_OF: Record<string, PublishDestination> = {
  organizer: "structure",
  pro: "pro",
  provider: "provider",
  media: "media",
};

/**
 * Les casquettes au nom desquelles le compte peut publier : « Moi » d'abord, puis ses structures, sa fiche pro, son profil
 * de prestataire, son profil de média (l'ordre de la maquette). Le passionné, le visiteur et l'administration ne sont pas des
 * pages. L'API vérifie les droits : cette liste ne fait que proposer.
 */
export function publishAuthors(
  personas: readonly Pick<PersonaEntry, "kind" | "id" | "label" | "logoUrl">[],
  pseudo: string,
  avatarUrl: string | null = null,
): PublishAuthor[] {
  const me: PublishAuthor = {
    key: "me",
    persona: "fan",
    destination: "me",
    name: pseudo,
    title: publishAuthorTitle("me", pseudo),
    hint: publishAuthorHint.me,
    icon: ICON_OF.me,
    logoUrl: avatarUrl,
  };
  const pages = personas
    .filter((p) => p.kind in DESTINATION_OF)
    .map((p, index) => ({ p, index }))
    .sort((a, b) => (RANK[a.p.kind] ?? 9) - (RANK[b.p.kind] ?? 9) || a.index - b.index)
    .map(({ p }): PublishAuthor => {
      const destination = DESTINATION_OF[p.kind] as PublishDestination;
      return {
        key: `${destination}:${p.id}`,
        persona: p.kind as StoryPersona,
        ...(p.kind === "organizer" ? { structureId: p.id } : {}),
        ...(p.kind === "pro" ? { proId: p.id } : {}),
        destination,
        name: p.label,
        title: publishAuthorTitle(destination, p.label),
        hint: publishAuthorHint[destination],
        icon: ICON_OF[destination],
        logoUrl: p.logoUrl,
      };
    });
  return [me, ...pages];
}

/** « Publier en tant que » n'apparaît qu'avec plus d'une casquette (sinon rien). */
export const showAuthorChoice = (authors: readonly PublishAuthor[]): boolean => authors.length > 1;

/** La longueur de la légende : 500 pour « Moi », 2 000 pour une casquette. */
export const captionMaxOf = (author: Pick<PublishAuthor, "persona">): number =>
  author.persona === "fan" ? FEED_CAPTION_MAX : FEED_CAPTION_PERSONA_MAX;

/** Le bloc « Rattacher à … » n'existe pas pour une fiche pro (T2, Damien 11/11). */
export const showEventBlock = (author: Pick<PublishAuthor, "persona">): boolean => author.persona !== "pro";

/** Le titre du bloc : « sortie » pour « Moi », « événement » pour une casquette. */
export const attachLeadOf = (author: Pick<PublishAuthor, "persona">): string =>
  author.persona === "fan" ? T.attachLeadMe : T.attachLead;

/** Les paramètres de `GET /me/feed-posts/attachable-events` pour cette casquette. */
export function attachableQuery(author: PublishAuthor): {
  persona: StoryPersona;
  structureId?: string;
  proId?: string;
} {
  return {
    persona: author.persona,
    ...(author.structureId ? { structureId: author.structureId } : {}),
    ...(author.proId ? { proId: author.proId } : {}),
  };
}

// --- Ce que la personne a choisi -------------------------------------------------------------------------------------

export type PublishChoice = {
  authorKey: string;
  eventId: string | null;
  vehicleId: string | null;
  /** Lieu libre, seulement sans événement. */
  placeLabel: string;
  importantOn: boolean;
  /** Aucun motif présélectionné. */
  importantReason: ImportantReason | null;
};

export const initialPublishChoice: PublishChoice = {
  authorKey: "me",
  eventId: null,
  vehicleId: null,
  placeLabel: "",
  importantOn: false,
  importantReason: null,
};

/**
 * Changer de casquette remet l'événement à « Aucun », retire le véhicule (réservé à « Moi ») et décoche « Info importante » :
 * ce qui valait pour l'autre page ne vaut plus. Une casquette inconnue ne change rien.
 */
export function chooseAuthor(choice: PublishChoice, authors: readonly PublishAuthor[], key: string): PublishChoice {
  if (key === choice.authorKey || !authors.some((a) => a.key === key)) return choice;
  return { ...choice, authorKey: key, eventId: null, vehicleId: null, importantOn: false, importantReason: null };
}

/** Un autre événement (ou « Aucun ») : « Info importante » repart décochée, sans motif. */
export function chooseEvent(choice: PublishChoice, eventId: string | null): PublishChoice {
  if (eventId === choice.eventId) return choice;
  return { ...choice, eventId, importantOn: false, importantReason: null };
}

/** Le véhicule n'est proposé qu'à « Moi ». */
export const vehicleAllowed = (author: Pick<PublishAuthor, "persona">): boolean => author.persona === "fan";

// --- « Info importante » ---------------------------------------------------------------------------------------------

/** La case existe pour la casquette structure **et** un événement de sa structure (rôle déduit `organizer`). */
export function importantAvailable(
  author: Pick<PublishAuthor, "persona">,
  event: Pick<AttachableEventItem, "role" | "important"> | null,
): boolean {
  return author.persona === "organizer" && event !== null && event.role === "organizer" && event.important !== null;
}

/** Le plafond atteint : `week` avant `day` (la semaine pleine explique aussi le jour). `null` : il reste de la place. */
export function importantBlocked(event: Pick<AttachableEventItem, "important">): "day" | "week" | null {
  const left = event.important;
  if (!left) return null;
  if (left.leftWeek < 1) return "week";
  if (left.leftToday < 1) return "day";
  return null;
}

/**
 * L'« Info importante » part-elle tout de suite ? Oui hors heures calmes, et la nuit si l'événement commence dans moins de
 * 12 h ou est en cours (règle de l'API, `deliverAfter` avec l'exception de l'Essentiel) ; sinon à 8 h.
 */
export function importantImmediate(startsAt: string, now: Date): boolean {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return true;
  return (
    deliverAfter(now, start, BUSINESS_TIMEZONE, { within: ESSENTIAL_URGENT_WITHIN_MS }).getTime() === now.getTime()
  );
}

// --- Ce qui bloque « Publier » ---------------------------------------------------------------------------------------

export type PublishDraft = {
  photos: readonly DraftFeedPhoto[];
  caption: string;
  preparing?: boolean;
  author: Pick<PublishAuthor, "persona">;
  /** L'événement choisi, tel que l'API l'a rendu (`hasVisual` : une affiche existe). */
  event: Pick<AttachableEventItem, "hasVisual"> | null;
  important: { on: boolean; reason: ImportantReason | null };
};

/**
 * La ligne « ce qui manque » (jamais un bouton principal grisé sans elle), ou `null`. Dans cet ordre : préparation en cours ;
 * visuel (T1 : une photo, sauf pour une publication rattachée à un événement qui a une affiche, avec une légende) ;
 * décision de plaque de chaque photo ; légende trop longue ; « Info importante » sans motif.
 */
export function publishIssueR8(draft: PublishDraft): string | null {
  if (draft.preparing) return L.preparing;
  if (draft.photos.length === 0) {
    if (!draft.event) return L.missingPhoto;
    if (!draft.event.hasVisual) return T.noPoster;
    if (draft.caption.trim().length === 0) return T.posterNeedsCaption;
  }
  if (draft.photos.length > FEED_POST_PHOTOS_MAX) return T.tooManyPhotos;
  const open = firstUndecidedPhoto(draft.photos);
  if (open >= 0) {
    const p = draft.photos[open] as DraftFeedPhoto;
    return p.rects.length > 0 ? L.placeFrame(open + 1) : L.missingPlate(open + 1);
  }
  const max = captionMaxOf(draft.author);
  if (draft.caption.trim().length > max)
    return draft.author.persona === "fan" ? L.captionTooLong : T.captionTooLongPage;
  if (draft.important.on && !draft.important.reason) return publicationErrors.importantReasonRequired;
  return null;
}

/**
 * Le corps de `POST /me/feed-posts`. **Jamais de rôle** (l'API le déduit des droits) ; `vehicleId` et `commercialPartnerId`
 * seulement pour « Moi » ; `placeLabel` seulement sans événement ; `important` seulement coché, avec son motif.
 */
export function feedPostBodyR8(draft: {
  photos: readonly (DraftFeedPhoto & { uploadKey: string })[];
  caption: string;
  aspect: FeedAspect;
  clientId: string;
  author: PublishAuthor;
  eventId: string | null;
  vehicleId: string | null;
  placeLabel: string;
  important: { on: boolean; reason: ImportantReason | null };
  commercialPartnerId?: string | null;
}) {
  const fan = draft.author.persona === "fan";
  const place = draft.placeLabel.trim().slice(0, FEED_PLACE_LABEL_MAX);
  return {
    caption: draft.caption.trim() || null,
    aspect: draft.aspect,
    clientId: draft.clientId,
    persona: draft.author.persona,
    ...(draft.author.structureId ? { structureId: draft.author.structureId } : {}),
    ...(draft.author.proId ? { proId: draft.author.proId } : {}),
    eventId: draft.eventId,
    ...(fan ? { vehicleId: draft.vehicleId } : {}),
    ...(fan && draft.commercialPartnerId ? { commercialPartnerId: draft.commercialPartnerId } : {}),
    ...(!draft.eventId && place ? { placeLabel: place } : {}),
    ...(draft.important.on && draft.important.reason && draft.eventId
      ? { important: { reason: draft.important.reason } }
      : {}),
    photos: draft.photos.map((p) =>
      p.rects.length
        ? { uploadKey: p.uploadKey, plateRects: [...p.rects], noPlateConfirmed: false }
        : { uploadKey: p.uploadKey, plateRects: null, noPlateConfirmed: true },
    ),
  };
}

// --- « Ce que verront les autres » -----------------------------------------------------------------------------------

export type PublishSays = {
  authorName: string;
  logoUrl: string | null;
  /** « pour le Salon Argelès » ; `null` : « À l'instant ». */
  phrase: string | null;
  /** Le tampon « Présent » : seulement une sortie passée (elle n'est proposée que si ma présence est validée). */
  stamp: boolean;
  where: string;
};

export function publishSays(
  author: PublishAuthor,
  event: Pick<AttachableEventItem, "title" | "role" | "phase"> | null,
  important: boolean,
): PublishSays {
  return {
    authorName: author.name,
    logoUrl: author.logoUrl,
    phrase: event ? attachPhraseOf(event.role, event.phase, event.title) : null,
    stamp: event !== null && author.persona === "fan" && event.role === "attendee" && event.phase === "after",
    where: publishWhereText({
      destination: author.destination,
      role: event?.role ?? null,
      phase: event?.phase ?? "before",
      important,
    }),
  };
}

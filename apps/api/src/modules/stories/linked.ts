// Contenus partagés (lot R7f4, maquette R7.23) : ce qu'on peut partager (événement, voiture, publication du Fil, souvenir,
// résultat de vote), la carte rendue pour chacun, et le 9:16 composé par le serveur (fond aux couleurs du contenu + carte
// posée selon le cadrage de l'auteur). Toute règle de visibilité est ici : l'écran n'en applique aucune.
// Plaques : l'image NETTE d'une carte est toujours une image que l'API a le droit de montrer (`maskedPhoto` : plaque
// floutée ou « aucune plaque confirmée », ou véhicule non immatriculé ; une publication du Fil a sa décision de plaque) ;
// sans photo montrable, une voiture ne se partage pas. L'affiche d'un événement n'a pas de décision de plaque : elle ne
// sort jamais nette (carte au cadre de la marque, l'affiche ne sert que de fond fortement flouté). Jamais la plaque :
// rien ici ne lit ce champ.
import {
  BUSINESS_TIMEZONE,
  type ErrorCode,
  eventFormatLabels,
  type Frame,
  formatDayDate,
  localDate,
  maskedPhoto,
  type ShareDestination,
  type ShareInfo,
  type StoryLinkedView,
  type StoryLinkType,
  shareLabels,
} from "@orasso/shared";
import { asc, eq } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../../db/client";
import { events, eventVotes, feedPostPhotos, profiles, vehiclePhotos } from "../../db/schema";
import { env } from "../../env";
import { now } from "../../lib/deps";
import { AppError, notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { loadPostViews } from "../feed/posts";
import { canSeeEvent } from "../invitations/access";
import { memoriesService } from "../memories/service";
import { type VehicleWithAll, vehiclesRepo } from "../vehicles/repo";
import { storyLine, storyName, storyStats } from "../vehicles/share-image";
import type { ShareStat } from "../vehicles/share-story";
import { votesService } from "../votes/service";
import { CANVAS_H, type CardSpec, placeOnGround, renderCard, renderGround } from "./card";

/** Un contenu prêt à partager : ce que la carte dit, l'image qu'elle porte, l'état de plaque de la story qui en naît. */
export type LinkedContent = {
  type: StoryLinkType;
  id: string;
  title: string;
  subtitle: string;
  kicker: string;
  badge: string | null;
  stats: ShareStat[];
  stripe: boolean;
  /** Photo nette de la carte (déjà masquée), ou `null` : le cadre de la marque. Jamais l'affiche d'un événement. */
  image: Buffer | null;
  /** Image dont on tire le fond flouté (la photo de la carte, ou l'affiche d'un événement), ou `null`. */
  ground: Buffer | null;
  /** Vignette de la feuille (adresse publique de la photo ou de l'affiche), ou `null`. */
  imageUrl: string | null;
  /**
   * `blurred` : l'image montrée a sa plaque floutée (ou rien de lisible n'est montré : événement, souvenir) ;
   * `none_confirmed` : une confirmation réelle (« aucune plaque », véhicule non immatriculé) existe pour la photo montrée.
   */
  plate: "blurred" | "none_confirmed";
  /** Page publique à coller dans un message. */
  url: string;
  /** Événement du contenu (story : identification de sa structure, lien d'un vote ou d'un souvenir). */
  event: { id: string; slug: string; structureId: string } | null;
  /** Le contenu vient de moi (publication : l'export hors d'Orasso est réservé à l'auteur). */
  mine: boolean;
  /** Auteur public (publication : un compte privé ne se repartage pas). */
  authorPublic: boolean;
};

export type LinkedRefusal = {
  status: 403 | 404 | 409;
  code: ErrorCode;
  message: string;
  reason: string;
  /** Le nom du contenu quand il est connu et que le regard a le droit de le lire (voiture à soi sans photo montrable). */
  title?: string;
};
type Found = { ok: true; content: LinkedContent } | { ok: false; refusal: LinkedRefusal };

const origin = () => new URL(env.PUBLIC_URL).origin;
const refuse = (status: 403 | 404 | 409, code: ErrorCode, message: string, reason = message): Found => ({
  ok: false,
  refusal: { status, code, message, reason },
});

const withoutPrefix = (url: string | null): string | null =>
  url?.startsWith("/api/files/") ? url.slice("/api/files/".length) : null;

async function eventImage(e: { posterPhotoKey: string | null; posterKey: string | null }) {
  const key = e.posterPhotoKey ?? e.posterKey;
  return { key, data: key ? await storage.get(key) : null };
}

function eventDetail(
  e: { city: string | null; startsAt: Date; endsAt: Date },
  at: Date,
): { subtitle: string; live: boolean } {
  const live = e.startsAt <= at && at < e.endsAt;
  const day = formatDayDate(localDate(live ? e.endsAt : e.startsAt, BUSINESS_TIMEZONE), { now: at });
  return { subtitle: [e.city, live ? `jusqu'au ${day}` : day].filter(Boolean).join(" · "), live };
}

const publicEvents = {
  id: events.id,
  slug: events.slug,
  title: events.title,
  format: events.format,
  city: events.city,
  startsAt: events.startsAt,
  endsAt: events.endsAt,
  status: events.status,
  admission: events.admission,
  structureId: events.structureId,
  posterKey: events.posterKey,
  posterPhotoKey: events.posterPhotoKey,
};

type EventRowShare = Awaited<ReturnType<typeof loadEvent>>;
async function loadEvent(id: string) {
  const [e] = await db.select(publicEvents).from(events).where(eq(events.id, id));
  return e ?? null;
}

/** Un événement ne se repartage que publié et ouvert à tous (ni brouillon, ni annulé, ni sur invitation). */
const shareable = (e: { status: string; admission: string }) =>
  e.status === "published" && e.admission !== "invite_only";

/**
 * Éligibilité à l'export, UNE fonction par contenu, partagée par `inspect` (l'export refuse) et par `linkedViewsOf`
 * (`exportable`) : l'indicateur annonce exactement ce que l'export fera, sans charger d'image.
 */
const vehicleRefusal = (veh: VehicleWithAll | undefined, ownerId: string): Found | null => {
  if (!veh || veh.ownerId !== ownerId || veh.status !== "active") {
    return refuse(404, "not_found", shareLabels.errors.notFound);
  }
  if (!maskedPhoto(veh.photos, veh.unregistered)) {
    const refused = refuse(409, "no_masked_photo", shareLabels.errors.noPhoto, shareLabels.reasons.vehicleNoPhoto);
    if (!refused.ok) refused.refusal.title = storyName(veh);
    return refused;
  }
  return null;
};

/** Un vote ne sort que clos, avec un classement et un gagnant. */
const voteRefusal = (view: { state: string; ranking?: readonly unknown[] | null } | null): Found | null => {
  if (!view) return refuse(404, "not_found", shareLabels.errors.notFound);
  if (view.state !== "closed")
    return refuse(409, "vote_open", shareLabels.errors.voteOpen, shareLabels.reasons.voteOpen);
  if (!view.ranking?.[0]) return refuse(409, "no_ranking", shareLabels.errors.notFound, shareLabels.reasons.noRanking);
  return null;
};

async function eventContent(e: NonNullable<EventRowShare>, type: StoryLinkType, extra: Partial<LinkedContent> = {}) {
  const at = now();
  const { subtitle, live } = eventDetail(e, at);
  const img = await eventImage(e);
  return {
    type,
    id: type === "event" || type === "memory" ? e.id : (extra.id ?? e.id),
    title: e.title,
    subtitle,
    kicker: eventFormatLabels[e.format],
    badge: live ? shareLabels.badgeLive : null,
    stats: [],
    stripe: false,
    // L'affiche n'a pas de décision de plaque : jamais nette sur une carte ; seulement un fond illisible.
    image: null,
    ground: img.data,
    imageUrl: storage.url(img.key),
    plate: "blurred" as const,
    url: `${origin()}/e/${e.slug}`,
    event: { id: e.id, slug: e.slug, structureId: e.structureId },
    mine: false,
    authorPublic: true,
    ...extra,
  } satisfies LinkedContent;
}

/** Cherche le contenu et dit s'il peut être partagé par ce regard (jamais une exception : la raison est rendue). */
export async function inspect(v: Viewer, type: StoryLinkType, id: string): Promise<Found> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return refuse(404, "not_found", shareLabels.errors.notFound);
  }
  const at = now();
  if (type === "event") {
    const e = await loadEvent(id);
    // Un brouillon ou un événement sur invitation ne se partage pas (comme l'autocollant d'événement : écarté).
    if (!e || !shareable(e) || !(await canSeeEvent(e, v))) {
      return refuse(404, "not_found", shareLabels.errors.notFound);
    }
    return { ok: true, content: await eventContent(e, "event") };
  }
  if (type === "vehicle") {
    const veh = await vehiclesRepo.findFullById(id);
    if (!veh) return refuse(404, "not_found", shareLabels.errors.notFound);
    const blocked = vehicleRefusal(veh, v.user.id);
    if (blocked) return blocked;
    const photo = maskedPhoto(veh.photos, veh.unregistered);
    if (!photo) return refuse(404, "not_found", shareLabels.errors.notFound);
    const category = veh.categories
      .map((c) => c.category)
      .filter((c) => c.active)
      .sort((a, b) => a.position - b.position)[0];
    const photoData = await storage.get(photo.storageKey);
    return {
      ok: true,
      content: {
        type,
        id: veh.id,
        title: storyName(veh),
        subtitle: storyLine(veh),
        kicker: [category?.label, `@${v.profile.pseudo}`].filter(Boolean).join(" · "),
        badge: null,
        stats: storyStats(veh),
        stripe: true,
        image: photoData,
        ground: photoData,
        imageUrl: storage.url(photo.storageKey),
        plate: photo.plateBlurred ? "blurred" : "none_confirmed",
        url: `${origin()}/v/${veh.id}`,
        event: null,
        mine: true,
        authorPublic: true,
      },
    };
  }
  if (type === "feed_post") {
    const [post] = await loadPostViews(db, [id], v.user.id, at);
    if (!post) return refuse(404, "not_found", shareLabels.errors.notFound);
    // Auteur lu par sa clé (`u:<compte>`), jamais par le pseudo : pour une page, `pseudo` est le nom de la page.
    const [author] =
      post.author.kind === "user"
        ? await db
            .select({ visibility: profiles.visibility })
            .from(profiles)
            .where(eq(profiles.userId, post.author.key.slice(2)))
        : [];
    const [first] = await db
      .select()
      .from(feedPostPhotos)
      .where(eq(feedPostPhotos.postId, id))
      .orderBy(asc(feedPostPhotos.position))
      .limit(1);
    if (!first) return refuse(404, "not_found", shareLabels.errors.notFound);
    const firstData = await storage.get(first.storageKey);
    const excerpt = post.caption
      ? post.caption.length > 72
        ? `${post.caption.slice(0, 71).trimEnd()}…`
        : post.caption
      : "";
    return {
      ok: true,
      content: {
        type,
        id,
        title: `@${post.author.pseudo}`,
        subtitle: excerpt,
        kicker: shareLabels.kicker.feed_post,
        badge: null,
        stats: [],
        stripe: false,
        image: firstData,
        ground: firstData,
        imageUrl: null,
        plate: first.plateBlurred ? "blurred" : "none_confirmed",
        url: `${origin()}/app/fil`,
        event: null,
        mine: post.mine,
        authorPublic: author?.visibility !== "private",
      },
    };
  }
  if (type === "memory") {
    const detail = await memoriesService.detail(v.user.id, id).catch(() => null);
    if (!detail) return refuse(404, "not_found", shareLabels.errors.notFound);
    const e = await loadEvent(id);
    if (!e) return refuse(404, "not_found", shareLabels.errors.notFound);
    return {
      ok: true,
      content: {
        ...(await eventContent(e, "memory")),
        kicker: shareLabels.kicker.memory,
        subtitle: [shareLabels.memoryYears(detail.yearsAgo), e.city].filter(Boolean).join(" · "),
        badge: shareLabels.memoryYears(detail.yearsAgo),
        mine: true,
      },
    };
  }
  // vote_result : le gagnant d'un vote clos, tel que ce regard a le droit de le voir (`canSeeRanking`).
  const [vote] = await db
    .select({ id: eventVotes.id, eventId: eventVotes.eventId })
    .from(eventVotes)
    .where(eq(eventVotes.id, id));
  if (!vote) return refuse(404, "not_found", shareLabels.errors.notFound);
  const e = await loadEvent(vote.eventId);
  // Même règle que l'événement : un classement ne se repartage pas depuis un événement sur invitation ou non publié
  // (lire un résultat n'est pas le repartager).
  if (!e || !shareable(e) || !(await canSeeEvent(e, v))) return refuse(404, "not_found", shareLabels.errors.notFound);
  const view = await votesService.get(v, vote.eventId, id).catch(() => null);
  const voteBlocked = voteRefusal(view);
  if (voteBlocked) return voteBlocked;
  const winner = view?.ranking?.[0];
  if (!view || !winner) return refuse(404, "not_found", shareLabels.errors.notFound);
  const key = withoutPrefix(winner.photoUrl);
  const winnerData = key ? await storage.get(key) : null;
  // L'état de plaque réel de la photo du gagnant (floutée, ou confirmée sans plaque) ; sans photo, rien n'est montré.
  const [winnerPhoto] = key
    ? await db
        .select({ blurred: vehiclePhotos.plateBlurred })
        .from(vehiclePhotos)
        .where(eq(vehiclePhotos.storageKey, key))
        .limit(1)
    : [];
  return {
    ok: true,
    content: {
      type,
      id,
      title: winner.vehicleLabel,
      subtitle: [winner.pseudo, e.title].filter(Boolean).join(" · "),
      kicker: view.title,
      badge: shareLabels.badgeFirst(winner.votes),
      stats: [],
      stripe: true,
      image: winnerData,
      ground: winnerData,
      imageUrl: winner.photoUrl,
      plate: winnerPhoto && !winnerPhoto.blurred ? "none_confirmed" : "blurred",
      url: `${origin()}/e/${e.slug}`,
      event: { id: e.id, slug: e.slug, structureId: e.structureId },
      mine: false,
      authorPublic: true,
    },
  };
}

export class LinkedError extends AppError {
  constructor(r: LinkedRefusal) {
    super(r.status, r.code, r.message);
  }
}

/** Le contenu ou l'erreur HTTP (404 introuvable, 409 pas encore, 403 pas à toi). */
export async function loadLinked(v: Viewer, type: StoryLinkType, id: string): Promise<LinkedContent> {
  const found = await inspect(v, type, id);
  if (!found.ok) throw new LinkedError(found.refusal);
  return found.content;
}

export const cardSpecOf = (c: LinkedContent): CardSpec => ({
  kicker: c.kicker,
  title: c.title,
  subtitle: c.subtitle,
  badge: c.badge,
  stats: c.stats,
  stripe: c.stripe,
  photo: c.image,
});

/** La carte seule (PNG à fond transparent, 1080 × 1350). */
export async function renderLinkedCard(c: LinkedContent): Promise<Buffer> {
  return renderCard(cardSpecOf(c));
}

/** Le fond d'une story (1080 × 1920) aux couleurs du contenu, ou d'une publication (1080 × 1350). */
export async function renderLinkedGround(c: LinkedContent, height: number): Promise<Buffer> {
  // L'affiche d'un événement (sans décision de plaque) ne sert que de fond fortement flouté.
  return renderGround(c.ground, 1080, height, c.type === "event" || c.type === "memory");
}

/** Le 9:16 final d'une story de carte : fond + carte posée selon le cadrage (WebP q80). Aucune plaque lisible par construction. */
export async function composeLinkedStory(
  c: LinkedContent,
  frame?: Frame,
): Promise<{ data: Buffer; width: number; height: number }> {
  const [card, ground] = await Promise.all([renderLinkedCard(c), renderLinkedGround(c, 1920)]);
  const flat = await placeOnGround(ground, card, { width: 1080, height: 1920 }, frame);
  const out = await sharp(flat).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  return { data: out.data, width: out.info.width, height: out.info.height };
}

/** Le 4:5 d'une publication de carte (PNG, 1080 × 1350). */
export async function composeLinkedPost(c: LinkedContent): Promise<Buffer> {
  const [card, ground] = await Promise.all([renderLinkedCard(c), renderLinkedGround(c, CANVAS_H)]);
  return placeOnGround(ground, card, { width: 1080, height: CANVAS_H });
}

// --- La feuille « Partager » ---------------------------------------------------------------------------------------------

const CLOSED: Record<ShareDestination, boolean> = { story: false, feed: false, message: false, external: false };

/** Les destinations ouvertes pour ce contenu et ce regard ; une fermée dit pourquoi (`reasons`). */
export async function shareInfo(v: Viewer, type: StoryLinkType, id: string): Promise<ShareInfo> {
  const found = await inspect(v, type, id);
  const link = shareLabels.link[type];
  if (!found.ok) {
    if (found.refusal.status === 404) throw notFound(shareLabels.errors.notFound);
    // Contenu connu mais pas partageable maintenant (voiture sans photo, vote ouvert) : tout est fermé, avec la raison,
    // sauf l'envoi du lien en message pour une voiture (la page publique n'a pas besoin de la photo) et, pour une voiture
    // sans photo montrable, l'affiche à trois styles du lot 50 (« Vers l'extérieur ») : c'est elle, avec sa vérification
    // de plaque, qui produit une photo sûre. Seules les destinations qui montreraient la photo nette restent fermées.
    const reason = found.refusal.reason;
    const poster = type === "vehicle" && found.refusal.code === "no_masked_photo";
    return {
      type,
      id,
      // Le nom de la voiture (à soi) reste : « En message » et l'en-tête de la feuille ne partent jamais sans.
      title: poster ? (found.refusal.title ?? "") : "",
      subtitle: "",
      imageUrl: null,
      linkLabel: link,
      // Voiture sans photo montrable : le message porte tout de même sa page publique (jamais l'accueil).
      url: type === "vehicle" ? `${origin()}/v/${id}` : `${origin()}/`,
      destinations: { ...CLOSED, message: type === "vehicle", external: poster },
      reasons: poster ? { story: reason, feed: reason } : { story: reason, feed: reason, external: reason },
      organizerNotified: null,
      formats: [],
    };
  }
  const c = found.content;
  const feedOk = type === "event" || type === "vehicle";
  const externalOk = type !== "feed_post" || c.mine;
  const storyOk = type !== "feed_post" || c.mine || c.authorPublic;
  const reasons: ShareInfo["reasons"] = {};
  if (!storyOk) reasons.story = shareLabels.reasons.privateFeed;
  if (!feedOk) reasons.feed = type === "memory" ? shareLabels.reasons.memoryPrivate : shareLabels.reasons.feedLimited;
  if (!externalOk)
    reasons.external =
      type === "feed_post" && !c.authorPublic
        ? shareLabels.reasons.privateFeed
        : shareLabels.reasons.externalAuthorOnly;
  const profilePublic = v.profile.visibility !== "private";
  return {
    type,
    id,
    title: c.title,
    subtitle: type === "vehicle" ? shareLabels.subtitleVehicle : c.subtitle,
    imageUrl: c.imageUrl,
    linkLabel: link,
    url: c.url,
    destinations: { story: storyOk, feed: feedOk, message: true, external: externalOk },
    reasons,
    organizerNotified: type === "event" ? profilePublic : null,
    formats: externalOk ? (type === "feed_post" ? ["post"] : ["story", "post"]) : [],
  };
}

// --- Lecture d'une story : la carte touchable ----------------------------------------------------------------------------

/**
 * Le contenu lié d'une story, refiltré pour ce lecteur à chaque lecture : un contenu supprimé, devenu privé ou plus
 * visible pour lui donne `null` (la carte, qui fait partie de l'image, devient inerte ; rien de lui n'est renvoyé).
 * `eventBy` et `vehicleBy` : ce que `serializeStories` a déjà lu.
 */
export async function linkedViewsOf(
  v: Viewer,
  rows: readonly {
    story: { id: string; authorId: string; linkedType: StoryLinkType | null; linkedId: string | null };
  }[],
  known: {
    event: Map<string, { id: string; slug: string; title: string; status: string; admission: string }>;
    /** Les voitures actives lues par `serializeStories` (propriétaire, photos, nom). */
    vehicle: Map<string, VehicleWithAll>;
  },
): Promise<Map<string, StoryLinkedView>> {
  const out = new Map<string, StoryLinkedView>();
  const voteViews = new Map<string, Awaited<ReturnType<typeof votesService.get>> | null>();
  const at = now();
  for (const { story: s } of rows) {
    if (!s.linkedType || !s.linkedId) continue;
    const label = shareLabels.link[s.linkedType];
    if (s.linkedType === "event") {
      const e = known.event.get(s.linkedId);
      if (e)
        out.set(s.id, {
          type: "event",
          id: s.linkedId,
          label,
          slug: e.slug,
          eventId: e.id,
          title: e.title,
          // Annulé, brouillon ou sur invitation : la carte reste lisible, mais l'export est refusé (même règle qu'`inspect`).
          exportable: shareable(e),
        });
    } else if (s.linkedType === "vehicle") {
      const veh = known.vehicle.get(s.linkedId);
      if (veh && veh.ownerId === s.authorId) {
        out.set(s.id, {
          type: "vehicle",
          id: s.linkedId,
          label,
          slug: null,
          eventId: null,
          title: null,
          exportable: vehicleRefusal(veh, s.authorId) === null,
        });
      }
    } else if (s.linkedType === "feed_post") {
      // Une publication du Fil : visible pour ce lecteur (compte privé non suivi : non), jamais pour un auteur devenu privé
      // sans que le lecteur le suive : `loadPostViews` applique la règle du Fil.
      const [post] = await loadPostViews(db, [s.linkedId], v.user.id, at);
      // L'export d'une publication ne sort que de la main de son auteur (comme `exportService.story`).
      if (post) {
        out.set(s.id, {
          type: "feed_post",
          id: s.linkedId,
          label,
          slug: null,
          eventId: null,
          title: null,
          exportable: post.author.pseudo === v.profile.pseudo,
        });
      }
    } else if (s.linkedType === "memory") {
      // Un souvenir est personnel : seul son auteur (celui du tampon) l'ouvre.
      if (s.authorId === v.user.id && (await memoriesService.detail(v.user.id, s.linkedId).catch(() => null))) {
        out.set(s.id, {
          type: "memory",
          id: s.linkedId,
          label,
          slug: null,
          eventId: s.linkedId,
          title: null,
          exportable: true,
        });
      }
    } else {
      const [vote] = await db
        .select({ id: eventVotes.id, eventId: eventVotes.eventId, title: eventVotes.title })
        .from(eventVotes)
        .where(eq(eventVotes.id, s.linkedId));
      const e = vote ? await loadEvent(vote.eventId) : null;
      // Même règle qu'au partage : un classement d'un événement sur invitation ou non publié n'est plus ouvrable.
      if (vote && e && shareable(e) && (await canSeeEvent(e, v))) {
        // Le classement ne sert qu'à dire à l'auteur si sa story s'exporte : jamais chargé pour un autre lecteur, et une
        // seule fois par vote pendant cette lecture (plusieurs stories du même vote).
        let view: Awaited<ReturnType<typeof votesService.get>> | null = null;
        if (s.authorId === v.user.id) {
          if (!voteViews.has(vote.id)) {
            voteViews.set(vote.id, await votesService.get(v, vote.eventId, vote.id).catch(() => null));
          }
          view = voteViews.get(vote.id) ?? null;
        }
        out.set(s.id, {
          type: "vote_result",
          id: vote.id,
          label,
          slug: e.slug,
          eventId: vote.eventId,
          title: vote.title,
          exportable: voteRefusal(view) === null,
        });
      }
    }
  }
  return out;
}

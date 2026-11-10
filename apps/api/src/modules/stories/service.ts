// Stories photo (lot R7f1, ARCHITECTURE-R7 § 2.5) : publier, supprimer, vue, flamme, réponse, signalement, mutes,
// retrait d'une identification. Toute règle est ici ou dans `@orasso/shared` (jamais seulement dans l'écran).
// Invariants : la plaque est décidée pour toute photo, quel que soit le public (crew compris) ; une story de crew ne
// s'identifie ni ne se lie hors du crew ; un compte privé ne publie pas en public et n'identifie ni structure, ni pro,
// ni événement ; l'original n'est jamais gardé.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  type AudienceStory,
  canSeeStory,
  canTag,
  directKey,
  type Frame,
  STORY_LIVE_MAX,
  STORY_TAGS_MAX,
  STORY_VIEWERS_MAX,
  type StoryCreate,
  type StoryCreated,
  type StoryDenial,
  type StoryReplyResult,
  type StoryTagInput,
  type StoryTagKind,
  shareLabels,
  storyAuthorKeyOf,
  storyDenial,
  storyExpiresAt,
  storyLabels,
  type UploadPurpose,
} from "@orasso/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  contactRequests,
  conversations,
  crewMembers,
  crews,
  events as events_,
  mediaProfiles,
  messages,
  notifications,
  proFollows,
  profiles,
  proProfiles,
  providerProfiles,
  stories,
  storyMutes,
  storyReactions,
  storyTags,
  storyViews,
  structureFollows,
  structureMembers,
  structures,
  uploads,
  userFollows,
} from "../../db/schema";
import { requireOrganizer } from "../../lib/access";
import { now } from "../../lib/deps";
import { AppError, forbidden, notFound, validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Tx, withTx } from "../../lib/tx";
import { canSeeEvent } from "../invitations/access";
import { canTalkDirect } from "../messaging/access/direct";
import { isStructureOrganizer } from "../messaging/access/organizer";
import { contactsService } from "../messaging/contacts";
import { messagingService } from "../messaging/service";
import { moderationService } from "../moderation/service";
import { notificationsService } from "../notifications/service";
import { commercialPartnerFor, notifyPartnerMention } from "../partnerships/commercial";
import { profilesRepo } from "../profiles/repo";
import { uploadsService } from "../uploads/service";
import { removeOrRetry } from "../vehicles/photos-blur";
import { vehiclesRepo } from "../vehicles/repo";
import {
  accountActive,
  audienceStoryOf,
  authorKeyOf,
  notMaskedCopy,
  relationOf,
  type StoryRow,
  selectStories,
  setsFor,
  viewerOf,
} from "./common";
import { composeStoryPhoto } from "./compose";
import { purgeStoryFiles } from "./expire";
import { composeLinkedStory, inspect, type LinkedContent, loadLinked } from "./linked";
import { softDeleteWithCopies } from "./purge";
import { dropCopiesOfTag } from "./share";
import { managedStructures } from "./sharing";

export { softDeleteWithCopies };

type Skipped = StoryCreated["skipped"];

const suspended = (v: Viewer) => Boolean(v.profile.suspendedUntil && v.profile.suspendedUntil > now());

function denialError(d: StoryDenial): AppError {
  if (d === "crew_only") return new AppError(403, "crew_only", storyLabels.crewOnly);
  if (d === "unavailable") return notFound("Story introuvable");
  if (d === "no_session") return new AppError(401, "unauthenticated", "Connexion requise");
  return forbidden();
}

/** Une story vivante que le regard voit, ou l'erreur (404 introuvable / expirée, 403 refus). */
export async function requireVisibleStory(v: Viewer, id: string, ex: Tx | typeof db = db): Promise<StoryRow> {
  const at = now();
  const [row] = await selectStories(eq(stories.id, id), ex);
  if (!row || row.story.deletedAt || row.story.status !== "ready" || row.story.expiresAt <= at) {
    throw notFound("Story introuvable");
  }
  const sets = await setsFor(v.user.id, [row], ex);
  const denial = storyDenial(viewerOf(v), audienceStoryOf(row, at), relationOf(sets, row));
  if (denial) throw denialError(denial);
  return row;
}

/** Les liens d'une personne avec l'auteur d'une story qu'elle ne publie pas (pour juger si elle la verrait). */
async function seesStory(
  userId: string,
  story: AudienceStory,
  ctx: { structureId: string | null; proId: string | null },
) {
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (!p || !accountActive(p, now())) return false;
  let followAccepted = false;
  if (ctx.structureId) {
    followAccepted = Boolean(
      (
        await db
          .select()
          .from(structureFollows)
          .where(and(eq(structureFollows.userId, userId), eq(structureFollows.structureId, ctx.structureId)))
      )[0],
    );
  } else if (ctx.proId) {
    followAccepted = Boolean(
      (
        await db
          .select()
          .from(proFollows)
          .where(and(eq(proFollows.userId, userId), eq(proFollows.proId, ctx.proId)))
      )[0],
    );
  } else {
    followAccepted = Boolean(
      (
        await db
          .select()
          .from(userFollows)
          .where(
            and(
              eq(userFollows.followerId, userId),
              eq(userFollows.followedId, story.authorId),
              eq(userFollows.status, "accepted"),
            ),
          )
      )[0],
    );
  }
  const member = story.crewId
    ? Boolean(
        (
          await db
            .select()
            .from(crewMembers)
            .innerJoin(crews, eq(crews.id, crewMembers.crewId))
            .where(
              and(
                eq(crewMembers.crewId, story.crewId),
                eq(crewMembers.userId, userId),
                eq(crewMembers.status, "active"),
                isNull(crews.deletedAt),
              ),
            )
        )[0],
      )
    : false;
  return canSeeStory({ id: userId, active: true }, story, {
    followAccepted,
    crewMemberActive: (id) => id === story.crewId && member,
  });
}

async function checkPersona(v: Viewer, input: StoryCreate) {
  const { persona, audience } = input;
  if (audience === "crew") {
    if (persona !== "fan") throw validation(storyLabels.crewAudiencePersona);
    if (!input.crewId) throw validation("Choisis le crew", { field: "crewId" });
    const [m] = await db
      .select({ id: crewMembers.userId })
      .from(crewMembers)
      .innerJoin(crews, eq(crews.id, crewMembers.crewId))
      .where(
        and(
          eq(crewMembers.crewId, input.crewId),
          eq(crewMembers.userId, v.user.id),
          eq(crewMembers.status, "active"),
          isNull(crews.deletedAt),
        ),
      );
    if (!m) throw forbidden(storyLabels.notMember);
  } else if (input.crewId) {
    throw validation("Un crew n'a de sens que pour une story de crew", { field: "crewId" });
  }
  if (persona === "fan") {
    if (input.structureId || input.proId) throw validation("Casquette inattendue");
    if (v.profile.visibility === "private" && audience === "public") throw validation(storyLabels.privateAccountPublic);
    return;
  }
  if (persona === "organizer") {
    if (!input.structureId) throw validation("Choisis la structure", { field: "structureId" });
    const [m] = await db
      .select({ role: structureMembers.role })
      .from(structureMembers)
      .innerJoin(structures, eq(structures.id, structureMembers.structureId))
      .where(
        and(
          eq(structureMembers.structureId, input.structureId),
          eq(structureMembers.userId, v.user.id),
          eq(structureMembers.status, "active"),
          inArray(structureMembers.role, ["owner", "co_organizer"]),
          isNull(structures.deletedAt),
          sql`${structures.verification} <> 'suspended'`,
        ),
      );
    if (!m) throw forbidden(storyLabels.notOrganizer);
    // Lot R7h, tour 3 : publier au nom d'une structure exige le second facteur, comme le repartage et le retrait.
    await requireOrganizer(v, input.structureId);
    return;
  }
  if (persona === "pro") {
    if (!input.proId) throw validation("Choisis la fiche pro", { field: "proId" });
    const [p] = await db
      .select({ id: proProfiles.id })
      .from(proProfiles)
      .where(
        and(eq(proProfiles.id, input.proId), eq(proProfiles.ownerUserId, v.user.id), isNull(proProfiles.deletedAt)),
      );
    if (!p) throw forbidden(storyLabels.notPro);
    return;
  }
  if (persona === "provider") {
    const [p] = await db
      .select({ id: providerProfiles.id })
      .from(providerProfiles)
      .where(eq(providerProfiles.userId, v.user.id))
      .limit(1);
    if (!p) throw forbidden(storyLabels.personaUnavailable);
    return;
  }
  const [m] = await db
    .select({ id: mediaProfiles.id })
    .from(mediaProfiles)
    .where(and(eq(mediaProfiles.userId, v.user.id), isNull(mediaProfiles.deletedAt)));
  if (!m) throw forbidden(storyLabels.personaUnavailable);
}

async function notifyPublished(
  tx: Tx,
  story: {
    id: string;
    authorId: string;
    persona: string;
    structureId: string | null;
    proId: string | null;
    audience: string;
  },
  authorKey: { kind: StoryTagKind; id: string; key: string },
  name: string,
  /** Les personnes à prévenir d'une identification (elles-mêmes ou, pour une structure ou un pro, ses responsables). */
  mentions: { userId: string; body: string; target: Record<string, string> }[],
  /** L'auteur affiché : pour une structure ou un pro, son nom et son logo, jamais le compte personnel de qui publie. */
  actor: { userId?: string; pseudo: string; avatarUrl: string | null },
) {
  const link = `/app/story/${authorKey.key}`;
  const data = { actor, storyId: story.id, authorKey: authorKey.key, link };
  // Identifiés : une notification chacun, jamais de vignette (invariant des stories de crew).
  for (const m of mentions) {
    if (m.userId === story.authorId) continue;
    // Lot R7h : `target` dit qui est identifié (moi, ma structure, ma fiche pro) : la ligne d'Activité en tire ses boutons.
    await notificationsService.notify(tx, m.userId, "story_mention", {
      title: storyLabels.mentionTitle(actor.pseudo),
      body: m.body,
      data: { ...data, ...m.target },
    });
  }
  const tagged = mentions.map((m) => m.userId);
  // Journal des abonnés acceptés : jamais pour une story de crew (même l'existence reste dans le crew).
  if (story.audience === "crew") return;
  const rows =
    authorKey.kind === "structure"
      ? await tx
          .select({ id: structureFollows.userId })
          .from(structureFollows)
          .where(eq(structureFollows.structureId, authorKey.id))
      : authorKey.kind === "pro"
        ? await tx.select({ id: proFollows.userId }).from(proFollows).where(eq(proFollows.proId, authorKey.id))
        : await tx
            .select({ id: userFollows.followerId })
            .from(userFollows)
            .where(and(eq(userFollows.followedId, authorKey.id), eq(userFollows.status, "accepted")));
  const audience = rows.map((r) => r.id).filter((id) => id !== story.authorId && !tagged.includes(id));
  if (!audience.length) return;
  const muted = await tx
    .select({ id: storyMutes.userId })
    .from(storyMutes)
    .where(
      and(
        eq(storyMutes.authorKind, authorKey.kind),
        eq(storyMutes.authorId, authorKey.id),
        inArray(storyMutes.userId, audience),
      ),
    );
  // Une seule actualité non lue par auteur et par 6 h et par abonné (cinq stories d'affilée, une ligne).
  const recent = await tx
    .select({ id: notifications.userId })
    .from(notifications)
    .where(
      and(
        eq(notifications.type, "story_published"),
        isNull(notifications.readAt),
        // `created_at` est écrit par la base : la fenêtre se lit à l'horloge de la base (comme les abonnements regroupés).
        sql`${notifications.createdAt} > now() - interval '6 hours'`,
        sql`${notifications.data} ->> 'authorKey' = ${authorKey.key}`,
        inArray(notifications.userId, audience),
      ),
    );
  const skip = new Set([...muted.map((m) => m.id), ...recent.map((r) => r.id)]);
  const targets = audience.filter((id) => !skip.has(id));
  await notificationsService.notifyMany(tx, targets, "story_published", {
    title: storyLabels.published(name),
    body: storyLabels.published(name),
    data,
  });
}

/**
 * Identifiant de publication, stable et lié à la personne et au fichier envoyé (`uploadKey`, tirée au hasard à chaque
 * envoi et à usage unique) : un fichier ne donne jamais qu'une story, quels que soient les réglages. Une reprise après
 * une réponse perdue retrouve la story au lieu d'en publier une seconde, même si la légende a changé entre-temps.
 * UUID de version 5 (hachage SHA-256), sans colonne ni migration.
 */
export function storyIdFor(userId: string, uploadKey: string): string {
  const h = createHash("sha256").update(`story:${userId}:${uploadKey}`).digest();
  h[6] = ((h[6] ?? 0) & 0x0f) | 0x50;
  h[8] = ((h[8] ?? 0) & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export const storiesService = {
  async create(v: Viewer, input: StoryCreate): Promise<StoryCreated> {
    if (suspended(v)) throw forbidden("Ton compte est suspendu : lecture seule.");
    // Reprise : cette publication existe déjà (la réponse s'est perdue) → la même story, sans doublon ni erreur.
    // Une carte liée (R7f4) n'a pas de fichier envoyé : l'identifiant de l'appareil (`clientId`) tient lieu de clé d'envoi.
    const sendKey = input.uploadKey ?? `linked:${input.clientId}`;
    const id = storyIdFor(v.user.id, sendKey);
    const replay = async (): Promise<StoryCreated | null> => {
      const [done] = await db
        .select({ status: stories.status, expiresAt: stories.expiresAt })
        .from(stories)
        .where(and(eq(stories.id, id), eq(stories.authorId, v.user.id)));
      // `skipped` n'est pas relu : il dépendait des réglages du premier envoi, que rien ne garde (écart accepté, journal).
      return done
        ? { id, status: done.status, expiresAt: done.expiresAt.toISOString(), skipped: [], replayed: true }
        : null;
    };
    const again = await replay();
    if (again) return again;
    rateLimit("storyPublish", v.user.id);
    const rects = input.plateRects ?? [];
    // Photo : la décision de plaque est obligatoire quel que soit le public, crew compris (D38, « règle des plaques partout »).
    // Une carte liée n'a pas de photo de l'auteur : son image est déjà celle que l'API a le droit de montrer (`linked.ts`).
    if (input.uploadKey && !rects.length && !input.noPlateConfirmed) {
      throw new AppError(400, "plate_decision_required", storyLabels.plateDecisionRequired);
    }
    await checkPersona(v, input);

    const skipped: Skipped = [];
    const storyShape: AudienceStory = {
      authorId: v.user.id,
      audience: input.audience,
      crewId: input.audience === "crew" ? (input.crewId ?? null) : null,
      authorVisibility: input.persona === "organizer" || input.persona === "pro" ? "public" : v.profile.visibility,
      authorActive: true,
    };
    const author = { visibility: v.profile.visibility };
    const ctx = {
      structureId: input.persona === "organizer" ? (input.structureId ?? null) : null,
      proId: input.persona === "pro" ? (input.proId ?? null) : null,
    };

    // Voiture : la mienne et active.
    let vehicleId: string | null = null;
    if (input.vehicleId) {
      const veh = await vehiclesRepo.byId(input.vehicleId);
      if (veh && veh.ownerId === v.user.id && veh.status === "active") vehicleId = veh.id;
      else skipped.push({ kind: "vehicle", id: input.vehicleId, reason: storyLabels.skipped.not_yours });
    }

    // Autocollant d'événement et contenu lié (événement ou voiture seulement dans ce lot).
    // Lot R7f3 : l'organisateur d'un événement collé en autocollant est prévenu (identification de sa structure, avec les
    // règles ordinaires : jamais depuis un compte privé ni sur une story de crew). `stickerStructure` la mémorise.
    let stickerStructure: string | null = null;
    const eventOk = async (id: string, kind: "event" | "linked"): Promise<string | null> => {
      const [e] = await db
        .select({
          id: events_.id,
          status: events_.status,
          admission: events_.admission,
          structureId: events_.structureId,
        })
        .from(events_)
        .where(eq(events_.id, id));
      const refusal = canTag(author, storyShape, {
        kind: "event",
        canSee: true,
        // Un brouillon, un événement annulé ou sur invitation ne se colle pas en autocollant (comme un brouillon : écarté).
        available: Boolean(e && e.status === "published" && e.admission !== "invite_only" && (await canSeeEvent(e, v))),
      });
      if (refusal) {
        skipped.push({ kind: kind === "event" ? "event" : "event", id, reason: storyLabels.skipped[refusal] });
        return null;
      }
      if (kind === "event") stickerStructure = e?.structureId ?? null;
      return id;
    };
    const eventId = input.eventId ? await eventOk(input.eventId, "event") : null;
    let linked: { type: NonNullable<StoryCreate["linked"]>["type"]; id: string } | null = null;
    // Carte liée sans média (R7f4) : le serveur résout le contenu (visible, partageable par ce regard) et rendra le 9:16.
    let card: LinkedContent | null = null;
    if (!input.uploadKey && input.linked) {
      card = await loadLinked(v, input.linked.type, input.linked.id);
      if (card.type === "feed_post" && !card.mine && !card.authorPublic) {
        throw new AppError(403, "private_author", shareLabels.errors.privateAuthor);
      }
      linked = { type: card.type, id: card.id };
      // Partager un événement prévient son organisateur (identification de sa structure) seulement depuis un compte
      // public et hors d'une story de crew ; sinon la story part sans identification, sans rien écarter.
      if (card.type === "event" && card.event && author.visibility !== "private" && input.audience !== "crew") {
        stickerStructure = card.event.structureId;
      }
    } else if (input.linked) {
      if (input.linked.type === "event") {
        if (await eventOk(input.linked.id, "linked")) linked = input.linked;
      } else if (input.linked.type === "vehicle") {
        const veh = await vehiclesRepo.byId(input.linked.id);
        if (veh && veh.ownerId === v.user.id && veh.status === "active") linked = input.linked;
        else skipped.push({ kind: "vehicle", id: input.linked.id, reason: storyLabels.skipped.not_yours });
      } else {
        // Publication du Fil, souvenir, résultat de vote avec une photo à soi : le lien est gardé s'il est visible.
        const found = await inspect(v, input.linked.type, input.linked.id);
        if (found.ok) linked = input.linked;
        else skipped.push({ kind: "event", id: input.linked.id, reason: found.refusal.reason });
      }
    }

    // Identifications : on n'identifie que quelqu'un qui peut voir la story ; compte privé : ni structure, ni pro.
    const tags: { kind: StoryTagKind; id: string }[] = [];
    const seen = new Set<string>();
    // La structure de l'autocollant d'événement passe en premier : elle prend une place des `STORY_TAGS_MAX` (les
    // identifications de la personne suivent, la dernière écartée si le plafond est atteint).
    const wanted: StoryTagInput[] = [...input.tags];
    if (stickerStructure && stickerStructure !== ctx.structureId)
      wanted.unshift({ kind: "structure", id: stickerStructure });
    for (const t of wanted) {
      const key = `${t.kind}:${t.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let available = false;
      let canSee = false;
      if (t.kind === "user") {
        if (t.id === v.user.id) continue;
        const [p] = await db.select().from(profiles).where(eq(profiles.userId, t.id));
        available = Boolean(p && accountActive(p, now()));
        canSee = available && (await seesStory(t.id, storyShape, ctx));
      } else if (t.kind === "structure") {
        if (!/^[0-9a-f-]{36}$/i.test(t.id)) continue;
        const [s] = await db
          .select({ d: structures.deletedAt, ver: structures.verification })
          .from(structures)
          .where(eq(structures.id, t.id));
        available = Boolean(s && !s.d && s.ver !== "suspended");
        canSee = true;
      } else {
        if (!/^[0-9a-f-]{36}$/i.test(t.id)) continue;
        const [p] = await db.select({ d: proProfiles.deletedAt }).from(proProfiles).where(eq(proProfiles.id, t.id));
        available = Boolean(p && !p.d);
        canSee = true;
      }
      const refusal = canTag(author, storyShape, { kind: t.kind, canSee, available });
      if (refusal) skipped.push({ kind: t.kind, id: t.id, reason: storyLabels.skipped[refusal] });
      else if (tags.length >= STORY_TAGS_MAX)
        skipped.push({ kind: t.kind, id: t.id, reason: storyLabels.skipped.tags_full });
      else tags.push(t);
    }

    // « Collaboration commerciale » (R7m2) : posée par l'API d'après les identifications DEMANDÉES et la légende.
    const commercialPartnerId = await commercialPartnerFor(db, {
      authorId: v.user.id,
      ownProId: ctx.proId,
      tagProIds: input.tags.flatMap((t) => (t.kind === "pro" ? [t.id] : [])),
      caption: input.caption,
      explicit: input.commercialPartnerId,
    });

    // Le fichier envoyé : à moi, pour une story, pas encore rattaché (absent pour une carte liée).
    const uploadKey = input.uploadKey;
    const [pending] = uploadKey
      ? await db
          .select()
          .from(uploads)
          .where(
            and(
              eq(uploads.key, uploadKey),
              eq(uploads.userId, v.user.id),
              eq(uploads.purpose, "story" satisfies UploadPurpose),
              isNull(uploads.consumedAt),
            ),
          )
      : [];
    // Un envoi presque simultané peut arriver après l'enregistrement du premier (fichier consommé, source supprimée) :
    // on retrouve alors sa story avant de refuser.
    if (uploadKey && !pending) {
      const won = await replay();
      if (won) return won;
      throw validation("Image inconnue ou déjà utilisée : envoie-la à nouveau.");
    }
    const source = pending ? await storage.get(pending.key) : null;
    if (pending && !source) {
      const won = await replay();
      if (won) return won;
      throw validation("Image introuvable : envoie-la à nouveau.");
    }
    const frame: Frame | undefined = input.frame;
    const composed = card
      ? await composeLinkedStory(card, frame).then((c) => ({
          data: c.data,
          info: { width: c.width, height: c.height },
        }))
      : await composeStoryPhoto(source as Buffer, { frame, rects });

    const key = `private/stories/${id}/${randomBytes(8).toString("hex")}.webp`;
    await storage.put(key, composed.data);
    const at = now();
    try {
      await withTx(async (tx, after) => {
        // Plafond : 50 stories vivantes au plus par auteur (personne, structure ou pro), compté sous verrou.
        const capKey = ctx.structureId ? `s:${ctx.structureId}` : ctx.proId ? `p:${ctx.proId}` : `u:${v.user.id}`;
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`story-cap:${capKey}`}))`);
        const [live] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(stories)
          .where(
            and(
              sql`${stories.deletedAt} is null`,
              sql`${stories.expiresAt} > ${at}`,
              notMaskedCopy(at),
              ctx.structureId
                ? and(eq(stories.persona, "organizer"), eq(stories.structureId, ctx.structureId))
                : ctx.proId
                  ? and(eq(stories.persona, "pro"), eq(stories.proId, ctx.proId))
                  : and(sql`${stories.persona} not in ('organizer','pro')`, eq(stories.authorId, v.user.id)),
            ),
          );
        if ((live?.n ?? 0) >= STORY_LIVE_MAX) {
          throw new AppError(409, "too_many_stories", storyLabels.tooManyStories);
        }
        if (uploadKey) {
          const upload = await uploadsService.consume(tx, v.user.id, uploadKey, "story");
          if (!upload) throw validation("Image inconnue ou déjà utilisée : envoie-la à nouveau.");
        }
        const [row] = await tx
          .insert(stories)
          .values({
            id,
            authorId: v.user.id,
            persona: input.persona,
            structureId: ctx.structureId,
            proId: ctx.proId,
            audience: input.audience,
            crewId: storyShape.crewId,
            mediaKind: "photo",
            storageKey: key,
            width: composed.info.width,
            height: composed.info.height,
            status: "ready",
            plateState: card ? card.plate : rects.length ? "blurred" : "none_confirmed",
            caption: input.caption || null,
            placeLabel: input.placeLabel || null,
            vehicleId,
            eventId,
            linkedType: linked?.type ?? null,
            linkedId: linked?.id ?? null,
            commercialPartnerId,
            expiresAt: storyExpiresAt(at),
            createdAt: at,
            updatedAt: at,
          })
          .returning();
        if (!row) throw new Error("Story non enregistrée");
        if (tags.length) {
          await tx.insert(storyTags).values(tags.map((t) => ({ storyId: id, targetKind: t.kind, targetId: t.id })));
        }
        const authorKey =
          input.persona === "organizer" && ctx.structureId
            ? { kind: "structure" as const, id: ctx.structureId, key: storyAuthorKeyOf("structure", ctx.structureId) }
            : input.persona === "pro" && ctx.proId
              ? { kind: "pro" as const, id: ctx.proId, key: storyAuthorKeyOf("pro", ctx.proId) }
              : { kind: "user" as const, id: v.user.id, key: storyAuthorKeyOf("user", v.user.id) };
        // Auteur affiché : la structure ou le pro (nom + logo), sans `userId` ; la personne (pseudo + avatar) sinon.
        // Le compte personnel d'un co-organisateur n'apparaît jamais dans ce que reçoivent les abonnés.
        const shown =
          authorKey.kind === "structure"
            ? (
                await tx
                  .select({ n: structures.name, l: structures.logoKey })
                  .from(structures)
                  .where(eq(structures.id, authorKey.id))
              )[0]
            : authorKey.kind === "pro"
              ? (
                  await tx
                    .select({ n: proProfiles.name, l: proProfiles.logoKey })
                    .from(proProfiles)
                    .where(eq(proProfiles.id, authorKey.id))
                )[0]
              : undefined;
        if (authorKey.kind !== "user" && !shown) throw notFound("Auteur introuvable");
        const name = shown ? shown.n : v.profile.pseudo;
        const actor =
          authorKey.kind === "user"
            ? { userId: v.user.id, pseudo: v.profile.pseudo, avatarUrl: storage.url(v.profile.avatarKey) }
            : { pseudo: name, avatarUrl: storage.url(shown?.l ?? null) };
        // Identifiés : la personne elle-même ; une structure ou un pro, ses responsables (propriétaire et co-organisateurs
        // actifs, propriétaire de la fiche). Une personne n'est prévenue qu'une fois.
        const mentions = new Map<string, { body: string; target: Record<string, string> }>();
        const pseudo = name;
        for (const t of tags) {
          if (t.kind === "user") mentions.set(t.id, { body: storyLabels.mention(pseudo), target: { target: "user" } });
        }
        for (const t of tags) {
          if (t.kind === "structure") {
            const [named] = await tx.select({ n: structures.name }).from(structures).where(eq(structures.id, t.id));
            const owners = await tx
              .select({ id: structureMembers.userId })
              .from(structureMembers)
              .where(
                and(
                  eq(structureMembers.structureId, t.id),
                  eq(structureMembers.status, "active"),
                  inArray(structureMembers.role, ["owner", "co_organizer"]),
                ),
              );
            for (const o of owners) {
              if (!mentions.has(o.id))
                mentions.set(o.id, {
                  body: storyLabels.mentionStructure(pseudo, named?.n ?? "ta structure"),
                  target: { target: "structure", structureId: t.id },
                });
            }
          } else if (t.kind === "pro") {
            const [pro] = await tx
              .select({ owner: proProfiles.ownerUserId, n: proProfiles.name })
              .from(proProfiles)
              .where(eq(proProfiles.id, t.id));
            if (pro && !mentions.has(pro.owner))
              mentions.set(pro.owner, {
                body: storyLabels.mentionStructure(pseudo, pro.n),
                target: { target: "pro", proId: t.id },
              });
          }
        }
        await notifyPublished(
          tx,
          row,
          authorKey,
          name,
          [...mentions].map(([userId, m]) => ({ userId, body: m.body, target: m.target })),
          actor,
        );
        if (commercialPartnerId) {
          await notifyPartnerMention(tx, {
            proId: commercialPartnerId,
            authorUserId: v.user.id,
            already: [...mentions.keys()],
            kind: "story",
            actor,
            data: { storyId: id, authorKey: authorKey.key, link: `/app/story/${authorKey.key}` },
          });
        }
        after(() => notificationsService.kick());
      });
    } catch (error) {
      await removeOrRetry(key);
      // Deux envois identiques en même temps : le perdant retrouve la story du gagnant.
      const won = await replay().catch(() => null);
      if (won) return won;
      throw error;
    }
    // Le fichier d'origine n'est jamais gardé : si sa suppression échoue, elle est reprise par la tâche `storage.remove`.
    if (pending) await removeOrRetry(pending.key);
    return { id, status: "ready", expiresAt: storyExpiresAt(at).toISOString(), skipped };
  },

  /**
   * `DELETE /me/stories/:id` : l'auteur retire sa story ; ses copies partent avec elle, les fichiers aussi. Sur une copie,
   * c'est « Retirer » (l'originale reste). Lot R7h : une story au nom d'une structure se retire aussi par ses responsables
   * (propriétaire, co-organisateurs), pas seulement par la personne qui l'a publiée.
   */
  async remove(v: Viewer, id: string): Promise<void> {
    rateLimit("storyWrite", v.user.id);
    const [found] = await db
      .select({
        id: stories.id,
        authorId: stories.authorId,
        persona: stories.persona,
        structureId: stories.structureId,
      })
      .from(stories)
      .where(and(eq(stories.id, id), isNull(stories.deletedAt)));
    const mine =
      found &&
      (found.authorId === v.user.id ||
        (found.persona === "organizer" &&
          found.structureId !== null &&
          (await managedStructures(v.user.id)).has(found.structureId)));
    if (!mine) throw notFound("Story introuvable");
    // Une story au nom d'une structure se retire par la garde centralisée de l'organisateur (double authentification
    // obligatoire), y compris la sienne : c'est un geste fait au nom de la structure.
    if (found.persona === "organizer" && found.structureId) await requireOrganizer(v, found.structureId);
    // Dans une transaction : l'originale est verrouillée avant la recherche des copies (un partage en cours ne laisse
    // pas de copie derrière), puis les fichiers partent après la validation.
    const ids = await withTx((tx) => softDeleteWithCopies(tx, [id]));
    await purgeStoryFiles(ids);
  },

  async view(v: Viewer, id: string): Promise<void> {
    rateLimit("storyWrite", v.user.id);
    const row = await requireVisibleStory(v, id);
    if (row.story.authorId === v.user.id) return;
    await withTx(async (tx) => {
      const [added] = await tx
        .insert(storyViews)
        .values({ storyId: id, viewerId: v.user.id })
        .onConflictDoNothing()
        .returning({ id: storyViews.storyId });
      if (added) {
        await tx
          .update(stories)
          .set({ viewsCount: sql`${stories.viewsCount} + 1` })
          .where(eq(stories.id, id));
      }
    });
  },

  /**
   * Liste de ceux qui ont vu ma story : pour moi seul. `total` est le compteur relu à cet appel (jamais celui de l'ouverture
   * de la visionneuse) : le titre « Vues · N » et la mention « liste partielle » partent de lui.
   */
  async viewers(v: Viewer, id: string) {
    const [mine] = await db
      .select({ id: stories.id })
      .from(stories)
      .where(and(eq(stories.id, id), eq(stories.authorId, v.user.id), isNull(stories.deletedAt)));
    if (!mine) throw notFound("Story introuvable");
    const rows = await db
      .select({
        userId: profiles.userId,
        pseudo: profiles.pseudo,
        avatarKey: profiles.avatarKey,
        at: storyViews.viewedAt,
        d: profiles.deletedAt,
        b: profiles.bannedAt,
        s: profiles.suspendedUntil,
      })
      .from(storyViews)
      .innerJoin(profiles, eq(profiles.userId, storyViews.viewerId))
      .where(eq(storyViews.storyId, id))
      .orderBy(sql`${storyViews.viewedAt} desc`)
      .limit(STORY_VIEWERS_MAX);
    // Le compteur est relu après la liste : une vue arrivée entre les deux lectures ne le laisse jamais derrière la liste.
    const [counted] = await db.select({ n: stories.viewsCount }).from(stories).where(eq(stories.id, id));
    const at = now();
    return {
      total: Math.max(counted?.n ?? 0, rows.length),
      viewers: rows
        .filter((r) => !r.d && !r.b && !(r.s && r.s > at))
        .map((r) => ({
          userId: r.userId,
          pseudo: r.pseudo,
          avatarUrl: storage.url(r.avatarKey),
          viewedAt: r.at.toISOString(),
        })),
    };
  },

  async react(v: Viewer, id: string, on: boolean): Promise<{ reacted: boolean }> {
    rateLimit("storyWrite", v.user.id);
    const row = await requireVisibleStory(v, id);
    if (row.story.authorId === v.user.id) throw validation(storyLabels.notYours);
    await withTx(async (tx, after) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`story-like:${id}`}))`);
      if (!on) {
        const gone = await tx
          .delete(storyReactions)
          .where(and(eq(storyReactions.storyId, id), eq(storyReactions.userId, v.user.id)))
          .returning({ id: storyReactions.storyId });
        if (gone.length) {
          await tx
            .update(stories)
            .set({ reactionsCount: sql`greatest(${stories.reactionsCount} - 1, 0)` })
            .where(eq(stories.id, id));
        }
        return;
      }
      const [added] = await tx
        .insert(storyReactions)
        .values({ storyId: id, userId: v.user.id })
        .onConflictDoNothing()
        .returning({ id: storyReactions.storyId });
      if (!added) return;
      await tx
        .update(stories)
        .set({ reactionsCount: sql`${stories.reactionsCount} + 1` })
        .where(eq(stories.id, id));
      // Flamme regroupée : une ligne non lue par story (group_key `story_like:<id>`), complétée à chaque flamme.
      const groupKey = `story_like:${id}`;
      const actor = { userId: v.user.id, pseudo: v.profile.pseudo, avatarUrl: storage.url(v.profile.avatarKey) };
      const [open] = await tx
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, row.story.authorId),
            eq(notifications.type, "story_like"),
            isNull(notifications.readAt),
            sql`${notifications.data} ->> 'groupKey' = ${groupKey}`,
          ),
        )
        .for("update");
      if (open) {
        const data = open.data as { actorIds?: string[]; pseudos?: string[] };
        const actorIds = [v.user.id, ...(data.actorIds ?? []).filter((x) => x !== v.user.id)];
        const pseudos = [v.profile.pseudo, ...(data.pseudos ?? []).filter((x) => x !== v.profile.pseudo)].slice(0, 2);
        await tx
          .update(notifications)
          .set({ body: storyLabels.liked(pseudos, actorIds.length), data: { ...open.data, actor, actorIds, pseudos } })
          .where(eq(notifications.id, open.id));
      } else {
        await notificationsService.notify(tx, row.story.authorId, "story_like", {
          title: storyLabels.likedTitle,
          body: storyLabels.liked([v.profile.pseudo], 1),
          data: {
            actor,
            actorIds: [v.user.id],
            pseudos: [v.profile.pseudo],
            storyId: id,
            groupKey,
            link: `/app/story/${authorKeyOf(row)?.key ?? storyAuthorKeyOf("user", row.story.authorId)}`,
          },
        });
      }
      after(() => notificationsService.kick());
    });
    return { reacted: on };
  },

  /**
   * `POST /stories/:id/reply` : un message à l'auteur, avec `story_id` enregistré dans la transaction d'envoi.
   * - story d'une personne : message direct si elle me suit (ou demande de contact acceptée, ou si elle m'a écrit en
   *   dernier), sinon le mot part en demande de contact (le contexte suit à l'acceptation) ;
   * - story d'une structure : la conversation de la structure (messagerie organisateur), jamais le compte personnel de
   *   qui l'a publiée ;
   * - story d'un pro : aucune messagerie de pro n'existe → 403 `reply_unavailable`.
   * `clientId` (de l'appareil) est réutilisé pour l'envoi : une reprise réseau ne crée pas un second message.
   */
  async reply(v: Viewer, id: string, input: { text: string; clientId?: string }): Promise<StoryReplyResult> {
    if (suspended(v)) throw forbidden("Ton compte est suspendu : lecture seule.");
    rateLimit("storyWrite", v.user.id);
    const row = await requireVisibleStory(v, id);
    const { story } = row;
    if (story.authorId === v.user.id) throw validation(storyLabels.notYours);
    const unavailable = () => new AppError(403, "reply_unavailable", storyLabels.replyUnavailable);
    const clientId = input.clientId ?? randomUUID();
    const context = { storyId: id };

    if (story.persona === "pro") throw unavailable();
    // Reprise réseau : un message ou une demande portant déjà ce `clientId` (pour cette story) est rendu tel quel, avant
    // tout choix entre message direct et demande de contact (la relation a pu changer entre deux envois).
    const [sent] = await db
      .select({ id: messages.id, conversationId: messages.conversationId })
      .from(messages)
      .where(and(eq(messages.senderId, v.user.id), eq(messages.clientId, clientId), eq(messages.storyId, id)));
    if (sent) return { mode: "message", conversationId: sent.conversationId, messageId: sent.id };
    const [asked] = await db
      .select({
        id: contactRequests.id,
        status: contactRequests.status,
        conversationId: contactRequests.conversationId,
      })
      .from(contactRequests)
      .where(and(eq(contactRequests.fromUserId, v.user.id), eq(contactRequests.clientId, clientId)));
    if (asked) {
      if (asked.status === "accepted" && asked.conversationId) {
        // Acceptée : le premier message de la conversation porte le même `clientId` (plus de `story_id` si elle a expiré).
        const [first] = await db
          .select({ id: messages.id })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, asked.conversationId),
              eq(messages.senderId, v.user.id),
              eq(messages.clientId, clientId),
            ),
          );
        if (first) return { mode: "message", conversationId: asked.conversationId, messageId: first.id };
      }
      return { mode: "contact_request", requestId: asked.id };
    }
    if (story.persona === "organizer") {
      if (!story.structureId || row.structure.verification !== "verified") throw unavailable();
      if (await isStructureOrganizer(db, v.user.id, story.structureId)) throw validation(storyLabels.notYours);
      const opened = await messagingService.openWithStructure(v, story.structureId);
      const sent = await messagingService.send(v, opened.id, { clientId, body: input.text }, context);
      return { mode: "message", conversationId: opened.id, messageId: sent.message.id };
    }

    const authorId = story.authorId;
    const [existing] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.directKey, directKey(v.user.id, authorId)));
    if (await canTalkDirect(db, v.user.id, authorId, existing?.id)) {
      const opened = await messagingService.openDirect(v, authorId);
      const sent = await messagingService.send(v, opened.id, { clientId, body: input.text }, context);
      return { mode: "message", conversationId: opened.id, messageId: sent.message.id };
    }
    const author = await profilesRepo.byUserId(authorId);
    if (!author) throw notFound("Story introuvable");
    // Reprise réseau : la même demande (même texte, même story) est rendue telle quelle.
    const [sameRequest] = await db
      .select({ id: contactRequests.id })
      .from(contactRequests)
      .where(
        and(
          eq(contactRequests.fromUserId, v.user.id),
          eq(contactRequests.toUserId, authorId),
          eq(contactRequests.message, input.text),
          eq(contactRequests.storyId, id),
          eq(contactRequests.status, "pending"),
        ),
      );
    if (sameRequest) return { mode: "contact_request", requestId: sameRequest.id };
    const request = await contactsService.create(
      v,
      { pseudo: author.pseudo, message: input.text },
      { ...context, clientId },
    );
    return { mode: "contact_request", requestId: request.id };
  },

  async report(v: Viewer, id: string, input: { reason: string; details?: string | null }) {
    const created = await moderationService.create(v, {
      targetType: "story",
      targetId: id,
      reason: input.reason as never,
      details: input.details ?? null,
      screenshotKey: null,
    });
    return { id: created.id };
  },

  async mute(v: Viewer, key: { kind: StoryTagKind; id: string }, on: boolean) {
    rateLimit("storyWrite", v.user.id);
    if (key.kind === "user" && key.id === v.user.id) throw validation("Tu ne peux pas masquer tes propres stories.");
    if (on) {
      await db
        .insert(storyMutes)
        .values({ userId: v.user.id, authorKind: key.kind, authorId: key.id })
        .onConflictDoNothing();
    } else {
      await db
        .delete(storyMutes)
        .where(
          and(eq(storyMutes.userId, v.user.id), eq(storyMutes.authorKind, key.kind), eq(storyMutes.authorId, key.id)),
        );
    }
  },

  /** L'identifié retire son identification (ou le propriétaire de la structure / du pro identifié) : la story reste. */
  async removeTag(v: Viewer, storyId: string, target?: { kind: "structure" | "pro"; id: string }) {
    rateLimit("storyWrite", v.user.id);
    const kind: StoryTagKind = target?.kind ?? "user";
    const targetId = target?.id ?? v.user.id;
    if (target?.kind === "structure") {
      const [m] = await db
        .select({ id: structureMembers.id })
        .from(structureMembers)
        .where(
          and(
            eq(structureMembers.structureId, target.id),
            eq(structureMembers.userId, v.user.id),
            eq(structureMembers.status, "active"),
            inArray(structureMembers.role, ["owner", "co_organizer"]),
          ),
        );
      if (!m) throw notFound("Identification introuvable");
      // Retirer au nom d'une structure : garde centralisée (double authentification obligatoire).
      await requireOrganizer(v, target.id);
    } else if (target?.kind === "pro") {
      const [p] = await db
        .select({ id: proProfiles.id })
        .from(proProfiles)
        .where(and(eq(proProfiles.id, target.id), eq(proProfiles.ownerUserId, v.user.id)));
      if (!p) throw notFound("Identification introuvable");
    }
    const [story] = await db
      .select({ id: stories.id })
      .from(stories)
      .where(and(eq(stories.id, storyId), isNull(stories.deletedAt), sql`${stories.expiresAt} > ${now()}`));
    if (!story) throw notFound("Identification introuvable");
    // Lot R7h, tour 2 : une seule transaction. La ligne de l'identification est verrouillée par la mise à jour ; un partage
    // en cours (qui la tient en `FOR SHARE`) se termine avant, et la recherche des copies qui suit voit sa copie.
    const dropped = await withTx(async (tx) => {
      const done = await tx
        .update(storyTags)
        .set({ removedAt: now() })
        .where(
          and(
            eq(storyTags.storyId, storyId),
            eq(storyTags.targetKind, kind),
            eq(storyTags.targetId, targetId),
            isNull(storyTags.removedAt),
          ),
        )
        .returning({ id: storyTags.id });
      if (!done.length) throw notFound("Identification introuvable");
      // Les copies fondées sur cette identification tombent avec elle (la story, elle, reste).
      return dropCopiesOfTag(tx, storyId, kind, targetId);
    });
    if (dropped.length) await purgeStoryFiles(dropped);
  },
};

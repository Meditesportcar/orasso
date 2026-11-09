// Stories photo (lot R7f1, ARCHITECTURE-R7 § 2.5) : publier, supprimer, vue, flamme, réponse, signalement, mutes,
// retrait d'une identification. Toute règle est ici ou dans `@orasso/shared` (jamais seulement dans l'écran).
// Invariants : la plaque est décidée pour toute photo, quel que soit le public (crew compris) ; une story de crew ne
// s'identifie ni ne se lie hors du crew ; un compte privé ne publie pas en public et n'identifie ni structure, ni pro,
// ni événement ; l'original n'est jamais gardé.
import { randomBytes, randomUUID } from "node:crypto";
import {
  type AudienceStory,
  canSeeStory,
  canTag,
  type Frame,
  type StoryCreate,
  type StoryCreated,
  type StoryReplyResult,
  type StoryTagKind,
  type StoryDenial,
  storyAuthorKeyOf,
  storyDenial,
  storyExpiresAt,
  storyLabels,
  type UploadPurpose,
} from "@orasso/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  crewMembers,
  crews,
  events as events_,
  mediaProfiles,
  messages,
  notifications,
  profiles,
  providerProfiles,
  proFollows,
  proProfiles,
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
import { now } from "../../lib/deps";
import { AppError, forbidden, notFound, validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Tx, withTx } from "../../lib/tx";
import { canSeeEvent } from "../invitations/access";
import { messagingService } from "../messaging/service";
import { contactsService } from "../messaging/contacts";
import { canTalkDirect } from "../messaging/access/direct";
import { moderationService } from "../moderation/service";
import { notificationsService } from "../notifications/service";
import { profilesRepo } from "../profiles/repo";
import { uploadsService } from "../uploads/service";
import { vehiclesRepo } from "../vehicles/repo";
import { accountActive, audienceStoryOf, relationOf, type StoryRow, selectStories, setsFor, viewerOf } from "./common";
import { composeStoryPhoto } from "./compose";
import { purgeStoryFiles } from "./expire";

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
async function seesStory(userId: string, story: AudienceStory, ctx: { structureId: string | null; proId: string | null }) {
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (!p || !accountActive(p, now())) return false;
  let followAccepted = false;
  if (ctx.structureId) {
    followAccepted = Boolean(
      (await db.select().from(structureFollows).where(and(eq(structureFollows.userId, userId), eq(structureFollows.structureId, ctx.structureId))))[0],
    );
  } else if (ctx.proId) {
    followAccepted = Boolean(
      (await db.select().from(proFollows).where(and(eq(proFollows.userId, userId), eq(proFollows.proId, ctx.proId))))[0],
    );
  } else {
    followAccepted = Boolean(
      (
        await db
          .select()
          .from(userFollows)
          .where(and(eq(userFollows.followerId, userId), eq(userFollows.followedId, story.authorId), eq(userFollows.status, "accepted")))
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
  return canSeeStory({ id: userId, active: true }, story, { followAccepted, crewMemberActive: (id) => id === story.crewId && member });
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
    return;
  }
  if (persona === "pro") {
    if (!input.proId) throw validation("Choisis la fiche pro", { field: "proId" });
    const [p] = await db
      .select({ id: proProfiles.id })
      .from(proProfiles)
      .where(and(eq(proProfiles.id, input.proId), eq(proProfiles.ownerUserId, v.user.id), isNull(proProfiles.deletedAt)));
    if (!p) throw forbidden(storyLabels.notPro);
    return;
  }
  if (persona === "provider") {
    const [p] = await db.select({ id: providerProfiles.id }).from(providerProfiles).where(eq(providerProfiles.userId, v.user.id)).limit(1);
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
  story: { id: string; authorId: string; persona: string; structureId: string | null; proId: string | null; audience: string },
  authorKey: { kind: StoryTagKind; id: string; key: string },
  name: string,
  tagged: string[],
  actor: { userId: string; pseudo: string; avatarUrl: string | null },
) {
  const link = `/app/story/${authorKey.key}`;
  const data = { actor, storyId: story.id, authorKey: authorKey.key, link };
  // Identifiés : une notification chacun, jamais de vignette (invariant des stories de crew).
  for (const userId of tagged) {
    if (userId === story.authorId) continue;
    await notificationsService.notify(tx, userId, "story_mention", {
      title: storyLabels.mentionTitle(actor.pseudo),
      body: storyLabels.mention(actor.pseudo),
      data,
    });
  }
  // Journal des abonnés acceptés : jamais pour une story de crew (même l'existence reste dans le crew).
  if (story.audience === "crew") return;
  const rows =
    authorKey.kind === "structure"
      ? await tx.select({ id: structureFollows.userId }).from(structureFollows).where(eq(structureFollows.structureId, authorKey.id))
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
    .where(and(eq(storyMutes.authorKind, authorKey.kind), eq(storyMutes.authorId, authorKey.id), inArray(storyMutes.userId, audience)));
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

export const storiesService = {
  async create(v: Viewer, input: StoryCreate): Promise<StoryCreated> {
    if (suspended(v)) throw forbidden("Ton compte est suspendu : lecture seule.");
    rateLimit("storyPublish", v.user.id);
    const rects = input.plateRects ?? [];
    // Photo : la décision de plaque est obligatoire quel que soit le public, crew compris (D38, « règle des plaques partout »).
    if (!rects.length && !input.noPlateConfirmed) {
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
    const ctx = { structureId: input.persona === "organizer" ? (input.structureId ?? null) : null, proId: input.persona === "pro" ? (input.proId ?? null) : null };

    // Voiture : la mienne et active.
    let vehicleId: string | null = null;
    if (input.vehicleId) {
      const veh = await vehiclesRepo.byId(input.vehicleId);
      if (veh && veh.ownerId === v.user.id && veh.status === "active") vehicleId = veh.id;
      else skipped.push({ kind: "vehicle", id: input.vehicleId, reason: storyLabels.skipped.not_yours });
    }

    // Autocollant d'événement et contenu lié (événement ou voiture seulement dans ce lot).
    const eventOk = async (id: string, kind: "event" | "linked"): Promise<string | null> => {
      const [e] = await db
        .select({ id: events_.id, status: events_.status, admission: events_.admission, structureId: events_.structureId })
        .from(events_)
        .where(eq(events_.id, id));
      const refusal = canTag(author, storyShape, { kind: "event", canSee: true, available: Boolean(e && e.status !== "draft" && (await canSeeEvent(e, v))) });
      if (refusal) {
        skipped.push({ kind: kind === "event" ? "event" : "event", id, reason: storyLabels.skipped[refusal] });
        return null;
      }
      return id;
    };
    const eventId = input.eventId ? await eventOk(input.eventId, "event") : null;
    let linked: { type: NonNullable<StoryCreate["linked"]>["type"]; id: string } | null = null;
    if (input.linked) {
      if (input.linked.type === "event") {
        if (await eventOk(input.linked.id, "linked")) linked = input.linked;
      } else if (input.linked.type === "vehicle") {
        const veh = await vehiclesRepo.byId(input.linked.id);
        if (veh && veh.ownerId === v.user.id && veh.status === "active") linked = input.linked;
        else skipped.push({ kind: "vehicle", id: input.linked.id, reason: storyLabels.skipped.not_yours });
      } else throw validation(storyLabels.linkedUnsupported, { field: "linked" });
    }

    // Identifications : on n'identifie que quelqu'un qui peut voir la story ; compte privé : ni structure, ni pro.
    const tags: { kind: StoryTagKind; id: string }[] = [];
    const seen = new Set<string>();
    for (const t of input.tags) {
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
        const [s] = await db.select({ d: structures.deletedAt, ver: structures.verification }).from(structures).where(eq(structures.id, t.id));
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
      else tags.push(t);
    }

    // Le fichier envoyé : à moi, pour une story, pas encore rattaché.
    const [pending] = await db
      .select()
      .from(uploads)
      .where(and(eq(uploads.key, input.uploadKey), eq(uploads.userId, v.user.id), eq(uploads.purpose, "story" satisfies UploadPurpose), isNull(uploads.consumedAt)));
    if (!pending) throw validation("Image inconnue ou déjà utilisée : envoie-la à nouveau.");
    const source = await storage.get(pending.key);
    if (!source) throw validation("Image introuvable : envoie-la à nouveau.");
    const frame: Frame | undefined = input.frame;
    const composed = await composeStoryPhoto(source, { frame, rects });

    const id = randomUUID();
    const key = `private/stories/${id}/${randomBytes(8).toString("hex")}.webp`;
    await storage.put(key, composed.data);
    const at = now();
    try {
      await withTx(async (tx, after) => {
        const upload = await uploadsService.consume(tx, v.user.id, input.uploadKey, "story");
        if (!upload) throw validation("Image inconnue ou déjà utilisée : envoie-la à nouveau.");
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
            plateState: rects.length ? "blurred" : "none_confirmed",
            caption: input.caption || null,
            placeLabel: input.placeLabel || null,
            vehicleId,
            eventId,
            linkedType: linked?.type ?? null,
            linkedId: linked?.id ?? null,
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
        const name =
          authorKey.kind === "structure"
            ? ((await tx.select({ n: structures.name }).from(structures).where(eq(structures.id, authorKey.id)))[0]?.n ?? v.profile.pseudo)
            : authorKey.kind === "pro"
              ? ((await tx.select({ n: proProfiles.name }).from(proProfiles).where(eq(proProfiles.id, authorKey.id)))[0]?.n ?? v.profile.pseudo)
              : v.profile.pseudo;
        await notifyPublished(
          tx,
          row,
          authorKey,
          name,
          tags.filter((t) => t.kind === "user").map((t) => t.id),
          { userId: v.user.id, pseudo: v.profile.pseudo, avatarUrl: storage.url(v.profile.avatarKey) },
        );
        after(() => notificationsService.kick());
      });
    } catch (error) {
      await storage.remove(key).catch(() => undefined);
      throw error;
    }
    // Le fichier d'origine n'est jamais gardé.
    await storage.remove(pending.key).catch(() => undefined);
    return { id, status: "ready", expiresAt: storyExpiresAt(at).toISOString(), skipped };
  },

  /** `DELETE /me/stories/:id` : l'auteur retire sa story ; ses copies partent avec elle, les fichiers aussi. */
  async remove(v: Viewer, id: string): Promise<void> {
    rateLimit("storyWrite", v.user.id);
    const [mine] = await db
      .select({ id: stories.id })
      .from(stories)
      .where(and(eq(stories.id, id), eq(stories.authorId, v.user.id), isNull(stories.deletedAt)));
    if (!mine) throw notFound("Story introuvable");
    const ids = await softDeleteWithCopies(db, [id]);
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
        await tx.update(stories).set({ viewsCount: sql`${stories.viewsCount} + 1` }).where(eq(stories.id, id));
      }
    });
  },

  /** Liste de ceux qui ont vu ma story : pour moi seul. */
  async viewers(v: Viewer, id: string) {
    const [mine] = await db
      .select({ id: stories.id })
      .from(stories)
      .where(and(eq(stories.id, id), eq(stories.authorId, v.user.id), isNull(stories.deletedAt)));
    if (!mine) throw notFound("Story introuvable");
    const rows = await db
      .select({ userId: profiles.userId, pseudo: profiles.pseudo, avatarKey: profiles.avatarKey, at: storyViews.viewedAt, d: profiles.deletedAt, b: profiles.bannedAt, s: profiles.suspendedUntil })
      .from(storyViews)
      .innerJoin(profiles, eq(profiles.userId, storyViews.viewerId))
      .where(eq(storyViews.storyId, id))
      .orderBy(sql`${storyViews.viewedAt} desc`)
      .limit(200);
    const at = now();
    return {
      viewers: rows
        .filter((r) => !r.d && !r.b && !(r.s && r.s > at))
        .map((r) => ({ userId: r.userId, pseudo: r.pseudo, avatarUrl: storage.url(r.avatarKey), viewedAt: r.at.toISOString() })),
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
      await tx.update(stories).set({ reactionsCount: sql`${stories.reactionsCount} + 1` }).where(eq(stories.id, id));
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
            link: `/app/story/${storyAuthorKeyOf("user", row.story.authorId)}`,
          },
        });
      }
      after(() => notificationsService.kick());
    });
    return { reacted: on };
  },

  /**
   * `POST /stories/:id/reply` : un message à l'auteur, avec `story_id`. Règle des messages directs (R6) : l'auteur me suit
   * (ou une demande de contact a été acceptée) → message direct ; sinon le mot part en demande de contact.
   */
  async reply(v: Viewer, id: string, text: string): Promise<StoryReplyResult> {
    if (suspended(v)) throw forbidden("Ton compte est suspendu : lecture seule.");
    rateLimit("storyWrite", v.user.id);
    const row = await requireVisibleStory(v, id);
    const authorId = row.story.authorId;
    if (authorId === v.user.id) throw validation(storyLabels.notYours);
    if (await canTalkDirect(db, v.user.id, authorId)) {
      const opened = await messagingService.openDirect(v, authorId);
      const sent = await messagingService.send(v, opened.id, { clientId: randomUUID(), body: text });
      await db.update(messages).set({ storyId: id }).where(eq(messages.id, sent.message.id));
      return { mode: "message", conversationId: opened.id, messageId: sent.message.id };
    }
    const author = await profilesRepo.byUserId(authorId);
    if (!author) throw notFound("Story introuvable");
    const request = await contactsService.create(v, { pseudo: author.pseudo, message: text });
    return { mode: "contact_request", requestId: (request as { id: string }).id };
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
        .where(and(eq(storyMutes.userId, v.user.id), eq(storyMutes.authorKind, key.kind), eq(storyMutes.authorId, key.id)));
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
    const done = await db
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
  },
};

/** Marque supprimées les stories données et toutes leurs copies (récursif) ; rend tous les identifiants touchés. */
export async function softDeleteWithCopies(ex: Tx | typeof db, ids: string[]): Promise<string[]> {
  if (!ids.every((i) => /^[0-9a-f-]{36}$/i.test(i))) throw new Error("Identifiant invalide");
  const at = now();
  const rows = await ex.execute<{ id: string }>(sql`
    with recursive tree(id) as (
      select id from stories where id = any(${sql.raw(`'{${ids.join(",")}}'::uuid[]`)})
      union
      select s.id from stories s join tree t on s.shared_from_story_id = t.id
    )
    update stories set deleted_at = coalesce(deleted_at, ${at}), updated_at = ${at}
    where id in (select id from tree)
    returning id`);
  return (rows as unknown as { rows: { id: string }[] }).rows.map((r) => r.id);
}

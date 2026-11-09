// « Ajouter à ma story » et mentions (lot R7h, ARCHITECTURE-R7 § 2.12). Une copie est LIÉE à l'originale : même expiration,
// supprimée avec elle (cascade de `purge.ts`), retirée si l'identification tombe, crédit de l'auteur visible. Elle garde le
// public et les droits de l'originale et ne les élargit jamais : refusée pour un crew et pour un compte privé (`shareRefusal`).
// Le fichier est recopié (une clé par story) : retirer une copie n'efface jamais le fichier de l'originale.
import { randomBytes, randomUUID } from "node:crypto";
import {
  STORY_LIVE_MAX,
  type StoryMentionItem,
  type StoryMentions,
  type StoryShared,
  type StoryShareInput,
  shareRefusal,
  storyAuthorKeyOf,
  storyDenial,
  storyLabels,
  storyShareLabels,
} from "@orasso/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { stories, structureMembers, structures } from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, forbidden, notFound, validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Tx, withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { removeOrRetry } from "../vehicles/photos-blur";
import {
  accountActive,
  audienceStoryOf,
  authorDisplay,
  authorKeyOf,
  liveStory,
  relationOf,
  selectStories,
  setsFor,
  viewerOf,
} from "./common";
import { purgeStoryFiles } from "./expire";
import { softDeleteWithCopies } from "./purge";
import { mediaUrlOf } from "./serialize";
import { ownedPros } from "./sharing";

const MENTIONS_PAGE = 20;

const suspended = (v: Viewer) => Boolean(v.profile.suspendedUntil && v.profile.suspendedUntil > now());

function refusal(code: "crew_story" | "private_author" | "not_visible"): AppError {
  if (code === "crew_story") return new AppError(403, "crew_only", storyShareLabels.refusals.crew_story);
  if (code === "private_author") return new AppError(403, "share_private", storyShareLabels.refusals.private_author);
  return notFound("Story introuvable");
}

/** Recopie un fichier de story sous la clé de la copie (une clé par story). */
async function copyFile(key: string, copyId: string): Promise<string> {
  const data = await storage.get(key);
  if (!data) throw notFound("Story introuvable");
  const ext = key.slice(key.lastIndexOf("."));
  const next = `private/stories/${copyId}/${randomBytes(8).toString("hex")}${ext}`;
  await storage.put(next, data);
  return next;
}

type TagKind = "user" | "structure" | "pro";

/** L'identification active de cette cible existe-t-elle sur la story ? */
async function hasActiveTag(ex: Tx | typeof db, storyId: string, kind: TagKind, targetId: string): Promise<boolean> {
  const res = await ex.execute<{ one: number }>(sql`
    select 1 as one from story_tags
    where story_id = ${storyId} and removed_at is null and target_kind = ${kind} and target_id = ${targetId}`);
  return res.rows.length > 0;
}

/**
 * Retire les copies fondées sur une identification qui tombe : celles faites par la cible retirée (la structure, le pro,
 * ou la personne). Copies de copies comprises. Rend les identifiants supprimés ; l'appelant efface les fichiers après la
 * validation.
 */
export async function dropCopiesOfTag(
  ex: Tx | typeof db,
  storyId: string,
  kind: TagKind,
  targetId: string,
): Promise<string[]> {
  const sharer =
    kind === "structure"
      ? and(eq(stories.persona, "organizer"), eq(stories.structureId, targetId))
      : kind === "pro"
        ? and(eq(stories.persona, "pro"), eq(stories.proId, targetId))
        : and(eq(stories.persona, "fan"), eq(stories.authorId, targetId));
  const copies = await ex
    .select({ id: stories.id })
    .from(stories)
    .where(and(eq(stories.sharedFromStoryId, storyId), isNull(stories.deletedAt), sharer));
  if (!copies.length) return [];
  return softDeleteWithCopies(
    ex,
    copies.map((c) => c.id),
  );
}

/** Retire les copies de toutes les stories d'une personne dont le compte passe en privé (une copie n'élargit jamais le public). */
export async function dropCopiesOfAuthor(ex: Tx | typeof db, authorId: string): Promise<string[]> {
  const res = await ex.execute<{ id: string }>(sql`
    select c.id from stories c join stories o on o.id = c.shared_from_story_id
    where o.author_id = ${authorId} and o.persona not in ('organizer', 'pro') and c.deleted_at is null`);
  const ids = res.rows.map((r) => r.id);
  if (!ids.length) return [];
  return softDeleteWithCopies(ex, ids);
}

/** Un compte passe en privé : ses stories ne peuvent plus être reprises, les copies faites jusque-là tombent (fichiers effacés après la validation). */
export async function retireCopiesOfPrivateAccount(tx: Tx, after: (cb: () => unknown) => void, authorId: string) {
  const ids = await dropCopiesOfAuthor(tx, authorId);
  if (ids.length) after(() => purgeStoryFiles(ids).catch(() => undefined));
}

export const storiesShare = {
  /** `POST /stories/:id/share-to-mine` : reprendre une story où je suis identifié dans la mienne (ou celle de ma structure). */
  async shareToMine(v: Viewer, id: string, input: StoryShareInput): Promise<StoryShared> {
    if (suspended(v)) throw forbidden("Ton compte est suspendu : lecture seule.");
    rateLimit("storyWrite", v.user.id);
    const at = now();
    const [row] = await selectStories(eq(stories.id, id));
    if (!row || row.story.deletedAt || row.story.status !== "ready" || row.story.expiresAt <= at) {
      throw notFound("Story introuvable");
    }
    const source = row.story;
    if (source.authorId === v.user.id) throw validation(storyShareLabels.refusals.own_story);
    // 1. Au nom de qui ? Une casquette que je gère, sinon moi.
    const persona = input.asStructureId ? "organizer" : input.asProId ? "pro" : "fan";
    const structureId = input.asStructureId ?? null;
    const proId = input.asProId ?? null;
    let sharerName = v.profile.pseudo;
    let sharerLogo: string | null = v.profile.avatarKey;
    if (structureId) {
      const [s] = await db
        .select({ name: structures.name, logo: structures.logoKey, ver: structures.verification })
        .from(structureMembers)
        .innerJoin(structures, eq(structures.id, structureMembers.structureId))
        .where(
          and(
            eq(structureMembers.structureId, structureId),
            eq(structureMembers.userId, v.user.id),
            eq(structureMembers.status, "active"),
            inArray(structureMembers.role, ["owner", "co_organizer"]),
            isNull(structures.deletedAt),
          ),
        );
      if (!s || s.ver === "suspended") throw forbidden(storyLabels.notOrganizer);
      sharerName = s.name;
      sharerLogo = s.logo;
    } else if (proId) {
      const name = (await ownedPros(v.user.id)).get(proId);
      if (name === undefined) throw forbidden(storyLabels.notPro);
      sharerName = name;
      sharerLogo = null;
    }
    // 2. Je vois la story, et elle peut être reprise : crew et compte privé refusés (la copie garde les droits de l'originale).
    const rel = relationOf(await setsFor(v.user.id, [row]), row);
    const denied = shareRefusal(viewerOf(v), audienceStoryOf(row, at), rel);
    if (denied) throw refusal(denied);
    // 3. Je suis bien identifié : moi, ou la structure / le pro au nom de qui je reprends.
    const tagKind: TagKind = structureId ? "structure" : proId ? "pro" : "user";
    const tagTarget = structureId ?? proId ?? v.user.id;
    if (!(await hasActiveTag(db, id, tagKind, tagTarget))) {
      throw new AppError(403, "not_tagged", storyShareLabels.refusals.not_tagged);
    }

    const copyId = randomUUID();
    const files: string[] = [];
    try {
      const storageKey = await copyFile(source.storageKey, copyId);
      files.push(storageKey);
      const posterKey = source.posterKey ? await copyFile(source.posterKey, copyId) : null;
      if (posterKey) files.push(posterKey);
      await withTx(async (tx, afterCommit) => {
        const capKey = structureId ? `s:${structureId}` : proId ? `p:${proId}` : `u:${v.user.id}`;
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`story-share:${id}:${capKey}`}))`);
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`story-cap:${capKey}`}))`);
        const sharer = structureId
          ? and(eq(stories.persona, "organizer"), eq(stories.structureId, structureId))
          : proId
            ? and(eq(stories.persona, "pro"), eq(stories.proId, proId))
            : and(sql`${stories.persona} not in ('organizer','pro')`, eq(stories.authorId, v.user.id));
        const [already] = await tx
          .select({ id: stories.id })
          .from(stories)
          .where(and(eq(stories.sharedFromStoryId, id), isNull(stories.deletedAt), sharer));
        if (already) throw new AppError(409, "already_shared", storyShareLabels.refusals.already_shared);
        const [live] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(stories)
          .where(and(sql`${stories.deletedAt} is null`, sql`${stories.expiresAt} > ${at}`, sharer));
        if ((live?.n ?? 0) >= STORY_LIVE_MAX) throw new AppError(409, "too_many_stories", storyLabels.tooManyStories);
        // L'originale a pu être supprimée ou l'identification retirée depuis le début : on relit sous verrou.
        const [still] = await tx
          .select({ id: stories.id })
          .from(stories)
          .where(and(eq(stories.id, id), liveStory(at)));
        if (!still || !(await hasActiveTag(tx, id, tagKind, tagTarget))) throw notFound("Story introuvable");
        await tx.insert(stories).values({
          id: copyId,
          authorId: v.user.id,
          persona,
          structureId,
          proId,
          // Une structure ou un pro est public par nature ; un identifié repartage à SES abonnés, rien de plus large.
          audience: persona === "fan" ? "followers" : "public",
          crewId: null,
          mediaKind: source.mediaKind,
          storageKey,
          posterKey,
          width: source.width,
          height: source.height,
          durationMs: source.durationMs,
          status: "ready",
          plateState: source.plateState,
          caption: source.caption,
          placeLabel: source.placeLabel,
          vehicleId: source.vehicleId,
          eventId: source.eventId,
          sharedFromStoryId: id,
          sharedByUserId: v.user.id,
          // Même expiration que l'originale : la copie ne la prolonge jamais.
          expiresAt: source.expiresAt,
          createdAt: at,
          updatedAt: at,
        });
        // L'auteur est prévenu ; jamais d'image dans la notification.
        const authorKey = storyAuthorKeyOf("user", source.authorId);
        await notificationsService.notify(tx, source.authorId, "story_shared_by_organizer", {
          title: storyShareLabels.sharedTitle(sharerName),
          body: storyShareLabels.activityShared(sharerName),
          data: {
            actor:
              persona === "fan"
                ? { userId: v.user.id, pseudo: sharerName, avatarUrl: storage.url(sharerLogo) }
                : { pseudo: sharerName, avatarUrl: storage.url(sharerLogo) },
            storyId: id,
            authorKey,
            link: `/app/story/${authorKey}`,
          },
        });
        afterCommit(() => notificationsService.kick());
      });
    } catch (error) {
      for (const f of files) await removeOrRetry(f);
      throw error;
    }
    return { id: copyId, expiresAt: source.expiresAt.toISOString() };
  },

  /** `GET /structures/:id/story-mentions` : les stories qui identifient la structure ou un de ses événements publiés. */
  async mentions(v: Viewer, structureId: string, cursor?: string): Promise<StoryMentions> {
    const at = now();
    const [member] = await db
      .select({ id: structureMembers.id })
      .from(structureMembers)
      .innerJoin(structures, eq(structures.id, structureMembers.structureId))
      .where(
        and(
          eq(structureMembers.structureId, structureId),
          eq(structureMembers.userId, v.user.id),
          eq(structureMembers.status, "active"),
          inArray(structureMembers.role, ["owner", "co_organizer", "staff"]),
          isNull(structures.deletedAt),
        ),
      );
    if (!member) throw forbidden("Réservé à l'organisation et à son staff");
    let after: { at: Date; id: string } | null = null;
    if (cursor) {
      const [ms, cid] = cursor.split("_");
      const date = new Date(Number(ms));
      if (!cid || Number.isNaN(date.getTime()) || !/^[0-9a-f-]{36}$/i.test(cid)) throw validation("Curseur invalide");
      after = { at: date, id: cid };
    }
    // Les mentions : identification active de la structure, ou autocollant d'un de ses événements publiés (sauf
    // identification retirée). Jamais une copie, jamais une story de crew, jamais celle de la structure elle-même, jamais
    // un auteur indisponible. Un compte privé ne peut pas identifier un organisateur (règle `canTag`) : s'il l'a fait avant
    // de passer en privé, la mention n'est plus servie.
    const base = sql`
      s.deleted_at is null and s.status = 'ready' and s.expires_at > ${at}
      and s.shared_from_story_id is null and s.audience in ('public', 'followers')
      and not (s.persona = 'organizer' and s.structure_id = ${structureId})
      and p.deleted_at is null and p.banned_at is null and (p.suspended_until is null or p.suspended_until <= ${at})
      and (s.persona in ('organizer', 'pro') or p.visibility = 'public')
      and (
        exists (select 1 from story_tags t where t.story_id = s.id and t.target_kind = 'structure'
          and t.target_id = ${structureId} and t.removed_at is null)
        or (s.event_id in (select e.id from events e where e.structure_id = ${structureId} and e.status = 'published')
          and not exists (select 1 from story_tags t where t.story_id = s.id and t.target_kind = 'structure'
            and t.target_id = ${structureId} and t.removed_at is not null)))`;
    const counted = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from stories s join profiles p on p.user_id = s.author_id where ${base}`,
    );
    const count = Number(counted.rows[0]?.n ?? 0);
    const page = await db.execute<{ id: string; created_at: Date }>(sql`
      select s.id, s.created_at from stories s join profiles p on p.user_id = s.author_id
      where ${base} ${after ? sql`and (date_trunc('milliseconds', s.created_at), s.id) < (${after.at}, ${after.id}::uuid)` : sql``}
      order by date_trunc('milliseconds', s.created_at) desc, s.id desc limit ${MENTIONS_PAGE + 1}`);
    const shown = page.rows.slice(0, MENTIONS_PAGE);
    if (!shown.length) return { items: [], nextCursor: null, count };
    const shownIds = shown.map((r) => r.id);
    const rows = await selectStories(inArray(stories.id, shownIds));
    const sets = await setsFor(v.user.id, rows);
    const copies = await db
      .select({ id: stories.id, from: stories.sharedFromStoryId })
      .from(stories)
      .where(
        and(
          inArray(stories.sharedFromStoryId, shownIds),
          isNull(stories.deletedAt),
          eq(stories.persona, "organizer"),
          eq(stories.structureId, structureId),
        ),
      );
    const order = new Map(shownIds.map((x, i) => [x, i]));
    const items: StoryMentionItem[] = [];
    for (const r of [...rows].sort((a, b) => (order.get(a.story.id) ?? 0) - (order.get(b.story.id) ?? 0))) {
      if (!accountActive(r.author, at)) continue;
      // L'aperçu passe par la route protégée : on ne liste que ce que le regard a le droit de voir.
      if (storyDenial(viewerOf(v), audienceStoryOf(r, at), relationOf(sets, r)) !== null) continue;
      const display = authorDisplay(r, storage.url);
      items.push({
        storyId: r.story.id,
        authorKey: authorKeyOf(r)?.key ?? storyAuthorKeyOf("user", r.story.authorId),
        authorName: display.name,
        authorAvatarUrl: display.avatarUrl,
        mediaUrl: mediaUrlOf(r.story.id, r.story.storageKey),
        caption: r.story.caption,
        createdAt: r.story.createdAt.toISOString(),
        expiresAt: r.story.expiresAt.toISOString(),
        copyId: copies.find((c) => c.from === r.story.id)?.id ?? null,
      });
    }
    const last = shown[shown.length - 1];
    return {
      items,
      nextCursor: page.rows.length > MENTIONS_PAGE && last ? `${new Date(last.created_at).getTime()}_${last.id}` : null,
      count,
    };
  },
};

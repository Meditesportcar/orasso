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
import { requireOrganizer } from "../../lib/access";
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
  notMaskedCopy,
  relationOf,
  type StoryRow,
  selectStories,
  setsFor,
  storyKeyOfRecord,
  viewerOf,
} from "./common";
import { purgeStoryFiles } from "./expire";
import { dropCopiesOfAuthor, softDeleteWithCopies } from "./purge";
import { mediaUrlOf } from "./serialize";
import { ownedPros } from "./sharing";

const MENTIONS_PAGE = 20;
/**
 * Points d'attente pour les tests de concurrence (lot R7h, tour 3) : `afterLocks` est attendu dans la transaction du
 * partage, une fois les verrous pris et les droits relus, avant d'insérer la copie. Jamais posé hors des tests.
 */
export const shareTestHooks: { afterLocks?: () => Promise<void> } = {};

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
  // Lot R7m2 : un pro cité en « Collaboration commerciale » garde le droit de reprendre la story, identifié ou non.
  if (kind === "pro") {
    const [cited] = await ex
      .select({ id: stories.id })
      .from(stories)
      .where(and(eq(stories.id, storyId), eq(stories.commercialPartnerId, targetId)));
    if (cited) return [];
  }
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

/** Un compte passe en privé : ses stories ne peuvent plus être reprises, les copies faites jusque-là tombent (fichiers effacés après la validation). */
export async function retireCopiesOfPrivateAccount(tx: Tx, after: (cb: () => unknown) => void, authorId: string) {
  const ids = await dropCopiesOfAuthor(tx, authorId, "personal");
  if (ids.length) after(() => purgeStoryFiles(ids).catch(() => undefined));
}

export const storiesShare = {
  /** `POST /stories/:id/share-to-mine` : reprendre une story où je suis identifié dans la mienne (ou celle de ma structure). */
  async shareToMine(v: Viewer, id: string, input: StoryShareInput): Promise<StoryShared> {
    if (suspended(v)) throw forbidden("Ton compte est suspendu : lecture seule.");
    rateLimit("storyWrite", v.user.id);
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
      // Garde centralisée de l'espace organisateur (double authentification obligatoire), comme partout ailleurs.
      await requireOrganizer(v, structureId);
      sharerName = s.name;
      sharerLogo = s.logo;
    } else if (proId) {
      const name = (await ownedPros(v.user.id)).get(proId);
      if (name === undefined) throw forbidden(storyLabels.notPro);
      sharerName = name;
      sharerLogo = null;
    }
    // 2. Je suis bien identifié : moi, ou la structure / le pro au nom de qui je reprends.
    const tagKind: TagKind = structureId ? "structure" : proId ? "pro" : "user";
    const tagTarget = structureId ?? proId ?? v.user.id;
    // Les droits, relus chaque fois qu'on les tient : la story est vivante, je la vois, elle peut être reprise (crew et
    // compte privé refusés : la copie garde les droits de l'originale), l'originale a son auteur, l'identification est là.
    const checkRights = async (ex: Tx | typeof db) => {
      const at = now();
      const [row] = await selectStories(eq(stories.id, id), ex);
      if (!row || row.story.deletedAt || row.story.status !== "ready" || row.story.expiresAt <= at) {
        throw notFound("Story introuvable");
      }
      if (row.story.authorId === v.user.id) throw validation(storyShareLabels.refusals.own_story);
      const rel = relationOf(await setsFor(v.user.id, [row], ex), row);
      const denied = shareRefusal(viewerOf(v), audienceStoryOf(row, at), rel);
      if (denied) throw refusal(denied);
      // Lot R7m2 : le pro cité en « Collaboration commerciale » reprend la story comme s'il était identifié.
      const citedAsPartner = tagKind === "pro" && row.story.commercialPartnerId === tagTarget;
      if (!citedAsPartner && !(await hasActiveTag(ex, id, tagKind, tagTarget))) {
        throw new AppError(403, "not_tagged", storyShareLabels.refusals.not_tagged);
      }
      return row.story;
    };
    const source = await checkRights(db);

    const copyId = randomUUID();
    const files: string[] = [];
    try {
      const storageKey = await copyFile(source.storageKey, copyId);
      files.push(storageKey);
      const posterKey = source.posterKey ? await copyFile(source.posterKey, copyId) : null;
      if (posterKey) files.push(posterKey);
      await withTx(async (tx, afterCommit) => {
        const at = now();
        const capKey = structureId ? `s:${structureId}` : proId ? `p:${proId}` : `u:${v.user.id}`;
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`story-share:${id}:${capKey}`}))`);
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`story-cap:${capKey}`}))`);
        // Verrous partagés, toujours dans cet ordre (compte de l'auteur, originale, identification). Le passage en privé,
        // la suspension, le bannissement, la suppression et le retrait de l'identification prennent le verrou
        // correspondant AVANT de chercher les copies à retirer : soit ils passent d'abord et les droits revérifiés
        // ci-dessous refusent le partage, soit nous passons d'abord et ils trouvent la copie et la retirent dans leur transaction.
        await tx.execute(sql`select 1 from profiles where user_id = ${source.authorId} for share`);
        await tx.execute(sql`select 1 from stories where id = ${id} and deleted_at is null for share`);
        await tx.execute(sql`select 1 from story_tags
          where story_id = ${id} and target_kind = ${tagKind} and target_id = ${tagTarget} and removed_at is null for share`);
        await checkRights(tx);
        await shareTestHooks.afterLocks?.();
        const sharer = structureId
          ? and(eq(stories.persona, "organizer"), eq(stories.structureId, structureId))
          : proId
            ? and(eq(stories.persona, "pro"), eq(stories.proId, proId))
            : and(eq(stories.persona, "fan"), eq(stories.authorId, v.user.id));
        const [already] = await tx
          .select({ id: stories.id })
          .from(stories)
          .where(and(eq(stories.sharedFromStoryId, id), isNull(stories.deletedAt), sharer));
        if (already) throw new AppError(409, "already_shared", storyShareLabels.refusals.already_shared);
        const [live] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(stories)
          .where(and(sql`${stories.deletedAt} is null`, sql`${stories.expiresAt} > ${at}`, notMaskedCopy(at), sharer));
        if ((live?.n ?? 0) >= STORY_LIVE_MAX) throw new AppError(409, "too_many_stories", storyLabels.tooManyStories);
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
          // « Collaboration commerciale » : la copie garde la mention de l'originale (R7m2).
          commercialPartnerId: source.commercialPartnerId,
          // Même expiration que l'originale : la copie ne la prolonge jamais.
          expiresAt: source.expiresAt,
          createdAt: at,
          updatedAt: at,
        });
        // L'auteur est prévenu ; jamais d'image dans la notification.
        // La clé de la page de l'originale (`s: p: v: m:`), sinon celle de la personne : le lien ouvre la bonne visionneuse.
        const authorKey = storyKeyOfRecord(source)?.key ?? storyAuthorKeyOf("user", source.authorId);
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
    // Curseur « <millisecondes>_<uuid> », validé en entier avant toute requête (un curseur mal formé est un 400, jamais une
    // erreur de PostgreSQL) : la date doit exister et l'identifiant être un UUID complet.
    let after: { at: Date; id: string } | null = null;
    if (cursor) {
      const m = /^(\d{1,13})_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(cursor);
      const date = m?.[1] ? new Date(Number(m[1])) : null;
      if (!m?.[2] || !date || Number.isNaN(date.getTime())) throw validation("Curseur invalide");
      after = { at: date, id: m[2] };
    }
    // Les mentions : identification active de la structure, ou autocollant d'un de ses événements publiés (sauf
    // identification retirée). Jamais une copie, jamais une story de crew, jamais celle de la structure elle-même, jamais
    // un auteur indisponible (compte, structure ou pro : le nombre et la liste partent de la même condition). Un compte privé ne peut pas identifier un organisateur (règle `canTag`) : s'il l'a fait avant
    // de passer en privé, la mention n'est plus servie.
    const base = sql`
      s.deleted_at is null and s.status = 'ready' and s.expires_at > ${at}
      and s.shared_from_story_id is null and s.audience in ('public', 'followers')
      and not (s.persona = 'organizer' and s.structure_id = ${structureId})
      and p.deleted_at is null and p.banned_at is null and (p.suspended_until is null or p.suspended_until <= ${at})
      and (s.persona <> 'fan' or p.visibility = 'public')
      and (s.persona <> 'organizer' or exists (select 1 from structures st where st.id = s.structure_id
        and st.deleted_at is null and st.verification <> 'suspended'))
      and (s.persona <> 'pro' or exists (select 1 from pro_profiles pp where pp.id = s.pro_id and pp.deleted_at is null))
      and (s.persona <> 'provider' or exists (select 1 from provider_profiles pv where pv.id = s.provider_id
        and pv.deleted_at is null))
      and (s.persona <> 'media' or exists (select 1 from media_profiles mp where mp.id = s.media_id
        and mp.deleted_at is null))
      and (
        exists (select 1 from story_tags t where t.story_id = s.id and t.target_kind = 'structure'
          and t.target_id = ${structureId} and t.removed_at is null)
        or (s.event_id in (select e.id from events e where e.structure_id = ${structureId} and e.status = 'published')
          and not exists (select 1 from story_tags t where t.story_id = s.id and t.target_kind = 'structure'
            and t.target_id = ${structureId} and t.removed_at is not null)))`;
    // Lot R7h, tour 4 : pagination en base, sans plafond global. La condition ci-dessus est celle des droits (auteur actif,
    // compte public ou casquette, structure ou pro disponible, audience publique ou d'abonnés : `storyDenial` n'ajoute
    // alors que « le regard est actif ») : le nombre est un `count(*)` de cette condition, la page un curseur appliqué dans
    // la requête (vingt lignes plus une pour savoir s'il y a une suite). `storyDenial` reste appliqué aux seules lignes de
    // la page, en filet de sécurité.
    if (!viewerOf(v)?.active) return { items: [], nextCursor: null, count: 0 };
    // Le nombre n'est calculé qu'à la première page (sans curseur) ; les pages suivantes rendent 0, le client garde le premier.
    const count = after
      ? 0
      : ((
          await db.execute<{ n: number }>(sql`
      select count(*)::int as n from stories s join profiles p on p.user_id = s.author_id where ${base}`)
        ).rows[0]?.n ?? 0);
    const page = await db.execute<{ id: string; ms: string }>(sql`
      select s.id, (extract(epoch from date_trunc('milliseconds', s.created_at)) * 1000)::bigint::text as ms
      from stories s join profiles p on p.user_id = s.author_id
      where ${base}${
        after
          ? sql` and (date_trunc('milliseconds', s.created_at), s.id) < (${after.at.toISOString()}::timestamptz, ${after.id}::uuid)`
          : sql``
      }
      order by date_trunc('milliseconds', s.created_at) desc, s.id desc limit ${MENTIONS_PAGE + 1}`);
    const msOf = new Map(page.rows.map((r) => [r.id, Number(r.ms)]));
    const rows = await selectStories(
      inArray(
        stories.id,
        page.rows.map((r) => r.id),
      ),
    );
    const sets = await setsFor(v.user.id, rows);
    const rank = (r: StoryRow) => msOf.get(r.story.id) ?? 0;
    const rest = rows
      .filter(
        (r) =>
          // Une story de page sans page n'a pas de clé : jamais servie, jamais la clé du compte (lot R9a).
          authorKeyOf(r) !== null &&
          accountActive(r.author, at) &&
          storyDenial(viewerOf(v), audienceStoryOf(r, at), relationOf(sets, r)) === null,
      )
      .sort((x, y) => rank(y) - rank(x) || (x.story.id < y.story.id ? 1 : -1));
    const shown = rest.slice(0, MENTIONS_PAGE);
    if (!shown.length) return { items: [], nextCursor: null, count };
    const shownIds = shown.map((r) => r.story.id);
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
    const items: StoryMentionItem[] = shown.map((r) => {
      const display = authorDisplay(r, storage.url);
      return {
        storyId: r.story.id,
        authorKey: authorKeyOf(r)?.key ?? storyAuthorKeyOf("user", r.story.authorId),
        authorName: display.name,
        authorAvatarUrl: display.avatarUrl,
        mediaUrl: mediaUrlOf(r.story.id, r.story.storageKey),
        caption: r.story.caption,
        createdAt: r.story.createdAt.toISOString(),
        expiresAt: r.story.expiresAt.toISOString(),
        copyId: copies.find((c) => c.from === r.story.id)?.id ?? null,
      };
    });
    const last = shown[shown.length - 1];
    return {
      items,
      nextCursor: rest.length > MENTIONS_PAGE && last ? `${rank(last)}_${last.story.id}` : null,
      count,
    };
  },
};

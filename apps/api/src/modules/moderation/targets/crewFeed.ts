// Cibles « publication de crew » et « commentaire de crew » (lot R5c1). Seuls les membres actifs du crew peuvent les
// signaler (404 sinon, comme leur lecture). Tour 2 (choix du coordinateur) : la modération voit les photos d'une
// publication **signalée**, dans le dossier de signalement seulement, par une route réservée aux modérateurs
// (`no-store`, consultation tracée) ; d'un sondage, la question et les réponses, jamais qui a voté quoi. Retrait =
// publication ou commentaire retiré, photos effacées.
import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "../../../db/client";
import {
  crewPollOptions,
  crewPolls,
  crewPostComments,
  crewPostPhotos,
  crewPosts,
  crews,
  profiles,
  reports,
} from "../../../db/schema";
import { requirePlatformRole } from "../../../lib/access";
import { now } from "../../../lib/deps";
import { notFound } from "../../../lib/errors";
import type { Viewer } from "../../../lib/session";
import { storage } from "../../../lib/storage";
import { audit } from "../../admin/audit";
import { requireCrewMember } from "../../crews/feed/access";
import { CREW_POST_FOLDER } from "../../crews/feed/posts";
import { softDeletePost } from "../../crews/feed/service";
import { goneView, type TargetRules, UUID_RE } from "./types";

/** Adresse d'une photo dans le dossier d'un signalement (modération seulement). */
const reportPhotoUrl = (reportId: string, storageKey: string) =>
  `/api/admin/reports/${reportId}/crew-photos/${storageKey.slice(CREW_POST_FOLDER.length)}`;

/**
 * `GET /api/admin/reports/:id/crew-photos/:nom` : une photo de la publication visée par ce signalement, pour un
 * modérateur (ou un super administrateur), consultation tracée. Rien d'autre : ni une autre publication, ni un autre
 * signalement.
 */
export async function crewPhotoForModeration(v: Viewer, reportId: string, name: string): Promise<Buffer> {
  await requirePlatformRole(v, "moderator");
  if (!/^[0-9a-f-]{36}\.webp$/.test(name)) throw notFound("Photo introuvable");
  const [report] = await db
    .select({ type: reports.targetType, targetId: reports.targetId })
    .from(reports)
    .where(eq(reports.id, reportId));
  if (report?.type !== "crew_post") throw notFound("Photo introuvable");
  const [photo] = await db
    .select({ key: crewPostPhotos.storageKey })
    .from(crewPostPhotos)
    .where(
      and(eq(crewPostPhotos.postId, report.targetId), eq(crewPostPhotos.storageKey, `${CREW_POST_FOLDER}${name}`)),
    );
  const data = photo ? await storage.get(photo.key) : null;
  if (!data) throw notFound("Photo introuvable");
  await audit(db, v, { action: "moderation.crew_photo_view", targetType: "report", targetId: reportId });
  return data;
}

async function postRow(id: string) {
  if (!UUID_RE.test(id)) return undefined;
  const [row] = await db.select().from(crewPosts).where(eq(crewPosts.id, id));
  return row;
}

async function commentRow(id: string) {
  if (!UUID_RE.test(id)) return undefined;
  const [row] = await db
    .select({ c: crewPostComments, post: crewPosts })
    .from(crewPostComments)
    .innerJoin(crewPosts, eq(crewPosts.id, crewPostComments.postId))
    .where(eq(crewPostComments.id, id));
  return row;
}

async function pseudoOf(userId: string) {
  const [p] = await db
    .select({ pseudo: profiles.pseudo, deletedAt: profiles.deletedAt })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  return p && !p.deletedAt ? p.pseudo : "Compte supprimé";
}

async function crewName(crewId: string) {
  const [c] = await db.select({ name: crews.name }).from(crews).where(eq(crews.id, crewId));
  return c?.name ?? "un crew";
}

export const crewPostTarget: TargetRules = {
  type: "crew_post",
  async resolve(v, targetId) {
    const post = await postRow(targetId);
    if (!post || post.deletedAt) throw notFound("Publication introuvable");
    await requireCrewMember(db, v, post.crewId);
    return { ownerId: post.authorId };
  },
  async view(report) {
    const post = await postRow(report.targetId);
    if (!post) return goneView("Publication de crew");
    const photos = await db
      .select({ key: crewPostPhotos.storageKey })
      .from(crewPostPhotos)
      .where(eq(crewPostPhotos.postId, post.id))
      .orderBy(asc(crewPostPhotos.position));
    const urls = photos.map((p) => reportPhotoUrl(report.id, p.key));
    // Sondage : la question et les réponses, jamais les voix de chacun.
    const [poll] = await db.select().from(crewPolls).where(eq(crewPolls.postId, post.id));
    const options = poll
      ? await db
          .select({ label: crewPollOptions.label })
          .from(crewPollOptions)
          .where(eq(crewPollOptions.postId, post.id))
          .orderBy(asc(crewPollOptions.position))
      : [];
    const pollText = poll ? [`Sondage : ${poll.question}`, ...options.map((o) => `• ${o.label}`)].join("\n") : null;
    return {
      title: `Publication de ${await pseudoOf(post.authorId)} dans « ${await crewName(post.crewId)} »`,
      text: [post.text, pollText].filter(Boolean).join("\n") || null,
      imageUrl: urls[0] ?? null,
      imageUrls: urls,
      link: null,
      gone: false,
      removed: Boolean(post.deletedAt),
    };
  },
  async remove(tx, v, report) {
    const [post] = await tx.select().from(crewPosts).where(eq(crewPosts.id, report.targetId)).for("update");
    if (!post || post.deletedAt) return [];
    return softDeletePost(tx, post.id, v.user.id);
  },
};

export const crewCommentTarget: TargetRules = {
  type: "crew_comment",
  async resolve(v, targetId) {
    const row = await commentRow(targetId);
    if (!row || row.c.deletedAt || row.post.deletedAt) throw notFound("Commentaire introuvable");
    await requireCrewMember(db, v, row.post.crewId);
    return { ownerId: row.c.authorId };
  },
  async view(report) {
    const row = await commentRow(report.targetId);
    if (!row) return goneView("Commentaire de crew");
    return {
      title: `Commentaire de ${await pseudoOf(row.c.authorId)} dans « ${await crewName(row.post.crewId)} »`,
      text: row.c.text,
      imageUrl: null,
      link: null,
      gone: false,
      removed: Boolean(row.c.deletedAt),
    };
  },
  async remove(tx, v, report) {
    await tx
      .update(crewPostComments)
      .set({ deletedAt: now(), deletedBy: v.user.id })
      .where(and(eq(crewPostComments.id, report.targetId), isNull(crewPostComments.deletedAt)));
    return [];
  },
};

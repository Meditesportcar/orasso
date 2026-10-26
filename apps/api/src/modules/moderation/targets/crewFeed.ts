// Cibles « publication de crew » et « commentaire de crew » (lot R5c1). Seuls les membres actifs du crew peuvent les
// signaler (404 sinon, comme leur lecture). L'administration voit le texte, jamais les photos (D36 : elles ne sortent
// jamais du crew) ; retrait = publication ou commentaire retiré, photos effacées.
import { and, eq, isNull } from "drizzle-orm";

import { db } from "../../../db/client";
import { crewPostComments, crewPostPhotos, crewPosts, crews, profiles } from "../../../db/schema";
import { now } from "../../../lib/deps";
import { notFound } from "../../../lib/errors";
import { requireCrewMember } from "../../crews/feed/access";
import { softDeletePost } from "../../crews/feed/service";
import { goneView, type TargetRules, UUID_RE } from "./types";

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
      .select({ id: crewPostPhotos.id })
      .from(crewPostPhotos)
      .where(eq(crewPostPhotos.postId, post.id));
    const note = photos.length
      ? `${photos.length > 1 ? `${photos.length} photos` : "1 photo"}, visibles des seuls membres du crew.`
      : null;
    return {
      title: `Publication de ${await pseudoOf(post.authorId)} dans « ${await crewName(post.crewId)} »`,
      text: [post.text, note].filter(Boolean).join("\n") || null,
      imageUrl: null,
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

// Cibles « publication du Fil » (lot R7e1) et « story » (cible posée ici, branchée par le lot R7f1).
// Publication du Fil : signalable par qui peut la voir (404 sinon, comme sa lecture) ; la modération voit les photos dans
// le dossier du signalement (route `GET /admin/reports/:id/media/:name`, `no-store`, consultation tracée). Retrait :
// publication retirée, photos effacées.
import { and, asc, eq } from "drizzle-orm";

import { db } from "../../../db/client";
import { feedPostPhotos, feedPosts, profiles } from "../../../db/schema";
import { now } from "../../../lib/deps";
import { notFound } from "../../../lib/errors";
import { storage } from "../../../lib/storage";
import { requireVisiblePost, UUID_RE } from "../../feed/access";
import { softDeletePost } from "../../feed/posts";
import { registerReportMedia, reportMediaUrl } from "../media";
import { goneView, type TargetRules } from "./types";

/** Nom d'un média dans l'adresse : la fin de la clé `feed/<postId>/<nom>`. */
const nameOf = (storageKey: string) => storageKey.slice(storageKey.lastIndexOf("/") + 1);

registerReportMedia("feed_post", async (report, name) => {
  if (!UUID_RE.test(report.targetId)) return null;
  // Seules les photos de cette publication : la clé se reconstruit, le nom ne désigne jamais un autre dossier.
  const key = `feed/${report.targetId}/${name}`;
  const [known] = await db
    .select({ id: feedPostPhotos.id })
    .from(feedPostPhotos)
    .where(and(eq(feedPostPhotos.postId, report.targetId), eq(feedPostPhotos.storageKey, key)));
  if (!known) return null;
  const data = await storage.get(key);
  return data ? { data, contentType: "image/webp" } : null;
});

async function pseudoOf(userId: string) {
  const [p] = await db
    .select({ pseudo: profiles.pseudo, deletedAt: profiles.deletedAt })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  return p && !p.deletedAt ? p.pseudo : "Compte supprimé";
}

export const feedPostTarget: TargetRules = {
  type: "feed_post",
  async resolve(v, targetId) {
    const row = await requireVisiblePost(v, targetId);
    return { ownerId: row.post.authorId };
  },
  async view(report) {
    if (!UUID_RE.test(report.targetId)) return goneView("Publication du Fil");
    const [post] = await db.select().from(feedPosts).where(eq(feedPosts.id, report.targetId));
    if (!post) return goneView("Publication du Fil");
    const photos = await db
      .select({ key: feedPostPhotos.storageKey })
      .from(feedPostPhotos)
      .where(eq(feedPostPhotos.postId, post.id))
      .orderBy(asc(feedPostPhotos.position));
    const urls = photos.map((p) => reportMediaUrl(report.id, nameOf(p.key)));
    return {
      title: `Publication de ${await pseudoOf(post.authorId)} dans le Fil`,
      text: post.caption,
      imageUrl: urls[0] ?? null,
      imageUrls: urls,
      link: null,
      gone: false,
      removed: Boolean(post.deletedAt),
    };
  },
  async remove(tx, v, report) {
    if (!UUID_RE.test(report.targetId)) return [];
    const [post] = await tx.select().from(feedPosts).where(eq(feedPosts.id, report.targetId)).for("update");
    if (!post || post.deletedAt) return [];
    return softDeletePost(tx, post.id, v.user.id, now());
  },
};

/**
 * Cible « story » : l'énumération est posée par le lot R7e1 pour que R7f1 n'ait pas à y retoucher. Tant que R7f1 n'a pas
 * branché ses règles (`registerStoryTarget`), une story est introuvable.
 */
let storyRules: Omit<TargetRules, "type"> = {
  async resolve() {
    throw notFound("Story introuvable");
  },
  async view() {
    return goneView("Story");
  },
};

/** Appelé par le module des stories (R7f1) : ses règles de résolution, de vue et de retrait. */
export function registerStoryTarget(rules: Omit<TargetRules, "type">) {
  storyRules = rules;
}

export const storyTarget: TargetRules = {
  type: "story",
  resolve: (v, targetId) => storyRules.resolve(v, targetId),
  view: (report) => storyRules.view(report),
  remove: (tx, v, report, after) => (storyRules.remove ? storyRules.remove(tx, v, report, after) : Promise.resolve([])),
};

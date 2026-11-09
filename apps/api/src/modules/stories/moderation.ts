// Cible de signalement « story » (lot R7f1). On ne signale que ce qu'on peut voir (404 sinon, comme pour un contenu
// inconnu). La modération voit le média signalé par `GET /admin/reports/:id/media/:name` (registre de
// `moderation/media.ts`), même après l'expiration : `stories.expire` garde le fichier d'une story qui a un signalement
// ouvert. Retrait par le super administrateur : la story et ses copies sont supprimées, les fichiers effacés.
import { storyLabels } from "@orasso/shared";
import { eq } from "drizzle-orm";

import { db } from "../../db/client";
import { profiles, stories } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { storage } from "../../lib/storage";
import { registerReportMedia } from "../moderation/media";
import { goneView, type TargetRules, UUID_RE } from "../moderation/targets/types";
import { fileNameOf } from "./serialize";
import { requireVisibleStory, softDeleteWithCopies } from "./service";

registerReportMedia("story", async (targetId, name) => {
  if (!UUID_RE.test(targetId)) return null;
  const [s] = await db.select().from(stories).where(eq(stories.id, targetId));
  if (!s || s.filesRemovedAt) return null;
  const key = [s.storageKey, s.posterKey].find((k) => k && fileNameOf(k) === name);
  if (!key) return null;
  const data = await storage.get(key);
  return data ? { data, contentType: key.endsWith(".mp4") ? "video/mp4" : "image/webp" } : null;
});

export const storyTarget: TargetRules = {
  type: "story",
  async resolve(v, targetId) {
    if (!UUID_RE.test(targetId)) throw notFound("Story introuvable");
    const row = await requireVisibleStory(v, targetId);
    return { ownerId: row.story.authorId };
  },
  async view(report) {
    if (!UUID_RE.test(report.targetId)) return goneView(storyLabels.reportGone);
    const [s] = await db.select().from(stories).where(eq(stories.id, report.targetId));
    if (!s) return goneView(storyLabels.reportGone);
    const [p] = await db.select({ pseudo: profiles.pseudo }).from(profiles).where(eq(profiles.userId, s.authorId));
    return {
      title: storyLabels.reportTitle(p?.pseudo ?? "Compte supprimé"),
      text: s.caption,
      imageUrl: s.filesRemovedAt
        ? null
        : `/api/admin/reports/${report.id}/media/${fileNameOf(s.posterKey ?? s.storageKey)}`,
      link: null,
      gone: Boolean(s.filesRemovedAt),
      removed: Boolean(s.deletedAt),
    };
  },
  async remove(tx, _v, report) {
    const ids = await softDeleteWithCopies(tx, [report.targetId]);
    // Les fichiers partent après la validation (rendus à l'appelant) ; le balayage constate qu'ils ont disparu.
    const rows = await tx.select().from(stories).where(eq(stories.id, report.targetId));
    return ids.length ? rows.flatMap((r) => [r.storageKey, ...(r.posterKey ? [r.posterKey] : [])]) : [];
  },
};

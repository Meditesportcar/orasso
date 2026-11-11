// Cible « commentaire d'une publication du Fil » (lot R8k1). Signalable par qui peut lire le commentaire (404 sinon, comme
// sa lecture : publication visible, auteur en règle, compte privé suivi). Motifs : ceux d'un commentaire de crew. Retrait =
// commentaire (et ses réponses) retiré, compteurs ajustés dans la transaction de la décision. L'auteur ne sait pas qui a signalé.
import { eq } from "drizzle-orm";

import { db } from "../../../db/client";
import { feedPostComments, profiles } from "../../../db/schema";
import { now } from "../../../lib/deps";
import { UUID_RE } from "../../feed/access";
import { lockPostOfComment, softDeleteComment } from "../../feed/comments/remove";
import { requireVisibleComment } from "../../feed/comments/view";
import { goneView, type TargetRules } from "./types";

async function pseudoOf(userId: string) {
  const [p] = await db
    .select({ pseudo: profiles.pseudo, deletedAt: profiles.deletedAt })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  return p && !p.deletedAt ? p.pseudo : "Compte supprimé";
}

export const feedCommentTarget: TargetRules = {
  type: "feed_comment",
  // Même ordre de verrous que la suppression : la publication du commentaire d'abord.
  async lock(tx, targetId) {
    await lockPostOfComment(tx, targetId);
  },
  async resolve(v, targetId) {
    const found = await requireVisibleComment(v, targetId);
    return { ownerId: found.c.authorId };
  },
  async view(report) {
    if (!UUID_RE.test(report.targetId)) return goneView("Commentaire du Fil");
    const [row] = await db.select().from(feedPostComments).where(eq(feedPostComments.id, report.targetId));
    if (!row) return goneView("Commentaire du Fil");
    return {
      title: `Commentaire de ${await pseudoOf(row.authorId)} sous une publication du Fil`,
      text: row.text,
      imageUrl: null,
      link: null,
      gone: false,
      removed: row.deletedAt !== null,
    };
  },
  async remove(tx, v, report) {
    await softDeleteComment(tx, report.targetId, v.user.id, now());
    return [];
  },
};

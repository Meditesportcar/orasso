// Cible « commentaire d'une publication du Fil » (lot R8k1). Signalable par qui peut lire le commentaire (404 sinon, comme
// sa lecture : publication visible, auteur en règle, compte privé suivi). Motifs : ceux d'un commentaire de crew. Retrait =
// commentaire (et ses réponses) retiré, compteurs ajustés dans la transaction de la décision. L'auteur ne sait pas qui a signalé.
import { and, eq, inArray } from "drizzle-orm";

import { db } from "../../../db/client";
import { feedPostComments, profiles, reports } from "../../../db/schema";
import { now } from "../../../lib/deps";
import type { Tx } from "../../../lib/tx";
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

/** Un signalement attend-il encore une décision sur l'un de ces commentaires ? */
async function hasOpenReport(tx: Tx, ids: string[]): Promise<boolean> {
  if (!ids.length) return false;
  const [open] = await tx
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.targetType, "feed_comment"),
        inArray(reports.targetId, ids),
        inArray(reports.status, ["pending", "reviewing"]),
      ),
    )
    .limit(1);
  return Boolean(open);
}

/**
 * Efface la ligne d'un commentaire gardé comme preuve (retiré à la suppression du compte de son auteur) quand plus aucun
 * signalement n'attend sur lui ni sur ses réponses ; puis, de même, son commentaire de premier niveau s'il n'est gardé que pour cela.
 */
async function purgeHeld(tx: Tx, id: string): Promise<void> {
  const [row] = await tx
    .select({ c: feedPostComments, gone: profiles.deletedAt })
    .from(feedPostComments)
    // Retiré par la suppression d'un compte : `deleted_by` est ce compte.
    .innerJoin(profiles, eq(profiles.userId, feedPostComments.deletedBy))
    .where(eq(feedPostComments.id, id));
  if (!row || !row.c.deletedAt || !row.gone) return;
  const replies = await tx
    .select({ id: feedPostComments.id })
    .from(feedPostComments)
    .where(eq(feedPostComments.parentId, id));
  if (await hasOpenReport(tx, [id, ...replies.map((r) => r.id)])) return;
  await tx.delete(feedPostComments).where(eq(feedPostComments.id, id));
  if (row.c.parentId) await purgeHeld(tx, row.c.parentId);
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
  // Retiré avec le compte de son auteur pendant que le signalement attendait : le texte était gardé pour la preuve. Une fois la
  // dernière décision prise, il part.
  async afterDecision(tx, report) {
    if (UUID_RE.test(report.targetId)) await purgeHeld(tx, report.targetId);
    return [];
  },
  async remove(tx, v, report) {
    await softDeleteComment(tx, report.targetId, v.user.id, now());
    return [];
  },
};

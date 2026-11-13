// Le Fil (lot R7e1) : compte supprimé. Ses publications personnelles partent (avec leurs photos et leurs flammes), ses flammes sur les
// publications des autres aussi (leur compteur baisse). Appelé par `accountService.anonymize`, dans sa transaction ;
// rend les clés des photos à effacer après la validation.
// Exception (tour 3, même règle que le retrait par l'auteur) : une publication qui a un signalement en attente est
// seulement retirée (cachée, flammes effacées) ; ses photos et sa ligne restent comme preuve jusqu'à la décision, qui les
// efface (`moderation/targets/feedPost.ts`, `afterDecision`).
import { and, eq, inArray, or, sql } from "drizzle-orm";

import {
  feedCoauthorInviteLog,
  feedPostCoauthors,
  feedPostPhotos,
  feedPostReactions,
  feedPosts,
  reports,
} from "../../db/schema";
import { now } from "../../lib/deps";
import type { Tx } from "../../lib/tx";
import { dropCoauthorNotifications } from "./coauthors";

export async function anonymizeFeedForDeletedAccount(tx: Tx, userId: string): Promise<string[]> {
  // Ses flammes ailleurs : le compteur des autres publications baisse d'un.
  await tx
    .update(feedPosts)
    .set({ reactionsCount: sql`greatest(0, ${feedPosts.reactionsCount} - 1)` })
    .where(
      inArray(
        feedPosts.id,
        tx.select({ id: feedPostReactions.postId }).from(feedPostReactions).where(eq(feedPostReactions.userId, userId)),
      ),
    );
  await tx.delete(feedPostReactions).where(eq(feedPostReactions.userId, userId));
  // Collaboration (R8o) : les publications qu'il cosigne. Lues avant le verrou, car elles font partie de l'ensemble à verrouiller.
  const cosigned = (
    await tx
      .select({ id: feedPostCoauthors.postId })
      .from(feedPostCoauthors)
      .where(and(eq(feedPostCoauthors.coauthorKind, "user"), eq(feedPostCoauthors.coauthorId, userId)))
  ).map((r) => r.id);
  // Verrou, **en une seule requête triée par identifiant**, de l'union de ses publications personnelles et de celles qu'il
  // cosigne (petit lot API, P44) : deux co-auteurs mutuels anonymisés en même temps prennent les verrous dans le même ordre
  // et ne s'interbloquent pas (40P01). Le verrou précède la lecture des signalements : un signalement ou une décision qui
  // arrive en même temps est vu, ou attend la fin. Vague R8 : seules ses publications personnelles partent ; celles d'une
  // page restent à la page (`author_id` garde la ligne `user`, que l'anonymisation conserve).
  const locked = await tx
    .select({ id: feedPosts.id, authorId: feedPosts.authorId, persona: feedPosts.persona })
    .from(feedPosts)
    .where(
      cosigned.length
        ? or(and(eq(feedPosts.authorId, userId), eq(feedPosts.persona, "fan")), inArray(feedPosts.id, cosigned))
        : and(eq(feedPosts.authorId, userId), eq(feedPosts.persona, "fan")),
    )
    .orderBy(feedPosts.id)
    .for("update");
  const ids = locked.filter((p) => p.authorId === userId && p.persona === "fan").map((p) => p.id);
  // Le journal des envois du compte part avec lui (la cascade attend une suppression physique, que l'anonymisation ne fait pas).
  await tx.delete(feedCoauthorInviteLog).where(eq(feedCoauthorInviteLog.invitedBy, userId));
  // Son nom disparaît des publications des autres (elles restent chez leur auteur) et les notifications qui le nomment partent
  // avec (relevées avant d'effacer la ligne) ; les invitations qu'il avait envoyées pour ses publications personnelles partent
  // avec elles.
  const touched = [...new Set([...cosigned, ...ids])];
  await dropCoauthorNotifications(tx, touched);
  if (cosigned.length) await tx.delete(feedPostCoauthors).where(inArray(feedPostCoauthors.postId, cosigned));
  if (ids.length) await tx.delete(feedPostCoauthors).where(inArray(feedPostCoauthors.postId, ids));
  if (!ids.length) return [];
  const heldRows = await tx
    .select({ id: reports.targetId })
    .from(reports)
    .where(
      and(
        eq(reports.targetType, "feed_post"),
        inArray(reports.targetId, ids),
        inArray(reports.status, ["pending", "reviewing"]),
      ),
    );
  const held = [...new Set(heldRows.map((r) => r.id))];
  const gone = ids.filter((id) => !held.includes(id));
  if (held.length) {
    const at = now();
    await tx
      .update(feedPosts)
      .set({
        deletedAt: sql`coalesce(${feedPosts.deletedAt}, ${at.toISOString()}::timestamptz)`,
        deletedBy: sql`coalesce(${feedPosts.deletedBy}, ${userId})`,
      })
      .where(inArray(feedPosts.id, held));
    await tx.delete(feedPostReactions).where(inArray(feedPostReactions.postId, held));
  }
  if (!gone.length) return [];
  const keys = (
    await tx.select({ key: feedPostPhotos.storageKey }).from(feedPostPhotos).where(inArray(feedPostPhotos.postId, gone))
  ).map((r) => r.key);
  // Photos et flammes partent avec la publication (clés étrangères en cascade).
  await tx.delete(feedPosts).where(inArray(feedPosts.id, gone));
  return keys;
}

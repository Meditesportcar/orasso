// Lecture du Journal en lot (lot R8k1, tour 7). `readableBatch` est `stillReadable` pour beaucoup de commentaires à la fois :
// même règle, mêmes verdicts, mais un nombre **fixe** de requêtes (commentaires et auteurs, commentaires de premier niveau,
// publications et auteurs, profil du destinataire, ses abonnements) quel que soit le nombre de lignes. La garde de lecture
// du Journal et de la pastille (`registerJournalGuard`) s'en sert pour toutes les lignes `feed_comment*` d'une page.
import { canSeeComment, canSeeFeedPost, type FeedPostFacts } from "@orasso/shared";
import { and, desc, eq, inArray, isNull, lte, ne, type SQL, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { feedPostComments, feedPosts, type notifications, profiles, userFollows } from "../../../db/schema";
import { now } from "../../../lib/deps";
import { storage } from "../../../lib/storage";
import type { Executor } from "../../../lib/tx";
import { registerJournalGuard } from "../../notifications/service";
import { profileOkSql, unavailable } from "../access";
import { COMMENT_TYPES, groupScopeKeys } from "./notify";
import { readableBatch } from "./readers";
import { anyOf } from "./sqlany";

type Row = typeof notifications.$inferSelect;

type Verdict = {
  shown: boolean;
  actors?: string[];
  avatars?: Record<string, string | null>;
  commentReadable?: boolean;
  /** Un commentaire lisible de la ligne, pour remplacer l'identifiant du commentaire cité quand il ne se lit plus. */
  readableCommentId?: string;
};
type Cand = { id: string; authorId: string; postId: string; replyToId: string | null };

/**
 * Verdict de toutes les lignes `feed_comment*` d'une page (ou de la pastille) pour leur destinataire. Une ligne tient tant
 * qu'un de ses commentaires se lit ; pour une ligne regroupée, `actors` ne nomme que les personnes dont un commentaire se
 * lit (au plus les 15 plus récents de chacune, comme la recherche de remplacement de la garde de livraison).
 */
export async function commentNotificationVerdicts(userId: string, rows: Row[]): Promise<Map<string, Verdict>> {
  const c = feedPostComments;
  const out = new Map<string, Verdict>();
  const groups = rows.flatMap((n) => {
    const g = groupScopeKeys(n);
    return g ? [{ n, g }] : [];
  });
  const posts = [...new Set(groups.flatMap(({ g }) => (g.kind === "post" ? [g.key] : [])))];
  const targets = [...new Set(groups.flatMap(({ g }) => (g.kind === "reply" ? [g.key] : [])))];
  const actorUnion = [...new Set(groups.flatMap(({ g }) => g.actorIds))];
  const pool: Cand[] = [];
  // Au plus 15 commentaires récents par portée (publication ou commentaire visé) et par acteur, bornés en SQL : une
  // publication très active ne fait pas disparaître la ligne d'une autre.
  const ranked = (scopeCol: typeof c.postId | typeof c.replyToId, inScope: SQL | undefined) =>
    db
      .select({
        id: c.id,
        authorId: c.authorId,
        postId: c.postId,
        replyToId: c.replyToId,
        createdAt: c.createdAt,
        rank: sql<number>`row_number() over (partition by ${scopeCol}, ${c.authorId} order by ${c.createdAt} desc, ${c.id} desc)`.as(
          "rank",
        ),
      })
      .from(c)
      .where(and(inScope, isNull(c.deletedAt), anyOf(c.authorId, actorUnion, "text"), ne(c.authorId, userId)))
      .as("ranked");
  for (const [scopeCol, inScope] of [
    [c.postId, posts.length ? anyOf(c.postId, posts, "uuid") : undefined],
    [c.replyToId, targets.length ? anyOf(c.replyToId, targets, "uuid") : undefined],
  ] as const) {
    if (!actorUnion.length || !inScope) continue;
    const sub = ranked(scopeCol, inScope);
    pool.push(
      ...(await db
        .select({ id: sub.id, authorId: sub.authorId, postId: sub.postId, replyToId: sub.replyToId })
        .from(sub)
        .where(lte(sub.rank, 15))
        .orderBy(desc(sub.createdAt), desc(sub.id))),
    );
  }
  const candidatesOf = (g: { kind: "post" | "reply"; key: string; actorIds: string[] }) => {
    const seen = new Map<string, number>();
    const mine: Cand[] = [];
    for (const cand of pool) {
      if (!g.actorIds.includes(cand.authorId)) continue;
      if (g.kind === "post" ? cand.postId !== g.key : cand.replyToId !== g.key) continue;
      const k = seen.get(cand.authorId) ?? 0;
      if (k >= 15) continue;
      seen.set(cand.authorId, k + 1);
      mine.push(cand);
    }
    return mine;
  };
  const byGroup = new Map(groups.map(({ n, g }) => [n.id, candidatesOf(g)]));
  const commentIds = rows.flatMap((n) => {
    const id = (n.data as { commentId?: unknown }).commentId;
    return typeof id === "string" ? [id] : [];
  });
  const extra = [...byGroup.values()].flatMap((list) => list.map((x) => x.id));
  const { readable, authorOf, pseudoOf, avatarOf } = await readableBatch(db, userId, [...commentIds, ...extra]);
  for (const n of rows) {
    const id = (n.data as { commentId?: unknown }).commentId;
    if (typeof id !== "string") {
      out.set(n.id, { shown: true });
      continue;
    }
    const cands = byGroup.get(n.id);
    if (!cands) {
      out.set(n.id, { shown: readable.has(id), commentReadable: readable.has(id) });
      continue;
    }
    const authors = new Set(cands.filter((x) => readable.has(x.id)).map((x) => x.authorId));
    const own = readable.has(id) ? authorOf.get(id) : undefined;
    if (own) authors.add(own);
    out.set(n.id, {
      shown: authors.size > 0,
      commentReadable: readable.has(id),
      readableCommentId: readable.has(id) ? id : cands.find((x) => readable.has(x.id))?.id,
      actors: [...authors].flatMap((a) => pseudoOf.get(a) ?? []),
      avatars: Object.fromEntries(
        [...authors].flatMap((a) =>
          pseudoOf.has(a) ? [[pseudoOf.get(a) as string, avatarOf.get(pseudoOf.get(a) as string) ?? null]] : [],
        ),
      ),
    });
  }
  return out;
}

registerJournalGuard([...COMMENT_TYPES], commentNotificationVerdicts);

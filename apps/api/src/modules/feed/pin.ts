// Épingler une publication du journal d'un événement (vague R8, lot R8a2, ARCHITECTURE-R8 § 2.4) : une seule par fiche
// d'événement (index unique partiel `feed_posts_pinned_key`). Les responsables de la structure de l'événement (second
// facteur compris) épinglent ; épingler en remplace une autre **dans la même transaction**, sous un verrou de l'événement :
// deux épinglages simultanés se suivent, le dernier garde l'épingle, aucun ne rend un 500.
import type { PinState } from "@orasso/shared";
import { and, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { feedPosts } from "../../db/schema";
import { requireAuthorship } from "../../lib/authorship";
import { now } from "../../lib/deps";
import { AppError, notFound } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { type Tx, withTx } from "../../lib/tx";
import { UUID_RE } from "./access";
import { requireJournalEvent } from "./lists";

const sqlState = (error: unknown): string | undefined => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause ?? e).code;
};

/**
 * L'épingle dans la transaction de l'appelant (lot R8d : la façade des annonces épingle l'annonce et la publication ensemble).
 * Prend le verrou de l'événement, revérifie les droits ; rend l'identifiant de l'événement.
 */
export async function pinInTx(tx: Tx, v: Viewer, eventId: string, postId: string, pin: boolean): Promise<string> {
  // Verrou de l'événement, jamais celui d'une ligne : l'index unique ne doit pas voir deux épingles à la fois.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pin:${eventId}`}))`);
  const event = await requireJournalEvent(tx, eventId);
  await requireAuthorship(v, { persona: "organizer", structureId: event.structureId }, tx);
  const [post] = await tx
    .select({ id: feedPosts.id, pinnedAt: feedPosts.pinnedAt })
    .from(feedPosts)
    .where(
      and(
        eq(feedPosts.id, postId),
        eq(feedPosts.persona, "organizer"),
        eq(feedPosts.structureId, event.structureId),
        eq(feedPosts.eventId, event.id),
        eq(feedPosts.eventRole, "organizer"),
        isNull(feedPosts.deletedAt),
      ),
    );
  if (!post) throw notFound("Cette publication n'est pas dans le journal de cet événement.");
  if (pin) {
    await tx
      .update(feedPosts)
      .set({ pinnedAt: null })
      .where(and(eq(feedPosts.eventId, event.id), isNotNull(feedPosts.pinnedAt), ne(feedPosts.id, post.id)));
    if (!post.pinnedAt) await tx.update(feedPosts).set({ pinnedAt: now() }).where(eq(feedPosts.id, post.id));
  } else if (post.pinnedAt) {
    await tx.update(feedPosts).set({ pinnedAt: null }).where(eq(feedPosts.id, post.id));
  }
  return event.id;
}

/** `PUT` (`pin = true`) ou `DELETE` (`pin = false`) `/events/:id/feed-posts/:postId/pin`. Idempotent. */
export async function setPinned(v: Viewer, eventId: string, postId: string, pin: boolean): Promise<PinState> {
  rateLimit("feedWrite", v.user.id);
  if (!UUID_RE.test(postId)) throw notFound("Publication introuvable");
  // L'état rendu est l'état **final**, lu après la validation : de deux épinglages simultanés, l'autre reçoit ce que le
  // gagnant a posé.
  const run = async (): Promise<PinState> => {
    const id = await withTx((tx) => pinInTx(tx, v, eventId, postId, pin));
    const [current] = await db
      .select({ id: feedPosts.id })
      .from(feedPosts)
      .where(and(eq(feedPosts.eventId, id), isNotNull(feedPosts.pinnedAt), isNull(feedPosts.deletedAt)));
    return { pinnedPostId: current?.id ?? null };
  };
  try {
    return await run();
  } catch (error) {
    // Garde-fou : une collision de l'index unique (jamais attendue sous le verrou) se rejoue une fois, puis se dit en 409.
    if (sqlState(error) === "23505" || sqlState(error) === "40P01") {
      try {
        return await run();
      } catch (again) {
        if (sqlState(again) === "23505" || sqlState(again) === "40P01") {
          throw new AppError(409, "conflict", "Quelqu'un vient de faire la même chose : réessaie.");
        }
        throw again;
      }
    }
    throw error;
  }
}

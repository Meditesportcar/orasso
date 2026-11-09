// Expiration des stories (lot R7f1, ARCHITECTURE-R7 § 2.5) : tâche `stories.expire` toutes les 5 minutes. Une story de
// plus de 24 h est marquée supprimée (avec ses copies), ses fichiers sont effacés, la vignette des réponses disparaît.
// Seule exception : une story qui a un signalement ouvert garde son fichier (invisible de tous sauf des modérateurs)
// jusqu'à la décision. Les lignes (vues, flammes) restent 7 jours pour les compteurs, puis disparaissent.
import { and, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { messages, stories } from "../../db/schema";
import { now } from "../../lib/deps";
import { removeOrRetry } from "../vehicles/photos-blur";

export const STORY_ROWS_KEEP_MS = 7 * 86_400_000;

/** Signalements ouverts : `pending` ou `reviewing`. */
const openReportOn = sql`exists (select 1 from reports r where r.target_type = 'story' and r.target_id = ${stories.id}::text and r.status in ('pending','reviewing'))`;

/**
 * Efface les fichiers des stories supprimées données (hors signalement ouvert) et détache les réponses. Rend le nombre de
 * stories dont les fichiers sont partis.
 */
export async function purgeStoryFiles(ids?: string[]): Promise<number> {
  const rows = await db
    .select({ id: stories.id, key: stories.storageKey, poster: stories.posterKey })
    .from(stories)
    .where(
      and(
        isNotNull(stories.deletedAt),
        isNull(stories.filesRemovedAt),
        sql`not ${openReportOn}`,
        ids ? inArray(stories.id, ids) : undefined,
      ),
    )
    .limit(500);
  if (!rows.length) return 0;
  for (const r of rows) {
    await removeOrRetry(r.key);
    if (r.poster) await removeOrRetry(r.poster);
  }
  const done = rows.map((r) => r.id);
  await db.update(stories).set({ filesRemovedAt: now() }).where(inArray(stories.id, done));
  // La vignette d'une réponse n'est servie que tant que la story existe.
  await db.update(messages).set({ storyId: null }).where(inArray(messages.storyId, done));
  return rows.length;
}

export const storiesExpire = {
  async run(): Promise<{ marked: number; files: number; purged: number }> {
    const at = now();
    // 1. Les stories échues, et leurs copies (même expiration : la copie hérite de la date de l'originale).
    const marked = await db
      .update(stories)
      .set({ deletedAt: at })
      .where(and(isNull(stories.deletedAt), lt(stories.expiresAt, at)))
      .returning({ id: stories.id });
    // Une copie dont l'originale est supprimée part avec elle (cascade logique de la suppression douce).
    await db.execute(sql`
      update stories c set deleted_at = ${at}
      from stories o
      where c.shared_from_story_id = o.id and o.deleted_at is not null and c.deleted_at is null`);
    // 2. Les fichiers (ceux d'une story supprimée à la main ou par la modération, aussi).
    const files = await purgeStoryFiles();
    // 3. Les lignes, 7 jours après, une fois les fichiers partis.
    const purged = await db
      .delete(stories)
      .where(
        and(
          isNotNull(stories.deletedAt),
          isNotNull(stories.filesRemovedAt),
          lt(stories.deletedAt, new Date(at.getTime() - STORY_ROWS_KEEP_MS)),
          sql`not ${openReportOn}`,
        ),
      )
      .returning({ id: stories.id });
    return { marked: marked.length, files, purged: purged.length };
  },
};

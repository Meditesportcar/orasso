// Retrait de stories hors de l'action de leur auteur (lot R7f1, tour 2) : suppression du compte (anonymisation) et
// dissolution d'un crew passent par ici, jamais par la seule cascade des clés étrangères (gardée comme filet) : les
// stories et leurs copies sont marquées supprimées dans la transaction du geste, puis, après sa validation, leurs
// fichiers sont effacés. Une story qui a un signalement ouvert garde son fichier jusqu'à la décision (voir `expire.ts`).
import { and, eq, isNull, sql } from "drizzle-orm";

import type { db } from "../../db/client";
import { stories } from "../../db/schema";
import { now } from "../../lib/deps";
import type { Tx } from "../../lib/tx";
import { detachReplies, purgeStoryFiles } from "./expire";

type After = (cb: () => unknown) => void;

/** Marque supprimées les stories données et toutes leurs copies (récursif) ; rend tous les identifiants touchés. */
export async function softDeleteWithCopies(ex: Tx | typeof db, ids: string[]): Promise<string[]> {
  if (!ids.every((i) => /^[0-9a-f-]{36}$/i.test(i))) throw new Error("Identifiant invalide");
  const at = now();
  const rows = await ex.execute<{ id: string }>(sql`
    with recursive tree(id) as (
      select id from stories where id = any(${sql.raw(`'{${ids.join(",")}}'::uuid[]`)})
      union
      select s.id from stories s join tree t on s.shared_from_story_id = t.id
    )
    update stories set deleted_at = coalesce(deleted_at, ${at}), updated_at = ${at}
    where id in (select id from tree)
    returning id`);
  const all = (rows as unknown as { rows: { id: string }[] }).rows.map((r) => r.id);
  await detachReplies(ex, all);
  return all;
}

/** Marque supprimées les stories d'un auteur ou d'un crew (et leurs copies), puis efface leurs fichiers après la validation. */
export async function retireStories(tx: Tx, after: After, which: { authorId: string } | { crewId: string }) {
  const rows = await tx
    .select({ id: stories.id })
    .from(stories)
    .where(
      and(
        isNull(stories.deletedAt),
        "authorId" in which ? eq(stories.authorId, which.authorId) : eq(stories.crewId, which.crewId),
      ),
    );
  if (!rows.length) return [];
  const ids = await softDeleteWithCopies(
    tx,
    rows.map((r) => r.id),
  );
  after(() => purgeStoryFiles(ids).catch(() => undefined));
  return ids;
}

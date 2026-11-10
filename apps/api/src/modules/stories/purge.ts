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
  // Verrou d'abord, dans une instruction à part : un partage en cours (qui tient l'originale en `FOR SHARE`) se termine
  // avant, et l'instruction suivante (nouvelle photo de la base) voit sa copie. Sans cela, une copie insérée entre-temps
  // survivrait à la suppression (lot R7h, tour 2).
  await ex.execute(
    sql`select id from stories where id = any(${sql.raw(`'{${ids.join(",")}}'::uuid[]`)}) order by id for update`,
  );
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

/**
 * Retire les copies des stories d'une personne : `all` (compte suspendu, banni) = toutes ses stories, copies de ses
 * stories personnelles ou signées d'une structure ou d'un pro ; sinon (compte passé en privé) seulement ses stories
 * personnelles, la structure et le pro restant publics. Rend les identifiants supprimés (fichiers effacés après la validation).
 */
export async function dropCopiesOfAuthor(
  ex: Tx | typeof db,
  authorId: string,
  scope: "all" | "personal" = "personal",
): Promise<string[]> {
  const res = await ex.execute<{ id: string }>(sql`
    select c.id from stories c join stories o on o.id = c.shared_from_story_id
    where o.author_id = ${authorId} ${scope === "all" ? sql`` : sql`and o.persona not in ('organizer', 'pro')`}
      and c.deleted_at is null`);
  const ids = res.rows.map((r) => r.id);
  if (!ids.length) return [];
  return softDeleteWithCopies(ex, ids);
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

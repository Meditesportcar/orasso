// Lot R9f : la migration `album-tags` n'ajoute que des objets neufs (une table, trois types, une colonne nulle sur `stories`, des index) et ne
// bouge aucune donnée : rejouée sur une base déjà peuplée, le nombre de stories et leurs lignes sont inchangés.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { resetDb, signUp, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { stories } from "../../db/schema";
import { paris } from "./albums-test-helpers";

afterAll(async () => {
  await pool.end();
});

const migrationFile = () => {
  const dir = fileURLToPath(new URL("../../../drizzle/", import.meta.url));
  const name = readdirSync(dir).find((f) => /^\d{4}_album-tags\.sql$/.test(f));
  if (!name) throw new Error("Migration album-tags introuvable");
  return readFileSync(`${dir}${name}`, "utf8");
};

class Rollback extends Error {}

describe("migration album-tags", () => {
  beforeEach(async () => {
    await resetDb();
    useClock(paris(11, 5, 12));
  });

  it("ajouts seulement : aucune suppression, aucune mise à jour, une colonne nulle", () => {
    const file = migrationFile();
    expect(file).not.toMatch(/\b(DROP\s|DELETE\s+FROM|TRUNCATE)/i);
    expect(file).not.toMatch(/\bUPDATE\s+"/i);
    expect(file).toContain('CREATE TABLE "album_photo_tags"');
    expect(file).toContain('ALTER TABLE "stories" ADD COLUMN "source_album_photo_id" uuid;');
    // L'unicité d'une personne ne vaut que par pseudo ; aucun filtre sur le retrait.
    expect(file).toMatch(
      /CREATE UNIQUE INDEX "album_photo_tags_user_key"[^;]*WHERE "album_photo_tags"\."target_kind" = 'user'/,
    );
    const unique = /CREATE UNIQUE INDEX "album_photo_tags_user_key"[^;]*;/.exec(file)?.[0] ?? "";
    expect(unique).not.toContain("removed_at");
    expect(/CONSTRAINT "album_photo_tags_vehicle_key" UNIQUE([^)]*)/.exec(file)?.[0]).not.toContain("removed_at");
  });

  it("rejouée sur une base peuplée (état d'avant), les stories sont les mêmes, avant et après", async () => {
    const u = await signUp("Mig_66");
    for (let i = 0; i < 3; i++) {
      await db.insert(stories).values({
        authorId: u.id,
        audience: "public",
        storageKey: `private/stories/m${i}/a.webp`,
        plateState: "none_confirmed",
        expiresAt: new Date(Date.now() + 3_600_000),
      });
    }
    const snapshot = async () =>
      (await db.execute<{ id: string; storage_key: string }>(sql`select id, storage_key from stories order by id`))
        .rows;
    const before = await snapshot();
    expect(before).toHaveLength(3);
    await expect(
      db.transaction(async (tx) => {
        // Retour à l'état d'avant la migration (dans une transaction annulée à la fin).
        await tx.execute(sql`drop table album_photo_tags`);
        await tx.execute(sql`alter table stories drop column source_album_photo_id`);
        await tx.execute(sql`drop type album_tag_removed_reason`);
        await tx.execute(sql`drop type album_tag_target`);
        await tx.execute(sql`drop type album_tagger`);
        const gone = await tx.execute(
          sql`select 1 from information_schema.columns where table_name = 'stories' and column_name = 'source_album_photo_id'`,
        );
        expect(gone.rows).toHaveLength(0);
        // La migration, instruction par instruction.
        for (const statement of migrationFile().split("--> statement-breakpoint")) {
          if (statement.trim()) await tx.execute(sql.raw(statement));
        }
        const count = await tx.execute<{ n: number }>(sql`select count(*)::int as n from stories`);
        expect(count.rows[0]?.n).toBe(3);
        const rows = await tx.execute<{ id: string; storage_key: string; source: string | null }>(
          sql`select id, storage_key, source_album_photo_id::text as source from stories order by id`,
        );
        expect(rows.rows.map((r) => [r.id, r.storage_key])).toEqual(before.map((r) => [r.id, r.storage_key]));
        expect(rows.rows.every((r) => r.source === null)).toBe(true);
        const table = await tx.execute(sql`select 1 from album_photo_tags limit 1`);
        expect(table.rows).toHaveLength(0);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
    // Rien n'a bougé hors de la transaction.
    expect(await snapshot()).toEqual(before);
  });
});

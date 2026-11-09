// Migration 0068 (stories) sur une base qui a déjà des données (lot R7f1, tour 2) : on migre jusqu'à 0067, on y met des
// messages et une demande de contact, puis on applique 0068 et on vérifie que rien n'est perdu, que les nouvelles
// colonnes valent `null`, et que les clés étrangères (`set null`) se comportent.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { describe, expect, it } from "vitest";

const full = fileURLToPath(new URL("../../../drizzle", import.meta.url));

function urlOfDatabase(name: string) {
  const url = new URL(process.env.DATABASE_URL ?? "");
  url.pathname = `/${name}`;
  return url.toString();
}

describe("migration 0068 sur une base avec données", () => {
  it("garde les messages et les demandes de contact, ajoute les colonnes de story à null, et les liens se défont proprement", async () => {
    const current = decodeURIComponent(new URL(process.env.DATABASE_URL ?? "").pathname.slice(1));
    const name = `${current}_m68`;
    const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const folder = mkdtempSync(join(tmpdir(), "orasso-mig-"));
    let pool: pg.Pool | null = null;
    try {
      await admin.query(`drop database if exists "${name}"`);
      await admin.query(`create database "${name}"`);

      // Les migrations jusqu'à 0067 seulement.
      cpSync(full, folder, { recursive: true });
      rmSync(join(folder, "0068_stories.sql"));
      const journalPath = join(folder, "meta", "_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
      expect(journal.entries.at(-1)?.tag).toBe("0068_stories");
      journal.entries = journal.entries.filter((e) => e.tag !== "0068_stories");
      writeFileSync(journalPath, JSON.stringify(journal));

      pool = new pg.Pool({ connectionString: urlOfDatabase(name), max: 2 });
      await migrate(drizzle(pool), { migrationsFolder: folder });
      const before = await pool.query(
        `select count(*)::int as n from information_schema.tables where table_name in ('stories','story_views')`,
      );
      expect(before.rows[0].n).toBe(0);

      // Des données existantes : deux comptes, une conversation, deux messages, une demande de contact.
      for (const id of ["u-a", "u-b"]) {
        await pool.query(
          `insert into "user" (id, name, email, email_verified, created_at, updated_at) values ($1, $1, $1 || '@exemple.fr', true, now(), now())`,
          [id],
        );
      }
      const conv = await pool.query(
        `insert into conversations (kind, direct_key, created_by) values ('direct', 'u-a:u-b', 'u-a') returning id`,
      );
      const conversationId = conv.rows[0].id as string;
      await pool.query(
        `insert into messages (conversation_id, sender_id, kind, body, client_id) values ($1, 'u-a', 'text', 'Avant la migration', gen_random_uuid()), ($1, 'u-b', 'text', 'Réponse', gen_random_uuid())`,
        [conversationId],
      );
      await pool.query(
        `insert into contact_requests (from_user_id, to_user_id, message) values ('u-b', 'u-a', 'Une demande existante')`,
      );

      // 0068 s'applique sur ces données.
      await migrate(drizzle(pool), { migrationsFolder: full });

      const messagesAfter = await pool.query(`select body, story_id from messages order by body`);
      expect(messagesAfter.rows).toEqual([
        { body: "Avant la migration", story_id: null },
        { body: "Réponse", story_id: null },
      ]);
      const requestAfter = await pool.query(`select message, story_id from contact_requests`);
      expect(requestAfter.rows).toEqual([{ message: "Une demande existante", story_id: null }]);
      const tables = await pool.query(
        `select table_name from information_schema.tables where table_schema = 'public' and table_name like 'stor%' order by 1`,
      );
      expect(tables.rows.map((r) => r.table_name)).toEqual(
        expect.arrayContaining(["stories", "story_mutes", "story_reactions", "story_tags", "story_views"]),
      );

      // Les nouvelles clés étrangères : une story supprimée remet à null le contexte des messages et des demandes.
      const story = await pool.query(
        `insert into stories (author_id, audience, storage_key, plate_state, status, expires_at)
         values ('u-a', 'public', 'private/stories/x/0000000000000000.webp', 'none_confirmed', 'ready', now() + interval '1 hour') returning id`,
      );
      const storyId = story.rows[0].id as string;
      await pool.query(`update messages set story_id = $1 where body = 'Réponse'`, [storyId]);
      await pool.query(`update contact_requests set story_id = $1`, [storyId]);
      await pool.query(`delete from stories where id = $1`, [storyId]);
      expect((await pool.query(`select story_id from messages where story_id is not null`)).rowCount).toBe(0);
      expect((await pool.query(`select story_id from contact_requests where story_id is not null`)).rowCount).toBe(0);
      expect((await pool.query(`select count(*)::int as n from messages`)).rows[0].n).toBe(2);

      // Une story prête sans décision de plaque est refusée par la base.
      await expect(
        pool.query(
          `insert into stories (author_id, audience, storage_key, status, expires_at)
           values ('u-a', 'public', 'private/stories/x/1111111111111111.webp', 'ready', now() + interval '1 hour')`,
        ),
      ).rejects.toThrow();
    } finally {
      await pool?.end().catch(() => undefined);
      await admin.query(`drop database if exists "${name}"`).catch(() => undefined);
      await admin.end();
      rmSync(folder, { recursive: true, force: true });
    }
  }, 120_000);
});

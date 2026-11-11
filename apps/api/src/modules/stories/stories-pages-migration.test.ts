// Migration `persona-follows` (lot R9a) sur une base au niveau de `vague-r8` qui a déjà des stories vivantes de casquette
// prestataire et média, des mutes et des abonnements : on migre jusqu'à la migration précédente, on y met des données, puis on
// applique la migration et on vérifie la reprise (les stories reçoivent leur page), l'enum des mutes et les contraintes.
// Le fichier est cherché par son nom, pas par son numéro (renuméroté à la fusion).
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

describe("migration persona-follows sur une base avec données", () => {
  it("reprend les stories de prestataire et de média, garde les mutes, pose les contraintes de page_follows", async () => {
    const current = decodeURIComponent(new URL(process.env.DATABASE_URL ?? "").pathname.slice(1));
    const name = `${current}_m79`;
    const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const folder = mkdtempSync(join(tmpdir(), "orasso-mig-"));
    let pool: pg.Pool | null = null;
    try {
      await admin.query(`drop database if exists "${name}"`);
      await admin.query(`create database "${name}"`);

      // Les migrations d'avant celle-ci seulement.
      cpSync(full, folder, { recursive: true });
      const journalPath = join(folder, "meta", "_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
      const at = journal.entries.findIndex((e) => e.tag.endsWith("_persona-follows"));
      expect(at).toBeGreaterThan(0);
      for (const e of journal.entries.slice(at)) rmSync(join(folder, `${e.tag}.sql`));
      journal.entries = journal.entries.slice(0, at);
      writeFileSync(journalPath, JSON.stringify(journal));

      pool = new pg.Pool({ connectionString: urlOfDatabase(name), max: 2 });
      await migrate(drizzle(pool), { migrationsFolder: folder });
      expect(
        (await pool.query(`select count(*)::int as n from information_schema.tables where table_name = 'page_follows'`))
          .rows[0].n,
      ).toBe(0);

      // Des données au niveau de vague-r8 : trois comptes (un avec prestataire, un avec média, un avec les deux dont le
      // prestataire est supprimé), des stories vivantes de chaque casquette et une story personnelle, des mutes.
      for (const id of ["u-prov", "u-media", "u-gone", "u-fan"]) {
        await pool.query(
          `insert into "user" (id, name, email, email_verified, created_at, updated_at) values ($1, $1, $1 || '@exemple.fr', true, now(), now())`,
          [id],
        );
      }
      const prov = (
        await pool.query(
          `insert into provider_profiles (user_id, type, name) values ('u-prov', 'photographer', 'La Brasa') returning id`,
        )
      ).rows[0].id as string;
      const media = (
        await pool.query(`insert into media_profiles (user_id, name) values ('u-media', 'Auto Sud Mag') returning id`)
      ).rows[0].id as string;
      // Un ancien profil prestataire supprimé, puis un nouveau : la reprise prend le profil non supprimé.
      await pool.query(
        `insert into provider_profiles (user_id, type, name, deleted_at) values ('u-gone', 'photographer', 'Ancien', now())`,
      );
      const story = async (author: string, persona: string) =>
        (
          await pool?.query(
            `insert into stories (author_id, persona, audience, storage_key, plate_state, status, expires_at)
             values ($1, $2::story_persona, 'public', 'private/stories/x/' || gen_random_uuid() || '.webp', 'none_confirmed', 'ready', now() + interval '1 hour') returning id`,
            [author, persona],
          )
        )?.rows[0].id as string;
      const sProv = await story("u-prov", "provider");
      const sMedia = await story("u-media", "media");
      const sGone = await story("u-gone", "provider");
      const sFan = await story("u-fan", "fan");
      const sNoProfile = await story("u-fan", "media");
      await pool.query(
        `insert into story_mutes (user_id, author_kind, author_id) values ('u-fan', 'user', 'u-prov'), ('u-fan', 'structure', 'abc')`,
      );

      // La migration s'applique sur ces données.
      await migrate(drizzle(pool), { migrationsFolder: full });

      const rows = await pool.query(`select id, persona, provider_id, media_id from stories order by id`);
      const by = (id: string) => rows.rows.find((r) => r.id === id);
      expect(by(sProv)).toMatchObject({ persona: "provider", provider_id: prov, media_id: null });
      expect(by(sMedia)).toMatchObject({ persona: "media", media_id: media, provider_id: null });
      // Sans profil non supprimé : sans page (elle n'est plus servie).
      expect(by(sGone)).toMatchObject({ provider_id: null });
      expect(by(sNoProfile)).toMatchObject({ media_id: null });
      expect(by(sFan)).toMatchObject({ persona: "fan", provider_id: null, media_id: null });

      // Les mutes sont gardés, sur le nouvel enum à cinq genres.
      const mutes = await pool.query(`select author_kind::text as k, author_id from story_mutes order by author_id`);
      expect(mutes.rows).toEqual([
        { k: "structure", author_id: "abc" },
        { k: "user", author_id: "u-prov" },
      ]);
      await pool.query(
        `insert into story_mutes (user_id, author_kind, author_id) values ('u-fan', 'provider', 'x'), ('u-fan', 'media', 'y')`,
      );
      // L'enum des identifications reste à trois genres.
      await expect(
        pool.query(`insert into story_tags (story_id, target_kind, target_id) values ($1, 'provider', 'x')`, [sProv]),
      ).rejects.toThrow();

      // La reprise est rejouable (aucun effet la seconde fois).
      const file = readdirSync(full).find((f) => f.endsWith("_persona-follows.sql")) as string;
      const text = readFileSync(join(full, file), "utf8");
      const data = text
        .slice(text.indexOf("-- Lot R9a : reprise"))
        .split("--> statement-breakpoint")
        .map((x) => x.trim())
        .filter(Boolean);
      expect(data).toHaveLength(2);
      for (const statement of data) await pool.query(statement);
      expect((await pool.query(`select id, persona, provider_id, media_id from stories order by id`)).rows).toEqual(
        rows.rows,
      );

      // Une story est supprimée avec sa page (cascade).
      await pool.query(`delete from provider_profiles where id = $1`, [prov]);
      expect((await pool.query(`select count(*)::int as n from stories where id = $1`, [sProv])).rows[0].n).toBe(0);

      // page_follows : « soi-même » refusé, et une personne ne suit ni structure, ni pro, ni personne.
      const bad = (follower: string, fid: string, target: string, tid: string) =>
        pool?.query(
          `insert into page_follows (follower_kind, follower_id, target_kind, target_id) values ($1, $2, $3, $4)`,
          [follower, fid, target, tid],
        );
      await expect(bad("provider", media, "provider", media)).rejects.toThrow();
      for (const kind of ["structure", "pro", "user"]) await expect(bad("user", "u-fan", kind, "x")).rejects.toThrow();
      await bad("user", "u-fan", "media", media);
      await bad("media", media, "user", "u-fan");
      // La clé primaire : jamais deux fois la même ligne.
      await expect(bad("media", media, "user", "u-fan")).rejects.toThrow();
    } finally {
      await pool?.end().catch(() => undefined);
      await admin.query(`drop database if exists "${name}"`).catch(() => undefined);
      await admin.end();
      rmSync(folder, { recursive: true, force: true });
    }
  }, 120_000);
});

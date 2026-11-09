// Migration 0072 (Sponsorisé dans le Fil) sur une base qui a déjà des emplacements (lot R7k1, tour 2) : on migre jusqu'à
// 0071, on y met un pro et deux anciens emplacements (avec leurs statistiques), puis on applique 0072 et on vérifie la
// reprise des données (nom du pro, Accueil seulement, type « pro », statistiques de l'Accueil) et la contrainte de
// cohérence entre le type d'annonceur et la fiche pro.
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

describe("migration 0072 sur une base avec des emplacements existants", () => {
  it("reprend le nom du pro, l'Accueil, le type « pro » et les statistiques ; la contrainte de cohérence tient", async () => {
    const current = decodeURIComponent(new URL(process.env.DATABASE_URL ?? "").pathname.slice(1));
    const name = `${current}_m72`;
    const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const folder = mkdtempSync(join(tmpdir(), "orasso-mig-"));
    let pool: pg.Pool | null = null;
    try {
      await admin.query(`drop database if exists "${name}"`);
      await admin.query(`create database "${name}"`);

      // Les migrations d'avant celle du Sponsorisé du Fil seulement (elle et celles qui la suivent sont retirées).
      cpSync(full, folder, { recursive: true });
      const journalPath = join(folder, "meta", "_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
      const at = journal.entries.findIndex((e) => e.tag.endsWith("_sponsored-feed"));
      expect(at).toBeGreaterThan(0);
      for (const e of journal.entries.slice(at)) rmSync(join(folder, `${e.tag}.sql`));
      journal.entries = journal.entries.slice(0, at);
      writeFileSync(journalPath, JSON.stringify(journal));

      pool = new pg.Pool({ connectionString: urlOfDatabase(name), max: 2 });
      await migrate(drizzle(pool), { migrationsFolder: folder });
      const before = await pool.query(
        `select count(*)::int as n from information_schema.columns
         where table_name = 'sponsored_placements' and column_name = 'advertiser_name'`,
      );
      expect(before.rows[0].n).toBe(0);

      // Des données d'avant : un pro (publié) et deux emplacements, avec une ligne de statistiques et un « déjà montré ».
      await pool.query(
        `insert into "user" (id, name, email, email_verified, created_at, updated_at)
         values ('u-pro', 'Titulaire', 'pro@exemple.fr', true, now(), now())`,
      );
      const pro = await pool.query(
        `insert into pro_profiles (slug, owner_user_id, name, published_at) values ('pneus-66', 'u-pro', 'Pneus 66', now()) returning id`,
      );
      const proId = pro.rows[0].id as string;
      const ids: string[] = [];
      for (const [title, status] of [
        ["Pneus d'hiver", "active"],
        ["Révision offerte", "paused"],
      ] as const) {
        const row = await pool.query(
          `insert into sponsored_placements (pro_profile_id, title, body, link_url, starts_on, ends_on, status, impressions, clicks)
           values ($1, $2, 'Corps', 'https://exemple.fr', '2026-11-01', '2026-12-01', $3, 12, 3) returning id`,
          [proId, title, status],
        );
        ids.push(row.rows[0].id as string);
      }
      await pool.query(
        `insert into sponsored_daily_stats (placement_id, day, impressions, clicks) values ($1, '2026-11-02', 12, 3)`,
        [ids[0]],
      );
      await pool.query(
        `insert into sponsored_daily_seen (placement_id, user_hash, day, clicked) values ($1, 'hash-a', '2026-11-02', true)`,
        [ids[0]],
      );

      // 0072 s'applique sur ces données.
      await migrate(drizzle(pool), { migrationsFolder: full });

      const placements = await pool.query(
        `select title, advertiser_name, advertiser_kind, surfaces, disclosure, external_url_domain, pro_profile_id,
                status, impressions, clicks
         from sponsored_placements order by title`,
      );
      expect(placements.rows).toEqual([
        {
          title: "Pneus d'hiver",
          advertiser_name: "Pneus 66",
          advertiser_kind: "pro",
          surfaces: ["home"],
          disclosure: null,
          external_url_domain: null,
          pro_profile_id: proId,
          status: "active",
          impressions: 12,
          clicks: 3,
        },
        {
          title: "Révision offerte",
          advertiser_name: "Pneus 66",
          advertiser_kind: "pro",
          surfaces: ["home"],
          disclosure: null,
          external_url_domain: null,
          pro_profile_id: proId,
          status: "paused",
          impressions: 12,
          clicks: 3,
        },
      ]);
      // Les statistiques et les « déjà montré » d'avant sont ceux de l'Accueil.
      const stats = await pool.query(`select surface, impressions, clicks from sponsored_daily_stats`);
      expect(stats.rows).toEqual([{ surface: "home", impressions: 12, clicks: 3 }]);
      const seen = await pool.query(`select surface, clicked from sponsored_daily_seen`);
      expect(seen.rows).toEqual([{ surface: "home", clicked: true }]);

      // La contrainte de cohérence : un externe n'a pas de fiche pro, un pro en a une.
      const insert = (kind: string, proProfileId: string | null) =>
        pool?.query(
          `insert into sponsored_placements (advertiser_kind, pro_profile_id, advertiser_name, title, body, link_url, starts_on, ends_on)
           values ($1, $2, 'Annonceur', 'T', 'B', 'https://exemple.fr', '2026-11-01', '2026-12-01')`,
          [kind, proProfileId],
        );
      await expect(insert("external", proId)).rejects.toThrow(/sponsored_placements_advertiser_check/);
      await expect(insert("pro", null)).rejects.toThrow(/sponsored_placements_advertiser_check/);
      await expect(insert("external", null)).resolves.toBeDefined();
      await expect(insert("pro", proId)).resolves.toBeDefined();
    } finally {
      await pool?.end();
      rmSync(folder, { recursive: true, force: true });
      await admin.query(`drop database if exists "${name}"`);
      await admin.end();
    }
  }, 120_000);
});

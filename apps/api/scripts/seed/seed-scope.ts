// Règle unique de la graine (lot R9-fix, tour 3) : elle ne crée, ne modifie, ne flamme, n'épingle, ne marque « vu » et ne commente
// que ses propres objets, jamais « la plus récente publication » d'un auteur ou d'une page, jamais un compte réel.
//  - Une publication de la graine est créée avec un identifiant fixe (`seedPostId`) et retrouvée par lui.
//  - Les publications posées par la graine avant ce changement (identifiant aléatoire) ne sont adoptées que si leur auteur et leur
//    légende sont ceux de la graine ET qu'elles sont antérieures à `SEED_ADOPT_BEFORE` : une publication réelle republiée avec la même
//    légende après cette date n'est jamais adoptée.
//  - Les comptes de la graine sont ceux dont l'e-mail finit par `@orasso.local`.
// Si l'objet de la graine manque ou est supprimé, la graine ne fait rien.
import { createHash } from "node:crypto";
import { type SQL, sql } from "drizzle-orm";

/** Date constante (UTC) : tout ce que la graine a posé avant elle, sans identifiant fixe, est à elle. Ne jamais la repousser. */
export const SEED_ADOPT_BEFORE = new Date("2026-11-14T18:00:00Z");

/** Identifiant fixe (forme UUID, dérivé d'une clé) d'une publication de la graine. */
export function seedPostId(key: string): string {
  const h = createHash("sha1").update(`orasso-seed:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export type SeedPost = { id: string; author: string; caption: string };

/** Condition SQL « cette ligne de `feed_posts` (alias `alias`) est une publication de la graine de la liste ». */
export function isSeedPost(items: SeedPost[], alias = "feed_posts"): SQL {
  const a = sql.raw(alias);
  const parts = items.map(
    (i) =>
      sql`(${a}.id = ${i.id}::uuid or (${a}.caption = ${i.caption} and ${a}.created_at < ${SEED_ADOPT_BEFORE.toISOString()}::timestamptz
        and exists (select 1 from profiles pr where pr.user_id = ${a}.author_id and lower(pr.pseudo) = ${i.author.toLowerCase()})))`,
  );
  return sql`(${sql.join(parts, sql` or `)})`;
}

/** Condition SQL « ce profil (colonne `userColumn`) est un compte de la graine ». */
export const isSeedAccount = (userColumn: string): SQL =>
  sql`exists (select 1 from "user" su where su.id = ${sql.raw(userColumn)} and su.email like '%@orasso.local')`;

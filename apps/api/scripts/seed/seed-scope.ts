// Règle unique de la graine (lot R9-fix, tours 3 et 4) : elle ne crée, ne modifie, ne flamme, n'épingle, ne marque « vu » et ne
// commente que ses propres objets, jamais « la plus récente publication » d'un auteur ou d'une page, jamais un compte réel.
// Preuve d'origine : un objet est à la graine seulement s'il porte une marque que seule elle pose.
//  - Une publication de la graine est créée avec un identifiant fixe (`seedPostId`, dérivé de l'auteur et de la légende) et
//    retrouvée par lui, jamais par sa légende : une vraie publication de même légende n'est pas à elle.
//  - Les publications posées avant ce changement (identifiant aléatoire) ne sont PAS adoptées : leurs photos sont rangées sous la
//    même clé `private/feed/…` que les vraies, aucune marque ne les distingue. Leurs effets déjà posés restent ; la graine ne les
//    refait pas (les nouvelles publications du Lydia et du plan, elles, sont créées avec leur identifiant fixe).
//  - Les comptes de la graine sont ceux dont l'e-mail finit par `@orasso.local`.
// Si l'objet de la graine manque ou est supprimé, la graine ne fait rien.
import { createHash } from "node:crypto";
import { type AnyColumn, type SQL, sql } from "drizzle-orm";

/** Identifiant fixe (forme UUID, dérivé d'une clé) d'une publication de la graine. */
export function seedPostId(key: string): string {
  const h = createHash("sha1").update(`orasso-seed:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export type SeedPost = { id: string; author: string; caption: string };

/** Condition SQL « cette ligne de `feed_posts` (alias `alias`) est une publication de la graine de la liste » : par identifiant seulement. */
export function isSeedPost(items: SeedPost[], alias = "feed_posts"): SQL {
  const a = sql.raw(alias);
  return sql`${a}.id in (${sql.join(
    items.map((i) => sql`${i.id}::uuid`),
    sql`, `,
  )})`;
}

/** Condition SQL « ce compte (colonne d'identifiant d'utilisateur) est un compte de la graine ». */
export const isSeedAccount = (userColumn: AnyColumn): SQL =>
  sql`exists (select 1 from "user" su where su.id = ${userColumn} and su.email like '%@orasso.local')`;

/**
 * Les événements posés par la graine (« Pour ta sortie » ne se publie que pour eux ; les affiches de démonstration ne se font que
 * pour eux). Lot B3b : la liste est complète (un test vérifie que chaque événement créé par la graine y est).
 */
export const SEED_EVENT_SLUGS = [
  "balade-prades",
  "beziers-night-2026",
  "c-et-c-narbonne-2026",
  "c-et-c-ceret-2026",
  "c-et-c-perpignan-2026",
  "cars-and-coffee-plage",
  "cars-coffee-carcassonne",
  "cars-coffee-ceret",
  "expo-de-printemps-2027",
  "expo-du-boulou-2026",
  "expo-rivesaltes-2026",
  "exposition-beziers",
  "hivernale-2027",
  "nocturne-de-canet-2026",
  "nocturne-de-rentree",
  "nocturne-port-sete",
  "nuit-des-moteurs",
  "portes-ouvertes-garage-du-mas-2026",
  "portes-ouvertes-muret",
  "rasso-du-lac-2026",
  "rasso-de-printemps-2026",
  "rassemblement-cote-vermeille-2025",
  "rassemblement-du-lydia",
  "rassemblement-narbonne",
  "rassemblement-toulouse",
  "salon-argeles",
  "salon-auto-retro-2026",
  "salon-de-perpignan-2026",
  "salon-de-printemps-2027",
  "salon-montpellier",
  "soiree-partenaires-2026",
  "sortie-du-canigou-2026",
  "toulouse-auto-retro",
];

/** Les éditions passées de MéditeSportCar (`msc-edition-01`, `msc-edition-02`…) : un préfixe, leur nombre dépend du seed. */
export const SEED_EVENT_SLUG_PREFIXES = ["msc-edition-"];

/**
 * Condition SQL « cet événement (colonnes `slug` et `structure_id` de la table d'alias `alias`) est un événement de la graine » :
 * slug de la graine ET structure dont le propriétaire actif est un compte de la graine ET créateur (`created_by`) de la graine.
 * Preuve d'origine d'un événement (même preuve que `live-event.ts`).
 */
export function isSeedEvent(alias = "events"): SQL {
  const a = sql.raw(alias);
  return sql`((${a}.slug in (${sql.join(
    SEED_EVENT_SLUGS.map((slug) => sql`${slug}`),
    sql`, `,
  )}) or ${sql.join(
    SEED_EVENT_SLUG_PREFIXES.map((prefix) => sql`${a}.slug like ${`${prefix}%`}`),
    sql` or `,
  )}) and exists (select 1 from structure_members sm join "user" su on su.id = sm.user_id
    where sm.structure_id = ${a}.structure_id and sm.role = 'owner' and sm.status = 'active' and su.email like '%@orasso.local')
    and exists (select 1 from "user" cu where cu.id = ${a}.created_by and cu.email like '%@orasso.local'))`;
}

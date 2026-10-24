// Annuaire des pros de l'Explorer (lot 29) : filtres activité / département / texte, rayon et tri par distance.
//
// Visibilité (`proVisibility`, lot 21) : la carte d'un pro ne porte ni remises, ni publications, ni statistiques ; après
// le 21/06/2027 sans abonnement actif, la fiche de base reste listée (nom, activités, ville, badge) mais n'a plus de mise
// en avant (`hidden.promotion`) : plus de « vérifiés d'abord ». Fiches supprimées, non publiées, ou dont le titulaire est
// supprimé ou suspendu : jamais listées. Position : celle envoyée pour la requête ou le secteur du profil ; un pro sans
// adresse (zone d'intervention seulement) n'a pas de distance et passe après les autres.
// Lot R2 (maquettes R2.4, R2.5) : « Où chercher ? » (les départements de Mon coin ou d'Ailleurs, entiers) ; avec un rayon
// autour de ma position, les pros sans atelier qui interviennent dans mes départements restent listés (« Se déplacent
// chez toi », en fin de liste) ; chaque carte porte la remise pour mon grade (`shownDiscount`, sauf fiche de base) et
// l'étoile de mon garage favori ; `GET /pros/activities` compte les pros de chaque métier dans le même lieu.
import {
  type Grade,
  type Page,
  type ProActivity,
  type ProActivityCounts,
  type ProCard,
  type ProDiscounts,
  type ProListQuery,
  proActivities,
  proActivityLabels,
  proVisibility,
  resolvePosition,
  shownDiscount,
} from "@orasso/shared";
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { proDiscounts, proFollows, proProfiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { distanceKmSql, roundKm, withinRadiusSql } from "../../lib/geo-sql";
import type { Viewer } from "../../lib/session";
import { anyColumnContains, fold, searchTokens } from "../../lib/text-search";
import { followersCounts, toCard } from "./card";

const safeOffset = (n: number): number => (Number.isSafeInteger(n) && n >= 0 ? n : 0);
const decodeOffset = (cursor: string | undefined): number =>
  cursor ? safeOffset(Number(Buffer.from(cursor, "base64url").toString())) : 0;
const encodeOffset = (offset: number): string => Buffer.from(String(offset)).toString("base64url");

/** Activités dont le libellé contient ce mot (« detail » → detailing), sans tenir compte des accents ni de la casse. */
function activitiesMatching(token: string): ProActivity[] {
  const needle = fold(token);
  return proActivities.filter((a) => fold(proActivityLabels[a]).includes(needle) || a.includes(needle));
}

/** Pro dont le titulaire est un compte en règle (ni supprimé ni suspendu). */
export const proOwnerActive = (at: Date) =>
  sql`exists (select 1 from profiles pr where pr.user_id = ${proProfiles.ownerUserId} and pr.deleted_at is null and (pr.suspended_until is null or pr.suspended_until <= ${at}))`;

/** Remises de ces pros, par grade (lot M5, « Pour ta … » du Garage ; lot R2, liste de l'Explorer). */
export async function discountsByPro(ids: string[]): Promise<Map<string, ProDiscounts>> {
  const out = new Map<string, ProDiscounts>();
  if (!ids.length) return out;
  const rows = await db.select().from(proDiscounts).where(inArray(proDiscounts.proId, ids));
  for (const r of rows) out.set(r.proId, { ...(out.get(r.proId) ?? {}), [r.grade]: r.percent });
  return out;
}

const textArray = (values: readonly string[]) =>
  sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;

/** Ce qui choisit les pros d'une requête (sans le métier quand `withActivity` est faux), et la distance. */
function prosWhere(q: ProListQuery, viewer: Viewer | null, withActivity: boolean) {
  const t = now();
  const explicit = q.lat !== undefined && q.lng !== undefined;
  const located = resolvePosition(
    { lat: q.lat, lng: q.lng },
    q.departments?.length ? q.departments : (viewer?.profile.departments ?? null),
  );
  const sort = q.sort === "distance" && located ? "distance" : "name";
  // Rayon : seulement s'il est demandé (pas de rayon implicite : les pros sans adresse ou éloignés restent listés).
  const wantsRadius = located !== null && q.radiusKm !== undefined;
  const needsDistance = located !== null && (sort === "distance" || wantsRadius || explicit);
  const dist = needsDistance && located ? distanceKmSql(proProfiles.lat, proProfiles.lng, located.position) : null;

  const filters: (SQL | undefined)[] = [
    isNull(proProfiles.deletedAt),
    isNotNull(proProfiles.publishedAt),
    proOwnerActive(t),
    withActivity && q.activity ? sql`${q.activity} = any(${proProfiles.activities})` : undefined,
    q.department
      ? or(eq(proProfiles.department, q.department), sql`${q.department} = any(${proProfiles.interventionDepartments})`)
      : undefined,
    q.departments?.length
      ? or(
          inArray(proProfiles.department, q.departments),
          sql`${proProfiles.interventionDepartments} && ${textArray(q.departments)}`,
        )
      : undefined,
  ];
  // Lot R1 : comme les événements, sans tenir compte des accents ni de la casse (« meca » trouve « Méca »).
  for (const token of searchTokens(q.q)) {
    const activities = activitiesMatching(token);
    filters.push(
      or(
        anyColumnContains(token, [proProfiles.name, proProfiles.city, proProfiles.description]),
        activities.length
          ? sql`${proProfiles.activities} && ARRAY[${sql.join(
              activities.map((a) => sql`${a}`),
              sql`, `,
            )}]::text[]`
          : undefined,
      ),
    );
  }
  if (wantsRadius && located) {
    const within = withinRadiusSql(proProfiles.lat, proProfiles.lng, located.position, q.radiusKm as number);
    // Lot R2 : un pro sans atelier qui se déplace dans mes départements reste dans la liste (« Se déplacent chez toi »).
    const home = viewer?.profile.departments ?? [];
    filters.push(
      home.length
        ? or(within, and(isNull(proProfiles.lat), sql`${proProfiles.interventionDepartments} && ${textArray(home)}`))
        : within,
    );
  }
  return { where: and(...filters), sort, dist, needsDistance, t };
}

export async function exploreProsList(q: ProListQuery, viewer: Viewer | null): Promise<Page<ProCard>> {
  const { where, sort, dist, needsDistance, t } = prosWhere(q, viewer, true);
  const promoted = !proVisibility(null, null, t).hidden.promotion;
  const order: SQL[] =
    sort === "distance" && dist
      ? [sql`${dist} asc nulls last`, asc(proProfiles.name), asc(proProfiles.id)]
      : [
          ...(promoted ? [desc(sql`${proProfiles.verifiedAt} is not null`)] : []),
          asc(proProfiles.name),
          asc(proProfiles.id),
        ];

  const offset = decodeOffset(q.cursor);
  const rows = await db
    .select({ p: proProfiles, dist: dist ?? sql<number | null>`null` })
    .from(proProfiles)
    .where(where)
    .orderBy(...order)
    .limit(q.limit + 1)
    .offset(offset);
  const page = rows.slice(0, q.limit);
  const ids = page.map((r) => r.p.id);
  const followers = await followersCounts(ids);
  // Lot R2 : la remise pour mon grade (fiche de base : remises masquées) et mon garage favori.
  const showDiscounts = viewer !== null && !proVisibility(null, null, t).hidden.discounts;
  const discounts = showDiscounts ? await discountsByPro(ids) : new Map<string, ProDiscounts>();
  const favorites = new Set<string>();
  if (viewer && ids.length) {
    const rowsFav = await db
      .select({ id: proFollows.proId })
      .from(proFollows)
      .where(and(eq(proFollows.userId, viewer.user.id), eq(proFollows.favorite, true), inArray(proFollows.proId, ids)));
    for (const r of rowsFav) favorites.add(r.id);
  }
  const items = page.map((r) => {
    const out = toCard(r.p, followers.get(r.p.id) ?? 0);
    if (needsDistance) out.distanceKm = roundKm(r.dist);
    if (viewer) {
      // Fiche de base (lot 21) : pas de remise du tout, pas même « pas de remise ».
      if (showDiscounts) out.discount = shownDiscount(discounts.get(r.p.id) ?? {}, viewer.profile.grade as Grade);
      out.favorite = favorites.has(r.p.id);
    }
    return out;
  });
  const total =
    q.withTotal && !q.cursor
      ? Number((await db.select({ n: sql<number>`count(*)::int` }).from(proProfiles).where(where))[0]?.n ?? 0)
      : undefined;
  const nextCursor = rows.length > q.limit ? encodeOffset(offset + q.limit) : null;
  return total === undefined ? { items, nextCursor } : { items, nextCursor, total };
}

/** `GET /pros/activities` (lot R2, feuille « Quel métier ? ») : le nombre de pros de chaque métier, dans le même lieu. */
export async function proActivityCounts(q: ProListQuery, viewer: Viewer | null): Promise<ProActivityCounts> {
  const { where } = prosWhere(q, viewer, false);
  const rows = (
    await db.execute<{ a: string; n: number }>(
      // Des pros distincts : une activité en double (fiche d'avant le dédoublonnage) ne compte qu'une fois.
      sql`select a, count(distinct ${proProfiles.id})::int as n from ${proProfiles}, unnest(${proProfiles.activities}) as a where ${where} group by a`,
    )
  ).rows;
  const total = Number((await db.select({ n: sql<number>`count(*)::int` }).from(proProfiles).where(where))[0]?.n ?? 0);
  const counts: ProActivityCounts["counts"] = {};
  for (const r of rows)
    if ((proActivities as readonly string[]).includes(r.a)) counts[r.a as ProActivity] = Number(r.n);
  return { total, counts };
}

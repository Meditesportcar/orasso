// Annuaire des pros de l'Explorer (lot 29) : filtres activité / département / texte, rayon et tri par distance.
//
// Visibilité (`proVisibility`, lot 21) : la carte d'un pro ne porte ni remises, ni publications, ni statistiques ; après
// le 21/06/2027 sans abonnement actif, la fiche de base reste listée (nom, activités, ville, badge) mais n'a plus de mise
// en avant (`hidden.promotion`) : plus de « vérifiés d'abord ». Fiches supprimées, non publiées, ou dont le titulaire est
// supprimé ou suspendu : jamais listées. Position : celle envoyée pour la requête ou le secteur du profil ; un pro sans
// adresse (zone d'intervention seulement) n'a pas de distance et passe après les autres.
import {
  type Page,
  type ProActivity,
  type ProCard,
  type ProListQuery,
  proActivities,
  proActivityLabels,
  proVisibility,
  resolvePosition,
} from "@orasso/shared";
import { and, asc, desc, eq, isNotNull, isNull, or, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { proProfiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { distanceKmSql, roundKm, withinRadiusSql } from "../../lib/geo-sql";
import type { Viewer } from "../../lib/session";
import { containsPattern, fold, searchTokens } from "../../lib/text-search";
import { followersCounts, toCard } from "./card";

const decodeOffset = (cursor: string | undefined): number =>
  cursor ? Math.max(0, Number(Buffer.from(cursor, "base64url").toString()) || 0) : 0;
const encodeOffset = (offset: number): string => Buffer.from(String(offset)).toString("base64url");

/** Activités dont le libellé contient ce mot (« detail » → detailing), sans tenir compte des accents ni de la casse. */
function activitiesMatching(token: string): ProActivity[] {
  const needle = fold(token);
  return proActivities.filter((a) => fold(proActivityLabels[a]).includes(needle) || a.includes(needle));
}

/** Pro dont le titulaire est un compte en règle (ni supprimé ni suspendu). */
export const proOwnerActive = (at: Date) =>
  sql`exists (select 1 from profiles pr where pr.user_id = ${proProfiles.ownerUserId} and pr.deleted_at is null and (pr.suspended_until is null or pr.suspended_until <= ${at}))`;

export async function exploreProsList(q: ProListQuery, viewer: Viewer | null): Promise<Page<ProCard>> {
  const t = now();
  const explicit = q.lat !== undefined && q.lng !== undefined;
  const located = resolvePosition({ lat: q.lat, lng: q.lng }, viewer?.profile.departments ?? null);
  const sort = q.sort === "distance" && located ? "distance" : "name";
  const wantsRadius = located !== null && (q.radiusKm !== undefined || (explicit && q.sort === "name"));
  const needsDistance = located !== null && (sort === "distance" || wantsRadius || explicit);
  const dist = needsDistance && located ? distanceKmSql(proProfiles.lat, proProfiles.lng, located.position) : null;

  const filters: (SQL | undefined)[] = [
    isNull(proProfiles.deletedAt),
    isNotNull(proProfiles.publishedAt),
    proOwnerActive(t),
    q.activity ? sql`${q.activity} = any(${proProfiles.activities})` : undefined,
    q.department
      ? or(eq(proProfiles.department, q.department), sql`${q.department} = any(${proProfiles.interventionDepartments})`)
      : undefined,
  ];
  for (const token of searchTokens(q.q)) {
    const like = containsPattern(token);
    const activities = activitiesMatching(token);
    filters.push(
      or(
        sql`${proProfiles.name} ilike ${like}`,
        sql`${proProfiles.city} ilike ${like}`,
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
    filters.push(withinRadiusSql(proProfiles.lat, proProfiles.lng, located.position, q.radiusKm ?? 50));
  }

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
    .where(and(...filters))
    .orderBy(...order)
    .limit(q.limit + 1)
    .offset(offset);
  const page = rows.slice(0, q.limit);
  const followers = await followersCounts(page.map((r) => r.p.id));
  const items = page.map((r) => {
    const out = toCard(r.p, followers.get(r.p.id) ?? 0);
    if (needsDistance) out.distanceKm = roundKm(r.dist);
    return out;
  });
  return { items, nextCursor: rows.length > q.limit ? encodeOffset(offset + q.limit) : null };
}

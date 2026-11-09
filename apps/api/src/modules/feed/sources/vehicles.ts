// Source « Voiture » : véhicules actifs ajoutés récemment par des comptes publics ou suivis (abonnement accepté), avec
// une photo dont la plaque est traitée (floutée, « aucune plaque visible » confirmée, ou véhicule non immatriculé :
// `maskedPhoto`). Jamais un compte privé non suivi, jamais soi-même, jamais un compte hors règle. Pas de plaque.
import { and, desc, eq, type SQL, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { profiles, vehicles } from "../../../db/schema";
import { storage } from "../../../lib/storage";
import { vehiclesRepo } from "../../vehicles/repo";
import { vehicleLabel } from "../../vehicles/serializers";
import { authorVisibleSql } from "../access";
import { personOf } from "../posts";
import { atBounds, type FeedSource, inDepartments, type LoadedCard, type SourceInput, tsParam } from "./types";

/* Une voiture ajoutée il y a plus de 60 jours n'est plus une nouveauté du Fil. */

export const source: FeedSource<"vehicle_public"> = {
  kind: "vehicle_public",
  async load(input: SourceInput): Promise<LoadedCard<"vehicle_public">[]> {
    const atExpr = sql`${vehicles.createdAt}`;
    const photoKey = sql<string | null>`(select vp.storage_key from vehicle_photos vp
      where vp.vehicle_id = ${vehicles.id} and (vp.plate_blurred or vp.no_plate_confirmed or ${vehicles.unregistered})
      order by vp.position limit 1)`;
    const filters: (SQL | undefined)[] = [
      eq(vehicles.status, "active"),
      sql`${vehicles.ownerId} <> ${input.userId}`,
      authorVisibleSql("profiles", sql`${vehicles.ownerId}`, input.userId, input.ref),
      sql`${photoKey} is not null`,
      sql`${vehicles.createdAt} <= ${tsParam(input.ref)}`,
      sql`${vehicles.createdAt} >= ${tsParam(input.ref)} - interval '60 days'`,
      ...atBounds(atExpr, input),
    ];
    if (input.filter === "following") {
      filters.push(
        sql`exists (select 1 from user_follows uf where uf.follower_id = ${input.userId} and uf.followed_id = ${vehicles.ownerId} and uf.status = 'accepted')`,
      );
    }
    if (input.filter === "nearby") filters.push(inDepartments(sql`${profiles.departments}[1]`, input.nearby));
    const rows = await db
      .select({
        v: vehicles,
        owner: profiles,
        photoKey,
        categoryIds: sql<
          string[]
        >`(select coalesce(array_agg(vc.category_id::text), '{}') from vehicle_categories vc where vc.vehicle_id = ${vehicles.id})`,
      })
      .from(vehicles)
      .innerJoin(profiles, eq(profiles.userId, vehicles.ownerId))
      .where(and(...filters))
      .orderBy(desc(vehicles.createdAt), desc(vehicles.id))
      .limit(input.limit);
    const full = new Map((await vehiclesRepo.findFullByIds(rows.map((r) => r.v.id))).map((v) => [v.id, v]));
    return rows.flatMap((r): LoadedCard<"vehicle_public">[] => {
      const v = full.get(r.v.id);
      const url = storage.url(r.photoKey);
      if (!v || !url) return [];
      return [
        {
          id: `vehicle_public:${r.v.id}`,
          kind: "vehicle_public",
          at: r.v.createdAt,
          department: r.owner.departments[0] ?? null,
          authorId: r.owner.userId,
          structureId: null,
          proId: null,
          categoryIds: r.categoryIds,
          authorPseudo: r.owner.pseudo,
          payload: {
            vehicle: { id: r.v.id, label: vehicleLabel(v), vehicleType: r.v.vehicleType, photoUrl: url },
            owner: personOf(r.owner),
          },
        },
      ];
    });
  },
};

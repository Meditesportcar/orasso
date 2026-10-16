// Véhicules par marque, modèle ou génération, avec leur propriétaire (docs/01 : recherche de personnes par véhicule).
//
// Confidentialité : un véhicule actif d'un compte public ou d'un ami est montré en entier (génération, première photo) ;
// celui d'un compte privé que l'on ne connaît pas se réduit à « marque modèle », sans photo, et sa génération ne sert
// pas à la recherche. Comptes supprimés et suspendus : jamais. Jamais la plaque. Mes propres véhicules sont écartés.
import type { SearchVehicleHit } from "@orasso/shared";
import { sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { now } from "../../../lib/deps";
import { storage } from "../../../lib/storage";
import { containsPattern, searchTokens } from "../../../lib/text-search";
import { detailVisibleSql } from "../../social/search";
import { vehiclesRepo } from "../../vehicles/repo";
import { vehicleBriefLabel, vehicleLabel } from "../../vehicles/serializers";
import type { SearchSource } from "./index";

type Row = { vehicle_id: string; detail: boolean };

export const vehiclesSource: SearchSource<"vehicles"> = {
  group: "vehicles",
  needsAccount: true,
  async run({ viewer, q, limit }): Promise<SearchVehicleHit[]> {
    if (!viewer) return [];
    const tokens = searchTokens(q);
    if (!tokens.length) return [];
    const detail = detailVisibleSql(viewer.user.id);
    const conditions = tokens.map((token) => {
      const like = containsPattern(token);
      return sql`(mk.name ilike ${like} or md.name ilike ${like} or (d.detail and g.name ilike ${like}))`;
    });
    const result = await db.execute<Row>(sql`
      select v.id as vehicle_id, d.detail
      from vehicles v
      join profiles p on p.user_id = v.owner_id
      join vehicle_makes mk on mk.id = v.make_id
      join vehicle_models md on md.id = v.model_id
      left join vehicle_generations g on g.id = v.generation_id
      cross join lateral (select ${detail} as detail) d
      where v.status = 'active'
        and p.deleted_at is null
        and (p.suspended_until is null or p.suspended_until <= ${now()})
        and p.user_id <> ${viewer.user.id}
        and ${sql.join(conditions, sql` and `)}
      order by lower(p.pseudo), v.id
      limit ${limit + 1}`);
    if (!result.rows.length) return [];
    const full = await vehiclesRepo.findFullByIds(result.rows.map((r) => r.vehicle_id));
    const byId = new Map(full.map((v) => [v.id, v]));
    const owners = await db.query.profiles.findMany({
      where: (p, { inArray }) => inArray(p.userId, [...new Set(full.map((v) => v.ownerId))]),
    });
    const ownerById = new Map(owners.map((o) => [o.userId, o]));
    const hits: SearchVehicleHit[] = [];
    for (const row of result.rows) {
      const v = byId.get(row.vehicle_id);
      const owner = v ? ownerById.get(v.ownerId) : undefined;
      if (!v || !owner) continue;
      hits.push({
        id: v.id,
        label: row.detail ? vehicleLabel(v) : vehicleBriefLabel(v),
        photoUrl: row.detail ? storage.url(v.photos[0]?.storageKey ?? null) : null,
        owner: {
          userId: owner.userId,
          pseudo: owner.pseudo,
          avatarUrl: storage.url(owner.avatarKey),
          grade: owner.grade,
        },
      });
    }
    return hits;
  },
};

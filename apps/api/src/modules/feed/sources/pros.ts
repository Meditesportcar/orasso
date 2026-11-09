// Source « Pro » : fiches de pros publiées depuis moins de 60 jours, dans le département de la personne (adresse ou zone
// d'intervention) ; « Mes abonnements » : les pros suivis. Titulaire en règle seulement ; aucun contact, aucune remise.
import { and, desc, type SQL, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { proProfiles } from "../../../db/schema";
import { storage } from "../../../lib/storage";
import { proOwnerActive } from "../../pros/explore";
import { atBounds, type FeedSource, type LoadedCard, type SourceInput, tsParam } from "./types";

const inArea = (list: readonly string[]): SQL => {
  const values = sql.join(
    list.map((d) => sql`${d}`),
    sql`, `,
  );
  return sql`(${proProfiles.department} in (${values}) or ${proProfiles.interventionDepartments} && array[${values}]::text[])`;
};

export const source: FeedSource<"pro"> = {
  kind: "pro",
  async load(input: SourceInput): Promise<LoadedCard<"pro">[]> {
    const atExpr = sql`${proProfiles.publishedAt}`;
    const filters: (SQL | undefined)[] = [
      sql`${proProfiles.deletedAt} is null`,
      sql`${proProfiles.publishedAt} is not null`,
      proOwnerActive(input.ref),
      sql`${proProfiles.publishedAt} <= ${tsParam(input.ref)}`,
      sql`${proProfiles.publishedAt} >= ${tsParam(input.ref)} - interval '60 days'`,
      ...atBounds(atExpr, input),
    ];
    if (input.filter === "following") {
      filters.push(
        sql`exists (select 1 from pro_follows pf where pf.pro_id = ${proProfiles.id} and pf.user_id = ${input.userId})`,
      );
    } else {
      const area = input.filter === "nearby" ? input.nearby : input.ctx.departments;
      // Sans département connu, pas de pro « près de chez toi » (les pros de la France entière ne sont pas un fil).
      filters.push(area.length ? inArea(area) : sql`false`);
    }
    const rows = await db
      .select({
        p: proProfiles,
        photoKey: sql<
          string | null
        >`(select ph.storage_key from pro_photos ph where ph.pro_id = ${proProfiles.id} order by ph.position, ph.created_at limit 1)`,
      })
      .from(proProfiles)
      .where(and(...filters))
      .orderBy(desc(proProfiles.publishedAt), desc(proProfiles.id))
      .limit(input.limit);
    return rows.flatMap((r): LoadedCard<"pro">[] => {
      const at = r.p.publishedAt;
      if (!at) return [];
      return [
        {
          id: `pro:${r.p.id}`,
          kind: "pro",
          at,
          department: r.p.department,
          authorId: null,
          structureId: null,
          proId: r.p.id,
          categoryIds: [],
          payload: {
            pro: {
              slug: r.p.slug,
              name: r.p.name,
              logoUrl: storage.url(r.p.logoKey),
              photoUrl: storage.url(r.photoKey),
              city: r.p.city,
              department: r.p.department,
              activities: r.p.activities,
            },
          },
        },
      ];
    });
  },
};

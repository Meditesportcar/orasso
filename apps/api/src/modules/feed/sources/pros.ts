// Source « Pro » : fiches de pros publiées depuis moins de 60 jours, dans le département de la personne (adresse ou zone
// d'intervention) ; « Mes abonnements » : les pros suivis. Titulaire en règle seulement ; aucun contact, aucune remise.
import { and, desc, type SQL, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { proProfiles } from "../../../db/schema";
import { storage } from "../../../lib/storage";
import { proOwnerActive } from "../../pros/explore";
import {
  atBounds,
  atMs,
  type FeedSource,
  type LoadedCard,
  type SourceInput,
  type SourceResult,
  sliceRows,
  tsParam,
} from "./types";

const inArea = (list: readonly string[]): SQL => {
  const values = sql.join(
    list.map((d) => sql`${d}`),
    sql`, `,
  );
  return sql`(${proProfiles.department} in (${values}) or ${proProfiles.interventionDepartments} && array[${values}]::text[])`;
};

type Area = { department: string | null; interventionDepartments: string[] | null };

/** Atelier et zone d'intervention : tous les départements que la fiche couvre. */
const areaOf = (p: Area): string[] => [
  ...new Set([...(p.department ? [p.department] : []), ...(p.interventionDepartments ?? [])]),
];

/** Le département de la carte pour le classement : un de ceux de la personne s'il est couvert, sinon celui de l'atelier. */
const servedDepartment = (p: Area, viewerDepartments: readonly string[]): string | null =>
  areaOf(p).find((d) => viewerDepartments.includes(d)) ?? p.department ?? null;

export const source: FeedSource<"pro"> = {
  kind: "pro",
  async load(input: SourceInput): Promise<SourceResult<"pro">> {
    const atExpr = atMs(sql`${proProfiles.publishedAt}`);
    const filters: (SQL | undefined)[] = [
      sql`${proProfiles.deletedAt} is null`,
      sql`${proProfiles.publishedAt} is not null`,
      proOwnerActive(input.ref),
      sql`${proProfiles.publishedAt} <= ${tsParam(input.ref)}`,
      sql`${proProfiles.publishedAt} >= ${tsParam(input.ref)} - interval '60 days'`,
      ...atBounds(atExpr, sql`${proProfiles.id}`, "pro", input),
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
    const raw = await db
      .select({
        p: proProfiles,
        at: sql<Date>`${atExpr}`,
        photoKey: sql<
          string | null
        >`(select ph.storage_key from pro_photos ph where ph.pro_id = ${proProfiles.id} order by ph.position, ph.created_at limit 1)`,
      })
      .from(proProfiles)
      .where(and(...filters))
      .orderBy(desc(atExpr), desc(proProfiles.id))
      .limit(input.limit + 1);
    const { rows, more, tail } = sliceRows(raw, input.limit, (r) => ({ at: new Date(r.at), id: `pro:${r.p.id}` }));
    const cards = rows.flatMap((r): LoadedCard<"pro">[] => {
      const at = r.p.publishedAt;
      if (!at) return [];
      return [
        {
          id: `pro:${r.p.id}`,
          kind: "pro",
          at,
          // Un pro mobile (sans atelier) sert le département de la personne : la proximité et « Autour de moi » le voient.
          department: servedDepartment(r.p, input.ctx.departments),
          areaDepartments: areaOf(r.p),
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
    return { cards, more, tail };
  },
};

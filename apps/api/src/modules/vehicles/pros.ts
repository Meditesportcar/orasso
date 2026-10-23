// « Pour ta … » du Garage (lot M5, maquette 7.1 ; idée de Damien) : les pros partenaires utiles à un véhicule, avec leur
// remise, et l'emplacement sponsorisé lié au véhicule en tête.
//
// Règle d'affinité (la plus simple que les données permettent, journal des choix) : les fiches pro n'ont ni marques ni
// styles, seulement des activités (garage, préparation, covering…) qui servent toutes une voiture. Le lien avec le
// véhicule passe donc par le sponsorisé, qui doit être ciblé sur une de ses catégories (JDM, Japonaise…) ; les autres
// sont les pros partenaires (au moins une remise aux membres) les plus proches du secteur de la personne, à 100 km au
// plus, ou sans adresse mais intervenant dans son secteur.
import {
  type Grade,
  type ProActivity,
  type ProDiscounts,
  proVisibility,
  resolvePosition,
  shownDiscount,
  type VehiclePro,
  type VehiclePros,
} from "@orasso/shared";
import { and, asc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { proDiscounts, proProfiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { notFound } from "../../lib/errors";
import { distanceKmSql, roundKm, withinRadiusSql } from "../../lib/geo-sql";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { sponsoredService } from "../home/sponsored";
import { proOwnerActive } from "../pros/explore";
import { vehiclesRepo } from "./repo";

/** Pros partenaires montrés sous le sponsorisé. */
export const VEHICLE_PROS_LIMIT = 3;
/** Rayon autour du secteur de la personne. */
export const VEHICLE_PROS_RADIUS_KM = 100;

async function discountsByPro(ids: string[]): Promise<Map<string, ProDiscounts>> {
  const out = new Map<string, ProDiscounts>();
  if (!ids.length) return out;
  const rows = await db.select().from(proDiscounts).where(inArray(proDiscounts.proId, ids));
  for (const r of rows) out.set(r.proId, { ...(out.get(r.proId) ?? {}), [r.grade]: r.percent });
  return out;
}

export const vehicleProsService = {
  /** `GET /me/vehicles/:id/pros` (propriétaire seulement). */
  async forVehicle(v: Viewer, vehicleId: string): Promise<VehiclePros> {
    const row = await vehiclesRepo.findFullById(vehicleId);
    if (!row || row.ownerId !== v.user.id) throw notFound("Véhicule introuvable");
    const t = now();
    const grade = v.profile.grade as Grade;
    // Fiche de base (lot 21) : remises masquées, donc ni « partenaires » ni sponsorisé à montrer.
    const vis = proVisibility(null, null, t);
    if (vis.hidden.discounts) return { vehicleId, sponsored: null, pros: [] };

    const categoryIds = row.categories.map((c) => c.categoryId);
    const sponsored = categoryIds.length ? await sponsoredService.select(v, categoryIds, { targetedOnly: true }) : null;

    const located = resolvePosition({}, v.profile.departments);
    const dist = located ? distanceKmSql(proProfiles.lat, proProfiles.lng, located.position) : null;
    const sector = v.profile.departments;
    // Pro sans adresse qui intervient dans le secteur de la personne.
    const intervenes = sector.length
      ? sql`${proProfiles.interventionDepartments} && ARRAY[${sql.join(
          sector.map((d) => sql`${d}`),
          sql`, `,
        )}]::text[]`
      : sql`false`;
    const near = located
      ? or(
          withinRadiusSql(proProfiles.lat, proProfiles.lng, located.position, VEHICLE_PROS_RADIUS_KM),
          and(isNull(proProfiles.lat), intervenes),
        )
      : sector.length
        ? or(inArray(proProfiles.department, sector), intervenes)
        : undefined;
    const rows = await db
      .select({ p: proProfiles, dist: dist ?? sql<number | null>`null` })
      .from(proProfiles)
      .where(
        and(
          isNull(proProfiles.deletedAt),
          isNotNull(proProfiles.publishedAt),
          proOwnerActive(t),
          sql`exists (select 1 from pro_discounts d where d.pro_id = ${proProfiles.id})`,
          sponsored ? ne(proProfiles.slug, sponsored.pro.slug) : undefined,
          near,
        ),
      )
      .orderBy(...(dist ? [sql`${dist} asc nulls last`] : []), asc(proProfiles.name), asc(proProfiles.id))
      .limit(VEHICLE_PROS_LIMIT);

    const sponsorRow = sponsored
      ? await db.query.proProfiles.findFirst({ where: eq(proProfiles.slug, sponsored.pro.slug) })
      : undefined;
    const discounts = await discountsByPro([...rows.map((r) => r.p.id), ...(sponsorRow ? [sponsorRow.id] : [])]);

    const pros: VehiclePro[] = rows.map((r) => ({
      slug: r.p.slug,
      name: r.p.name,
      logoUrl: storage.url(r.p.logoKey),
      activities: r.p.activities as ProActivity[],
      city: r.p.city,
      distanceKm: roundKm(r.dist),
      discount: shownDiscount(discounts.get(r.p.id) ?? {}, grade),
    }));
    return {
      vehicleId,
      sponsored: sponsored
        ? {
            ...sponsored,
            city: sponsorRow?.city ?? null,
            discount: sponsorRow ? shownDiscount(discounts.get(sponsorRow.id) ?? {}, grade) : null,
          }
        : null,
      pros,
    };
  },
};

// Carte d'un pro (annuaire, carte, recherche) : sortie commune du service des pros et de l'Explorer (lot 29).
import type { ProActivity, ProCard } from "@orasso/shared";
import { count, inArray } from "drizzle-orm";

import { db } from "../../db/client";
import { proFollows, type proProfiles } from "../../db/schema";
import { storage } from "../../lib/storage";
import { pageFollowerCounts } from "../social/pageFollows";

type ProRow = typeof proProfiles.$inferSelect;

/** Abonnés d'une fiche pro : les personnes (`pro_follows`) **plus** les pages qui la suivent (`page_follows`, lot R9a). */
export async function followersCounts(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const [rows, pages] = await Promise.all([
    db
      .select({ proId: proFollows.proId, n: count() })
      .from(proFollows)
      .where(inArray(proFollows.proId, ids))
      .groupBy(proFollows.proId),
    pageFollowerCounts("pro", ids),
  ]);
  const out = new Map(rows.map((r) => [r.proId, r.n]));
  for (const [id, n] of pages) out.set(id, (out.get(id) ?? 0) + n);
  return out;
}

export function toCard(p: ProRow, followers: number): ProCard {
  return {
    slug: p.slug,
    name: p.name,
    logoUrl: storage.url(p.logoKey),
    activities: p.activities as ProActivity[],
    city: p.city,
    department: p.department,
    lat: p.lat,
    lng: p.lng,
    interventionDepartments: p.interventionDepartments,
    verified: p.verifiedAt !== null,
    registryName: p.verifiedAt !== null ? (p.registryCheck?.name ?? null) : null,
    followersCount: followers,
  };
}

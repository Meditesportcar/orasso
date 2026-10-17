// Registres des structures et des pros (lot 33, docs/02 « registres : structures, pros avec mode assistance »).
// Les actions sur une structure (vérifier, renouveler, suspendre, transférer) restent celles des lots 13 et 27 ; ici :
// la liste complète avec recherche, le quota des messages groupés (S18, réglable par l'admin), la liste des pros et
// leur vérification à la main (SIRET non trouvé automatiquement), tracée.
import type { AdminProRow, ProActivity } from "@orasso/shared";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or } from "drizzle-orm";

import { db } from "../../db/client";
import { assistanceRequests, events, profiles, proProfiles, structureMembers, structures } from "../../db/schema";
import { requirePlatformRole } from "../../lib/access";
import { now } from "../../lib/deps";
import { AppError, notFound } from "../../lib/errors";
import { escapeLike } from "../../lib/pagination";
import type { Viewer } from "../../lib/session";
import { withTx } from "../../lib/tx";
import { audit } from "./audit";

export type AdminStructureRegistryRow = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  verification: string;
  badgeExpiresAt: string | null;
  city: string | null;
  department: string | null;
  owner: { id: string; pseudo: string } | null;
  members: number;
  events: number;
  followerMessageQuota: number | null;
  assistanceOpen: boolean;
  createdAt: string;
};

export const registriesService = {
  /** `GET /admin/structure-registry?q=` : toutes les structures (statut, badge, propriétaire, assistance). */
  async structures(v: Viewer, q?: string): Promise<AdminStructureRegistryRow[]> {
    await requirePlatformRole(v, "super_admin");
    const rows = await db
      .select()
      .from(structures)
      .where(
        and(
          isNull(structures.deletedAt),
          q
            ? or(ilike(structures.name, `%${escapeLike(q)}%`), ilike(structures.slug, `%${escapeLike(q)}%`))
            : undefined,
        ),
      )
      .orderBy(asc(structures.name))
      .limit(300);
    if (!rows.length) return [];
    const ids = rows.map((s) => s.id);
    const [owners, memberCounts, eventCounts, open] = await Promise.all([
      db
        .select({ structureId: structureMembers.structureId, id: profiles.userId, pseudo: profiles.pseudo })
        .from(structureMembers)
        .innerJoin(profiles, eq(profiles.userId, structureMembers.userId))
        .where(
          and(
            inArray(structureMembers.structureId, ids),
            eq(structureMembers.role, "owner"),
            eq(structureMembers.status, "active"),
          ),
        ),
      db
        .select({ id: structureMembers.structureId, n: count() })
        .from(structureMembers)
        .where(and(inArray(structureMembers.structureId, ids), eq(structureMembers.status, "active")))
        .groupBy(structureMembers.structureId),
      db
        .select({ id: events.structureId, n: count() })
        .from(events)
        .where(inArray(events.structureId, ids))
        .groupBy(events.structureId),
      db
        .select({ id: assistanceRequests.structureId })
        .from(assistanceRequests)
        .where(and(inArray(assistanceRequests.structureId, ids), eq(assistanceRequests.status, "open"))),
    ]);
    const m = new Map(memberCounts.map((r) => [r.id, r.n]));
    const e = new Map(eventCounts.map((r) => [r.id, r.n]));
    const o = new Set(open.map((r) => r.id));
    return rows.map((s) => {
      const owner = owners.find((x) => x.structureId === s.id);
      return {
        id: s.id,
        slug: s.slug,
        name: s.name,
        kind: s.kind,
        verification: s.verification,
        badgeExpiresAt: s.badgeExpiresAt?.toISOString() ?? null,
        city: s.city,
        department: s.department,
        owner: owner ? { id: owner.id, pseudo: owner.pseudo } : null,
        members: m.get(s.id) ?? 0,
        events: e.get(s.id) ?? 0,
        followerMessageQuota: s.followerMessageQuota,
        assistanceOpen: o.has(s.id),
        createdAt: s.createdAt.toISOString(),
      };
    });
  },

  /** `PATCH /admin/structures/:id/quota {followerMessageQuota, reason}` : quota des messages aux abonnés (S18). */
  async setFollowerQuota(v: Viewer, id: string, quota: number | null, reason: string) {
    await requirePlatformRole(v, "super_admin");
    return withTx(async (tx) => {
      const [s] = await tx
        .update(structures)
        .set({ followerMessageQuota: quota })
        .where(and(eq(structures.id, id), isNull(structures.deletedAt)))
        .returning({ id: structures.id, quota: structures.followerMessageQuota });
      if (!s) throw notFound("Structure introuvable");
      await audit(tx, v, {
        action: "structure.follower_quota",
        targetType: "structure",
        targetId: id,
        structureId: id,
        reason: `${quota ?? "par défaut"} · ${reason}`,
      });
      return { id: s.id, followerMessageQuota: s.quota };
    });
  },

  /** `GET /admin/pros?filter=to_verify|all&q=` : fiches pro ; « à vérifier » = publiées sans badge « pro vérifié ». */
  async pros(v: Viewer, filter: "to_verify" | "all", q?: string): Promise<AdminProRow[]> {
    await requirePlatformRole(v, "super_admin");
    const rows = await db
      .select({ p: proProfiles, pseudo: profiles.pseudo })
      .from(proProfiles)
      .leftJoin(profiles, eq(profiles.userId, proProfiles.ownerUserId))
      .where(
        and(
          isNull(proProfiles.deletedAt),
          filter === "to_verify" ? and(isNotNull(proProfiles.publishedAt), isNull(proProfiles.verifiedAt)) : undefined,
          q
            ? or(ilike(proProfiles.name, `%${escapeLike(q)}%`), ilike(proProfiles.slug, `%${escapeLike(q)}%`))
            : undefined,
        ),
      )
      .orderBy(desc(proProfiles.createdAt))
      .limit(300);
    return rows.map(({ p, pseudo }) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      owner: pseudo ? { id: p.ownerUserId, pseudo } : null,
      city: p.city,
      department: p.department,
      activities: p.activities as ProActivity[],
      siret: p.siret,
      registryStatus: p.registryCheck?.status ?? null,
      verified: p.verifiedAt !== null,
      published: p.publishedAt !== null,
      createdAt: p.createdAt.toISOString(),
    }));
  },

  /** `POST /admin/pros/:id/verify {verified, note}` : badge « pro vérifié » posé ou retiré à la main, tracé. */
  async verifyPro(v: Viewer, id: string, verified: boolean, note: string) {
    await requirePlatformRole(v, "super_admin");
    const owned = await db.query.proProfiles.findFirst({
      where: eq(proProfiles.id, id),
      columns: { ownerUserId: true },
    });
    if (owned?.ownerUserId === v.user.id) {
      throw new AppError(409, "self_action", "Action impossible sur ta propre fiche pro.");
    }
    return withTx(async (tx) => {
      const [p] = await tx
        .update(proProfiles)
        .set({ verifiedAt: verified ? now() : null })
        .where(and(eq(proProfiles.id, id), isNull(proProfiles.deletedAt)))
        .returning({ id: proProfiles.id, verifiedAt: proProfiles.verifiedAt });
      if (!p) throw notFound("Fiche pro introuvable");
      await audit(tx, v, {
        action: verified ? "pro.verify" : "pro.unverify",
        targetType: "pro",
        targetId: id,
        reason: note,
      });
      return { id: p.id, verified: p.verifiedAt !== null };
    });
  },
};

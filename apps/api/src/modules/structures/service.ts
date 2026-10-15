import { randomBytes } from "node:crypto";
import type {
  MemberInvite,
  MemberUpdate,
  StaffRole,
  StructureCreate,
  StructureMember,
  StructureOrganizer,
  StructurePublic,
  StructureUpdate,
} from "@orasso/shared";
import { and, asc, count, eq, isNull, ne, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  adminAuditLog,
  profiles,
  structureBans,
  structureFollows,
  structureMembers,
  structures,
  user,
} from "../../db/schema";
import { type OrganizerAccess, requireOrganizer, requirePlatformRole } from "../../lib/access";
import { now } from "../../lib/deps";
import { conflict, forbidden, notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { uniqueSlug } from "../../lib/slug";
import { storage } from "../../lib/storage";
import { withTx } from "../../lib/tx";
import { profilesRepo } from "../profiles/repo";

export type StructureRow = typeof structures.$inferSelect;

const YEAR_MS = 365 * 86_400_000;

export async function structureById(id: string): Promise<StructureRow> {
  const s = await db.query.structures.findFirst({ where: and(eq(structures.id, id), isNull(structures.deletedAt)) });
  if (!s) throw notFound("Structure introuvable");
  return s;
}

async function followersCount(structureId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(structureFollows)
    .where(eq(structureFollows.structureId, structureId));
  return row?.n ?? 0;
}

export async function isFollowing(structureId: string, userId: string): Promise<boolean> {
  const row = await db.query.structureFollows.findFirst({
    where: and(eq(structureFollows.structureId, structureId), eq(structureFollows.userId, userId)),
  });
  return Boolean(row);
}

async function toPublic(s: StructureRow, viewer?: Viewer | null): Promise<StructurePublic> {
  return {
    id: s.id,
    slug: s.slug,
    kind: s.kind,
    name: s.name,
    logoUrl: storage.url(s.logoKey),
    description: s.description,
    addressLine: s.addressLine,
    postalCode: s.postalCode,
    city: s.city,
    department: s.department,
    lat: s.lat,
    lng: s.lng,
    departments: s.departments,
    website: s.website,
    socials: s.socials,
    verified: s.verification === "verified",
    followersCount: await followersCount(s.id),
    ...(viewer ? { isFollowing: await isFollowing(s.id, viewer.user.id) } : {}),
  };
}

async function toOrganizer(s: StructureRow, access: OrganizerAccess): Promise<StructureOrganizer> {
  return {
    ...(await toPublic(s)),
    verification: s.verification,
    verifiedAt: s.verifiedAt?.toISOString() ?? null,
    badgeExpiresAt: s.badgeExpiresAt?.toISOString() ?? null,
    siret: s.siret,
    rna: s.rna,
    inviteToken: s.inviteToken,
    myRole: access.role,
  };
}

const slugTaken = async (slug: string) =>
  Boolean(await db.query.structures.findFirst({ where: eq(structures.slug, slug) }));

export const structuresService = {
  async getPublic(slug: string, viewer: Viewer | null): Promise<StructurePublic> {
    const s = await db.query.structures.findFirst({
      where: and(eq(structures.slug, slug), isNull(structures.deletedAt)),
    });
    if (!s || s.verification === "suspended") throw notFound("Structure introuvable");
    return toPublic(s, viewer);
  },

  /** N'importe quel utilisateur peut créer une structure ; il en devient le propriétaire (docs/01, bloc 1). */
  async create(v: Viewer, input: StructureCreate): Promise<StructureOrganizer> {
    const slug = await uniqueSlug(input.name, slugTaken);
    const s = await withTx(async (tx) => {
      const [row] = await tx
        .insert(structures)
        .values({ ...input, slug, inviteToken: randomBytes(12).toString("base64url"), createdBy: v.user.id })
        .returning();
      if (!row) throw new Error("Création de la structure impossible");
      await tx
        .insert(structureMembers)
        .values({ structureId: row.id, userId: v.user.id, role: "owner", status: "active", joinedAt: now() });
      return row;
    });
    return toOrganizer(s, { role: "owner" });
  },

  async getForOrganizer(v: Viewer, id: string): Promise<StructureOrganizer> {
    const s = await structureById(id);
    return toOrganizer(s, await requireOrganizer(v, id));
  },

  async update(v: Viewer, id: string, input: StructureUpdate): Promise<StructureOrganizer> {
    const access = await requireOrganizer(v, id);
    const [s] = await db.update(structures).set(input).where(eq(structures.id, id)).returning();
    if (!s) throw notFound("Structure introuvable");
    return toOrganizer(s, access);
  },

  async follow(v: Viewer, id: string) {
    await structureById(id);
    await db
      .insert(structureFollows)
      .values({ structureId: id, userId: v.user.id, source: "manual" })
      .onConflictDoNothing();
  },

  async unfollow(v: Viewer, id: string) {
    await db
      .delete(structureFollows)
      .where(and(eq(structureFollows.structureId, id), eq(structureFollows.userId, v.user.id)));
  },

  /** Abonnés (organisateur seulement) : un utilisateur qui ne suit pas la structure n'y apparaît pas. */
  async followers(v: Viewer, id: string) {
    await requireOrganizer(v, id);
    return db
      .select({
        userId: profiles.userId,
        pseudo: profiles.pseudo,
        grade: profiles.grade,
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        phone: profiles.phone,
        email: user.email,
        source: structureFollows.source,
        since: structureFollows.createdAt,
      })
      .from(structureFollows)
      .innerJoin(profiles, eq(profiles.userId, structureFollows.userId))
      .innerJoin(user, eq(user.id, structureFollows.userId))
      .where(eq(structureFollows.structureId, id))
      .orderBy(asc(profiles.pseudo));
  },

  async members(v: Viewer, id: string): Promise<StructureMember[]> {
    await requireOrganizer(v, id);
    const rows = await db
      .select({ m: structureMembers, pseudo: profiles.pseudo })
      .from(structureMembers)
      .innerJoin(profiles, eq(profiles.userId, structureMembers.userId))
      .where(and(eq(structureMembers.structureId, id), ne(structureMembers.status, "removed")))
      .orderBy(asc(structureMembers.role), asc(profiles.pseudo));
    return rows.map(({ m, pseudo }) => ({
      userId: m.userId,
      pseudo,
      role: m.role,
      staffRoles: m.staffRoles as StaffRole[],
      canDecide: m.canDecide,
      status: m.status,
      joinedAt: m.joinedAt?.toISOString() ?? null,
    }));
  },

  /**
   * Invitation d'un membre par pseudo ou e-mail d'un compte existant ; il accepte depuis son compte.
   * Le propriétaire gère les co-organisateurs ; propriétaire et co-organisateurs gèrent le staff.
   */
  async invite(v: Viewer, id: string, input: MemberInvite) {
    const access = await requireOrganizer(v, id);
    if (input.role === "co_organizer" && access.role === "co_organizer") {
      throw forbidden("Seul le propriétaire nomme les co-organisateurs");
    }
    const target = input.pseudo
      ? await profilesRepo.byPseudo(input.pseudo)
      : await db
          .select({ userId: user.id })
          .from(user)
          .where(sql`lower(${user.email}) = lower(${input.email ?? ""})`)
          .then((r) => r[0]);
    if (!target) throw notFound("Aucun compte Orasso à ce nom");
    const existing = await db.query.structureMembers.findFirst({
      where: and(eq(structureMembers.structureId, id), eq(structureMembers.userId, target.userId)),
    });
    if (existing && existing.status !== "removed") throw conflict("conflict", "Déjà membre ou déjà invité");
    const values = {
      role: input.role,
      staffRoles: input.staffRoles,
      canDecide: input.canDecide,
      status: "invited" as const,
      invitedBy: v.user.id,
      joinedAt: null,
    };
    if (existing) await db.update(structureMembers).set(values).where(eq(structureMembers.id, existing.id));
    else await db.insert(structureMembers).values({ structureId: id, userId: target.userId, ...values });
    return { userId: target.userId };
  },

  async respondToInvitation(v: Viewer, structureId: string, accept: boolean) {
    const m = await db.query.structureMembers.findFirst({
      where: and(
        eq(structureMembers.structureId, structureId),
        eq(structureMembers.userId, v.user.id),
        eq(structureMembers.status, "invited"),
      ),
    });
    if (!m) throw notFound("Invitation introuvable");
    await db
      .update(structureMembers)
      .set(accept ? { status: "active", joinedAt: now() } : { status: "removed" })
      .where(eq(structureMembers.id, m.id));
  },

  async updateMember(v: Viewer, id: string, userId: string, input: MemberUpdate) {
    const access = await requireOrganizer(v, id);
    const m = await db.query.structureMembers.findFirst({
      where: and(eq(structureMembers.structureId, id), eq(structureMembers.userId, userId)),
    });
    if (!m || m.status === "removed") throw notFound("Membre introuvable");
    if (m.role === "owner") throw forbidden("Le propriétaire ne se modifie pas ici");
    if (access.role === "co_organizer" && (m.role === "co_organizer" || input.role === "co_organizer")) {
      throw forbidden("Seul le propriétaire gère les co-organisateurs");
    }
    await db.update(structureMembers).set(input).where(eq(structureMembers.id, m.id));
  },

  async removeMember(v: Viewer, id: string, userId: string) {
    const access = await requireOrganizer(v, id);
    const m = await db.query.structureMembers.findFirst({
      where: and(eq(structureMembers.structureId, id), eq(structureMembers.userId, userId)),
    });
    if (!m || m.status === "removed") throw notFound("Membre introuvable");
    if (m.role === "owner") throw forbidden("Pas de transfert de propriété (docs/01) : l'équipe Orasso intervient");
    if (access.role === "co_organizer" && m.role === "co_organizer") {
      throw forbidden("Seul le propriétaire gère les co-organisateurs");
    }
    await db.update(structureMembers).set({ status: "removed" }).where(eq(structureMembers.id, m.id));
  },

  async bans(v: Viewer, id: string) {
    await requireOrganizer(v, id);
    return db
      .select({
        userId: structureBans.userId,
        pseudo: profiles.pseudo,
        reason: structureBans.reason,
        at: structureBans.createdAt,
      })
      .from(structureBans)
      .innerJoin(profiles, eq(profiles.userId, structureBans.userId))
      .where(eq(structureBans.structureId, id));
  },

  /** Bannissement des événements de la structure (seule l'équipe Orasso bannit de la plateforme). */
  async ban(v: Viewer, id: string, pseudo: string, reason: string | null) {
    await requireOrganizer(v, id);
    const target = await profilesRepo.byPseudo(pseudo);
    if (!target) throw notFound("Profil introuvable");
    await db
      .insert(structureBans)
      .values({ structureId: id, userId: target.userId, reason, createdBy: v.user.id })
      .onConflictDoNothing();
  },

  async unban(v: Viewer, id: string, userId: string) {
    await requireOrganizer(v, id);
    await db.delete(structureBans).where(and(eq(structureBans.structureId, id), eq(structureBans.userId, userId)));
  },

  /** Vérification manuelle par l'équipe Orasso (le contrôle SIRET/RNA et les justificatifs viendront au lot 13). */
  async verify(v: Viewer, id: string, verified: boolean, note: string | null, ip?: string | null) {
    await requirePlatformRole(v, "super_admin");
    await structureById(id);
    const at = now();
    await withTx(async (tx) => {
      await tx
        .update(structures)
        .set(
          verified
            ? { verification: "verified", verifiedAt: at, badgeExpiresAt: new Date(at.getTime() + YEAR_MS) }
            : { verification: "unverified", verifiedAt: null, badgeExpiresAt: null },
        )
        .where(eq(structures.id, id));
      await tx.insert(adminAuditLog).values({
        actorUserId: v.user.id,
        action: verified ? "structure.verify" : "structure.unverify",
        targetType: "structure",
        targetId: id,
        structureId: id,
        reason: note,
        ip: ip ?? null,
      });
    });
  },
};

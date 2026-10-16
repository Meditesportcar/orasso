import { randomBytes } from "node:crypto";
import {
  departmentFromPostalCode,
  type MemberInvite,
  type MemberUpdate,
  type Page,
  reviewAverage,
  type StaffRole,
  type StructureCard,
  type StructureCreate,
  type StructureMember,
  type StructureOrganizer,
  type StructurePublic,
  type StructureRating,
  type StructureUpdate,
} from "@orasso/shared";
import { and, asc, count, eq, gte, isNull, ne, sql } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../../db/client";
import {
  adminAuditLog,
  events,
  profiles,
  reviews,
  structureBans,
  structureFollows,
  structureMembers,
  structures,
  user,
} from "../../db/schema";
import { type OrganizerAccess, requireOrganizer, requirePlatformRole } from "../../lib/access";
import { now } from "../../lib/deps";
import { AppError, conflict, forbidden, notFound, validation } from "../../lib/errors";
import { addressQuery, geocode } from "../../lib/geocode";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { uniqueSlug } from "../../lib/slug";
import { storage } from "../../lib/storage";
import { withTx } from "../../lib/tx";
import { staffChatsService } from "../communication/staff-chats";
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

/** Note moyenne de la structure : avis de ses événements, moyenne affichée à partir de 3 avis (lot 12). */
async function ratingOf(structureId: string): Promise<StructureRating> {
  const rows = await db
    .select({ rating: reviews.rating })
    .from(reviews)
    .innerJoin(events, eq(events.id, reviews.eventId))
    .where(and(eq(events.structureId, structureId), isNull(reviews.hiddenAt)));
  return { average: reviewAverage(rows.map((r) => r.rating)), count: rows.length };
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
    rating: await ratingOf(s.id),
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

/** Position et département d'une adresse (meilleur effort : jamais bloquant). */
export async function locate(a: {
  addressLine?: string | null;
  postalCode?: string | null;
  city?: string | null;
  department?: string | null;
  lat?: number | null;
  lng?: number | null;
}) {
  const out: { lat?: number; lng?: number; department?: string } = {};
  const department = a.department ?? departmentFromPostalCode(a.postalCode);
  if (department && !a.department) out.department = department;
  if (a.lat == null || a.lng == null) {
    const hit = await geocode(addressQuery(a));
    if (hit) {
      out.lat = hit.lat;
      out.lng = hit.lng;
      if (!out.department && !a.department && hit.department) out.department = hit.department;
    }
  }
  return out;
}

const slugTaken = async (slug: string) =>
  Boolean(await db.query.structures.findFirst({ where: eq(structures.slug, slug) }));

export const structuresService = {
  /** Annuaire public des structures vérifiées (plan du site, page des organisateurs). */
  async list(limit: number, cursor?: string): Promise<Page<StructureCard>> {
    const offset = cursor ? Number(Buffer.from(cursor, "base64url").toString()) || 0 : 0;
    const t = now();
    const upcoming = db
      .select({ structureId: events.structureId, n: count().as("n") })
      .from(events)
      .where(and(eq(events.status, "published"), gte(events.endsAt, t)))
      .groupBy(events.structureId)
      .as("upcoming");
    const rows = await db
      .select({ s: structures, n: upcoming.n })
      .from(structures)
      .leftJoin(upcoming, eq(upcoming.structureId, structures.id))
      .where(and(isNull(structures.deletedAt), eq(structures.verification, "verified")))
      .orderBy(asc(structures.name), asc(structures.id))
      .limit(limit + 1)
      .offset(offset);
    return {
      items: rows.slice(0, limit).map(({ s, n }) => ({
        slug: s.slug,
        name: s.name,
        kind: s.kind,
        logoUrl: storage.url(s.logoKey),
        city: s.city,
        department: s.department,
        upcomingCount: n ?? 0,
      })),
      nextCursor: rows.length > limit ? Buffer.from(String(offset + limit)).toString("base64url") : null,
    };
  },

  /** Lien d'invitation d'un organisateur (`/invitation/:jeton`) : la structure concernée. */
  async byInviteToken(token: string): Promise<StructurePublic> {
    const s = await db.query.structures.findFirst({
      where: and(eq(structures.inviteToken, token), isNull(structures.deletedAt)),
    });
    if (!s || s.verification === "suspended") throw notFound("Invitation introuvable");
    return toPublic(s);
  },

  /** Un compte qui suit la structure par son lien d'invitation (source `invite_link`). */
  async acceptInvite(v: Viewer, token: string): Promise<StructurePublic> {
    const s = await db.query.structures.findFirst({
      where: and(eq(structures.inviteToken, token), isNull(structures.deletedAt)),
    });
    if (!s || s.verification === "suspended") throw notFound("Invitation introuvable");
    await db
      .insert(structureFollows)
      .values({ structureId: s.id, userId: v.user.id, source: "invite_link" })
      .onConflictDoNothing();
    return toPublic(s, v);
  },

  /** Logo de la structure (carré, WebP 512 px). */
  async setLogo(v: Viewer, id: string, file: File): Promise<StructureOrganizer> {
    const access = await requireOrganizer(v, id);
    rateLimit("fileUpload", v.user.id);
    if (file.size === 0) throw validation("Fichier vide");
    if (file.size > 8 * 1024 * 1024) throw new AppError(413, "payload_too_large", "Logo de 8 Mo au plus");
    let data: Buffer;
    try {
      data = await sharp(Buffer.from(await file.arrayBuffer()))
        .rotate()
        .resize(512, 512, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new AppError(415, "unsupported_media_type", "Image illisible (JPEG, PNG ou WebP)");
    }
    const previous = (await structureById(id)).logoKey;
    const key = `structures/${id}/logo-${randomBytes(6).toString("hex")}.webp`;
    await storage.put(key, data);
    const [s] = await db.update(structures).set({ logoKey: key }).where(eq(structures.id, id)).returning();
    if (!s) throw notFound("Structure introuvable");
    if (previous) await storage.remove(previous);
    return toOrganizer(s, access);
  },

  async getPublic(slug: string, viewer: Viewer | null): Promise<StructurePublic> {
    const s = await db.query.structures.findFirst({
      where: and(eq(structures.slug, slug), isNull(structures.deletedAt)),
    });
    if (!s || s.verification === "suspended") throw notFound("Structure introuvable");
    return toPublic(s, viewer);
  },

  /** N'importe quel utilisateur peut créer une structure ; il en devient le propriétaire (docs/01, bloc 1). */
  async create(v: Viewer, input: StructureCreate): Promise<StructureOrganizer> {
    rateLimit("structureCreate", v.user.id);
    const slug = await uniqueSlug(input.name, slugTaken);
    // Le SIRET et le RNA ne se posent que par le contrôle du registre (`verification.check`).
    const { siret: _siret, rna: _rna, ...fields } = input;
    const located = await locate(fields);
    const s = await withTx(async (tx) => {
      const [row] = await tx
        .insert(structures)
        .values({
          ...fields,
          ...located,
          slug,
          inviteToken: randomBytes(12).toString("base64url"),
          createdBy: v.user.id,
        })
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
    const current = await structureById(id);
    const { siret: _siret, rna: _rna, ...fields } = input;
    const addressChanged = ["addressLine", "postalCode", "city"].some(
      (k) => k in fields && fields[k as "city"] !== current[k as "city"],
    );
    const located = addressChanged
      ? await locate({
          ...current,
          ...fields,
          department: "postalCode" in fields ? (fields.department ?? null) : current.department,
          lat: null,
          lng: null,
        })
      : {};
    const [s] = await db
      .update(structures)
      .set({ ...fields, ...located })
      .where(eq(structures.id, id))
      .returning();
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
    // Discussions du staff (lot 20) : participants à jour.
    if (accept) await staffChatsService.syncStructure(structureId);
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
    await staffChatsService.syncStructure(id);
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
    await staffChatsService.syncStructure(id);
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

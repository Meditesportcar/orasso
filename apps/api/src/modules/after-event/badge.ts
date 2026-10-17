// Badge de structure (lot 27, ARCHITECTURE-SUITE § 11.6, docs/01 « la structure ») : valable un an ; la structure est
// prévenue un mois, une semaine et la veille avant l'échéance (une fois chaque, tâche quotidienne idempotente) ;
// sans renouvellement, elle est suspendue — sans rien supprimer, et l'équipe peut lever la suspension. Suspendue :
// plus de publication ni de création d'événement, plus d'écriture côté organisateur ; les événements publiés à venir
// sont conservés (S31 : les inscrits sont engagés) et tout reste lisible. L'équipe Orasso (super administrateur, 2FA)
// renouvelle, suspend, lève, et change le propriétaire sur justificatif (S32) ; tout est écrit au journal
// d'administration. Rien d'automatique n'est irréversible.
import { randomBytes } from "node:crypto";
import {
  type AdminBadgeCounts,
  type AdminBadgeRow,
  type AdminStructureDetail,
  afterEventLabels,
  type BadgeFilter,
  type BadgeReminders,
  badgeDaysLeft,
  badgePlan,
  gracedBadgeExpiry,
  renewedBadgeExpiry,
  type TransferOwner,
  type VerificationDocument,
} from "@orasso/shared";
import { and, asc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  adminAuditLog,
  profiles,
  structureMembers,
  structures,
  structureVerificationDocuments,
  user,
} from "../../db/schema";
import { env } from "../../env";
import { requirePlatformRole } from "../../lib/access";
import { now } from "../../lib/deps";
import { AppError, conflict, notFound, validation } from "../../lib/errors";
import { mail, renderMail } from "../../lib/mail";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Tx, withTx } from "../../lib/tx";
import { staffChatsService } from "../communication/staff-chats";
import { notificationsService } from "../notifications/service";
import { sniffDocument } from "../structures/verification";
import { organizerIds } from "./helpers";

type StructureRow = typeof structures.$inferSelect;

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const DAY = 86_400_000;
/** Un badge est « à renouveler » à partir de ce nombre de jours avant l'échéance (premier palier). */
const EXPIRING_WITHIN_DAYS = 30;

const docOf = (d: typeof structureVerificationDocuments.$inferSelect): VerificationDocument => ({
  id: d.id,
  kind: d.kind,
  fileName: d.fileName,
  sizeBytes: d.sizeBytes,
  createdAt: d.createdAt.toISOString(),
});

async function ownersOf(ids: string[]) {
  if (!ids.length) return new Map<string, { pseudo: string; email: string }>();
  const rows = await db
    .select({ structureId: structureMembers.structureId, pseudo: profiles.pseudo, email: user.email })
    .from(structureMembers)
    .innerJoin(profiles, eq(profiles.userId, structureMembers.userId))
    .innerJoin(user, eq(user.id, structureMembers.userId))
    .where(
      and(
        inArray(structureMembers.structureId, ids),
        eq(structureMembers.role, "owner"),
        eq(structureMembers.status, "active"),
      ),
    );
  return new Map(rows.map((r) => [r.structureId, { pseudo: r.pseudo, email: r.email }]));
}

function rowOf(s: StructureRow, owner: { pseudo: string; email: string } | undefined, at: Date): AdminBadgeRow {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    verification: s.verification,
    suspendedReason: s.suspendedReason,
    suspendedAt: s.suspendedAt?.toISOString() ?? null,
    badgeExpiresAt: s.badgeExpiresAt?.toISOString() ?? null,
    daysLeft: s.badgeExpiresAt ? badgeDaysLeft(s.badgeExpiresAt, at) : null,
    reminded: s.badgeRemindedAt,
    owner: owner ?? null,
  };
}

/** Structure verrouillée pour la transaction (renouvellement, suspension et balayage ne se croisent pas). */
async function lockStructure(tx: Tx, id: string): Promise<StructureRow> {
  const [s] = await tx.select().from(structures).where(eq(structures.id, id)).for("update");
  if (!s || s.deletedAt) throw notFound("Structure introuvable");
  return s;
}

async function audit(
  tx: Tx,
  v: Viewer,
  action: string,
  structureId: string,
  reason: string | null,
  ip: string | null,
  targetType = "structure",
  targetId = structureId,
) {
  await tx.insert(adminAuditLog).values({
    actorUserId: v.user.id,
    action,
    targetType,
    targetId,
    structureId,
    reason,
    ip,
  });
}

export const badgeService = {
  /**
   * Tâche `structure.badge-sweep` (chaque jour à 09:00, Paris). Pour chaque structure vérifiée dont l'échéance approche
   * ou est passée : un rappel (le palier franchi le plus urgent, une fois chacun) ou la suspension. Chaque structure a
   * sa transaction, sous verrou : rejouée ou lancée deux fois, la tâche n'envoie rien de plus.
   */
  async sweep(): Promise<{ reminded: number; suspended: number }> {
    const horizon = new Date(now().getTime() + (EXPIRING_WITHIN_DAYS + 1) * DAY);
    const candidates = await db
      .select({ id: structures.id })
      .from(structures)
      .where(
        and(
          eq(structures.verification, "verified"),
          isNull(structures.deletedAt),
          sql`${structures.badgeExpiresAt} is not null`,
          lte(structures.badgeExpiresAt, horizon),
        ),
      )
      .orderBy(asc(structures.badgeExpiresAt));
    let reminded = 0;
    let suspended = 0;
    for (const { id } of candidates) {
      const outcome = await withTx(async (tx, after) => {
        const s = await lockStructure(tx, id);
        if (s.verification !== "verified" || !s.badgeExpiresAt) return "none" as const;
        const at = now();
        const plan = badgePlan(s.badgeExpiresAt, at, s.badgeRemindedAt);
        if (plan.action === "none") return "none" as const;
        const organizers = await organizerIds(s.id, tx);
        if (plan.action === "remind") {
          const marks: BadgeReminders = { ...s.badgeRemindedAt };
          for (const d of plan.mark) marks[`${d}`] = at.toISOString();
          await tx.update(structures).set({ badgeRemindedAt: marks }).where(eq(structures.id, s.id));
          const date = s.badgeExpiresAt.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long" });
          await notificationsService.notifyMany(tx, organizers, "structure_badge_expiring", {
            title: afterEventLabels.badgeReminderTitle(s.name),
            body: afterEventLabels.badgeReminderBody(plan.day, date),
            data: { structureId: s.id, day: plan.day },
            link: { label: "Ouvrir ma structure", path: `/orga/${s.slug}/structure` },
          });
          after(() => notificationsService.kick());
          return "reminded" as const;
        }
        await tx
          .update(structures)
          .set({ verification: "suspended", suspendedReason: "badge_expired", suspendedAt: at })
          .where(eq(structures.id, s.id));
        await notificationsService.notifyMany(tx, organizers, "structure_badge_suspended", {
          title: afterEventLabels.badgeSuspendedTitle(s.name),
          body: afterEventLabels.badgeSuspendedBody,
          data: { structureId: s.id },
          link: { label: "Ouvrir ma structure", path: `/orga/${s.slug}/structure` },
        });
        after(() => notificationsService.kick());
        return "suspended" as const;
      });
      if (outcome === "reminded") reminded += 1;
      if (outcome === "suspended") suspended += 1;
    }
    return { reminded, suspended };
  },

  // --- Équipe Orasso -----------------------------------------------------------------------------------------------

  /** `GET /admin/structures?badge=expiring|suspended|all` */
  async list(v: Viewer, filter: BadgeFilter): Promise<{ items: AdminBadgeRow[]; counts: AdminBadgeCounts }> {
    await requirePlatformRole(v, "super_admin");
    const at = now();
    const horizon = new Date(at.getTime() + EXPIRING_WITHIN_DAYS * DAY);
    const expiring = and(
      eq(structures.verification, "verified"),
      sql`${structures.badgeExpiresAt} is not null`,
      lte(structures.badgeExpiresAt, horizon),
    );
    const suspended = eq(structures.verification, "suspended");
    const rows = await db
      .select()
      .from(structures)
      .where(
        and(
          isNull(structures.deletedAt),
          filter === "expiring"
            ? expiring
            : filter === "suspended"
              ? suspended
              : or(
                  suspended,
                  and(eq(structures.verification, "verified"), sql`${structures.badgeExpiresAt} is not null`),
                ),
        ),
      )
      .orderBy(asc(structures.badgeExpiresAt), asc(structures.name))
      .limit(300);
    const owners = await ownersOf(rows.map((r) => r.id));
    const [counts] = (
      await db.execute(sql`
        select (count(*) filter (where verification = 'verified' and badge_expires_at is not null
                                   and badge_expires_at <= ${horizon}))::int as expiring,
               (count(*) filter (where verification = 'suspended'))::int as suspended
        from structures where deleted_at is null`)
    ).rows as AdminBadgeCounts[];
    return {
      items: rows.map((r) => rowOf(r, owners.get(r.id), at)),
      counts: { expiring: counts?.expiring ?? 0, suspended: counts?.suspended ?? 0 },
    };
  },

  /** `GET /admin/structures/:id` */
  async detail(v: Viewer, id: string): Promise<AdminStructureDetail> {
    await requirePlatformRole(v, "super_admin");
    const [s] = await db
      .select()
      .from(structures)
      .where(and(eq(structures.id, id), isNull(structures.deletedAt)));
    if (!s) throw notFound("Structure introuvable");
    const owners = await ownersOf([s.id]);
    const members = await db
      .select({
        userId: structureMembers.userId,
        pseudo: profiles.pseudo,
        role: structureMembers.role,
        status: structureMembers.status,
      })
      .from(structureMembers)
      .innerJoin(profiles, eq(profiles.userId, structureMembers.userId))
      .where(and(eq(structureMembers.structureId, id), ne(structureMembers.status, "removed")))
      .orderBy(asc(structureMembers.role), asc(profiles.pseudo));
    const docs = await db
      .select()
      .from(structureVerificationDocuments)
      .where(eq(structureVerificationDocuments.structureId, id))
      .orderBy(asc(structureVerificationDocuments.createdAt));
    return {
      ...rowOf(s, owners.get(s.id), now()),
      kind: s.kind,
      city: s.city,
      members,
      documents: docs.map(docOf),
    };
  },

  /** `POST /admin/structures/:id/renew-badge {note}` : un an de plus (à partir de l'échéance si elle n'est pas passée). */
  async renew(v: Viewer, id: string, note: string | null, ip: string | null): Promise<AdminBadgeRow> {
    await requirePlatformRole(v, "super_admin");
    await withTx(async (tx) => {
      const s = await lockStructure(tx, id);
      const suspendedForBadge = s.verification === "suspended" && s.suspendedReason !== "moderation";
      if (s.verification !== "verified" && !suspendedForBadge) {
        throw conflict(
          "conflict",
          s.verification === "suspended"
            ? "Suspendue par l'équipe : lève d'abord la suspension."
            : "Seule une structure vérifiée a un badge à renouveler.",
        );
      }
      const at = now();
      await tx
        .update(structures)
        .set({
          verification: "verified",
          suspendedReason: null,
          suspendedAt: null,
          badgeExpiresAt: renewedBadgeExpiry(s.badgeExpiresAt, at),
          badgeRemindedAt: {},
        })
        .where(eq(structures.id, id));
      await audit(tx, v, "structure.renew_badge", id, note, ip);
    });
    return (await this.detail(v, id)) as AdminBadgeRow;
  },

  /** `POST /admin/structures/:id/suspend {reason}` : décision de l'équipe, réversible. */
  async suspend(v: Viewer, id: string, reason: string, ip: string | null): Promise<AdminBadgeRow> {
    await requirePlatformRole(v, "super_admin");
    await withTx(async (tx, after) => {
      const s = await lockStructure(tx, id);
      if (s.verification !== "verified") throw conflict("conflict", "Seule une structure vérifiée se suspend.");
      await tx
        .update(structures)
        .set({ verification: "suspended", suspendedReason: "moderation", suspendedAt: now() })
        .where(eq(structures.id, id));
      await audit(tx, v, "structure.suspend", id, reason, ip);
      await notificationsService.notifyMany(tx, await organizerIds(id, tx), "structure_badge_suspended", {
        title: afterEventLabels.badgeSuspendedTitle(s.name),
        body: afterEventLabels.badgeSuspendedModeration,
        data: { structureId: s.id },
        link: { label: "Ouvrir ma structure", path: `/orga/${s.slug}/structure` },
      });
      after(() => notificationsService.kick());
    });
    return (await this.detail(v, id)) as AdminBadgeRow;
  },

  /**
   * `POST /admin/structures/:id/lift {reason}` : lève la suspension (rien n'avait été supprimé). Un badge échu repart
   * pour 30 jours de grâce, pour que le balayage du lendemain ne la suspende pas aussitôt ; les rappels recommencent.
   */
  async lift(v: Viewer, id: string, reason: string, ip: string | null): Promise<AdminBadgeRow> {
    await requirePlatformRole(v, "super_admin");
    await withTx(async (tx) => {
      const s = await lockStructure(tx, id);
      if (s.verification !== "suspended") throw conflict("conflict", "Cette structure n'est pas suspendue.");
      const at = now();
      const expiry = s.badgeExpiresAt ? gracedBadgeExpiry(s.badgeExpiresAt, at) : null;
      const changed = expiry && s.badgeExpiresAt && expiry.getTime() !== s.badgeExpiresAt.getTime();
      await tx
        .update(structures)
        .set({
          verification: "verified",
          suspendedReason: null,
          suspendedAt: null,
          ...(expiry ? { badgeExpiresAt: expiry } : {}),
          ...(changed ? { badgeRemindedAt: {} } : {}),
        })
        .where(eq(structures.id, id));
      await audit(tx, v, "structure.lift", id, reason, ip);
    });
    return (await this.detail(v, id)) as AdminBadgeRow;
  },

  /** `POST /admin/structures/:id/documents` (multipart : `file`) : justificatif téléversé par l'équipe (kind `other`). */
  async addDocument(v: Viewer, id: string, file: File, ip: string | null): Promise<VerificationDocument> {
    await requirePlatformRole(v, "super_admin");
    rateLimit("adminUpload", v.user.id);
    const [s] = await db.select({ id: structures.id }).from(structures).where(eq(structures.id, id));
    if (!s) throw notFound("Structure introuvable");
    if (file.size === 0) throw validation("Fichier vide");
    if (file.size > MAX_DOCUMENT_BYTES) throw new AppError(413, "payload_too_large", "Fichier de 10 Mo au plus");
    const data = Buffer.from(await file.arrayBuffer());
    const kind = sniffDocument(data);
    if (!kind) throw new AppError(415, "unsupported_media_type", "PDF, JPEG, PNG ou WebP seulement");
    const key = `private/verification/${id}/${randomBytes(12).toString("hex")}.${kind.ext}`;
    await storage.put(key, data);
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(structureVerificationDocuments)
        .values({
          structureId: id,
          kind: "other",
          storageKey: key,
          fileName: (file.name || `justificatif.${kind.ext}`).replace(/[^\w.\- ()]/g, "_").slice(0, 120),
          contentType: kind.contentType,
          sizeBytes: data.length,
          uploadedBy: v.user.id,
        })
        .returning();
      if (!row) throw new Error("Justificatif non enregistré");
      await audit(tx, v, "structure.document.add", id, row.fileName, ip, "structure_document", row.id);
      return docOf(row);
    });
  },

  /**
   * `POST /admin/structures/:id/transfer-owner` : sur justificatif seulement (docs/01). L'ancien propriétaire devient
   * co-organisateur (S32), le nouveau est propriétaire ; les deux sont prévenus par e-mail ; tout est au journal.
   */
  async transferOwner(v: Viewer, id: string, input: TransferOwner, ip: string | null): Promise<AdminStructureDetail> {
    await requirePlatformRole(v, "super_admin");
    const result = await withTx(async (tx, after) => {
      const s = await lockStructure(tx, id);
      const [doc] = await tx
        .select()
        .from(structureVerificationDocuments)
        .where(
          and(
            eq(structureVerificationDocuments.id, input.documentId),
            eq(structureVerificationDocuments.structureId, id),
            eq(structureVerificationDocuments.kind, "other"),
          ),
        );
      if (!doc) throw validation("Le justificatif doit être un document « autre » de cette structure.");
      const [target] = await tx
        .select({ userId: profiles.userId, pseudo: profiles.pseudo, email: user.email })
        .from(profiles)
        .innerJoin(user, eq(user.id, profiles.userId))
        .where(
          and(
            input.userId
              ? eq(profiles.userId, input.userId)
              : sql`lower(${profiles.pseudo}) = lower(${input.pseudo ?? ""})`,
            isNull(profiles.deletedAt),
            isNull(profiles.bannedAt),
          ),
        );
      if (!target) throw notFound("Nouveau propriétaire introuvable");
      const [current] = await tx
        .select({ userId: structureMembers.userId, pseudo: profiles.pseudo, email: user.email })
        .from(structureMembers)
        .innerJoin(profiles, eq(profiles.userId, structureMembers.userId))
        .innerJoin(user, eq(user.id, structureMembers.userId))
        .where(
          and(
            eq(structureMembers.structureId, id),
            eq(structureMembers.role, "owner"),
            eq(structureMembers.status, "active"),
          ),
        );
      if (current?.userId === target.userId) throw conflict("conflict", "Cette personne est déjà propriétaire.");
      const at = now();
      // L'ancien d'abord (un seul propriétaire actif à la fois, index unique), puis le nouveau.
      if (current) {
        await tx
          .update(structureMembers)
          .set({ role: "co_organizer", canDecide: true })
          .where(and(eq(structureMembers.structureId, id), eq(structureMembers.userId, current.userId)));
      }
      const [existing] = await tx
        .select({ id: structureMembers.id, joinedAt: structureMembers.joinedAt })
        .from(structureMembers)
        .where(and(eq(structureMembers.structureId, id), eq(structureMembers.userId, target.userId)));
      if (existing) {
        await tx
          .update(structureMembers)
          .set({ role: "owner", status: "active", canDecide: true, joinedAt: existing.joinedAt ?? at })
          .where(eq(structureMembers.id, existing.id));
      } else {
        await tx.insert(structureMembers).values({
          structureId: id,
          userId: target.userId,
          role: "owner",
          status: "active",
          canDecide: true,
          invitedBy: v.user.id,
          joinedAt: at,
        });
      }
      await audit(
        tx,
        v,
        "structure.transfer_owner",
        id,
        `${input.reason} · justificatif ${doc.id} · de ${current?.pseudo ?? "aucun"} à ${target.pseudo}`,
        ip,
      );
      after(() => staffChatsService.syncStructure(id));
      return { s, current: current ?? null, target };
    });
    const url = `${env.PUBLIC_URL}/orga/${result.s.slug}/structure`;
    const title = afterEventLabels.ownerChangedTitle(result.s.name);
    if (result.current) {
      await mail.send(
        "structure_owner_changed",
        result.current.email,
        renderMail(title, [afterEventLabels.ownerChangedOld], { label: "Ouvrir la structure", url }),
        { structureId: id },
      );
    }
    await mail.send(
      "structure_owner_changed",
      result.target.email,
      renderMail(title, [afterEventLabels.ownerChangedNew], { label: "Ouvrir la structure", url }),
      { structureId: id },
    );
    return this.detail(v, id);
  },
};

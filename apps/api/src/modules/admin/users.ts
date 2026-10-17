// Registre des utilisateurs (lot 33, ARCHITECTURE-SUITE § 16) : recherche, fiche détaillée, réinitialisation de la double
// authentification par l'équipe (A5), anonymisation (service unique du lot 15), sanction directe (échelle du lot 32),
// rôle de modérateur. Super admin seulement ; chaque action écrit le journal d'administration avec son motif.
import type { AdminUserDetail, AdminUserRow, Grade, PlatformRole, ReportReason, SanctionKind } from "@orasso/shared";
import { and, count, desc, eq, ilike, isNull, like, lt, ne, or } from "drizzle-orm";

import { db } from "../../db/client";
import {
  devices,
  passkey,
  pointEntries,
  profiles,
  proProfiles,
  reports,
  sanctions,
  session,
  structureMembers,
  structures,
  twoFactor,
  user,
  vehicleGenerations,
  vehicleMakes,
  vehicleModels,
  vehicles,
  verification,
} from "../../db/schema";
import { env } from "../../env";
import { requirePlatformRole } from "../../lib/access";
import { now } from "../../lib/deps";
import { AppError, conflict, notFound } from "../../lib/errors";
import { renderMail } from "../../lib/mail";
import { decodeCursor, encodeCursor, escapeLike } from "../../lib/pagination";
import { requestContext } from "../../lib/request-context";
import type { Viewer } from "../../lib/session";
import { withTx } from "../../lib/tx";
import { accountService } from "../account/service";
import { moderationService } from "../moderation/service";
import { notificationsService } from "../notifications/service";
import { loginFingerprint } from "../security/service";
import { audit } from "./audit";

type UserJoin = { u: typeof user.$inferSelect; p: typeof profiles.$inferSelect };

const row = ({ u, p }: UserJoin): AdminUserRow => ({
  id: u.id,
  pseudo: p.pseudo,
  email: u.email,
  emailVerified: u.emailVerified,
  platformRole: p.platformRole,
  grade: p.grade as Grade,
  pointsSeason: p.pointsSeason,
  createdAt: u.createdAt.toISOString(),
  suspendedUntil: p.suspendedUntil?.toISOString() ?? null,
  bannedAt: p.bannedAt?.toISOString() ?? null,
  deletedAt: p.deletedAt?.toISOString() ?? null,
});

const selfAction = () => new AppError(409, "self_action", "Action impossible sur ton propre compte.");

async function target(id: string): Promise<UserJoin> {
  const [found] = await db
    .select({ u: user, p: profiles })
    .from(user)
    .innerJoin(profiles, eq(profiles.userId, user.id))
    .where(eq(user.id, id));
  if (!found) throw notFound("Compte introuvable");
  return found;
}

function twoFactorResetMail(pseudo: string) {
  return renderMail(
    "Ta double authentification a été réinitialisée",
    [
      `Bonjour ${pseudo},`,
      "À ta demande, l'équipe Orasso a réinitialisé la double authentification de ton compte : l'application d'authentification et les clés d'accès sont retirées et tous tes appareils ont été déconnectés.",
      "Reconnecte-toi puis configure à nouveau ta double authentification dans la sécurité de ton compte.",
      "Si tu n'as rien demandé, écris tout de suite à contact@orasso.fr.",
    ],
    { label: "Ouvrir la sécurité de mon compte", url: `${env.PUBLIC_URL}/app/securite` },
  );
}

export const adminUsersService = {
  /** `GET /admin/users?q=&role=` : par pseudo (début ou morceau) ou adresse e-mail ; du plus récent au plus ancien. */
  async list(v: Viewer, q: { q?: string; role?: PlatformRole; limit: number; cursor?: string }) {
    await requirePlatformRole(v, "super_admin");
    const cur = decodeCursor(q.cursor);
    const text = q.q?.trim();
    const rows = await db
      .select({ u: user, p: profiles })
      .from(user)
      .innerJoin(profiles, eq(profiles.userId, user.id))
      .where(
        and(
          text
            ? text.includes("@")
              ? ilike(user.email, `%${escapeLike(text)}%`)
              : or(ilike(profiles.pseudo, `%${escapeLike(text)}%`), eq(user.id, text))
            : undefined,
          q.role ? eq(profiles.platformRole, q.role) : undefined,
          cur
            ? or(lt(user.createdAt, cur.createdAt), and(eq(user.createdAt, cur.createdAt), lt(user.id, cur.id)))
            : undefined,
        ),
      )
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(q.limit + 1);
    const items = rows.slice(0, q.limit);
    const last = items.at(-1);
    return {
      items: items.map(row),
      nextCursor: rows.length > q.limit && last ? encodeCursor(last.u.createdAt, last.u.id) : null,
    };
  },

  /**
   * `GET /admin/users/:id` : fiche complète pour l'équipe (docs/01 : les super admins voient tous les utilisateurs).
   * Jamais de mot de passe, de secret TOTP, de jeton de session ni de jeton de notification ; pas de plaque.
   * Consultation tracée (`user.view`).
   */
  async detail(v: Viewer, id: string): Promise<AdminUserDetail> {
    await requirePlatformRole(v, "super_admin");
    const t = await target(id);
    const [
      members,
      garage,
      entries,
      sanctionRows,
      emitted,
      received,
      recent,
      deviceRows,
      sessionRows,
      pro,
      totp,
      keys,
    ] = await Promise.all([
      db
        .select({ m: structureMembers, s: structures })
        .from(structureMembers)
        .innerJoin(structures, eq(structures.id, structureMembers.structureId))
        .where(and(eq(structureMembers.userId, id), ne(structureMembers.status, "removed"))),
      db
        .select({ v: vehicles, make: vehicleMakes, model: vehicleModels, gen: vehicleGenerations })
        .from(vehicles)
        .innerJoin(vehicleMakes, eq(vehicleMakes.id, vehicles.makeId))
        .innerJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
        .leftJoin(vehicleGenerations, eq(vehicleGenerations.id, vehicles.generationId))
        .where(eq(vehicles.ownerId, id))
        .orderBy(desc(vehicles.createdAt)),
      db.select().from(pointEntries).where(eq(pointEntries.userId, id)).orderBy(desc(pointEntries.createdAt)).limit(20),
      db.select().from(sanctions).where(eq(sanctions.userId, id)).orderBy(desc(sanctions.createdAt)),
      db.select({ n: count() }).from(reports).where(eq(reports.reporterId, id)),
      db.select({ n: count() }).from(reports).where(eq(reports.targetOwnerId, id)),
      db
        .select()
        .from(reports)
        .where(or(eq(reports.reporterId, id), eq(reports.targetOwnerId, id)))
        .orderBy(desc(reports.createdAt))
        .limit(10),
      db.select().from(devices).where(eq(devices.userId, id)).orderBy(desc(devices.lastSeenAt)),
      db.select().from(session).where(eq(session.userId, id)).orderBy(desc(session.updatedAt)),
      db.query.proProfiles.findFirst({ where: and(eq(proProfiles.ownerUserId, id), isNull(proProfiles.deletedAt)) }),
      db.query.twoFactor.findFirst({ where: eq(twoFactor.userId, id), columns: { verified: true } }),
      db.select({ n: count() }).from(passkey).where(eq(passkey.userId, id)),
    ]);
    await audit(db, v, { action: "user.view", targetType: "user", targetId: id });
    const at = now();
    return {
      ...row(t),
      firstName: t.p.firstName,
      lastName: t.p.lastName,
      phone: t.p.phone,
      departments: t.p.departments,
      newsletterOptIn: t.p.newsletterOptIn,
      twoFactor: { totp: Boolean(t.u.twoFactorEnabled) && totp?.verified !== false, passkeys: keys[0]?.n ?? 0 },
      structures: members.map(({ m, s }) => ({ id: s.id, slug: s.slug, name: s.name, role: m.role, status: m.status })),
      vehicles: garage.map((g) => ({
        id: g.v.id,
        label: [g.make.isOther ? "Autre" : g.make.name, g.model.isOther ? "Autre" : g.model.name, g.gen?.name]
          .filter(Boolean)
          .join(" "),
        year: g.v.year,
        status: g.v.status,
        certified: g.v.certifiedAt !== null,
      })),
      points: entries.map((e) => ({
        id: e.id,
        kind: e.kind,
        points: e.points,
        at: e.createdAt.toISOString(),
        note: e.note,
      })),
      sanctions: sanctionRows.map((s) => ({
        id: s.id,
        kind: s.kind,
        reason: s.reason,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt?.toISOString() ?? null,
        liftedAt: s.liftedAt?.toISOString() ?? null,
      })),
      reports: {
        emitted: emitted[0]?.n ?? 0,
        received: received[0]?.n ?? 0,
        recent: recent.map((r) => ({ id: r.id, reason: r.reason, status: r.status, at: r.createdAt.toISOString() })),
      },
      devices: deviceRows.map((d) => ({
        id: d.id,
        platform: d.platform,
        lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
        revoked: d.revokedAt !== null,
      })),
      sessions: sessionRows
        .filter((s) => s.expiresAt > at)
        .map((s) => ({
          id: s.id,
          device: loginFingerprint(s.userAgent, s.ipAddress).label,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        })),
      pro: pro ? { id: pro.id, slug: pro.slug, name: pro.name } : null,
    };
  },

  /**
   * `POST /admin/users/:id/reset-two-factor {reason}` (A5) : retire le TOTP, les clés d'accès et les appareils de
   * confiance, ferme toutes les sessions, prévient la personne (e-mail de sécurité, réserve du budget). Jamais sur
   * soi-même.
   */
  async resetTwoFactor(v: Viewer, id: string, reason: string) {
    await requirePlatformRole(v, "super_admin");
    if (id === v.user.id) throw selfAction();
    const t = await target(id);
    if (t.p.deletedAt) throw conflict("conflict", "Ce compte a été supprimé.");
    const mail = twoFactorResetMail(t.p.pseudo);
    await withTx(async (tx, after) => {
      await tx.delete(twoFactor).where(eq(twoFactor.userId, id));
      await tx.delete(passkey).where(eq(passkey.userId, id));
      await tx.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, id));
      await tx
        .delete(verification)
        .where(and(like(verification.identifier, "trust-device-%"), eq(verification.value, id)));
      await tx.delete(session).where(eq(session.userId, id));
      await audit(tx, v, { action: "user.reset_two_factor", targetType: "user", targetId: id, reason });
      await notificationsService.notify(tx, id, "security_two_factor_reset", {
        title: mail.subject,
        body: "L'équipe Orasso a réinitialisé ta double authentification. Configure-la à nouveau.",
        link: { label: "Ouvrir la sécurité de mon compte", path: "/app/securite" },
        email: mail,
      });
      after(() => notificationsService.kick());
    });
    return { reset: true };
  },

  /**
   * `POST /admin/users/:id/anonymize {reason}` : le même service que la suppression demandée par la personne
   * (`accountService.anonymize`, lot 15). Refusé sur soi-même, sur un compte de l'équipe, et sur le propriétaire d'une
   * structure (comme `DELETE /me`).
   */
  async anonymize(v: Viewer, id: string, reason: string) {
    await requirePlatformRole(v, "super_admin");
    if (id === v.user.id) throw selfAction();
    const t = await target(id);
    if (t.p.deletedAt) return { deleted: true };
    if (t.p.platformRole !== "user") {
      throw conflict("conflict", "Retire d'abord son rôle dans l'équipe Orasso.");
    }
    const owned = await db
      .select({ name: structures.name })
      .from(structureMembers)
      .innerJoin(structures, eq(structures.id, structureMembers.structureId))
      .where(
        and(
          eq(structureMembers.userId, id),
          eq(structureMembers.role, "owner"),
          eq(structureMembers.status, "active"),
          isNull(structures.deletedAt),
        ),
      );
    if (owned.length) {
      throw conflict(
        "structure_owner",
        `Propriétaire de ${owned.map((s) => s.name).join(", ")} : transfère d'abord la structure.`,
        { structures: owned.map((s) => s.name) },
      );
    }
    return accountService.anonymize(id, requestContext.get()?.ip ?? null, {
      confirm: true,
      actor: { userId: v.user.id, reason },
    });
  },

  /** `POST /admin/users/:id/sanction` : sanction directe, mêmes règles que la file des signalements (lot 32). */
  async sanction(v: Viewer, id: string, input: { kind: SanctionKind; reason: ReportReason; note: string }) {
    await requirePlatformRole(v, "super_admin");
    if (id === v.user.id) throw selfAction();
    await target(id);
    return moderationService.sanctionUser(v, id, input, requestContext.get()?.ip ?? null);
  },

  /**
   * `POST /admin/users/:id/role {role, reason}` : donner ou retirer le rôle de modérateur. Le rôle de super admin ne
   * se donne ni ne se retire ici ; personne ne change son propre rôle.
   */
  async setRole(v: Viewer, id: string, role: "user" | "moderator", reason: string) {
    await requirePlatformRole(v, "super_admin");
    if (id === v.user.id) throw selfAction();
    const t = await target(id);
    if (t.p.platformRole === "super_admin") {
      throw conflict("conflict", "Le rôle de super administrateur ne se change pas depuis l'administration.");
    }
    if (t.p.deletedAt) throw conflict("conflict", "Ce compte a été supprimé.");
    if (t.p.platformRole === role) return row(t);
    await withTx(async (tx) => {
      await tx.update(profiles).set({ platformRole: role }).where(eq(profiles.userId, id));
      // Nouveau rôle : les sessions ouvertes sans second facteur ne doivent pas garder l'ancien périmètre.
      await tx.delete(session).where(eq(session.userId, id));
      await audit(tx, v, { action: "user.role", targetType: "user", targetId: id, reason: `${role} · ${reason}` });
    });
    return row(await target(id));
  },
};

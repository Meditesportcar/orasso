import { createHash, randomBytes, randomInt } from "node:crypto";
import { type DeviceRegister, defaultNotificationPrefs, type Me, type ProfileUpdate } from "@orasso/shared";
import { and, count, eq, gt, inArray, isNull } from "drizzle-orm";

import { db } from "../../db/client";
import {
  applications,
  categories,
  devices,
  events,
  proProfiles,
  structureMembers,
  structures,
  vehicles,
} from "../../db/schema";
import { hasPasskey, twoFactorRequired } from "../../lib/access";
import { now } from "../../lib/deps";
import { conflict, notFound, validation } from "../../lib/errors";
import type { AuthUser, Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { personasOf } from "./personas";
import { type Profile, profilesRepo } from "./repo";

/** Pseudo proposé à partir du nom saisi à l'inscription ; complété de chiffres s'il est pris ou trop court. */
async function derivePseudo(name: string): Promise<string> {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_.]/g, "")
    .slice(0, 24);
  if (base.length >= 3 && !(await profilesRepo.pseudoTaken(base))) return base;
  const stem = (base.length >= 3 ? base : "pilote").slice(0, 19);
  for (;;) {
    const candidate = `${stem}_${randomInt(1000, 10000)}`;
    if (!(await profilesRepo.pseudoTaken(candidate))) return candidate;
  }
}

/** Identifiant court du QR de compte : 8 premiers octets de SHA-256(user_id) (ARCHITECTURE.md § 3.3). */
export function accountQrShortId(userId: string): Buffer {
  return createHash("sha256").update(userId, "utf8").digest().subarray(0, 8);
}

/**
 * Crée le profil d'un compte (appelé par Better Auth à l'inscription). Le pseudo vient du champ `name`
 * de l'inscription s'il est valide et libre ; il se change ensuite dans le profil.
 */
export async function ensureProfile(user: Pick<AuthUser, "id" | "name">): Promise<Profile> {
  const existing = await profilesRepo.byUserId(user.id);
  if (existing) return existing;
  for (let attempt = 0; attempt < 5; attempt++) {
    const created = await profilesRepo.insert({
      userId: user.id,
      pseudo: await derivePseudo(user.name),
      accountQrSecret: randomBytes(32),
      accountQrShortId: accountQrShortId(user.id),
      inviteToken: randomBytes(12).toString("base64url"),
    });
    if (created) return created;
    const raced = await profilesRepo.byUserId(user.id);
    if (raced) return raced;
  }
  throw new Error("Création du profil impossible");
}

export const profilesService = {
  async me(v: Viewer): Promise<Me> {
    const p = v.profile;
    const memberships = await db
      .select({
        structureId: structures.id,
        structureSlug: structures.slug,
        structureName: structures.name,
        role: structureMembers.role,
        staffRoles: structureMembers.staffRoles,
        canDecide: structureMembers.canDecide,
        status: structureMembers.status,
      })
      .from(structureMembers)
      .innerJoin(structures, eq(structures.id, structureMembers.structureId))
      .where(and(eq(structureMembers.userId, v.user.id), inArray(structureMembers.status, ["active", "invited"])));
    const pro = await db.query.proProfiles.findFirst({
      where: and(eq(proProfiles.ownerUserId, v.user.id), isNull(proProfiles.deletedAt)),
    });
    const [vehicleCount] = await db
      .select({ n: count() })
      .from(vehicles)
      .where(and(eq(vehicles.ownerId, v.user.id), eq(vehicles.status, "active")));
    const [upcoming] = await db
      .select({ n: count() })
      .from(applications)
      .innerJoin(events, eq(events.id, applications.eventId))
      .where(
        and(
          eq(applications.userId, v.user.id),
          eq(applications.kind, "vehicle"),
          inArray(applications.status, ["pending", "accepted", "waitlisted", "offered"]),
          gt(events.endsAt, now()),
        ),
      );
    // Pastille de la cloche (lot 17) : éléments du Journal non lus, un push seul (message reçu) n'en fait pas partie.
    const unread = await notificationsService.unreadCount(v.user.id);
    const required = await twoFactorRequired(v);
    return {
      user: {
        id: v.user.id,
        email: v.user.email,
        emailVerified: v.user.emailVerified,
        twoFactorEnabled: Boolean(v.user.twoFactorEnabled),
      },
      profile: {
        pseudo: p.pseudo,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        avatarUrl: storage.url(p.avatarKey),
        bio: p.bio,
        visibility: p.visibility,
        departments: p.departments,
        radiusKm: p.radiusKm,
        interests: await profilesRepo.interests(v.user.id),
        platformRole: p.platformRole,
        newsletterOptIn: p.newsletterOptIn,
        notificationPrefs: { ...defaultNotificationPrefs, ...p.notificationPrefs, staff: true, account: true },
        pointsSeason: p.pointsSeason,
        grade: p.grade,
        inviteToken: p.inviteToken,
      },
      pro: pro
        ? {
            id: pro.id,
            slug: pro.slug,
            name: pro.name,
            logoUrl: storage.url(pro.logoKey),
            published: pro.publishedAt !== null,
            verified: pro.verifiedAt !== null,
          }
        : null,
      memberships: memberships.map((m) => ({
        ...m,
        staffRoles: m.staffRoles as Me["memberships"][number]["staffRoles"],
      })),
      twoFactorRequired: required,
      twoFactorHint: required
        ? (await hasPasskey(v.user.id))
          ? "passkey_sign_in"
          : v.user.twoFactorEnabled
            ? "totp_sign_in"
            : "setup"
        : null,
      counts: {
        vehicles: vehicleCount?.n ?? 0,
        upcomingApplications: upcoming?.n ?? 0,
        unreadNotifications: unread,
      },
      personas: await personasOf(v),
      // La Boîte arrive au lot 18 : aucun message à compter avant.
      unreadInbox: 0,
    };
  },

  async update(v: Viewer, input: ProfileUpdate): Promise<Profile> {
    if (input.pseudo && (await profilesRepo.pseudoTaken(input.pseudo, v.user.id))) {
      throw conflict("conflict", "Ce pseudo est déjà pris", { field: "pseudo" });
    }
    if (input.interests?.length) {
      const found = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(inArray(categories.id, input.interests), eq(categories.active, true)));
      if (found.length !== new Set(input.interests).size) throw validation("Centre d'intérêt inconnu");
    }
    const { interests, notificationPrefs, ...rest } = input;
    return withTx(async (tx) => {
      const values = {
        ...rest,
        ...(notificationPrefs ? { notificationPrefs: { ...v.profile.notificationPrefs, ...notificationPrefs } } : {}),
      };
      const updated = Object.keys(values).length ? await profilesRepo.update(v.user.id, values, tx) : v.profile;
      if (interests) await profilesRepo.setInterests(v.user.id, [...new Set(interests)], tx);
      if (!updated) throw notFound();
      return updated;
    });
  },

  async setAvatar(v: Viewer, image: Buffer): Promise<string> {
    const key = `avatars/${v.user.id}/${randomBytes(6).toString("hex")}.webp`;
    await storage.put(key, image);
    if (v.profile.avatarKey) await storage.remove(v.profile.avatarKey);
    await profilesRepo.update(v.user.id, { avatarKey: key });
    return storage.url(key) ?? "";
  },

  async registerDevice(v: Viewer, input: DeviceRegister) {
    return withTx(async (tx) => {
      // Un jeton push appartient à un seul compte : il passe au dernier connecté sur l'appareil.
      if (input.expoPushToken) await tx.delete(devices).where(eq(devices.expoPushToken, input.expoPushToken));
      const [row] = await tx
        .insert(devices)
        .values({
          userId: v.user.id,
          platform: input.platform,
          expoPushToken: input.expoPushToken ?? null,
          name: input.name,
          appVersion: input.appVersion,
          lastSeenAt: now(),
        })
        .returning();
      return row;
    });
  },

  listDevices(v: Viewer) {
    return profilesRepo.activeDevices(v.user.id);
  },

  async revokeDevice(v: Viewer, id: string) {
    const [row] = await db
      .update(devices)
      .set({ revokedAt: now(), expoPushToken: null })
      .where(and(eq(devices.id, id), eq(devices.userId, v.user.id)))
      .returning({ id: devices.id });
    if (!row) throw notFound("Appareil introuvable");
  },
};

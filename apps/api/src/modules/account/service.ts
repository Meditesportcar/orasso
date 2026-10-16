// Compte (lot 15, ARCHITECTURE-SUITE § 1.2 à § 1.5) : e-mails de réinitialisation et de vérification, parrainage,
// réglages regroupés, aperçu public, suppression du compte par anonymisation (S5).
import { randomBytes } from "node:crypto";
import { createOTP } from "@better-auth/utils/otp";
import {
  type AccountDelete,
  type AccountSettings,
  type AccountSettingsUpdate,
  defaultNotificationPrefs,
  type PublicPreview,
  REFERRAL_WINDOW_MS,
} from "@orasso/shared";
import { symmetricDecrypt } from "better-auth/crypto";
import { and, eq, gt, inArray, isNull, ne } from "drizzle-orm";

import { db } from "../../db/client";
import {
  account,
  adminAuditLog,
  categories,
  devices,
  expressInvites,
  knownLogins,
  passkey,
  proFollows,
  profileInterests,
  profiles,
  proProfiles,
  session,
  structureFollows,
  structureMembers,
  structures,
  twoFactor,
  user,
  vehiclePhotos,
  vehicles,
} from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, conflict, notFound, validation } from "../../lib/errors";
import { mail } from "../../lib/mail";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { withTx } from "../../lib/tx";
import { pointsService } from "../points/service";
import { profilesRepo } from "../profiles/repo";
import { accountQrShortId, profilesService } from "../profiles/service";
import { securityMails } from "../security/mails";

type MailUser = { id: string; email: string; name: string };

async function pseudoOf(userId: string, fallback: string) {
  return (await profilesRepo.byUserId(userId))?.pseudo ?? fallback;
}

/** `auth` est importé à l'appel : `auth.ts` dépend de ce module (crochets), pas l'inverse au chargement. */
async function authContext() {
  const { auth } = await import("../../auth");
  return auth.$context;
}

/** Mot de passe du compte (identifiant e-mail) ; `false` s'il n'y en a pas ou s'il ne correspond pas. */
async function checkPassword(userId: string, password: string): Promise<boolean> {
  const cred = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.providerId, "credential")),
  });
  if (!cred?.password) return false;
  const ctx = await authContext();
  return ctx.password.verify({ hash: cred.password, password });
}

/** Code TOTP de l'application d'authentification (secret chiffré par Better Auth, fenêtre de ±1 période). */
async function checkTotp(userId: string, code: string): Promise<boolean> {
  const row = await db.query.twoFactor.findFirst({ where: eq(twoFactor.userId, userId) });
  if (!row) return false;
  const ctx = await authContext();
  const secret = await symmetricDecrypt({ key: ctx.secretConfig, data: row.secret });
  return createOTP(secret, { digits: 6, period: 30 }).verify(code, { window: 1 });
}

export const accountService = {
  async sendPasswordReset(u: MailUser, url: string) {
    const profile = await profilesRepo.byUserId(u.id);
    if (profile?.deletedAt) return;
    await mail.send("password_reset", u.email, securityMails.passwordReset(profile?.pseudo ?? u.name, url), {
      userId: u.id,
    });
  },

  /**
   * E-mail de vérification (inscription, relance). Pas d'envoi pour une inscription express en cours : l'adresse est
   * celle qui a reçu le lien express, marquée vérifiée par `expressService`.
   */
  async sendEmailVerification(u: MailUser, url: string) {
    const express = await db.query.expressInvites.findFirst({
      where: and(eq(expressInvites.email, u.email), isNull(expressInvites.usedAt), gt(expressInvites.expiresAt, now())),
      columns: { id: true },
    });
    if (express) return;
    await mail.send("email_verification", u.email, securityMails.emailVerification(await pseudoOf(u.id, u.name), url), {
      userId: u.id,
    });
  },

  /** Crochet après vérification de l'e-mail : parrainage confirmé (§ 1.3). */
  async onEmailVerified(userId: string) {
    const profile = await profilesRepo.byUserId(userId);
    if (!profile?.invitedByUserId || profile.deletedAt) return null;
    return pointsService.awardReferral(profile.invitedByUserId, userId);
  },

  /**
   * `POST /me/referral {token}` : rattache le parrain (lien d'ami `/ami/:jeton`) à un compte créé il y a moins de 24 h,
   * sans parrain, avec le jeton d'un autre. Si l'e-mail est déjà vérifié, les points partent aussitôt.
   */
  async applyReferral(v: Viewer, token: string) {
    const created = v.user.createdAt instanceof Date ? v.user.createdAt : new Date(v.user.createdAt);
    const sponsor = await db.query.profiles.findFirst({ where: eq(profiles.inviteToken, token) });
    const applicable =
      sponsor &&
      !sponsor.deletedAt &&
      sponsor.userId !== v.user.id &&
      !v.profile.invitedByUserId &&
      now().getTime() - created.getTime() < REFERRAL_WINDOW_MS;
    if (!applicable)
      throw conflict("referral_not_applicable", "Ce lien d'ami ne peut plus être utilisé pour ce compte");
    const [row] = await db
      .update(profiles)
      .set({ invitedByUserId: sponsor.userId })
      .where(and(eq(profiles.userId, v.user.id), isNull(profiles.invitedByUserId)))
      .returning({ userId: profiles.userId });
    if (!row) throw conflict("referral_not_applicable", "Ce lien d'ami ne peut plus être utilisé pour ce compte");
    if (v.user.emailVerified) await pointsService.awardReferral(sponsor.userId, v.user.id);
    return { sponsor: sponsor.pseudo };
  },

  /** `GET /referral/:token` (public) : pseudo et photo du parrain, 404 si le lien est inconnu. */
  async referrer(token: string) {
    const p = token.length <= 64 ? await db.query.profiles.findFirst({ where: eq(profiles.inviteToken, token) }) : null;
    if (!p || p.deletedAt) throw notFound("Lien d'ami inconnu");
    return { pseudo: p.pseudo, avatarUrl: storage.url(p.avatarKey) };
  },

  /** `POST /me/email/resend-verification` : 3 par heure. */
  async resendVerification(v: Viewer) {
    if (v.user.emailVerified) throw conflict("conflict", "Ton adresse est déjà confirmée");
    rateLimit("emailVerificationResend", v.user.id);
    const { auth } = await import("../../auth");
    await auth.api.sendVerificationEmail({ body: { email: v.user.email, callbackURL: "/app" } });
  },

  async settings(v: Viewer): Promise<AccountSettings> {
    const p = v.profile;
    return {
      notificationPrefs: { ...defaultNotificationPrefs, ...p.notificationPrefs, staff: true, account: true },
      mutedTypes: p.mutedTypes,
      visibility: p.visibility,
      departments: p.departments,
      radiusKm: p.radiusKm,
      interests: await profilesRepo.interests(v.user.id),
      homeWidgets: p.homeWidgets ?? null,
    };
  },

  async updateSettings(v: Viewer, input: AccountSettingsUpdate): Promise<AccountSettings> {
    if (input.interests?.length) {
      const found = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(inArray(categories.id, input.interests), eq(categories.active, true)));
      if (found.length !== new Set(input.interests).size) throw validation("Centre d'intérêt inconnu");
    }
    const { interests, notificationPrefs, mutedTypes, homeWidgets, ...rest } = input;
    const updated = await withTx(async (tx) => {
      const values = {
        ...rest,
        ...(notificationPrefs ? { notificationPrefs: { ...v.profile.notificationPrefs, ...notificationPrefs } } : {}),
        ...(mutedTypes ? { mutedTypes: [...new Set(mutedTypes)] } : {}),
        ...(homeWidgets !== undefined ? { homeWidgets } : {}),
      };
      const row = Object.keys(values).length ? await profilesRepo.update(v.user.id, values, tx) : v.profile;
      if (interests) await profilesRepo.setInterests(v.user.id, [...new Set(interests)], tx);
      if (!row) throw notFound();
      return row;
    });
    return this.settings({ ...v, profile: updated });
  },

  /** Ce que voit un autre utilisateur connecté (règles public / privé de docs/01, sans l'exception « c'est moi »). */
  publicPreview(v: Viewer): Promise<PublicPreview> {
    return profilesService.publicProfile(v, v.profile.pseudo, { asOther: true });
  },

  /**
   * `DELETE /me` (§ 1.5, S5) : mot de passe (et code TOTP si la 2FA est active) ; refus si propriétaire actif d'une
   * structure. E-mail de confirmation envoyé avant, puis anonymisation en une transaction. Idempotent : un compte déjà
   * supprimé n'a plus de session (401).
   */
  async deleteAccount(v: Viewer, input: AccountDelete, ip?: string | null) {
    if (v.profile.deletedAt) throw new AppError(401, "unauthenticated", "Compte supprimé");
    if (!(await checkPassword(v.user.id, input.password))) {
      throw new AppError(403, "invalid_credentials", "Mot de passe incorrect");
    }
    if (v.user.twoFactorEnabled) {
      if (!input.totpCode || !(await checkTotp(v.user.id, input.totpCode))) {
        throw new AppError(403, "invalid_credentials", "Code de double authentification incorrect");
      }
    }
    const owned = await db
      .select({ name: structures.name })
      .from(structureMembers)
      .innerJoin(structures, eq(structures.id, structureMembers.structureId))
      .where(
        and(
          eq(structureMembers.userId, v.user.id),
          eq(structureMembers.role, "owner"),
          eq(structureMembers.status, "active"),
          isNull(structures.deletedAt),
        ),
      );
    if (owned.length) {
      throw conflict(
        "structure_owner",
        `Tu es propriétaire de ${owned.map((s) => s.name).join(", ")} : transmets la structure ou supprime-la d'abord`,
        { structures: owned.map((s) => s.name) },
      );
    }
    await mail.send("account_deleted", v.user.email, securityMails.accountDeleted(v.profile.pseudo), {
      userId: v.user.id,
    });
    return this.anonymize(v.user.id, ip ?? null);
  },

  /** Anonymisation complète des données identifiantes ; historique (candidatures, entrées, points, avis) conservé. */
  async anonymize(userId: string, ip: string | null) {
    const tag = randomBytes(4).toString("hex");
    const at = now();
    const photoKeys: string[] = [];
    await withTx(async (tx) => {
      const profile = await tx.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
      if (!profile || profile.deletedAt) return;
      // Plus aucune connexion possible : sessions, identifiants (mot de passe, Google, Apple), clés, 2FA, appareils.
      await tx.delete(session).where(eq(session.userId, userId));
      await tx.delete(account).where(eq(account.userId, userId));
      await tx.delete(passkey).where(eq(passkey.userId, userId));
      await tx.delete(twoFactor).where(eq(twoFactor.userId, userId));
      await tx.delete(devices).where(eq(devices.userId, userId));
      await tx.delete(knownLogins).where(eq(knownLogins.userId, userId));
      await tx
        .update(user)
        .set({
          email: `supprime+${tag}@orasso.invalid`,
          name: "Compte supprimé",
          emailVerified: false,
          image: null,
          twoFactorEnabled: false,
        })
        .where(eq(user.id, userId));
      if (profile.avatarKey) photoKeys.push(profile.avatarKey);
      await tx
        .update(profiles)
        .set({
          pseudo: `supprime_${tag}`,
          firstName: null,
          lastName: null,
          phone: null,
          bio: null,
          avatarKey: null,
          deletedAt: at,
          newsletterOptIn: false,
          homeWidgets: null,
          mutedTypes: [],
          inviteToken: randomBytes(12).toString("base64url"),
          accountQrSecret: randomBytes(32),
          // L'identifiant court reste dérivé de l'identifiant du compte (unique) : inutilisable sans le secret.
          accountQrShortId: accountQrShortId(userId),
        })
        .where(eq(profiles.userId, userId));
      await tx.delete(profileInterests).where(eq(profileInterests.userId, userId));
      // Véhicules : vendus, plaque effacée, photos supprimées (fichiers effacés après la validation).
      const owned = await tx.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.ownerId, userId));
      if (owned.length) {
        const ids = owned.map((o) => o.id);
        const photos = await tx
          .delete(vehiclePhotos)
          .where(inArray(vehiclePhotos.vehicleId, ids))
          .returning({ key: vehiclePhotos.storageKey });
        photoKeys.push(...photos.map((p) => p.key));
        await tx
          .update(vehicles)
          .set({
            status: "sold",
            plate: null,
            plateNormalized: null,
            color: null,
            description: null,
            preparation: null,
          })
          .where(inArray(vehicles.id, ids));
      }
      // Liens sociaux et d'organisation (amis, crews, messagerie : lots 17 à 19, à compléter par leurs tables).
      await tx.delete(structureFollows).where(eq(structureFollows.userId, userId));
      await tx.delete(proFollows).where(eq(proFollows.userId, userId));
      await tx
        .update(structureMembers)
        .set({ status: "removed" })
        .where(and(eq(structureMembers.userId, userId), ne(structureMembers.status, "removed")));
      await tx
        .update(proProfiles)
        .set({ deletedAt: at, publishedAt: null })
        .where(and(eq(proProfiles.ownerUserId, userId), isNull(proProfiles.deletedAt)));
      await tx.insert(adminAuditLog).values({
        actorUserId: userId,
        action: "user.self_delete",
        targetType: "user",
        targetId: userId,
        reason: "Suppression du compte par son titulaire (anonymisation)",
        ip,
      });
    });
    for (const key of photoKeys) {
      await storage.remove(key).catch(() => undefined);
    }
    return { deleted: true };
  },
};

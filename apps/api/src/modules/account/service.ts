// Compte (lot 15, ARCHITECTURE-SUITE § 1.2 à § 1.5) : e-mails de réinitialisation et de vérification, parrainage,
// réglages regroupés, aperçu public, suppression du compte par anonymisation (S5).
import { randomBytes } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createOTP } from "@better-auth/utils/otp";
import {
  type AccountDelete,
  type AccountSettings,
  type AccountSettingsUpdate,
  appInstallLabels,
  defaultNotificationPrefs,
  normalizeHomeWidgets,
  type PreviewAs,
  type PublicPreview,
  REFERRAL_WINDOW_MS,
} from "@orasso/shared";
import { symmetricDecrypt } from "better-auth/crypto";
import { and, eq, gt, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  account,
  adminAuditLog,
  applications,
  devices,
  emailOutbox,
  events,
  expressInvites,
  knownLogins,
  malusContests,
  notifications,
  orders,
  passkey,
  plateTransferRequests,
  proFollows,
  profileInterests,
  profiles,
  proPhotos,
  proProfiles,
  session,
  structureFollows,
  structureMembers,
  structures,
  tickets,
  twoFactor,
  user,
  vehiclePhotos,
  vehicles,
  verification,
} from "../../db/schema";
import { env } from "../../env";
import { deps, now } from "../../lib/deps";
import { AppError, conflict, notFound } from "../../lib/errors";
import { mail, renderMail } from "../../lib/mail";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { dataDir, storage } from "../../lib/storage";
import { withTx } from "../../lib/tx";
import { notesService } from "../after-event/notes";
import { applicationsService } from "../applications/service";
import { anonymizeCommunicationForDeletedAccount } from "../communication/anonymize";
import { anonymizeCrewsForDeletedAccount } from "../crews/anonymize";
import { anonymizeCrewFeedForDeletedAccount } from "../crews/feed/anonymize";
import { invitationsService } from "../invitations/service";
import { anonymizeMediaForDeletedAccount } from "../media/anonymize";
import { anonymizeMessagingForDeletedAccount } from "../messaging/anonymize";
import { anonymizeModerationForDeletedAccount } from "../moderation/anonymize";
import { pointsService } from "../points/service";
import { profilesRepo } from "../profiles/repo";
import { accountQrShortId } from "../profiles/service";
import { anonymizeProviderForDeletedAccount } from "../providers/anonymize";
import { securityMails } from "../security/mails";
import { isSecondFactor } from "../security/passkey";
import { securityService } from "../security/service";
import { anonymizeSocialForDeletedAccount } from "../social/anonymize";
import { followsService } from "../social/follows";
import { socialProfile } from "../social/profile";
import { anonymizeStaffForDeletedAccount } from "../staff/anonymize";
import { anonymizeGarageForDeletedAccount } from "../vehicles/anonymize";
import { assertInterests } from "../vehicles/categories";

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
  if (!cred?.password || !password) return false;
  const ctx = await authContext();
  return ctx.password.verify({ hash: cred.password, password });
}

/**
 * Second facteur de l'application d'authentification : code TOTP (secret chiffré par Better Auth, fenêtre ±1 période)
 * ou code de secours (JSON du plugin, chiffré si l'option est posée). Les essais sont comptés par la limite
 * `accountDelete` de la route.
 */
async function checkTotpOrBackupCode(userId: string, code: string): Promise<boolean> {
  const row = await db.query.twoFactor.findFirst({ where: eq(twoFactor.userId, userId) });
  if (!row) return false;
  const ctx = await authContext();
  const clean = code.replace(/\s+/g, "");
  if (/^\d{6}$/.test(clean)) {
    const secret = await symmetricDecrypt({ key: ctx.secretConfig, data: row.secret });
    return createOTP(secret, { digits: 6, period: 30 }).verify(clean, { window: 1 });
  }
  let codes: unknown;
  try {
    codes = JSON.parse(row.backupCodes);
  } catch {
    codes = JSON.parse(await symmetricDecrypt({ key: ctx.secretConfig, data: row.backupCodes }));
  }
  return Array.isArray(codes) && codes.includes(clean);
}

/** Compte créé par l'inscription express (lien remis par le staff) : ne compte jamais pour le parrainage. */
async function isExpressAccount(email: string): Promise<boolean> {
  const row = await db.query.expressInvites.findFirst({
    where: and(eq(expressInvites.email, email), isNotNull(expressInvites.usedAt)),
    columns: { id: true },
  });
  return Boolean(row);
}

/**
 * Copies HTML du transport « journal » des e-mails donnés (fichiers `<date>-<id>.html`) : développement ; facultatives
 * en ligne. Les identifiants viennent de la file des e-mails, sans relire chaque fichier.
 */
async function removeJournalMails(ids: string[]) {
  if (!ids.length) return;
  const dir = join(dataDir, "mail");
  const names = await readdir(dir).catch(() => [] as string[]);
  const wanted = new Set(ids);
  for (const name of names) {
    const id = /-([0-9a-f-]{36})\.html$/.exec(name)?.[1];
    if (id && wanted.has(id)) await rm(join(dir, name), { force: true });
  }
}

/** Délai entre la confirmation de l'adresse et l'e-mail « Installe l'appli » (lot 36). */
export const APP_INSTALL_DELAY_MS = 60 * 60 * 1000;

export const accountService = {
  /**
   * `account.app-install` (lot 36) : e-mail « Installe l'appli » à un compte qui n'a jamais ouvert l'appli sur un
   * téléphone (aucun appareil Android ou iOS enregistré : l'appli enregistre le sien à chaque lancement connecté), une
   * seule fois par compte. Renvoie `true` si l'e-mail est parti.
   */
  async sendAppInstallReminder(userId: string): Promise<boolean> {
    const u = await db.query.user.findFirst({ where: eq(user.id, userId) });
    const profile = u ? await profilesRepo.byUserId(userId) : null;
    if (!u || !profile || profile.deletedAt) return false;
    const phone = await db.query.devices.findFirst({
      where: and(eq(devices.userId, userId), inArray(devices.platform, ["android", "ios"])),
      columns: { id: true },
    });
    if (phone) return false;
    const sent = await db.query.emailOutbox.findFirst({
      where: and(eq(emailOutbox.template, "app_install"), sql`${emailOutbox.payload}->>'userId' = ${userId}`),
      columns: { id: true },
    });
    if (sent) return false;
    const L = appInstallLabels;
    const content = renderMail(L.mailSubject, [L.mailIntro(profile.pseudo), L.mailBody], {
      label: L.mailButton,
      url: `${env.PUBLIC_URL}/appli`,
    });
    return (await mail.send("app_install", u.email, content, { userId })) === "sent";
  },

  async sendPasswordReset(u: MailUser, url: string) {
    const profile = await profilesRepo.byUserId(u.id);
    if (profile?.deletedAt) return;
    await mail.send("password_reset", u.email, securityMails.passwordReset(profile?.pseudo ?? u.name, url), {
      userId: u.id,
    });
  },

  /** E-mail de vérification (inscription, inscription express comprise, relance). */
  async sendEmailVerification(u: MailUser, url: string) {
    await mail.send("email_verification", u.email, securityMails.emailVerification(await pseudoOf(u.id, u.name), url), {
      userId: u.id,
    });
  },

  /** Crochet après vérification de l'e-mail : parrainage confirmé (§ 1.3), jamais pour un compte express. */
  async onEmailVerified(userId: string) {
    // Lot 36 : une heure plus tard, « Installe l'appli » si l'appli n'a jamais été ouverte (le service revérifie).
    await deps.jobs.send("account.app-install", { userId }, new Date(now().getTime() + APP_INSTALL_DELAY_MS));
    const profile = await profilesRepo.byUserId(userId);
    if (!profile?.invitedByUserId || profile.deletedAt) return null;
    const u = await db.query.user.findFirst({ where: eq(user.id, userId), columns: { email: true } });
    if (!u || (await isExpressAccount(u.email))) return null;
    return pointsService.awardReferral(profile.invitedByUserId, userId);
  },

  /**
   * `POST /me/referral {token}` : rattache le parrain (lien d'ami `/ami/:jeton`) à un compte créé il y a moins de 24 h,
   * sans parrain, avec le jeton d'un autre, hors inscription express. Si l'e-mail est déjà vérifié, les points partent
   * aussitôt.
   */
  async applyReferral(v: Viewer, token: string) {
    const created = v.user.createdAt instanceof Date ? v.user.createdAt : new Date(v.user.createdAt);
    const sponsor = await db.query.profiles.findFirst({ where: eq(profiles.inviteToken, token) });
    const applicable =
      sponsor &&
      !sponsor.deletedAt &&
      sponsor.userId !== v.user.id &&
      !v.profile.invitedByUserId &&
      now().getTime() - created.getTime() < REFERRAL_WINDOW_MS &&
      !(await isExpressAccount(v.user.email));
    if (!applicable)
      throw conflict("referral_not_applicable", "Ce lien de parrainage ne peut plus être utilisé pour ce compte");
    const [row] = await db
      .update(profiles)
      .set({ invitedByUserId: sponsor.userId })
      .where(and(eq(profiles.userId, v.user.id), isNull(profiles.invitedByUserId)))
      .returning({ userId: profiles.userId });
    if (!row) throw conflict("referral_not_applicable", "Ce lien de parrainage ne peut plus être utilisé pour ce compte");
    if (v.user.emailVerified) await pointsService.awardReferral(sponsor.userId, v.user.id);
    return { sponsor: sponsor.pseudo };
  },

  /** `GET /referral/:token` (public) : pseudo et photo du parrain, 404 si le lien est inconnu. */
  async referrer(token: string) {
    const p = token.length <= 64 ? await db.query.profiles.findFirst({ where: eq(profiles.inviteToken, token) }) : null;
    if (!p || p.deletedAt) throw notFound("Lien de parrainage inconnu");
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
      homeWidgets: p.homeWidgets ? normalizeHomeWidgets(p.homeWidgets) : null,
    };
  },

  async updateSettings(v: Viewer, input: AccountSettingsUpdate): Promise<AccountSettings> {
    // Lot R5a : un centre d'intérêt mis en pause depuis (« Moto ») reste permis s'il était déjà choisi.
    await assertInterests(db, v.user.id, input.interests);
    const { interests, notificationPrefs, mutedTypes, homeWidgets, ...rest } = input;
    const updated = await withTx(async (tx) => {
      const values = {
        ...rest,
        ...(notificationPrefs ? { notificationPrefs: { ...v.profile.notificationPrefs, ...notificationPrefs } } : {}),
        ...(mutedTypes ? { mutedTypes: [...new Set(mutedTypes)] } : {}),
        ...(homeWidgets !== undefined ? { homeWidgets } : {}),
      };
      const row = Object.keys(values).length ? await profilesRepo.update(v.user.id, values, tx) : v.profile;
      // Lot R6b : un compte qui passe de privé à public accepte toutes ses demandes d'abonnement en attente (sous le
      // verrou de la ligne du profil, posé par la mise à jour : une demande simultanée est acceptée aussi).
      if (rest.visibility === "public") {
        await followsService.acceptAllPending(tx, v.user.id);
      }
      if (interests) await profilesRepo.setInterests(v.user.id, [...new Set(interests)], tx);
      if (!row) throw notFound();
      return row;
    });
    return this.settings({ ...v, profile: updated });
  },

  /**
   * Ce que voit un autre utilisateur connecté (règles public / privé de docs/01, sans l'exception « c'est moi ») ; lot
   * R4c, R6b : `as=follower` pour le regard d'un abonné.
   */
  publicPreview(v: Viewer, as: PreviewAs = "member"): Promise<PublicPreview> {
    return socialProfile.view(v, v.profile.pseudo, { as });
  },

  /**
   * `DELETE /me` (§ 1.5, S5) : mot de passe (ou, pour un compte sans mot de passe, session ouverte par clé d'accès) et,
   * si la 2FA est active, code TOTP, code de secours ou session ouverte par clé ; 5 essais par quart d'heure, un seul
   * message d'erreur. Refus si propriétaire actif d'une structure. E-mail de confirmation envoyé avant, puis
   * anonymisation. Un compte déjà supprimé n'a plus de session (401).
   */
  async deleteAccount(v: Viewer, input: AccountDelete, ip?: string | null) {
    if (v.profile.deletedAt) throw new AppError(401, "unauthenticated", "Compte supprimé");
    rateLimit("accountDelete", v.user.id);
    // Session qui prouve un second facteur (clé d'accès vérifiée, ou code TOTP / de secours / appareil de confiance).
    const provenSession = isSecondFactor(v.session?.secondFactor);
    const cred = await db.query.account.findFirst({
      where: and(eq(account.userId, v.user.id), eq(account.providerId, "credential")),
      columns: { password: true },
    });
    const passwordOk = cred?.password ? await checkPassword(v.user.id, input.password) : provenSession;
    // Compte protégé par un facteur (TOTP ou clé d'accès) : session qui le prouve, ou code valide.
    const secondOk =
      !(await securityService.accountHasFactor(v.user.id)) ||
      provenSession ||
      (Boolean(input.totpCode) && (await checkTotpOrBackupCode(v.user.id, input.totpCode ?? "")));
    if (!passwordOk || !secondOk) throw new AppError(403, "invalid_credentials", "Confirmation incorrecte");
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
    // L'e-mail de confirmation part après la validation de l'anonymisation (adresse gardée en mémoire).
    return this.anonymize(v.user.id, ip ?? null, { confirm: true });
  },

  /**
   * Anonymisation complète des données identifiantes ; historique (candidatures passées, entrées, points, avis)
   * conservé. Candidatures à venir désistées sans malus. Rejouée, elle ne fait rien.
   */
  async anonymize(
    userId: string,
    ip: string | null,
    // Lot 33 : `actor` = anonymisation décidée par l'équipe (même service, trace `user.anonymize` avec le motif).
    opts: { confirm?: boolean; actor?: { userId: string; reason: string } } = {},
  ) {
    const tag = randomBytes(4).toString("hex");
    const anonEmail = `supprime+${tag}@orasso.invalid`;
    const at = now();
    const photoKeys: string[] = [];
    let oldEmail = null as string | null;
    let oldPseudo = null as string | null;
    const mailIds: string[] = [];
    const before = await db.query.profiles.findFirst({
      where: eq(profiles.userId, userId),
      columns: { deletedAt: true },
    });
    if (!before || before.deletedAt) return { deleted: true };
    await withTx(async (tx, after) => {
      // Verrou : deux suppressions simultanées n'anonymisent qu'une fois.
      const [profile] = await tx.select().from(profiles).where(eq(profiles.userId, userId)).for("update");
      if (!profile || profile.deletedAt) return;
      const [current] = await tx.select({ email: user.email }).from(user).where(eq(user.id, userId));
      oldEmail = current?.email ?? null;
      oldPseudo = profile.pseudo;
      // Candidatures à venir (offres de place en cours comprises) : désistées sans malus, QR révoqués, place
      // proposée au suivant — dans la même transaction, après le verrou.
      await applicationsService.withdrawAllForDeletedAccount(tx, userId, after);
      // Billets d'événements à venir : annulés (le contrôle à l'entrée les refuse), commandes en attente annulées.
      const upcomingEvents = tx.select({ id: events.id }).from(events).where(gt(events.endsAt, at));
      await tx
        .update(tickets)
        .set({ status: "cancelled", cancelledAt: at })
        .where(and(eq(tickets.userId, userId), eq(tickets.status, "valid"), inArray(tickets.eventId, upcomingEvents)));
      await tx
        .update(orders)
        .set({ status: "cancelled" })
        .where(and(eq(orders.userId, userId), eq(orders.status, "pending"), inArray(orders.eventId, upcomingEvents)));
      // Plus aucune connexion possible : sessions, identifiants (mot de passe, Google, Apple), clés, 2FA, appareils,
      // jetons de réinitialisation encore valables (valeur = identifiant du compte).
      await tx.delete(session).where(eq(session.userId, userId));
      await tx.delete(account).where(eq(account.userId, userId));
      await tx.delete(passkey).where(eq(passkey.userId, userId));
      await tx.delete(twoFactor).where(eq(twoFactor.userId, userId));
      await tx.delete(devices).where(eq(devices.userId, userId));
      await tx.delete(knownLogins).where(eq(knownLogins.userId, userId));
      await tx.delete(verification).where(eq(verification.value, userId));
      await tx
        .update(user)
        .set({ email: anonEmail, name: "Compte supprimé", emailVerified: false, image: null, twoFactorEnabled: false })
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
          // Lot R5b : les réseaux partent avec le reste du profil.
          socials: {},
          avatarKey: null,
          deletedAt: at,
          newsletterOptIn: false,
          homeWidgets: null,
          mutedTypes: [],
          preferredFormats: [],
          inviteToken: randomBytes(12).toString("base64url"),
          accountQrSecret: randomBytes(32),
          // L'identifiant court reste dérivé de l'identifiant du compte (unique) : inutilisable sans le secret.
          accountQrShortId: accountQrShortId(userId),
        })
        .where(eq(profiles.userId, userId));
      await tx.delete(profileInterests).where(eq(profileInterests.userId, userId));
      // Traces de l'adresse et de la plaque ailleurs : file des e-mails, inscriptions express, invitations, transferts.
      if (oldEmail) {
        const sent = await tx
          .update(emailOutbox)
          .set({ to: anonEmail })
          .where(eq(emailOutbox.to, oldEmail))
          .returning({ id: emailOutbox.id });
        mailIds.push(...sent.map((m) => m.id));
        await tx.update(expressInvites).set({ email: anonEmail }).where(eq(expressInvites.email, oldEmail));
      }
      await tx.delete(plateTransferRequests).where(eq(plateTransferRequests.toUserId, userId));
      await tx.update(applications).set({ message: null }).where(eq(applications.userId, userId));
      await tx.update(malusContests).set({ message: "[message supprimé]" }).where(eq(malusContests.userId, userId));
      // Journal de l'utilisateur (notifications) : personnel, rien à garder.
      await tx.delete(notifications).where(eq(notifications.userId, userId));
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
      // Garage : demandes de certification, certification, demandes de transfert de plaque (lot 31).
      await anonymizeGarageForDeletedAccount(tx, userId);
      // Liens sociaux et d'organisation (amis : lot 17 ; crews, messagerie : lots 18 et 19, à compléter par leurs tables).
      await anonymizeSocialForDeletedAccount(tx, userId);
      // Lot R5c1 : ses publications, commentaires, flammes et voix dans le fil des crews.
      photoKeys.push(...(await anonymizeCrewFeedForDeletedAccount(tx, userId)));
      photoKeys.push(...(await anonymizeCrewsForDeletedAccount(tx, userId)));
      photoKeys.push(...(await anonymizeMessagingForDeletedAccount(tx, userId)));
      await anonymizeCommunicationForDeletedAccount(tx, userId);
      await anonymizeStaffForDeletedAccount(tx, userId);
      // Modération (lot 32) : signalements et sanctions conservés un an (docs/01) ; contestation en cours close.
      await anonymizeModerationForDeletedAccount(tx, userId);
      await invitationsService.anonymizeForDeletedAccount(tx, userId, oldEmail);
      // Après l'événement (lot 27) : notes internes sur la personne effacées, celles qu'elle a écrites perdent leur auteur.
      await notesService.anonymizeForDeletedAccount(tx, userId);
      await tx.delete(structureFollows).where(eq(structureFollows.userId, userId));
      await tx.delete(proFollows).where(eq(proFollows.userId, userId));
      await tx
        .update(structureMembers)
        .set({ status: "removed" })
        .where(and(eq(structureMembers.userId, userId), ne(structureMembers.status, "removed")));
      // Fiche pro : rattachée à la personne seule (pas de lien de structure dans le schéma) → retirée et vidée de
      // tout ce qui l'identifie (nom, adresse, coordonnées, site, réseaux, SIRET, logo et photos).
      const pros = await tx.select().from(proProfiles).where(eq(proProfiles.ownerUserId, userId));
      for (const pro of pros) {
        if (pro.logoKey) photoKeys.push(pro.logoKey);
        const photos = await tx
          .delete(proPhotos)
          .where(eq(proPhotos.proId, pro.id))
          .returning({ key: proPhotos.storageKey });
        photoKeys.push(...photos.map((p) => p.key));
        await tx
          .update(proProfiles)
          .set({
            deletedAt: pro.deletedAt ?? at,
            publishedAt: null,
            name: "Fiche supprimée",
            description: null,
            logoKey: null,
            addressLine: null,
            postalCode: null,
            city: null,
            lat: null,
            lng: null,
            phone: null,
            email: null,
            website: null,
            socials: {},
            hours: {},
            siret: null,
            registryCheck: null,
            verifiedAt: null,
          })
          .where(eq(proProfiles.id, pro.id));
      }
      // Profil prestataire (lot 21) : retiré et vidé de ce qui l'identifie (les candidatures passées gardent leur lien).
      photoKeys.push(...(await anonymizeProviderForDeletedAccount(tx, userId, at)));
      // Profil média (lot 45) : retiré et vidé, contenus retirés.
      photoKeys.push(...(await anonymizeMediaForDeletedAccount(tx, userId, at)));
      await tx.insert(adminAuditLog).values({
        actorUserId: opts.actor?.userId ?? userId,
        action: opts.actor ? "user.anonymize" : "user.self_delete",
        targetType: "user",
        targetId: userId,
        reason: opts.actor?.reason ?? "Suppression du compte par son titulaire (anonymisation)",
        ip,
      });
    });
    for (const key of photoKeys) {
      await storage.remove(key).catch(() => undefined);
    }
    if (oldEmail && opts.confirm) {
      // Confirmation à l'ancienne adresse, après la validation ; la trace dans la file des e-mails est aussitôt
      // anonymisée et la copie du transport journal supprimée.
      const content = opts.actor
        ? securityMails.accountAnonymizedByTeam(oldPseudo ?? "")
        : securityMails.accountDeleted(oldPseudo ?? "");
      await mail.send("account_deleted", oldEmail, content, { userId });
      const sent = await db
        .update(emailOutbox)
        .set({ to: anonEmail })
        .where(eq(emailOutbox.to, oldEmail))
        .returning({ id: emailOutbox.id });
      mailIds.push(...sent.map((m) => m.id));
    }
    await removeJournalMails(mailIds);
    return { deleted: true };
  },
};

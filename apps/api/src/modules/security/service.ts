// Sécurité du compte (lot 15, ARCHITECTURE-SUITE § 1.1) : alerte « nouvelle connexion », alerte « mot de passe
// changé », clés d'accès comme double authentification, sessions. Appelé par les crochets de Better Auth (`auth.ts`).
import { createHash } from "node:crypto";
import { and, count, desc, eq, like, lt, ne } from "drizzle-orm";

import { db } from "../../db/client";
import { knownLogins, passkey, profiles, session, twoFactor, user, verification } from "../../db/schema";
import { now } from "../../lib/deps";
import { notFound } from "../../lib/errors";
import { push } from "../../lib/push";
import { withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { securityMails } from "./mails";
import type { SecondFactor } from "./passkey";

export type FactorChangeType =
  | "security_passkey_added"
  | "security_passkey_removed"
  | "security_two_factor_enabled"
  | "security_two_factor_disabled";

const FACTOR_CHANGE_BODY: Record<FactorChangeType, string> = {
  security_passkey_added:
    "Une clé d'accès a été ajoutée à ton compte. Si ce n'est pas toi, supprime-la et change ton mot de passe.",
  security_passkey_removed:
    "Une clé d'accès a été supprimée de ton compte. Si ce n'est pas toi, change ton mot de passe.",
  security_two_factor_enabled: "La double authentification par code est activée sur ton compte.",
  security_two_factor_disabled:
    "La double authentification par code est désactivée. Si ce n'est pas toi, change ton mot de passe.",
};

/** Un compte créé il y a moins de 10 minutes ne reçoit pas d'alerte (c'est sa première connexion). */
export const NEW_ACCOUNT_GRACE_MS = 10 * 60_000;
/** Connexions connues oubliées après un an sans connexion (§ 17.4). */
export const KNOWN_LOGIN_RETENTION_MS = 365 * 86_400_000;

/** Famille de navigateur et de système lues dans l'en-tête User-Agent (sans bibliothèque : seulement l'essentiel). */
export function describeUserAgent(ua: string | null | undefined): { browser: string; os: string } {
  const s = ua ?? "";
  const browser = /Orasso|Expo|okhttp|CFNetwork/i.test(s)
    ? "Appli Orasso"
    : /Edg\//.test(s)
      ? "Edge"
      : /OPR\/|Opera/.test(s)
        ? "Opera"
        : /SamsungBrowser/.test(s)
          ? "Samsung Internet"
          : /Firefox\//.test(s)
            ? "Firefox"
            : /Chrome\/|CriOS/.test(s)
              ? "Chrome"
              : /Safari\//.test(s)
                ? "Safari"
                : "Navigateur inconnu";
  const os = /Android/i.test(s)
    ? "Android"
    : /iPhone|iPad|iOS|CFNetwork|Darwin/i.test(s)
      ? "iPhone"
      : /Windows/i.test(s)
        ? "Windows"
        : /Mac OS X|Macintosh/i.test(s)
          ? "Mac"
          : /Linux/i.test(s)
            ? "Linux"
            : "système inconnu";
  return { browser, os };
}

/** Préfixe réseau d'une adresse : /24 en IPv4, /48 en IPv6 (une box qui change d'adresse reste « connue »). */
export function ipPrefix(ip: string | null | undefined): string {
  const raw = (ip ?? "").split(",")[0]?.trim() ?? "";
  const v4 = raw.replace(/^::ffff:/, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return v4.split(".").slice(0, 3).join(".");
  if (raw.includes(":")) return raw.split(":").slice(0, 3).join(":");
  return "";
}

export function loginFingerprint(userAgent: string | null | undefined, ip: string | null | undefined) {
  const { browser, os } = describeUserAgent(userAgent);
  const fingerprint = createHash("sha256")
    .update(`${browser}|${os}|${ipPrefix(ip)}`)
    .digest("hex");
  return { fingerprint, label: `${browser} · ${os}` };
}

export const securityService = {
  /**
   * Après chaque création de session (connexion, inscription, vérification d'e-mail) : empreinte inconnue sur un
   * compte de plus de 10 minutes → notification `security_new_login` (push + e-mail toujours). Une seule alerte par
   * empreinte : la ligne `known_logins` est posée dans la même transaction que la notification.
   */
  async onLogin(userId: string, ip: string | null | undefined, userAgent: string | null | undefined) {
    // Sessions créées par le serveur lui-même (nouveau jeton après un changement de mot de passe, inscription
    // express) : ni appareil ni adresse, rien à comparer.
    if (!userAgent && !ip) return false;
    const { fingerprint, label } = loginFingerprint(userAgent, ip);
    const at = now();
    const account = await db.query.user.findFirst({ where: eq(user.id, userId), columns: { createdAt: true } });
    if (!account) return false;
    const alerted = await withTx(async (tx, after) => {
      const inserted = await tx
        .insert(knownLogins)
        .values({ userId, fingerprint, label, firstSeenAt: at, lastSeenAt: at })
        .onConflictDoNothing()
        .returning({ userId: knownLogins.userId });
      if (!inserted.length) {
        await tx
          .update(knownLogins)
          .set({ lastSeenAt: at })
          .where(and(eq(knownLogins.userId, userId), eq(knownLogins.fingerprint, fingerprint)));
        return false;
      }
      if (at.getTime() - account.createdAt.getTime() < NEW_ACCOUNT_GRACE_MS) return false;
      const profile = await tx.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
      if (profile?.deletedAt) return false;
      const mail = securityMails.newLogin(profile?.pseudo ?? "", label, at);
      await notificationsService.notify(tx, userId, "security_new_login", {
        title: mail.subject,
        body: `Nouvelle connexion depuis ${label}. Si ce n'est pas toi, change ton mot de passe.`,
        link: { label: "Ouvrir la sécurité de mon compte", path: "/app/securite" },
        email: mail,
      });
      after(() => notificationsService.kick());
      return true;
    });
    return alerted;
  },

  /** Mot de passe changé ou réinitialisé : e-mail toujours (notification `security_password_changed`). */
  async onPasswordChanged(userId: string) {
    // Un nouveau mot de passe oublie aussi les appareils de confiance (le code sera redemandé).
    await this.forgetTrustedDevices(userId);
    const at = now();
    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
    const mail = securityMails.passwordChanged(profile?.pseudo ?? "", at);
    await withTx(async (tx, after) => {
      await notificationsService.notify(tx, userId, "security_password_changed", {
        title: mail.subject,
        body: "Le mot de passe de ton compte vient d'être changé. Si ce n'est pas toi, réinitialise-le.",
        link: { label: "Réinitialiser mon mot de passe", path: "/mot-de-passe-oublie" },
        email: mail,
      });
      after(() => notificationsService.kick());
    });
  },

  /** Révoque toutes les sessions du compte sauf celle donnée (changement de mot de passe). */
  async revokeOtherSessions(userId: string, keepToken: string | null) {
    await db
      .delete(session)
      .where(and(eq(session.userId, userId), keepToken ? ne(session.token, keepToken) : undefined));
    // Lot M6, tour 4 : les appareils de ces sessions quittent les push du compte.
    await push.forgetStale(userId);
  },

  /** Le compte a-t-il déjà un second facteur (TOTP activé ou au moins une clé d'accès) ? */
  async accountHasFactor(userId: string): Promise<boolean> {
    return (await this.totpEnabled(userId)) || (await this.passkeyCount(userId)) > 0;
  },

  async totpEnabled(userId: string): Promise<boolean> {
    const row = await db.query.user.findFirst({ where: eq(user.id, userId), columns: { twoFactorEnabled: true } });
    return Boolean(row?.twoFactorEnabled);
  },

  /** Activation du TOTP commencée mais pas confirmée (ligne `two_factor` non vérifiée). */
  async totpPendingActivation(userId: string): Promise<boolean> {
    const row = await db.query.twoFactor.findFirst({
      where: eq(twoFactor.userId, userId),
      columns: { verified: true },
    });
    return Boolean(row) && row?.verified !== true;
  },

  /**
   * Oublie les appareils de confiance du compte (lignes `verification` du plugin TOTP) : désactivation du TOTP,
   * changement ou réinitialisation du mot de passe, ajout ou retrait d'un facteur.
   */
  async forgetTrustedDevices(userId: string) {
    await db
      .delete(verification)
      .where(and(like(verification.identifier, "trust-device-%"), eq(verification.value, userId)));
  },

  /** La session `token` prouve désormais ce second facteur (code vérifié, appareil de confiance). */
  async markSessionFactor(token: string, factor: SecondFactor) {
    await db.update(session).set({ secondFactor: factor }).where(eq(session.token, token));
  },

  /**
   * Un facteur a été ajouté, retiré, activé ou désactivé : alerte (e-mail toujours, tout de suite) et déconnexion des
   * autres appareils ; la session courante (`keepToken`) garde sa preuve.
   */
  async onFactorChanged(userId: string, type: FactorChangeType, keepToken: string | null) {
    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
    if (profile?.deletedAt) return;
    const at = now();
    const mail = securityMails.factorChanged(type, profile?.pseudo ?? "", at);
    await withTx(async (tx, after) => {
      await notificationsService.notify(tx, userId, type, {
        title: mail.subject,
        body: FACTOR_CHANGE_BODY[type],
        link: { label: "Ouvrir la sécurité de mon compte", path: "/app/securite" },
        email: mail,
      });
      after(() => notificationsService.kick());
    });
    await this.revokeOtherSessions(userId, keepToken);
    await this.forgetTrustedDevices(userId);
  },

  async passkeyCount(userId: string): Promise<number> {
    const [row] = await db.select({ n: count() }).from(passkey).where(eq(passkey.userId, userId));
    return row?.n ?? 0;
  },

  /** Sessions ouvertes (appareil, dernière activité) ; `current` = celle de la requête. */
  async listSessions(userId: string, currentSessionId: string | null) {
    const rows = await db
      .select()
      .from(session)
      .where(and(eq(session.userId, userId)))
      .orderBy(desc(session.updatedAt));
    return rows
      .filter((s) => s.expiresAt > now())
      .map((s) => ({
        id: s.id,
        device: loginFingerprint(s.userAgent, s.ipAddress).label,
        createdAt: s.createdAt.toISOString(),
        lastActiveAt: s.updatedAt.toISOString(),
        current: s.id === currentSessionId,
      }));
  },

  async revokeSession(userId: string, sessionId: string) {
    const deleted = await db
      .delete(session)
      .where(and(eq(session.id, sessionId), eq(session.userId, userId)))
      .returning({ id: session.id });
    if (!deleted.length) throw notFound("Session introuvable");
    // Lot M6, tour 4 : l'appareil déconnecté à distance quitte aussi les push du compte.
    await push.forgetStale(userId);
  },

  /**
   * Tâche hebdomadaire `security.purge-known-logins` : connexions connues de plus d'un an. Lot M6, tour 4 : aussi les
   * jetons push des sessions expirées (ceux d'un compte qui ne reçoit rien ne sont jamais relus à l'envoi).
   */
  async purgeKnownLogins() {
    const limit = new Date(now().getTime() - KNOWN_LOGIN_RETENTION_MS);
    const rows = await db
      .delete(knownLogins)
      .where(lt(knownLogins.lastSeenAt, limit))
      .returning({ u: knownLogins.userId });
    await push.forgetStale();
    return rows.length;
  },
};

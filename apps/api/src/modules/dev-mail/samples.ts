// Exemples de chaque e-mail (lot 56) pour l'aperçu `/_mail` du site (développement seulement) et pour le test du
// gabarit commun. Une entrée par type d'envoi existant : sécurité, compte, notification, invitation, newsletter.
import { appInstallLabels } from "@orasso/shared";

import { env } from "../../env";
import { type MailContent, renderMail } from "../../lib/mail";
import { newsletterMail } from "../admin/newsletter";
import { securityMails } from "../security/mails";

export type MailSample = { id: string; label: string; content: MailContent; hasButton: boolean };

const at = new Date("2026-10-24T18:30:00+02:00");

export function mailSamples(): MailSample[] {
  const url = (path: string) => `${env.PUBLIC_URL}${path}`;
  const entries: [string, string, MailContent, boolean][] = [
    [
      "email_verification",
      "Confirmation de l'adresse",
      securityMails.emailVerification("Kenji_66", url("/verification-email?jeton=exemple")),
      true,
    ],
    [
      "password_reset",
      "Mot de passe oublié",
      securityMails.passwordReset("Kenji_66", url("/reinitialisation?jeton=exemple")),
      true,
    ],
    ["security_new_login", "Nouvelle connexion", securityMails.newLogin("Kenji_66", "Chrome sur Windows", at), true],
    ["security_password_changed", "Mot de passe changé", securityMails.passwordChanged("Kenji_66", at), true],
    [
      "security_two_factor_enabled",
      "Double authentification",
      securityMails.factorChanged("security_two_factor_enabled", "Kenji_66", at),
      true,
    ],
    ["account_deleted", "Compte supprimé", securityMails.accountDeleted("Kenji_66"), false],
    [
      "app_install",
      "Installe l'appli",
      renderMail(appInstallLabels.mailSubject, [appInstallLabels.mailIntro("Kenji_66"), appInstallLabels.mailBody], {
        label: appInstallLabels.mailButton,
        url: url("/appli"),
      }),
      true,
    ],
    [
      "notification",
      "Notification (candidature retenue)",
      renderMail(
        "Tu es retenu à la Nocturne de Canet",
        ["Ta BMW E30 est retenue, zone JDM.", "Ton créneau d'arrivée : 18 h 30 – 19 h 15."],
        { label: "Voir mon accès", url: url("/app/acces") },
      ),
      true,
    ],
    [
      "backup_code",
      "Avec un code de secours",
      renderMail(
        "Ton code de secours",
        ["Garde ce code : il remplace ton second facteur une seule fois."],
        { label: "Ouvrir la sécurité de mon compte", url: url("/app/securite") },
        { code: "K7Q2-M9XD" },
      ),
      true,
    ],
    [
      "newsletter",
      "Newsletter",
      newsletterMail("Les rassos de novembre", "Du **nouveau** ce mois-ci : la carte, les affiches, le passeport.", {
        page: url("/desinscription/exemple"),
        oneClick: url("/desinscription/exemple"),
      }),
      false,
    ],
  ];
  return entries.map(([id, label, content, hasButton]) => ({ id, label, content, hasButton }));
}

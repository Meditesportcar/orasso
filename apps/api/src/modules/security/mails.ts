// E-mails de la sécurité du compte (lot 15), en français. Textes à relire par Damien (non bloquant, PLAN-SUITE).
import { env } from "../../env";
import { formatDateTime } from "../../lib/format";
import { type MailContent, renderMail } from "../../lib/mail";

const securityLink = () => ({ label: "Ouvrir la sécurité de mon compte", url: `${env.PUBLIC_URL}/app/securite` });
const forgotLink = () => ({ label: "Réinitialiser mon mot de passe", url: `${env.PUBLIC_URL}/mot-de-passe-oublie` });

export const securityMails = {
  passwordReset(pseudo: string, url: string): MailContent {
    return renderMail(
      "Réinitialise ton mot de passe",
      [
        `Bonjour ${pseudo},`,
        "Tu as demandé à changer ton mot de passe Orasso. Le lien ci-dessous est valable une heure.",
        "Si ce n'est pas toi, ignore ce message : ton mot de passe ne change pas.",
      ],
      { label: "Choisir un nouveau mot de passe", url },
    );
  },

  emailVerification(pseudo: string, url: string): MailContent {
    return renderMail(
      "Confirme ton adresse e-mail",
      [
        `Bonjour ${pseudo},`,
        "Bienvenue sur Orasso. Confirme ton adresse pour sécuriser ton compte et valider les points de parrainage de la personne qui t'a invité.",
        "Le lien est valable une heure ; tu peux en demander un nouveau depuis ton compte.",
      ],
      { label: "Confirmer mon adresse", url },
    );
  },

  newLogin(pseudo: string, device: string, at: Date): MailContent {
    return renderMail(
      "Nouvelle connexion à ton compte",
      [
        `Bonjour ${pseudo},`,
        `Nouvelle connexion depuis ${device} le ${formatDateTime(at)}.`,
        "Si c'est toi, il n'y a rien à faire. Sinon, change ton mot de passe tout de suite et déconnecte les appareils que tu ne reconnais pas.",
      ],
      securityLink(),
    );
  },

  passwordChanged(pseudo: string, at: Date): MailContent {
    return renderMail(
      "Ton mot de passe a été changé",
      [
        `Bonjour ${pseudo},`,
        `Le mot de passe de ton compte Orasso a été changé le ${formatDateTime(at)}. Tes autres appareils ont été déconnectés.`,
        "Si ce n'est pas toi, réinitialise ton mot de passe immédiatement.",
      ],
      forgotLink(),
    );
  },

  /** Clé d'accès ajoutée ou supprimée, double authentification activée ou désactivée. */
  factorChanged(
    type:
      | "security_passkey_added"
      | "security_passkey_removed"
      | "security_two_factor_enabled"
      | "security_two_factor_disabled",
    pseudo: string,
    at: Date,
  ): MailContent {
    const what = {
      security_passkey_added: [
        "Clé d'accès ajoutée",
        "Une clé d'accès (Face ID, empreinte, clé de sécurité) a été ajoutée à ton compte",
      ],
      security_passkey_removed: ["Clé d'accès supprimée", "Une clé d'accès a été supprimée de ton compte"],
      security_two_factor_enabled: [
        "Double authentification activée",
        "La double authentification par code a été activée sur ton compte",
      ],
      security_two_factor_disabled: [
        "Double authentification désactivée",
        "La double authentification par code a été désactivée sur ton compte",
      ],
    }[type];
    return renderMail(
      what[0] ?? "",
      [
        `Bonjour ${pseudo},`,
        `${what[1]} le ${formatDateTime(at)}. Tes autres appareils ont été déconnectés.`,
        "Si ce n'est pas toi, réinitialise ton mot de passe tout de suite et vérifie la sécurité de ton compte.",
      ],
      securityLink(),
    );
  },

  accountDeleted(pseudo: string): MailContent {
    return renderMail(
      "Ton compte Orasso est supprimé",
      [
        `Bonjour ${pseudo},`,
        "Comme tu l'as demandé, ton compte est supprimé : ton pseudo, ton adresse, tes coordonnées, tes véhicules et leurs photos sont effacés.",
        "L'historique des événements auxquels tu as participé reste chez les organisateurs, sans ton nom (« Compte supprimé »).",
        "Merci d'avoir roulé avec nous.",
      ],
      undefined,
      { footer: "deleted" },
    );
  },

  /** Lot 33 : anonymisation décidée par l'équipe Orasso (même effacement que la suppression demandée). */
  accountAnonymizedByTeam(pseudo: string): MailContent {
    return renderMail(
      "Ton compte Orasso est supprimé",
      [
        `Bonjour ${pseudo},`,
        "L'équipe Orasso a supprimé ton compte : ton pseudo, ton adresse, tes coordonnées, tes véhicules et leurs photos sont effacés.",
        "L'historique des événements auxquels tu as participé reste chez les organisateurs, sans ton nom (« Compte supprimé »).",
        "Pour toute question, écris à contact@orasso.fr.",
      ],
      undefined,
      { footer: "deleted" },
    );
  },
};

import type { AdminSettingKey } from "../rules/admin";
import type { AdminOverview, AssistanceCloseReason, AssistanceStatus, NewsletterStatus } from "../schemas/admin";

// Administration (lot 33) : accueil et files, registres, mode assistance, réglages, newsletter, désinscription.

/** Barre latérale de `/admin` (une entrée par page ; le modérateur ne voit que les signalements). */
export const adminNavLabels = {
  overview: "Accueil",
  reports: "Signalements",
  sanctions: "Sanctions",
  certifications: "Certifications",
  transfers: "Transferts de plaque",
  badges: "Badges des structures",
  verification: "Structures à vérifier",
  users: "Utilisateurs",
  structures: "Structures",
  pros: "Pros",
  vehicles: "Base véhicules",
  audit: "Journal des accès",
  assistance: "Assistance",
  contests: "Contestations de malus",
  settings: "Réglages",
  newsletter: "Newsletter",
  sponsored: "Sponsorisés",
  media: "Médias",
} as const;

/** Tuiles de l'accueil : une file, son compteur, sa page. */
export const adminOverviewTiles: { key: keyof AdminOverview; label: string; href: string }[] = [
  { key: "structuresPending", label: "Structures à vérifier", href: "/admin/verification" },
  { key: "badgesExpiring", label: "Badges à renouveler", href: "/admin/badges" },
  { key: "prosToVerify", label: "Pros à vérifier", href: "/admin/pros" },
  { key: "reportsPending", label: "Signalements", href: "/admin/signalements" },
  { key: "certificationsPending", label: "Certifications", href: "/admin/certifications" },
  { key: "plateTransfersArbitrated", label: "Transferts de plaque", href: "/admin/transferts" },
  { key: "otherVehicles", label: "Véhicules « Autre »", href: "/admin/vehicules" },
  { key: "malusContestsEscalated", label: "Contestations de malus", href: "/admin/contestations" },
  { key: "sanctionsContested", label: "Contestations de sanction", href: "/admin/sanctions" },
  { key: "assistanceOpen", label: "Demandes d'aide", href: "/admin/assistance" },
  { key: "newslettersScheduled", label: "Newsletters planifiées", href: "/admin/newsletter" },
  { key: "mediaToVerify", label: "Médias à vérifier", href: "/admin/medias" },
];

export const adminSettingLabels: Record<AdminSettingKey, string> = {
  "signup.enabled": "Inscriptions ouvertes",
  "sponsored.enabled": "Emplacements sponsorisés sur l'Accueil",
  "providers.enabled": "Candidatures des prestataires",
  "points.participation": "Présent à un événement",
  "points.staff": "Staff présent",
  "points.referral": "Parrainage confirmé",
  "points.malus": "Absent sans désistement (malus)",
  "points.audience_prize": "Prix du public (gagnant)",
  "grades.thresholds": "Seuils des grades",
  "lists.refusal_reasons": "Motifs de refus proposés au tri",
  "lists.vendor_types": "Types de prestataires proposés",
  "lists.pro_activities": "Activités des pros proposées",
  "lists.event_formats": "Formats proposés à la création d'un événement",
};

export const adminTexts = {
  settingsTitle: "Réglages",
  switchesTitle: "Interrupteurs",
  ticketingTitle: "Billetterie",
  pointsTitle: "Points et grades",
  pointsWarning:
    "Modifie les futurs calculs : les points déjà attribués ne changent pas. Le prochain règlement (J+2) applique le nouveau barème ; un changement de seuils recalcule le grade de tous les comptes (en arrière-plan, sans notification).",
  listsTitle: "Listes",
  listsHint:
    "Coche ce qui est proposé et choisis l'ordre. Les éléments décochés restent valables pour ce qui a déjà été enregistré.",
  templatesTitle: "Modèles de messages Orasso",
  on: "activé",
  enable: "Activer",
  disable: "Désactiver",
  off: "désactivé",
  saved: "Réglage enregistré.",
  reasonLabel: "Motif (obligatoire, gardé au journal)",
  selfForbidden: "Action impossible sur ton propre compte.",
  userSearch: "Pseudo ou adresse e-mail",
  noResult: "Aucun résultat.",
  resetTwoFactor: "Réinitialiser la double authentification",
  resetTwoFactorHint:
    "Retire l'application d'authentification et les clés d'accès, déconnecte tous les appareils et prévient la personne par e-mail. Elle devra reconfigurer sa double authentification.",
  anonymize: "Anonymiser le compte",
  anonymizeHint:
    "Efface pseudo, adresse, coordonnées, véhicules et photos, comme une suppression demandée par la personne. Irréversible.",
  sanction: "Sanctionner",
  adjustPoints: "Ajuster les points",
  overview: "Toutes les files de l'administration et ce qui attend.",
  otherQueue: "File « Autre »",
  otherQueueHint:
    "Véhicules enregistrés avec « Autre » : crée la marque, le modèle ou la génération manquant, puis rattache chaque véhicule. Le propriétaire est prévenu.",
  reassign: "Rattacher ce véhicule",
  // Lot R4a (maquette R4.8b) : la file « Modèles proposés ».
  proposals: "Modèles proposés",
  proposalsHint:
    "Les fiches dont la personne a tapé le modèle ou la marque, regroupées par texte (sans accents ni majuscules). La plus grosse file en tête.",
  proposalKnownMake: (make: string) => `Marque connue : ${make} · modèle tapé`,
  proposalTypedMake: (make: string) => `Marque tapée « ${make} » : la marque et le modèle seront créés`,
  proposalCount: (n: number) => (n > 1 ? `${n} fiches` : "1 fiche"),
  proposalModelName: "Nom dans la liste",
  proposalAdd: (n: number) =>
    n > 1 ? `Ajouter à la liste et rattacher les ${n} fiches` : "Ajouter à la liste et rattacher la fiche",
  proposalExisting: "Modèle existant (faute de frappe)",
  proposalAttach: "Rattacher à un modèle existant",
  proposalNotice: (name: string) =>
    `Chaque propriétaire reçoit : « L'équipe Orasso a rattaché ta ${name} à la liste. » Pas d'annulation : une erreur se corrige fiche par fiche.`,
  audit: "Journal des accès",
  overviewEmpty: "Rien à traiter.",
} as const;

/** Emplacements sponsorisés (routes du lot 30, page du lot 33). */
export const placementStatusLabels: Record<"draft" | "active" | "paused" | "ended", string> = {
  draft: "Brouillon",
  active: "Actif",
  paused: "En pause",
  ended: "Terminé",
};

/** Contrôle automatique du SIRET d'une fiche pro (lot 14). */
export const registryStatusLabels: Record<"matched" | "closed" | "not_found" | "unavailable", string> = {
  matched: "SIRET trouvé",
  closed: "Établissement fermé",
  not_found: "SIRET introuvable",
  unavailable: "Registre indisponible",
};

export const newsletterStatusLabels: Record<NewsletterStatus, string> = {
  draft: "Brouillon",
  scheduled: "Planifiée",
  sending: "Envoi en cours",
  paused: "En pause",
  sent: "Envoyée",
};

export const newsletterTexts = {
  title: "Newsletter",
  hint: "Envoyée seulement aux personnes qui l'ont acceptée et dont l'adresse est confirmée. Chaque e-mail porte un lien de désinscription.",
  preview: "Aperçu",
  test: "M'envoyer un test",
  schedule: "Planifier l'envoi",
  save: "Enregistrer le brouillon",
  footer: "Tu reçois cet e-mail parce que tu as accepté la newsletter Orasso.",
  unsubscribeLink: "Se désinscrire de la newsletter",
  testPrefix: "[Test] ",
  recipients: (n: number) => `${n} destinataire${n > 1 ? "s" : ""} possible${n > 1 ? "s" : ""}`,
  markdownHelp: "Markdown : # titre, **gras**, *italique*, - liste, [lien](https://…)",
  scheduleAt: "Date et heure d'envoi (à venir)",
  sendNow: "Envoyer maintenant",
  confirmSend: (n: number) => `Envoyer à ${n} personne${n > 1 ? "s" : ""}`,
  confirmHint: "L'envoi part par lots dès la prochaine minute. Vérifie le test avant de confirmer.",
  pause: "Mettre en pause",
  resume: "Reprendre l'envoi",
  pausedErrors: "Envoi interrompu : erreurs du service d'e-mail. Vérifie Brevo, puis reprends l'envoi.",
  pausedAdmin: "Envoi en pause : aucun lot ne part tant qu'il n'est pas repris.",
  resumeAfter:
    "Plafond du jour atteint (la newsletter laisse passer les e-mails des événements) : reprise après minuit, heure de Paris.",
  progress: (delivered: number, failed: number) =>
    `${delivered} e-mail${delivered > 1 ? "s" : ""} parti${delivered > 1 ? "s" : ""}${failed ? ` · ${failed} en échec (réessayés)` : ""}.`,
} as const;

export const unsubscribeTexts = {
  title: "Newsletter Orasso",
  confirm: "Se désinscrire",
  ask: "Tu ne recevras plus la newsletter d'Orasso. Les e-mails liés à ton compte et à tes événements continuent.",
  done: "C'est fait : tu ne recevras plus la newsletter. Tu peux la réactiver depuis les réglages de ton compte.",
  invalid: "Ce lien de désinscription n'est pas valable.",
} as const;

export const assistanceStatusLabels: Record<AssistanceStatus, string> = {
  open: "Ouverte",
  closed: "Close",
};

export const assistanceCloseReasonLabels: Record<AssistanceCloseReason, string> = {
  organizer: "Close par la structure",
  admin: "Close par l'équipe Orasso",
  expired: "Close automatiquement (7 jours)",
};

export const assistanceTexts = {
  readOnly: "Mode assistance · lecture seule",
  readOnlyHint: "Tu survoles l'espace de cette structure. Pour intervenir, la structure doit demander l'aide d'Orasso.",
  intervention: (date: string) => `Intervention en cours (demande du ${date})`,
  interventionHint: "Chaque modification est tracée au journal avec la demande de la structure.",
  ask: "Demander l'aide d'Orasso",
  askHint:
    "L'équipe Orasso peut alors intervenir dans ton espace pendant 7 jours au plus. Chaque intervention est tracée et tu peux fermer la demande à tout moment.",
  messageLabel: "Ce dont tu as besoin",
  close: "Fermer la demande",
  current: "Demande d'aide en cours",
  history: "Demandes précédentes",
  survey: "Survoler l'espace",
  denied: "Mode assistance : lecture seule. La structure doit demander l'aide d'Orasso pour qu'on intervienne.",
} as const;

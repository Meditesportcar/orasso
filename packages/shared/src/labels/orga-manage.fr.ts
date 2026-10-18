// Casquette Organisateur de l'appli, parité avec le site (lot 35a, décision D20) : équipe et demandes de staff,
// structure (fiche, logo, vérification, badge, partenaires), bannissements, modèles de message, export des participants
// et notes internes. Les mots sont ceux du site (`orga-staff`, `orga-structure`, `orga-communication`, `orga-apres`).

export const orgaManageLabels = {
  // Équipe (onglet Staff de la barre de l'organisateur).
  teamTitle: "Équipe",
  teamRequestsTitle: (n: number) => `Demandes reçues · ${n}`,
  teamRequestsIntro:
    "Ces personnes demandent à rejoindre ton staff. Choisis leurs rôles, puis accepte ; ils restent modifiables.",
  teamRequestsEmpty: "Aucune demande en attente.",
  teamMembersTitle: (n: number) => `Membres · ${n}`,
  teamMembersEmpty: "Personne pour l'instant : invite des membres.",
  teamOwnerOnly: "Géré par le propriétaire de la structure.",
  teamRolesNone: "Aucun rôle",
  teamInvitedTitle: (n: number) => `Invitations en attente · ${n}`,
  teamInvitedRemove: "Retirer l'invitation",
  teamInvitedRemoved: "Invitation retirée.",
  teamInvitedRemoveBody: "La personne ne pourra plus accepter cette invitation.",
  teamStructureSection: "Structure et équipe",
  teamEventsSection: "Staff des événements",

  // Actions sur une demande.
  requestAccept: "Accepter",
  requestDecline: "Refuser",
  requestAcceptTitle: (pseudo: string) => `Accepter ${pseudo}`,
  requestAcceptDone: "Demande acceptée.",
  /** Lot 36 : accepter fait entrer dans l'équipe, sans rôle. */
  requestAcceptHint:
    "Cette personne entre dans ton équipe. Ses rôles (scan, entrée visiteurs, placement…) se donnent ensuite pour chaque événement.",
  requestDeclineTitle: (pseudo: string) => `Refuser ${pseudo}`,
  requestDeclineBody:
    "La personne est prévenue que sa demande est refusée. Elle ne pourra pas redemander avant demain.",
  requestDeclineDone: "Demande refusée.",
  requestsOpenTeam: "Traiter dans l'Équipe",
  requestPending: "Demande en attente de réponse",

  // Rôles et droit de trancher.
  rolesLegend: "Rôles du staff",
  canDecide: "Peut aider à trancher (filtration)",
  canDecideShort: "Peut trancher",
  rolesSave: "Enregistrer les rôles",
  rolesSaved: "Rôles enregistrés.",
  structureRole: "Rôle dans la structure",
  manage: "Gérer",
  manageTitle: (pseudo: string) => `Gérer ${pseudo}`,

  // Retrait d'un membre.
  removeMember: "Retirer",
  removeTitle: (pseudo: string) => `Retirer ${pseudo}`,
  removeBody: "Son accès hors ligne est coupé à sa prochaine synchro. La personne peut redemander plus tard.",
  removeDone: "Membre retiré : son accès hors ligne est coupé à sa prochaine synchro.",
  removeConfirm: "Retirer de l'équipe",

  // Inviter.
  invite: "Inviter",
  inviteTitle: "Inviter dans l'équipe",
  inviteWho: "Pseudo ou e-mail du compte",
  inviteSend: "Envoyer l'invitation",
  inviteDone: "Invitation envoyée.",
  inviteLinkTitle: "Lien d'invitation",
  inviteLinkIntro: (name: string) =>
    `Les passionnés qui créent leur compte par ce lien suivent ${name} et sont prévenus de tes prochains événements en avant-première.`,
  inviteLinkShare: "Partager le lien",
  inviteLinkMessage: (name: string) => `Rejoins ${name} sur Orasso`,

  // Staff d'un événement.
  eventRolesSave: "Enregistrer pour l'événement",
  eventRolesInherit: "Revenir aux rôles de la structure",
  eventRolesSaved: "Rôles de l'événement enregistrés.",
  eventRolesAdjusted: "Rôles ajustés pour cet événement.",
  eventRolesAdjustedShort: "ajustés pour l'événement",
  remindAll: (n: number) => `Relancer ceux qui n'ont pas répondu · ${n}`,
  remindAllDone: (n: number) =>
    n > 0 ? `${n} relance${n > 1 ? "s" : ""} envoyée${n > 1 ? "s" : ""}.` : "Personne à relancer aujourd'hui.",
  remindNever: (n: number, last: string | null) =>
    `Jamais répondu · relancé ${n} fois${last ? ` (dernière : ${last})` : ""}`,
  discussion: "Discussion du staff",

  // Structure.
  structureTitle: "Ma structure",
  structureOpen: "Ma structure",
  structureOpenHint: "Fiche, logo, vérification, badge et partenaires",
  structureSuspended: "Structure suspendue : tu peux consulter tes données, mais plus publier ni écrire.",
  structureCardTitle: "Fiche publique",
  structureName: "Nom",
  structureDescription: "Description",
  structureAddress: "Adresse",
  structurePostalCode: "Code postal",
  structureCity: "Ville",
  structureDepartments: "Départements couverts",
  structureDepartmentsHelp: "Codes séparés par des virgules (ex. 66, 11).",
  structureDepartmentsError: "Codes de département séparés par des virgules (ex. 66, 11).",
  structureWebsite: "Site web",
  structureInstagram: "Instagram",
  structureFacebook: "Facebook",
  structureTiktok: "TikTok",
  structureYoutube: "YouTube",
  structureSave: "Enregistrer la fiche",
  structureSaved: "Fiche enregistrée.",
  structurePublicPage: "Voir la page publique",
  logoTitle: "Logo",
  logoChange: "Changer le logo",
  logoSaved: "Logo enregistré.",
  logoNone: "Pas encore de logo.",

  // Vérification et badge.
  verifTitle: "Vérification",
  verifBadgeOk: (until: string | null) =>
    `Ta structure porte le badge « Structure vérifiée »${until ? `, valable jusqu'au ${until}` : ""}. Tu peux publier tes événements.`,
  verifPending:
    "Dossier envoyé : l'équipe Orasso valide ton justificatif à la main. Tu reçois un e-mail dès que c'est fait.",
  verifIntro:
    "La publication d'événements est réservée aux structures vérifiées, en deux étapes : ton numéro est contrôlé automatiquement dans les registres publics, puis l'équipe Orasso valide un justificatif.",
  verifStepNumber: "1. Numéro SIRET ou RNA",
  verifNumberLabel: "SIRET (14 chiffres) ou RNA (W + 9 chiffres)",
  verifCheck: "Contrôler",
  verifChecked: "Contrôle effectué.",
  verifMatched: "Trouvé et actif",
  verifClosed: "Établissement fermé",
  verifNotFound: "Introuvable",
  verifUnavailable: "Registre indisponible",
  verifNotAssociation:
    "Ce numéro n'est pas celui d'une association : l'équipe Orasso vérifiera le type de ta structure.",
  verifNotFoundHelp:
    "Numéro absent des registres publics (une association déclarée sans SIRET n'y figure pas). Joins alors le récépissé de déclaration, ou la pièce d'identité de ton responsable pour un club non déclaré.",
  verifUnavailableHelp: "Le registre de l'État ne répond pas : réessaie dans quelques minutes.",
  verifStepDocument: "2. Justificatif",
  verifDocumentHelp:
    "Statuts, récépissé de déclaration ou Kbis (photo, image ou PDF, 10 Mo au plus). Un club sérieux non déclaré joint la pièce d'identité de son responsable : elle est supprimée dès la validation.",
  verifDocumentKind: "Nature du document",
  verifDocumentAdd: "Ajouter un justificatif",
  /** Lot 34 : justificatif en PDF depuis les fichiers du téléphone. */
  verifDocumentAddPdf: "Ajouter un PDF",
  verifDocumentAdded: "Justificatif ajouté.",
  verifDocumentRemove: "Retirer",
  verifDocumentRemoveTitle: "Retirer ce justificatif",
  verifDocumentRemoveBody: "Le fichier est supprimé de ton dossier.",
  verifDocumentRemoved: "Justificatif retiré.",
  verifDocumentsNone: "Aucun justificatif pour l'instant.",
  verifSubmit: "Envoyer pour vérification",
  verifSubmitted: "Envoyé à l'équipe Orasso.",
  badgeTitle: "Badge",
  badgeUntil: (date: string) => `Échéance le ${date}`,
  badgeNone: "Pas de badge pour l'instant.",

  // Partenaires.
  partnersTitle: "Pros partenaires",
  partnersIntro: (name: string) =>
    `Les pros qui te proposent un partenariat apparaissent ici. Une fois acceptés, ils sont affichés sur la page de ${name}.`,
  partnersEmpty: "Aucune demande de pro pour l'instant.",
  partnerAccepted: "Partenaire",
  partnerPending: "Demande en attente",
  partnerAccept: "Accepter",
  partnerAcceptDone: "Partenaire accepté.",
  partnerDropAccepted: "Retirer",
  partnerDropPending: "Refuser",
  partnerDropTitle: (name: string) => `Retirer ${name}`,
  partnerDropBody: "Le pro n'apparaît plus sur la page de ta structure.",
  partnerDropDone: "Partenaire retiré.",

  // Bannissements.
  bansOpen: "Bannissements",
  bansOpenHint: "Les personnes écartées de tes événements",
  bansTitle: "Bannissements",
  bansIntro:
    "Une personne bannie ne peut plus candidater à tes événements. Seule l'équipe Orasso bannit de la plateforme.",
  bansEmpty: "Aucune personne bannie.",
  bansAddTitle: "Bannir une personne",
  bansPseudo: "Pseudo de la personne",
  bansReason: "Motif (facultatif)",
  bansAdd: "Bannir",
  bansAddConfirmBody: (pseudo: string) =>
    `${pseudo} ne pourra plus candidater à tes événements. Tu pourras lever le bannissement quand tu veux.`,
  bansAddDone: "Personne bannie.",
  bansLift: "Lever",
  bansLiftTitle: (pseudo: string) => `Lever le bannissement de ${pseudo}`,
  bansLiftBody: "La personne pourra de nouveau candidater à tes événements.",
  bansLiftDone: "Bannissement levé.",
  bansSince: (date: string) => `Depuis le ${date}`,
  bansNoReason: "Sans motif",

  // Modèles de message.
  templatesOpen: "Modèles de message",
  templatesOpenHint: "Messages groupés, annonces, consignes, remerciements",
  templatesTitle: "Modèles de message",
  templatesIntro: "Tu peux modifier ou supprimer tes modèles ; les modèles Orasso sont en lecture seule.",
  templatesMineEmpty: "Aucun modèle de la structure pour l'instant.",
  templateNew: "Nouveau modèle",
  templateEdit: "Modifier",
  templateEditTitle: "Modifier le modèle",
  templateSubject: "Objet (facultatif)",
  templateBody: "Texte du message",
  templateSave: "Enregistrer le modèle",
  templateSaved: "Modèle enregistré.",
  templateDelete: "Supprimer",
  templateDeleteTitle: (name: string) => `Supprimer « ${name} »`,
  templateDeleteBody: "Le modèle est supprimé. Les messages déjà envoyés ne changent pas.",
  templateDeleted: "Modèle supprimé.",

  // Export des participants.
  exportTitle: "Export des participants",
  exportIntro:
    "Un fichier CSV avec les coordonnées des retenus, pour une demande des autorités ou une enquête. Chaque export est enregistré au journal d'Orasso, avec ton motif.",
  exportReason: "Motif de l'export",
  exportReasonHelp: "Au moins 10 caractères. Il est conservé avec la date, ton nom et ton adresse.",
  exportTrace: "Cet export sera tracé : qui, quand, pourquoi.",
  exportNotes: "Les notes internes ne sont jamais incluses dans le fichier.",
  exportButton: "Exporter le CSV",
  exportConfirmTitle: "Exporter les participants",
  exportConfirmBody: "Le fichier contient des données personnelles. L'export est enregistré au journal avec ton motif.",
  exportConfirm: "Exporter et partager",
  exportDone: "Export partagé et enregistré au journal.",
  exportSavedWeb: "Export téléchargé et enregistré au journal.",
  exportUnavailable: "Le partage de fichiers n'est pas disponible sur cet appareil.",

  nextOnSite: "L'édition suivante (dupliquer l'événement) se prépare sur le site pour l'instant.",

  // Notes internes.
  notesOpen: "Notes internes",
  notesOpenHint: "Privées : seule ta structure les voit",
  notesScreenTitle: "Notes internes",
  notesAddTitle: "Ajouter une note",
  notesPlaceholder: "Fait précis, sans jugement.",
  notesSearchButton: "Chercher",
  notesEmptySearch: (q: string) => `Aucune note pour « ${q} ».`,
  notesNoWrite: "Structure suspendue : les notes sont en lecture seule.",
  notesDeleteTitle: "Supprimer cette note",
  notesDeleteBody: "La note est retirée de la fiche de la personne.",
  notesNew: "Ajouter une note à cette personne",
  notesOnFile: "Notes de ta structure sur cette personne",
  notesEventTag: (title: string) => `Événement : ${title}`,
  notesBilanLink: "Notes internes sur un participant",
} as const;

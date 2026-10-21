// Casquettes Pro et Prestataire, DA v2 (lot 54) : libellés des six onglets, tels que le prototype v2 les écrit
// (`s-pro`, `s-pscan`, `s-pstats`, `s-missions`, `s-pcand`, `s-vitrine`). Au « tu », sans genre. Les phrases de
// l'API (missions, emplacement, avis) restent dans `missions.fr.ts` ; celles de la fiche pro dans `parity.fr.ts`.

const fr = (n: number) => String(n).replace(".", ",");

export const proV2Labels = {
  // --- Fiche (s-pro) ---------------------------------------------------------------------------------------------
  ficheTitle: "Ma fiche",
  proValidated: "Pro validé",
  segView: "Vue passionné",
  segEdit: "Modifier ma fiche",
  /** Lot C4b (§ 5.2 de l'audit) : troisième segment, la publication, les actualités, les partenaires et l'abonnement. */
  segPosts: "Publications",
  /** Champs de la fiche hors artefact (nom, e-mail, zone, réseaux, horaires) : regroupés sous les champs de l'artefact. */
  moreDetails: "Autres informations",
  activities: "Activités",
  activitiesEdit: "Activités · touche pour cocher",
  discountsTitle: "Remises par grade",
  discountsHint: "Montre ton QR de compte",
  discountsNone: "Aucune remise pour l'instant.",
  worksTitle: "Réalisations",
  works: (n: number) => `${n} photo${n > 1 ? "s" : ""}`,
  worksNone: "Pas encore de photo de réalisation.",
  goThere: "Y aller",
  favorite: "Favori",
  favoritePreview: "Aperçu : c'est ce que voit un passionné. Son bouton Favori te garde dans ses garages.",
  noAddress: "Adresse à compléter",
  /** « Perpignan · 3,2 km » */
  cityDistance: (city: string, km: number) => `${city} · ${fr(Math.round(km * 10) / 10)} km`,
  // Exemples de format dans les champs (placeholders), comme le prototype.
  placeholders: {
    phone: "ex. 04 68 12 34 56",
    instagram: "ex. @atelier.tet",
    website: "ex. atelier-tet.fr",
    description: "ex. Detailing et céramique depuis 2018. Sur rendez-vous, du mardi au samedi.",
    name: "ex. Atelier Têt Detailing",
    address: "ex. 12 rue Pascal Marie Agasse",
    postalCode: "ex. 66000",
    city: "ex. Perpignan",
    zone: "ex. 66, 11",
    email: "ex. contact@atelier-tet.fr",
  },
  siretHint: "14 chiffres, ex. 912 345 678 00014. Vérifié auprès de l'INSEE.",
  addressVerified: "Adresse trouvée sur la carte",
  // --- Scanner (s-pscan) -----------------------------------------------------------------------------------------
  scannerTitle: "Scanner",
  scannerLabel: "Remises par grade",
  lastScan: (pseudo: string) => `Dernier scan : ${pseudo}`,
  lastScanDetail: (grade: string, percent: number | null) =>
    percent ? `Grade ${grade} · remise de ${percent} % appliquée` : `Grade ${grade} · pas de remise`,
  historyTitle: "Derniers scans",
  noScanYet: "Pas encore de scan. Le client ouvre son QR de compte, tu le vises.",
  // --- Stats (s-pstats) ------------------------------------------------------------------------------------------
  statsTitle: "Stats",
  statsPeriod: "30 derniers jours",
  views: "Vues de la fiche",
  discounts: "Remises",
  byGrade: "Remises par grade",
  // --- Missions (s-missions) -------------------------------------------------------------------------------------
  missionsTitle: "Missions",
  /** « Autour de Perpignan » */
  around: (department: string) => `Autour du ${department}`,
  aroundUnknown: "Autour de toi",
  radiusChip: (km: number) => `${km} km`,
  radiusLabel: "Rayon",
  radiusLimits: (min: number, max: number) => `De ${min} à ${max} km`,
  noZone: "Indique ta zone d'intervention dans ta vitrine pour voir les missions autour de toi.",
  emptyTitle: "Aucune mission pour le moment",
  emptyText: "Élargis le rayon ou change de métier : les organisateurs ajoutent leurs besoins au fil des semaines.",
  proposeTitle: (name: string) => `Proposer ${name}`,
  proposeNeed: "Besoin",
  proposeMessage: "Un mot pour l'équipe organisatrice (facultatif)",
  proposeRules: "J'accepte le règlement de l'événement",
  proposeSend: "Envoyer",
  proposeSent: "Candidature envoyée",
  proposeSentText: (name: string) => `${name} est dans le tri de l'organisateur.`,
  profileIncomplete: (issue: string) => `Complète ta vitrine pour proposer ta candidature : ${issue}`,
  // --- Candidatures (s-pcand) ------------------------------------------------------------------------------------
  candTitle: "Candidatures",
  candUpcoming: (n: number) => `À venir · ${n}`,
  candPast: (n: number) => `Passées · ${n}`,
  pendingLine: (day: string) => `Envoyée le ${day} · en attente de la réponse de l'équipe organisatrice`,
  waitlistRank: (rank: number | null) =>
    rank ? `Liste d'attente · ${rank === 1 ? "1er" : `${rank}e`}` : "Liste d'attente",
  withdrawHint: "Un empêchement ? Retire ta candidature depuis le ticket : l'organisateur est prévenu tout de suite.",
  withdraw: "Retirer ma candidature",
  withdrawTitle: "Retirer ta candidature ?",
  withdrawBody: (event: string) => `L'organisateur de « ${event} » est prévenu tout de suite et ta place est libérée.`,
  openTitle: "Ouverts à ton activité",
  openSubtitle: "Sans mission précise",
  openNone: "Aucun autre événement n'attend ton activité pour le moment.",
  apply: "Candidater",
  retry: "Réessayer",
  loadError: "Impossible de charger cette page pour l'instant.",
  mediaOfficial: "Média officiel",
  teamRange: "Équipe : de 1 à 50 personnes.",
  frontageRange: "Façade : de 1 à 30 mètres.",
  withoutMission: "Sans mission précise",
  noReview: "Pas d'avis pour l'instant",
  upcomingNone: "Aucune candidature à venir. Les missions autour de toi t'attendent dans l'onglet Missions.",
  pastNone: "Aucune candidature passée.",
  noInstructions: "L'organisateur n'a pas encore écrit de consignes.",
  // --- Vitrine (s-vitrine) ---------------------------------------------------------------------------------------
  vitrineTitle: "Ma vitrine",
  vitrineVerified: "Vérifié",
  /** « Food truck · Pyrénées-Orientales » (l'API ne donne que les départements de la zone). */
  tradePlace: (trade: string, place: string | null) => (place ? `${trade} · ${place}` : trade),
  menuNone: "Pas encore de menu.",
  reviewsCount: (n: number) => `${n} événement${n > 1 ? "s" : ""}`,
  zoneDepartments: "Départements",
  photosTitle: (n: number, max: number) => `Photos · ${n} / ${max}`,
  photosHelp: "Montre ton activité, ton stand ou ton travail.",
  photosAdd: "Ajouter des photos",
  saved: "Vitrine enregistrée.",
  save: "Enregistrer",
  nameMissing: "Indique le nom de ton activité.",
  // --- Fiche publique d'un prestataire ----------------------------------------------------------------------------
  providerPage: "Prestataire",
  providerMissing: "Ce prestataire n'existe pas ou n'est plus visible.",
} as const;

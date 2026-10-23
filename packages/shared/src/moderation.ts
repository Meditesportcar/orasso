// Modération (lot 32, ARCHITECTURE-SUITE § 15) : signalements, sanctions, contestation. Valeurs anglaises identiques aux
// enums PostgreSQL ; libellés dans `labels/moderation.fr.ts`.

/** Ce qu'on peut signaler (docs/01 : profil, véhicule, message, photo, événement, avis, crew ; § 15.3 : pro, prestataire, annonce). */
export const reportTargets = [
  "profile",
  "vehicle",
  "photo",
  "message",
  "event",
  "review",
  "crew",
  "pro",
  "provider",
  "announcement",
] as const;
export type ReportTarget = (typeof reportTargets)[number];

/**
 * Motifs (docs/01 : insulte, arnaque, contenu choquant, faux profil, harcèlement… ; `other` exige des détails). Lot M6
 * (retour 21 de Damien) : des motifs propres à ce qu'on signale, ajoutés à la fin (valeurs de l'enum PostgreSQL) ;
 * chaque type n'en propose qu'une partie (`reportReasonsByTarget`), vérifiée par l'API.
 */
export const reportReasons = [
  "insult",
  "scam",
  "shocking",
  "fake_profile",
  "harassment",
  "spam",
  "dangerous_driving",
  "other",
  "misleading_info",
  "cancelled_unannounced",
  "unauthorized_place",
  "abusive_pricing",
  "plate_or_face",
  "copyright",
  "fake_pro",
  "discount_not_applied",
  "fake_reviews",
] as const;
export type ReportReason = (typeof reportReasons)[number];

/** Les motifs d'une personne (la liste d'origine) : aussi ceux d'une sanction décidée par l'administration. */
export const personReportReasons = [
  "insult",
  "harassment",
  "fake_profile",
  "scam",
  "shocking",
  "spam",
  "dangerous_driving",
  "other",
] as const satisfies readonly ReportReason[];

/**
 * Les motifs proposés pour chaque type, dans l'ordre de la feuille « Signaler » (appli et site). `other` toujours en
 * dernier. Événement : liste de la maquette 9.2 ; personne : la liste d'origine ; pro et prestataire, contenu, message :
 * retour 21 ; véhicule, avis, crew, annonce : adaptés (journal des choix, lot M6).
 */
export const reportReasonsByTarget: Record<ReportTarget, readonly ReportReason[]> = {
  event: [
    "scam",
    "misleading_info",
    "cancelled_unannounced",
    "dangerous_driving",
    "unauthorized_place",
    "abusive_pricing",
    "shocking",
    "spam",
    "other",
  ],
  profile: personReportReasons,
  vehicle: ["plate_or_face", "shocking", "copyright", "misleading_info", "spam", "other"],
  photo: ["plate_or_face", "shocking", "copyright", "other"],
  message: ["insult", "harassment", "scam", "spam", "other"],
  review: ["insult", "misleading_info", "spam", "other"],
  crew: ["insult", "shocking", "fake_profile", "dangerous_driving", "spam", "other"],
  pro: ["fake_pro", "scam", "discount_not_applied", "fake_reviews", "other"],
  provider: ["fake_pro", "scam", "fake_reviews", "other"],
  announcement: ["misleading_info", "shocking", "insult", "spam", "other"],
};

/** Le motif est-il proposé pour ce type ? (contrôle de l'API, `reportCreateSchema`). */
export const reportReasonAllowed = (target: ReportTarget, reason: ReportReason): boolean =>
  reportReasonsByTarget[target].includes(reason);

export const reportStatuses = [
  "pending",
  "reviewing",
  "resolved_action",
  "resolved_no_action",
  "dismissed_abusive",
] as const;
export type ReportStatus = (typeof reportStatuses)[number];

/** Statuts terminaux : le signaleur est prévenu (« Ton signalement a été traité »), la conservation d'un an commence. */
export const terminalReportStatuses: readonly ReportStatus[] = [
  "resolved_action",
  "resolved_no_action",
  "dismissed_abusive",
];

/** Échelle des sanctions (docs/01). */
export const sanctionKinds = ["warning", "suspension_7d", "suspension_30d", "ban"] as const;
export type SanctionKind = (typeof sanctionKinds)[number];

export const contestStates = ["none", "pending", "upheld", "lifted"] as const;
export type ContestState = (typeof contestStates)[number];

/**
 * Copie d'un message signalé et de ses voisins (5 avant, 5 après), prise au moment du signalement parmi les messages
 * que le signaleur peut lire (AS5). Orasso ne relit jamais la conversation en direct.
 */
export type ReportContextMessage = {
  id: string;
  pseudo: string;
  body: string | null;
  /** Image, message supprimé ou déjà retiré : pas de texte copié. */
  note: "image" | "deleted" | null;
  createdAt: string;
  reported: boolean;
};

/** Ce que l'administration voit de la cible (rendu selon le type ; jamais la plaque). */
export type ReportTargetView = {
  type: ReportTarget;
  id: string;
  title: string;
  text: string | null;
  imageUrl: string | null;
  /** Page publique de la cible (site), quand elle existe. */
  link: string | null;
  /** La cible n'existe plus (supprimée entre-temps). */
  gone: boolean;
  /** Contenu déjà retiré par la modération (avis masqué, message retiré…). */
  removed: boolean;
};

export type AdminReportItem = {
  id: string;
  targetType: ReportTarget;
  targetId: string;
  reason: ReportReason;
  status: ReportStatus;
  createdAt: string;
  ownerPseudo: string | null;
  /** Le propriétaire de la cible a une sanction en cours (suspension automatique comprise). */
  ownerSuspended: boolean;
  /** Signalements ouverts sur le même compte depuis 24 h (signaleurs distincts). */
  openOnOwner: number;
  hasScreenshot: boolean;
};

export type AdminReportDetail = AdminReportItem & {
  details: string | null;
  context: ReportContextMessage[] | null;
  screenshotUrl: string | null;
  target: ReportTargetView;
  ownerUserId: string | null;
  /** Visible de l'administration seulement (jamais du signalé) : pour repérer un signaleur abusif. */
  reporter: { pseudo: string; dismissedAbusive: number; accountAgeDays: number };
  handledByPseudo: string | null;
  handledAt: string | null;
  /** `liftable` : la personne connectée peut lever cette sanction (modérateur : suspension automatique seulement). */
  sanction: { id: string; kind: SanctionKind; auto: boolean; liftedAt: string | null; liftable: boolean } | null;
  /** Ce que la personne connectée peut faire (selon son rôle). */
  can: {
    review: boolean;
    closeNoAction: boolean;
    resolveAction: boolean;
    dismissAbusive: boolean;
    sanctionKinds: SanctionKind[];
    hideContent: boolean;
    sanctionReporter: boolean;
  };
};

/** Sanction vue par la personne sanctionnée (`GET /me/sanctions`) : jamais qui l'a signalée ni les signalements. */
export type MySanction = {
  id: string;
  kind: SanctionKind;
  reason: ReportReason;
  note: string | null;
  startsAt: string;
  endsAt: string | null;
  active: boolean;
  liftedAt: string | null;
  contestStatus: ContestState;
  contestMessage: string | null;
  contestedAt: string | null;
  canContest: boolean;
};

export type AdminSanction = {
  id: string;
  userId: string;
  pseudo: string;
  kind: SanctionKind;
  reason: ReportReason;
  note: string | null;
  auto: boolean;
  issuedByPseudo: string | null;
  startsAt: string;
  endsAt: string | null;
  active: boolean;
  liftedAt: string | null;
  contestStatus: ContestState;
  contestMessage: string | null;
  contestedAt: string | null;
  reportIds: string[];
  can: { decide: boolean; lift: boolean };
};

/** `GET /me` → `suspension` : compte suspendu (ou banni) en ce moment. */
export type SuspensionInfo = {
  until: string;
  kind: SanctionKind;
  reason: ReportReason;
  sanctionId: string;
  canContest: boolean;
};

// Mots de la navigation des casquettes (lot R9n, maquette R9 `n-barres`, `n-fil`, `n-publier`) : la feuille « Mes casquettes »,
// la pastille « Tu lis en tant que », la ligne « Mes casquettes » de la Page. Les libellés des barres sont dans `tabSets`.
export const casquettesLabels = {
  /** La feuille « Mes casquettes » (maquette `mcSheet`). */
  sheetTitle: "Mes casquettes",
  sheetIntro:
    "Un seul compte, plusieurs casquettes. La casquette choisie signe ce que tu publies et sert d'auteur à tes stories. Ton compte personnel reste à un toucher.",
  /** Première option : le compte personnel (le passionné ou le visiteur). */
  mePrefix: "Moi",
  meFan: "Ton compte de passionné",
  meVisitor: "Ton compte de visiteur",
  active: "Active",
  /** Libellé accessible de la pastille de la barre du haut. */
  chipHint: "Ouvre Mes casquettes",
  /** La pastille du Fil (maquette `r9as`). */
  readingAs: "Tu lis en tant que",
  change: "Changer",
  changeHint: "Ouvre Mes casquettes pour changer de casquette",
  /** La ligne de la Page (T21) : les casquettes, en bas. */
  pageRow: "Mes casquettes",
  pageRowCaption: "Ton compte personnel et tes autres casquettes",
  pageTitle: "Page",
  /** Page provisoire (T21) : l'accès à l'Équipe, qui n'a plus d'onglet. */
  pageTeamRow: "Équipe",
  pageTeamCaption: "Le staff, les bannissements, les modèles et les notes",
  /** « Publier » (T18) : le segment « Publication | Story » en haut de l'écran, et l'en-tête « en tant que <nom> ». */
  publishKindLabel: "Quoi publier",
  publishKindPost: "Publication",
  publishKindStory: "Story",
  publishAs: (name: string) => `en tant que ${name}`,
  /** Le bandeau du Fil après une publication au nom d'une page (tour 1, point 9). */
  bannerTitle: "Publié sur ta page.",
  bannerLink: "Voir sur ma page",
  /** Basculer vers la story avec un brouillon en cours : on confirme avant de l'abandonner. */
  switchTitle: "Passer à la story ?",
  switchBody: "Ta publication en cours (photos, légende, rattachement) sera abandonnée.",
  switchStay: "Rester",
  switchGo: "Passer à la story",
  /** L'auteur d'une story perd ses droits pendant la rédaction : l'envoi est bloqué, on choisit (jamais de bascule silencieuse). */
  authorLost: (name: string) => `Tu n'as plus accès à ${name} : la story ne peut pas partir en son nom.`,
  authorLostChoice: "Publier en mon nom",
  /** « Publier » : la casquette choisie n'est plus disponible pendant la rédaction (R9h, tour 2) ; jamais de repli silencieux sur « Moi ». */
  postAuthorLost: (name: string) => `Tu n'as plus accès à ${name} : la publication ne peut pas partir en son nom.`,
  authorLostUnknown: "cette page",
  /** Casquette périmée (structure quittée, fiche supprimée) : retour à la casquette de base. */
  gone: "Cette casquette n'est plus disponible",
  goneText: "Tu es revenu à ton compte personnel.",
  /** Le site (lot R9h) : la pastille de la barre du haut d'un espace, la rangée de navigation de la casquette, le Fil d'une page indisponible. */
  siteChipOpen: (name: string) => `Page de ${name}`,
  siteNav: (name: string) => `Navigation de ${name}`,
  filUnavailable: "Le Fil de cette page n'est pas disponible.",
  filUnavailableText:
    "Une page suspendue, ou survolée en assistance, ne lit ni n'agit en son nom. Reviens à l'espace de la page.",
  filUnavailableBack: "Retour à l'espace",
} as const;

/** « Abonnements » vu par une casquette (maquette `filR9`, choix 12) : ce que la casquette suit, pas ce que la personne suit. */
export const casquetteFeedPhrases = {
  following: (name: string) => `Ceux que ${name} suit : ce qui plaît, puis le plus récent.`,
  hotFollowing: (name: string) => `chez ceux que ${name} suit · 7 jours`,
} as const;

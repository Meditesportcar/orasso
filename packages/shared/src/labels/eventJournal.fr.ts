// La fiche d'un événement : « Publications » (le journal), « Mentions · N » et ses écrans, menus de l'organisateur (vague R8,
// lot R8d, maquette R8.5 `e-fiche`, `ficheH` et `mentionsH`). Appli et site disent les mêmes mots, copiés de la maquette au
// caractère près (espaces insécables, guillemets français, « · »).
export const eventJournalLabels = {
  /** Le titre de la section de la fiche. */
  title: "Publications",
  /** La phrase sous le titre ; l'organisateur a une phrase de plus. */
  intro: (structure: string, manager: boolean) =>
    `Le journal de l'événement, dans la durée : seulement celles de ${structure} rattachées à cette fiche, de la date annoncée aux photos d'après.${manager ? " Épinglée en tête si tu le veux." : ""}`,
  /** Les deux étiquettes d'une publication du journal. */
  pinned: "Épinglée",
  notified: "Inscrits prévenus",
  /** Chargement, panne, suite. */
  loading: "Chargement des publications…",
  error: "Les publications ne se chargent pas pour le moment.",
  retry: "Réessayer",
  more: "Voir plus",
  /** Organisateur d'une fiche sans publication : l'invitation, et le bouton qui ouvre « Publier ». */
  inviteTitle: "Publie la première nouvelle de cet événement",
  inviteText: "La date, l'affiche, le plateau, le programme, puis les photos d'après : tout reste sur la fiche.",
  publishFor: "Publier pour cet événement",
  /** Les deux gestes de l'organisateur à la place de « Nouvelle annonce » (T3). */
  writeToRegistered: "Écrire aux inscrits",
  /** La ligne qui ouvre l'écran des mentions. */
  mentionsRow: (n: number) => `Mentions · ${n}`,
  mentionsHint: "Pros présents et passionnés qui citent l'événement : à part, chez leur auteur",
  /** L'écran des mentions. */
  mentionsTitle: (n: number) => `Mentions · ${n}`,
  backToEvent: "Retour à la fiche",
  mentionsIntro: (event: string, manager: boolean) =>
    `${event} : ce que les autres publient en citant l'événement. Ces publications ne sont pas celles de la fiche : elles restent chez leur auteur.${manager ? " Tu peux en masquer une de ta fiche (« … »)." : ""}`,
  onSite: "Sur place",
  fansBefore: "Passionnés · j'y serai",
  fansAfter: "Passionnés · j'y étais",
  fansNoteBefore: "Comptes publics seulement. Les autres comptes n'apparaissent pas.",
  fansNoteAfter: "Comptes publics seulement. Après l'événement, seulement ceux dont la présence est validée (QR ou GPS).",
  herPage: "Sa fiche",
  present: "Présent",
  mentionsLoading: "Chargement des mentions…",
  mentionsError: "Les mentions ne se chargent pas pour le moment.",
  mentionsEmpty: "Personne n'a encore cité cet événement.",
  /** Le menu « … » de l'organisateur (jamais montré à un passionné) ; chaque écriture revérifie ses droits. */
  menuTitle: "Publication",
  menuOpen: "Plus d'actions",
  pin: "Épingler en tête",
  unpin: "Retirer l'épingle",
  hide: "Masquer de la fiche",
  unhide: "Remettre sur la fiche",
  /** Le filtre de l'organisateur sur l'écran des mentions. */
  filterVisible: "Sur la fiche",
  filterHidden: "Masquées",
  hiddenTag: "Masquée de la fiche",
  /** Retours des gestes. */
  pinDone: "Publication épinglée en tête.",
  unpinDone: "Épingle retirée.",
  hideDone: "Mention masquée de la fiche.",
  unhideDone: "Mention remise sur la fiche.",
  actionError: "Le geste n'a pas abouti. Réessaie.",
  /** Les anciennes annonces qui restent sous le journal. */
  legacyTitle: "Fil de l'événement",
} as const;

// Les offres du pro (lot R9c, maquette R9.2b `n-publier` et R9.3 `n-page`, onglet « Offres ») : l'étiquette « Offre » d'une
// publication de la fiche, ses dates, l'onglet de la fiche. Appli et site lisent ce fichier. Les mots de la maquette sont copiés
// au caractère près ; ceux qu'elle ne montre pas (titre du champ, « Anciennes offres », vide, refus) sont consignés dans le
// journal des choix (section « Lot R9c »).
import { pluralFr } from "./plural.fr";

export const proOffersLabels = {
  /** Bloc « Étiquette » de l'écran « Publier » (fiche pro, publication seulement). */
  tagTitle: "Étiquette · facultatif",
  tagGroup: "Étiquette de la publication",
  tagNone: "Aucune",
  tagOffer: "Offre",
  /** Titre du champ (absent de la maquette). */
  titleLabel: "Titre de l'offre",
  titlePlaceholder: "Polish complet avant l'hiver",
  /** « Du 10 nov. au 30 nov. · dates de l'offre » : le gras, puis la suite, puis « modifier ». */
  datesSuffix: "dates de l'offre",
  datesEdit: "modifier",
  /** Quand aucune date n'est encore choisie (la fin est obligatoire). */
  datesEmpty: "Choisis la date de fin",
  startLabel: "Début (facultatif)",
  endLabel: "Fin",
  startClear: "Dès la publication",
  /** La seule phrase d'aide gardée de la `pnote` de la maquette. */
  help: "Elle s'affiche dans l'onglet « Offres » de ta page, et dans le Fil comme toute publication.",
  /** Le bouton de l'onglet et de l'espace du pro. */
  publishOffer: "Publier une offre",
  /** La confirmation (`toast` de la maquette) : « Publié : <fiche> · offre du 10 au 30 nov. ». */
  published: (page: string, range: string) => `Publié : ${page} · offre ${range}`,
  /** L'étiquette sur une publication. */
  tag: "Offre",
  tagEnded: "Offre terminée",
  /** L'onglet « Offres » de la fiche. */
  tab: "Offres",
  count: (n: number) => `${n} ${pluralFr(n, "offre en cours", "offres en cours")}`,
  counter: (n: number) => pluralFr(n, "offre en cours", "offres en cours"),
  empty: "Pas d'offre en cours.",
  openOffer: "Ouvrir l'offre",
  /** Les « offres et actualités » d'avant (`pro_posts`), restées à leur place. */
  oldTitle: "Anciennes offres",
  /** Pour qui ne suit pas le pro : le message d'aujourd'hui (« réservées aux abonnés »). */
  oldLocked: (n: number) =>
    `${n} publication${n > 1 ? "s" : ""} réservée${n > 1 ? "s" : ""} aux abonnés : suis ce pro pour les lire.`,
  oldEmpty: "Aucune publication pour l'instant.",
  loading: "Chargement des offres…",
  loadError: "Les offres ne se chargent pas pour le moment.",
  more: "Voir plus",
  oldDate: "Publiée le",
  /** Les offres en cours de l'espace du pro. */
  currentTitle: "Offres en cours",
  /** Refus de l'API (un message par cause). */
  errors: {
    offer_requires_pro: "Seule une fiche pro peut publier une offre.",
    title_required: "Donne un titre à ton offre (2 caractères au moins).",
    title_too_long: "Le titre de l'offre est trop long (80 caractères au plus).",
    ends_required: "Choisis la date de fin de l'offre.",
    ends_past: "La date de fin de l'offre est déjà passée.",
    ends_before_start: "La fin de l'offre est avant son début.",
    dates_invalid: "Une date de l'offre n'est pas valide.",
  },
} as const;

export type OfferErrorCode = keyof typeof proOffersLabels.errors;

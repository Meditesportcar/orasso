import { countFr } from "./plural.fr";

// La section « Photos » de la fiche d'un événement, l'album officiel et la reprise d'une photo dans le journal (vague R9, lot R9g,
// maquette R9.8 `e-photos` : `photosH`, `ossheetH`) : textes de la maquette au caractère près, plus ceux qu'elle ne montre pas
// (consignés au journal des choix). L'appli et le site lisent ici.
export const eventPhotosLabels = {
  /** Le titre de la section et le compteur à côté (« 2 albums »). */
  title: "Photos",
  albumsCount: (n: number) => countFr(n, "album"),
  /** « Photos · 2 albums » : le titre lu d'un seul tenant (lecteur d'écran, ancre). */
  titleWithCount: (n: number) => `Photos · ${countFr(n, "album")}`,
  /** « Objectif 66 · 48 photos » sous le titre d'un album. */
  mediaLine: (name: string, photos: number) => `${name} · ${countFr(photos, "photo")}`,
  officialAlbum: "Album officiel",
  seeAlbum: "Voir l'album",
  /** La phrase gardée en pied de la section (le reste de la note de la maquette n'est pas dans le produit). */
  footnote: "Les photos sont celles des médias, crédit visible : elles ne sont pas des publications de l'organisateur.",
  /** Le « … » d'un album (organisateur) : la feuille. */
  albumMenu: "Plus d'actions sur cet album",
  makeOfficial: "Choisir cet album comme « officiel »",
  makeOfficialHint: "Un seul album officiel par événement",
  removeOfficial: "Retirer « officiel »",
  removeOfficialHint: "L'album reste sur la fiche, sans l'étoile",
  officialDone: (name: string) => `Album officiel : ${name}`,
  officialRemoved: "« Officiel » retiré",
  officialFailed: "L'album n'a pas pu être modifié. Réessaie.",
  /** La reprise d'une photo dans le journal. */
  repostAction: "Reprendre dans le journal de l'événement",
  repostHint: (name: string) => `Repartage avec le crédit « Photo : ${name} », non retirable`,
  repostTitle: "Reprendre dans le journal",
  repostCaption: "Légende",
  repostCaptionHint: "Elle accompagne la photo dans le journal de l'événement.",
  repostWhatOthersSee: "Ce que verront les autres",
  repostPublish: "Publier",
  repostPublishing: "Publication…",
  seeJournal: "Voir le journal",
  repostDone: (structure: string, media: string) => `Repris dans le journal de ${structure} : crédit ${media} conservé`,
  repostAlready: "Déjà reprise dans le journal.",
  repostUnknownPlate: "Cette photo d'une ancienne galerie ne peut pas être reprise.",
  repostFailed: "La photo n'a pas pu être reprise. Réessaie.",
  /** Le crédit sur la photo reprise et son pied. */
  creditOnPhoto: (name: string) => `Photo : ${name}`,
  repostedFoot: "repartagée, crédit non retirable",
  seeCreditAlbum: "Voir l'album",
  /** La caption par défaut d'une reprise : « Photo : <média> » (la légende est modifiable). */
  defaultCaption: (name: string) => `Photo : ${name}`,
  /** La gestion de l'événement, bloc « Après » : « Photos · 2 albums · officiel : Objectif 66 ». */
  manageLine: (n: number, official: string | null) =>
    `Photos · ${countFr(n, "album")}${official ? ` · officiel : ${official}` : ""}`,
  manageHint: "Ouvre la fiche, à la section « Photos »",
  /** Messages de l'API (les mêmes que ceux des écrans). */
  errors: {
    plateUnknown: "Cette photo d'une ancienne galerie ne peut pas être reprise.",
    alreadyReposted: "Déjà reprise dans le journal.",
    repostExpired: "Cet album a plus de 30 jours : la reprise n'est plus possible.",
    albumNotFound: "Album introuvable",
    photoNotFound: "Photo introuvable",
    notOrganizer: "Seul l'organisateur de l'événement peut le faire.",
    eventCancelled: "L'événement est annulé.",
  },
  /** La notification `album_published` : « Objectif 66 a publié un album de 48 photos · Rassemblement JDM ». */
  publishedTitle: (media: string, photos: number, event: string) =>
    `${media} a publié un album de ${countFr(photos, "photo")} · ${event}`,
} as const;

// Fil d'un crew (lot R5c1, maquettes R5.7 onglet Fil et R5.10) : libellés de l'appli et du site, mêmes mots partout.
import { CREW_POST_PHOTOS_MAX } from "../rules/crewFeed";

export const crewFeedLabels = {
  feed: "Fil",
  composerHint: "Une photo, un mot, un sondage pour le crew…",
  publish: "Publier",
  publishTitle: "Publier dans le crew",
  publishPhoto: "Publication",
  publishPoll: "Sondage",
  addPhoto: "Ajouter",
  takePhoto: "Appareil photo",
  pickPhotos: "Galerie",
  photosCount: (n: number) => `${n} sur ${CREW_POST_PHOTOS_MAX}`,
  removePhoto: "Retirer cette photo",
  photosNote: "Tes photos gardent leur format. Elles restent dans le crew : personne d'autre ne les voit.",
  word: "Un mot",
  wordPlaceholder: "Lavée, prête pour dimanche…",
  withVehicle: "Avec quel véhicule ?",
  forEvent: "Pour quelle sortie ?",
  optional: "facultatif",
  noneChoice: "Aucun",
  visibleTo: (n: number) => (n > 1 ? `Visible par les ${n} membres du crew` : "Visible par les membres du crew"),
  visibleHint: "Le chef peut la retirer ; chacun peut la signaler.",
  missingPhotoOrText: "Ajoute au moins une photo ou un mot.",
  missingQuestion: "Écris la question du sondage.",
  missingOptions: "Il faut au moins deux réponses.",
  sending: (i: number, n: number) => `Envoi de la photo ${i} sur ${n}…`,
  published: "Publié dans le crew.",
  pollQuestion: "La question",
  pollQuestionPlaceholder: "On roule où dimanche ?",
  pollOptions: "Les réponses",
  pollOption: (i: number) => `Réponse ${i}`,
  pollAddOption: "Ajouter une réponse",
  pollRemoveOption: (i: number) => `Retirer la réponse ${i}`,
  pollEnd: "Fin du sondage",
  pollNoEnd: "Sans fin",
  pollEndIn: (days: number) => (days === 1 ? "Demain" : `Dans ${days} jours`),
  pollHint:
    "Un seul choix par membre, modifiable tant que le sondage est ouvert. Chacun voit les résultats, jamais qui a voté quoi.",
  pollVotes: (n: number) => (n > 1 ? `${n} voix` : `${n} voix`),
  pollYourChoice: "Ton choix",
  pollClosed: "Clos",
  pollEndsOn: (date: string) => `Jusqu'au ${date}`,
  pollClose: "Clore le sondage",
  pollClosedToast: "Sondage clos.",
  pollVoteFor: (label: string) => `Voter « ${label} »`,
  pollBy: (pseudo: string) => `Sondage de ${pseudo}`,
  fire: "Flamme",
  fireOn: (n: number) => `Retirer ta flamme, ${n} en tout`,
  fireOff: (n: number) => `Donner une flamme, ${n} en tout`,
  comments: "Commentaires",
  commentsCount: (n: number) => (n === 0 ? "Aucun commentaire" : n > 1 ? `${n} commentaires` : "1 commentaire"),
  openComments: (n: number) => `Voir les commentaires, ${n}`,
  noComments: "Aucun commentaire pour l'instant.",
  commentPlaceholder: "Ton commentaire…",
  commentSend: "Envoyer",
  commentMissing: "Écris ton commentaire.",
  more: "Plus d'actions",
  remove: "Retirer",
  removePostConfirm: "Retirer cette publication du fil ?",
  removeCommentConfirm: "Retirer ce commentaire ?",
  removed: "Publication retirée.",
  photoOf: (i: number, n: number) => `${i} / ${n}`,
  photoAlt: (pseudo: string, i: number, n: number) => `Photo ${i} sur ${n} de ${pseudo}`,
  deletedAccount: "Compte supprimé",
  empty: "Rien dans le fil pour l'instant. Une photo, un mot : lance le crew !",
  loadMore: "Voir la suite",
  loadError: "Le fil n'a pas pu se charger.",
  retry: "Réessayer",
  autoJoined: (pseudo: string) => `${pseudo} a rejoint le crew`,
  autoAccepted: (title: string) => `Le crew est retenu : ${title}`,
  autoAcceptedMembers: (names: string[]) =>
    names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} et ${names.length - 3} de plus`,
  now: "à l'instant",
  minutesAgo: (n: number) => `il y a ${n} min`,
  hoursAgo: (n: number) => `il y a ${n} h`,
  yesterday: "hier",
  daysAgo: (n: number) => `il y a ${n} jours`,
  membersOnly: "Le fil est réservé aux membres du crew.",
  optionsError: "Les réglages de publication du crew n'ont pas pu se charger.",
  optionsLoading: "Chargement des réglages du crew…",
  // Tour 2 : Réglages › Confidentialité, retrait de ses contenus des crews quittés.
  leftCrewsTitle: "Crews que j'ai quittés",
  leftCrewsHint:
    "Tes publications et tes commentaires restent dans le fil d'un crew que tu quittes. Tu peux les retirer tous d'un coup.",
  leftCrewsAction: "Retirer mes publications des crews que j'ai quittés",
  leftCrewsConfirm:
    "Tes publications (photos comprises) et tes commentaires dans ces crews seront retirés. C'est définitif.",
  leftCrewsConfirmAction: "Oui, tout retirer",
  cancel: "Annuler",
  leftCrewsDone: (posts: number, comments: number) =>
    posts + comments === 0
      ? "Rien à retirer : aucune publication dans un crew que tu as quitté."
      : `Retiré : ${posts > 1 ? `${posts} publications` : `${posts} publication`} et ${
          comments > 1 ? `${comments} commentaires` : `${comments} commentaire`
        }.`,
} as const;

/** « il y a 2 h », « hier », « il y a 3 jours », puis la date (`dateLabel`, déjà formatée par l'appelant). */
export function crewFeedWhen(at: Date, now: Date, dateLabel: string): string {
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return crewFeedLabels.now;
  if (minutes < 60) return crewFeedLabels.minutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return crewFeedLabels.hoursAgo(hours);
  const days = Math.floor(hours / 24);
  if (days === 1) return crewFeedLabels.yesterday;
  if (days < 7) return crewFeedLabels.daysAgo(days);
  return dateLabel;
}

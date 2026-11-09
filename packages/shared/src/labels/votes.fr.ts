// Votes à thème (lot R7l1, D38) : libellés de l'API, du site et de l'appli, mêmes mots partout. Les écrans les reprennent
// tels quels ; l'API s'en sert pour les erreurs et les notifications.
import type { VoteCandidateFilter, VoteCandidateMode } from "../rules/votes";
import { ALL_CATEGORIES_TITLE, VOTE_TITLE_MAX, VOTES_PER_EVENT_MAX } from "../rules/votes";

/** Un modèle de titre : le titre, et le réglage des candidats qui va avec (modifiable par l'organisateur). */
export type VoteTemplate = {
  id: string;
  title: string;
  candidateMode: VoteCandidateMode;
  candidateFilter: VoteCandidateFilter | null;
};

/** Les 9 modèles proposés à la création d'un vote (maquette R7.15) ; « Concours de rupteur » se choisit à la main. */
export const voteTemplates: readonly VoteTemplate[] = [
  { id: "japanese", title: "Plus belle japonaise", candidateMode: "origins", candidateFilter: { countries: ["JP"] } },
  { id: "german", title: "Plus belle allemande", candidateMode: "origins", candidateFilter: { countries: ["DE"] } },
  { id: "italian", title: "Plus belle italienne", candidateMode: "origins", candidateFilter: { countries: ["IT"] } },
  { id: "american", title: "Plus belle américaine", candidateMode: "origins", candidateFilter: { countries: ["US"] } },
  { id: "youngtimer", title: "Plus belle youngtimer", candidateMode: "all", candidateFilter: null },
  { id: "preparation", title: "Plus belle préparation", candidateMode: "all", candidateFilter: null },
  { id: "christmas", title: "Meilleure décoration de Noël", candidateMode: "all", candidateFilter: null },
  { id: "rev-limiter", title: "Concours de rupteur", candidateMode: "hand", candidateFilter: null },
  { id: "sound", title: "Plus beau son", candidateMode: "all", candidateFilter: null },
];

export const voteTexts = {
  allCategoriesTitle: ALL_CATEGORIES_TITLE,
  errors: {
    vote_closed: "Ce vote est clos.",
    vote_not_open: "Ce vote n'est pas encore ouvert.",
    not_checked_in:
      "Votent les personnes pointées, les billets scannés, le staff présent et les présences validées sur place.",
    own_vehicle: "Pas pour toi-même : choisis un autre véhicule.",
    not_a_candidate: "Ce véhicule ne concourt pas à ce vote.",
    candidate_not_entered: "Ce véhicule n'est pas encore entré : il ne reçoit pas de voix.",
    vote_locked: "Ce vote est ouvert : rien ne change plus. Clos-le si tu veux l'arrêter.",
    vote_fixed: "Le vote « Toutes catégories » ne se modifie pas : tu peux le retirer ou le clore.",
    vote_has_voices: "Ce vote a déjà reçu des voix : clos-le plutôt que de le retirer.",
    vote_not_manual: "Seul un vote lancé à la main ou à l'heure se lance depuis la console.",
    not_hand: "Les candidats se choisissent seulement pour un vote « à la main ».",
    not_enough_candidates: "Il faut deux candidats entrés au moins pour ouvrir un vote.",
    event_over: "L'événement est terminé.",
    not_open: "Ce vote n'est pas ouvert.",
    not_check_in: "Ce véhicule n'est pas entré.",
    invalid_qr: "Ce QR n'est pas un accès Orasso valable.",
    hand_first_entry: "Un vote à la main se lance toi-même ou à une heure fixée.",
    not_published: "L'événement n'est pas publié : le vote se lancera après sa publication.",
    expired_qr: "Ce QR a expiré : demande à la personne de le rouvrir et scanne-le à nouveau.",
    other_event: "Ce QR est celui d'un autre événement.",
    opens_at_past: "L'heure d'ouverture est déjà passée ou tombe après la fin de l'événement.",
    not_retained: "Cette candidature n'est pas retenue.",
    restore_has_voices: "Ce vote a déjà reçu des voix : il ne peut plus être remis.",
    too_many_votes: `${VOTES_PER_EVENT_MAX} votes au plus par événement.`,
    zone_unknown: "Cette zone n'existe pas pour cet événement.",
    title_taken: "Un vote porte déjà ce titre.",
    order_mismatch: "L'ordre doit reprendre exactement les votes de l'événement.",
  },
  titleHint: `${VOTE_TITLE_MAX} caractères au plus`,
  /** Notification `vote_opened` : « Concours de rupteur : vote ouvert ». */
  openedTitle: (title: string) => `${title} : vote ouvert`,
  openedBody: (eventTitle: string) => `Une voix, jusqu'à la clôture. ${eventTitle}.`,
  /** Notification `vote_won`. */
  wonTitle: (voteTitle: string) => `Tu gagnes « ${voteTitle} »`,
  wonBody: (voteTitle: string, eventTitle: string, points: number, stamp: boolean) =>
    `Ton véhicule remporte « ${voteTitle} » à « ${eventTitle} » : un trophée${stamp ? ", un tampon rare" : ""}${points > 0 ? ` et +${points} points` : ""}.`,
  /** Notification `vote_podium` (Journal seul). */
  podiumTitle: (voteTitle: string, rank: number) => `${rank}e de « ${voteTitle} »`,
  podiumBody: (voteTitle: string, eventTitle: string, rank: number) =>
    `Ton véhicule finit ${rank}e du vote « ${voteTitle} » à « ${eventTitle} ».`,
} as const;

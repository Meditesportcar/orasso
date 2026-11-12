// Collaboration (vague R8, lot R8o, maquette R8.13 `p-collab`) : « Publier avec… », la demande dans l'Activité, la carte à
// deux noms, « Avec … » sur les profils, « Me retirer ». Les mots sont ceux de `collabH` (`page-r8.js`), au caractère près ;
// les `pnote` de la maquette ne sont pas dans le produit, les phrases des `toast` servent de messages de confirmation.
// Ce que la maquette ne dit pas (recherche, refus, état d'une invitation) est écrit ici et consigné dans le journal des
// choix (« Lot R8o »). Le site et l'appli lisent ce même fichier.
import type { AuthorKind } from "../rules/authors";
import type { CoauthorStatus } from "../rules/coauthors";

export const coauthorLabels = {
  // --- « Publier » : la ligne et le choix -----------------------------------------------------------------------------
  lineTitle: "Publier avec…",
  lineHint: "Inviter un co-auteur : une personne, une structure, un pro, un média.",
  /** Une fois choisi : « Kenji_66 · invité : tant qu'il n'a pas accepté… ». */
  linePicked: (name: string) => `${name} · invité : tant qu'il n'a pas accepté, la publication est seulement chez toi.`,
  /** Un pro partenaire : « Wrap 66 · pro partenaire · invité ». */
  linePickedPartner: (name: string) => `${name} · pro partenaire · invité`,
  /** La phrase qui informe d'un pro partenaire (elle reste affichée). */
  partnerNote: (name: string) =>
    `${name} est un pro partenaire : la mention « Collaboration commerciale » s'applique comme aujourd'hui.`,
  /** Le bandeau sous le choix. */
  banner: {
    lead: (name: string) => `Tant que ${name} n'a pas accepté,`,
    rest: " la publication est seulement chez toi. Acceptée, elle apparaît sur les deux profils, signée des deux. Le co-auteur peut se retirer à tout moment ; seul toi la supprimes.",
  },
  chipUser: "Une personne",
  chipStructure: "Une structure",
  chipPro: "Un pro",
  chipMedia: "Un média",
  pickTitle: "Choisir un co-auteur",
  pickSearch: "Chercher un nom",
  pickSearchHint: "Deux lettres au moins.",
  pickNone: "Personne ne correspond.",
  pickLoading: "Recherche…",
  pickFailed: "La recherche ne répond pas pour le moment.",
  pickClear: "Retirer le co-auteur choisi",
  pickDone: "Terminé",
  partnerTag: "Pro partenaire",
  /** Après l'envoi. */
  sent: (name: string) => `Invitation envoyée à ${name} ; publié chez toi en attendant`,

  // --- La carte et les profils -----------------------------------------------------------------------------------------
  /** L'en-tête de la carte : « Kenji_66 et Wrap 66 ». */
  signature: (author: string, coAuthor: string) => `${author} et ${coAuthor}`,
  /** Sous la signature, avant « il y a 1 h ». */
  collaboration: "Collaboration",
  /** L'étiquette sur la vignette d'un profil : « Avec Wrap 66 ». */
  with: (name: string) => `Avec ${name}`,

  // --- La demande dans l'Activité --------------------------------------------------------------------------------------
  requestTitle: (author: string, forName: string | null) =>
    forName ? `${author} te propose de publier avec ${forName}` : `${author} te propose de publier avec lui`,
  accept: "Accepter",
  decline: "Refuser",
  accepted: "Acceptée : elle apparaît sur vos deux profils, signée des deux",
  declined: (author: string) => `Refusée : ${author} garde sa publication`,
  requestGone: "Cette invitation n'existe plus.",

  // --- Le menu de la publication ---------------------------------------------------------------------------------------
  withdraw: "Me retirer de la publication",
  withdrawConfirmTitle: "Te retirer de cette publication ?",
  withdrawConfirmText: (author: string) =>
    `Elle restera chez ${author}, qui seul la supprime. Tu ne pourras plus la retrouver sur ton profil.`,
  withdrawConfirm: "Me retirer",
  withdrawn: (author: string) => `Tu n'es plus co-auteur : elle reste chez ${author}`,
  cancelInvite: "Annuler l'invitation",
  removeCoAuthor: "Retirer le co-auteur",
  cancelled: "Invitation annulée",
  removed: "Co-auteur retiré",

  // --- Ce que voit l'auteur d'origine de son invitation ----------------------------------------------------------------
  /** `coAuthorInvite.status` : seul l'auteur le voit, jamais une tierce personne. */
  inviteStatus: (name: string, status: CoauthorStatus): string =>
    status === "pending"
      ? `Invitation envoyée à ${name}`
      : status === "declined"
        ? "Invitation refusée"
        : status === "withdrawn"
          ? `${name} s'est retiré`
          : `Avec ${name}`,

  // --- Messages d'erreur (codes de `errorCodes`) -----------------------------------------------------------------------
  errors: {
    coauthor_self: "Tu ne peux pas t'inviter toi-même ni inviter ta propre page.",
    coauthor_important: "Une info importante ne se co-signe pas.",
    coauthor_unavailable: "Ce co-auteur est introuvable ou n'est plus disponible.",
    coauthor_cannot_see:
      "Cette personne ne pourrait pas voir ta publication : ton compte est privé et elle ne te suit pas.",
    coauthor_quota: "Tu as envoyé trop d'invitations aujourd'hui : réessaie demain.",
    coauthor_provider: "Les prestataires ne peuvent pas encore être invités.",
    coauthor_closed: "Cette invitation n'est plus en attente.",
  },
} as const;

/** Le mot de la puce de choix d'un genre de co-auteur. */
export const coauthorKindChip = (kind: Exclude<AuthorKind, "provider">): string =>
  kind === "user"
    ? coauthorLabels.chipUser
    : kind === "structure"
      ? coauthorLabels.chipStructure
      : kind === "pro"
        ? coauthorLabels.chipPro
        : coauthorLabels.chipMedia;

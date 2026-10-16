import type { CertificationLostReason, CertificationStatus, ShareFormat } from "../garage";
import type { CategoryRefusal, CertificationMissing } from "../rules/garage";

// Garage et certification (lot 31).

/** Pays des marques du référentiel (code ISO 3166-1 alpha-2) ; un code inconnu s'affiche tel quel. */
export const countryLabels: Record<string, string> = {
  CZ: "Tchéquie",
  DE: "Allemagne",
  ES: "Espagne",
  FR: "France",
  GB: "Royaume-Uni",
  IT: "Italie",
  JP: "Japon",
  KR: "Corée du Sud",
  SE: "Suède",
  US: "États-Unis",
};

export const countryLabel = (code: string | null): string | null => (code ? (countryLabels[code] ?? code) : null);

/** Raison affichée sous une catégorie grisée dans le formulaire du véhicule. */
export const categoryRefusalLabels: Record<CategoryRefusal, string> = {
  age: "Véhicule trop récent",
  type: "Ne convient pas à ce type de véhicule",
  country: "Marque d'un autre pays",
  make: "Réservée à certaines marques",
};

export const certificationStatusLabels: Record<CertificationStatus, string> = {
  pending: "Demande en cours d'examen",
  accepted: "Certifié",
  refused: "Demande refusée",
};

export const certificationLostLabels: Record<CertificationLostReason, string> = {
  modified: "Fiche modifiée",
  inactive: "Six mois sans événement",
};

/** Conditions de la demande de certification, affichées sur la page du véhicule (ce qui manque). */
export const certificationMissingLabels: Record<CertificationMissing, string> = {
  grade: "Atteindre le grade Sport",
  status: "Le véhicule doit être actif",
  plate: "Plaque en attente de transfert",
  photos: "Au moins 3 photos",
  description: "Une description",
  category: "Au moins une catégorie",
  pending: "Une demande est déjà en cours",
  certified: "Déjà certifié",
};

/** Les conditions, dans l'ordre d'affichage (cochées ou non selon ce qui manque). */
export const certificationConditions: { key: Exclude<CertificationMissing, "pending" | "certified">; label: string }[] =
  [
    { key: "grade", label: "Grade Sport ou plus" },
    { key: "status", label: "Véhicule actif" },
    { key: "photos", label: "Au moins 3 photos" },
    { key: "description", label: "Une description" },
    { key: "category", label: "Au moins une catégorie" },
  ];

export const shareFormatLabels: Record<ShareFormat, string> = {
  story: "Story (9:16)",
  post: "Publication (1:1)",
};

/** Motifs de statut proposés dans la feuille « Vendu / Souvenir / Accidenté ». */
export const archiveStatusChoices = [
  { status: "sold", label: "Vendu", hint: "Le véhicule n'est plus à toi." },
  { status: "keepsake", label: "Souvenir", hint: "Tu le gardes, il ne roule plus." },
  { status: "wrecked", label: "Accidenté", hint: "Le véhicule est détruit ou irréparable." },
] as const;

export const plateTransferLabels = {
  pending: "Plaque en attente de transfert",
  waitingOwner: "L'ancien propriétaire a 7 jours pour répondre.",
  arbitrated: "L'équipe Orasso tranche",
  refused: "Transfert refusé : véhicule non immatriculé",
  requestTitle: "Demande de transfert de plaque",
  accept: "Je confirme le transfert",
  decline: "Ce n'est pas le cas",
} as const;

import {
  CERTIFICATION_MIN_PHOTOS,
  type CertificationLostReason,
  type CertificationStatus,
  type ShareFormat,
  type ShareStyle,
} from "../garage";
import { gradeLabels } from "../grades";
import {
  type CategoryRefusal,
  CERTIFICATION_MIN_GRADE,
  type CertificationLine,
  type CertificationMissing,
} from "../rules/garage";

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

/** Origine d'un véhicule, dite comme sur l'affiche à partager : « Toyota · 2021 · Japonaise » (adjectif du pays de la marque). */
export const countryOriginLabels: Record<string, string> = {
  CZ: "Tchèque",
  DE: "Allemande",
  ES: "Espagnole",
  FR: "Française",
  GB: "Britannique",
  IT: "Italienne",
  JP: "Japonaise",
  KR: "Coréenne",
  SE: "Suédoise",
  US: "Américaine",
};

export const originLabel = (code: string | null): string | null =>
  code ? (countryOriginLabels[code] ?? countryLabels[code] ?? code) : null;

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
  reference: "Le modèle rattaché à la liste Orasso",
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

/**
 * Ligne d'état de la certification (lot M5, maquette 7.1) : un titre qui dit d'abord ce qui manque, et le détail en
 * une ligne (photos, description, grade). Un ancien véhicule ne peut pas être certifié : la ligne le dit, sans bouton.
 */
export const certificationLineLabels = {
  title: "Certification",
  headline(line: CertificationLine): string {
    switch (line.kind) {
      case "certified":
        return "Certifié Orasso";
      case "pending":
        return "Certification : demande en cours d'examen";
      case "impossible":
        return "Certification impossible";
      case "ready":
        return "Certification : prête, tu peux la demander";
      case "missing": {
        const first =
          line.first === "photos"
            ? `il manque ${line.photosMissing} photo${line.photosMissing > 1 ? "s" : ""}`
            : line.first === "description"
              ? "il manque la description"
              : line.first === "category"
                ? "il manque une catégorie"
                : line.first === "plate"
                  ? "plaque en attente de transfert"
                  : line.first === "reference"
                    ? "le modèle attend la liste Orasso"
                    : `il faut le grade ${gradeLabels[CERTIFICATION_MIN_GRADE]}`;
        return `Certification : ${first}`;
      }
    }
  },
  /** « 2 sur 3 photos · description ✓ · grade Sport ✓ » ; pour un ancien véhicule, la raison. */
  detail(
    line: CertificationLine,
    facts: { photoCount: number; missing: readonly CertificationMissing[]; certifiedAt?: string | null },
  ): string {
    if (line.kind === "impossible")
      return "Un ancien véhicule (vendu, souvenir ou accidenté) ne peut pas être certifié.";
    if (line.kind === "certified")
      return "Elle se perd si la fiche technique change, ou après six mois sans événement.";
    if (line.kind === "pending") return "L'équipe Orasso vérifie la fiche à la main.";
    const ok = (key: CertificationMissing) => (facts.missing.includes(key) ? "✗" : "✓");
    return [
      `${Math.min(facts.photoCount, CERTIFICATION_MIN_PHOTOS)} sur ${CERTIFICATION_MIN_PHOTOS} photos`,
      `description ${ok("description")}`,
      `grade ${gradeLabels[CERTIFICATION_MIN_GRADE]} ${ok("grade")}`,
    ].join(" · ");
  },
};

/** « Pour ta … » (lot M5, tour 2) : sans département connu, pas de liste, une invitation à choisir son coin. */
export const vehicleProsLabels = {
  partners: "Pros partenaires",
  needsPlace:
    "Choisis ton coin (ton département) dans tes préférences pour voir les pros partenaires près de chez toi.",
  needsPlaceLink: "Choisir mon coin",
  qrHint: "La remise s'applique sur présentation de ton QR de compte.",
};

export const shareFormatLabels: Record<ShareFormat, string> = {
  story: "Story 9:16",
  post: "Post 4:5",
};

/** Affiche à partager (lot 50 ; lot M6, maquettes 2.1 à 2.3) : formats, styles, zones masquées et boutons. */
export const shareStyleLabels: Record<ShareStyle, string> = { night: "Nuit", sand: "Sable", neon: "Néon" };

export const shareSheetLabels = {
  title: "Affiche à partager",
  subtitle: "Signée Orasso",
  /** Sous-titre avec le modèle : « Ta GR Supra, signée Orasso ». */
  subtitleOf: (model: string) => `Ta ${model}, signée Orasso`,
  help: "Une affiche avec la photo de couverture, le nom du véhicule et ses chiffres. La plaque reste floutée.",
  showSafe: "Voir les zones masquées par Instagram",
  hideSafe: "Cacher les zones masquées",
  maskedByInstagram: "Masqué par Instagram",
  story: "En story",
  post: "En post",
  image: "Image",
  copyLink: "Copier le lien",
  linkCopied: "Lien copié.",
  saved: "Image enregistrée.",
  unavailable: "Le partage n'est pas disponible sur cet appareil.",
  loading: "Préparation de l'affiche…",
  failed: "Impossible de préparer l'affiche : vérifie ta connexion.",
  // Filet de sécurité : la plaque re-détectée sur l'affiche composée, avant le partage.
  plateChecking: "Vérification de la plaque sur l'affiche…",
  plateClear: "Plaque vérifiée à nouveau avant le partage : rien de lisible.",
  plateServer: "La photo garde la plaque floutée par Orasso.",
  plateFound: "Une plaque semble lisible sur l'affiche.",
  plateMask: "La masquer",
  plateCheckingShort: "Vérification…",
  shareAnyway: "Partager quand même",
  shareAnywayConfirm: "Une plaque semble lisible sur l'affiche. La partager quand même ?",
  plateMasked: "Plaque masquée sur l'affiche.",
  // Tour 4 : la vérification n'a pas répondu à temps ; rien à masquer sans plaque repérée.
  plateSlow: "La plaque n'a pas pu être vérifiée sur l'affiche.",
  plateRetry: "Vérifier à nouveau",
  shareUncheckedConfirm: "La plaque n'a pas pu être vérifiée sur l'affiche. La partager quand même ?",
  /** Pied de l'affiche (texte rendu par l'API). */
  findIt: "Retrouve-la sur",
  certifiedSeal: "Véhicule certifié · Orasso",
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

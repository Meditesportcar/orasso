import type { StructureKind, StructureVerification, VerificationDocumentKind } from "../enums";

// Structures (organisateurs) et leur vérification.

export const structureKindLabels: Record<StructureKind, string> = {
  association: "Association",
  club: "Club",
  circuit: "Circuit",
  company: "Entreprise",
  collectivity: "Collectivité",
};

export const structureVerificationLabels: Record<StructureVerification, string> = {
  unverified: "Non vérifiée",
  pending: "Vérification en cours",
  verified: "Structure vérifiée",
  suspended: "Suspendue",
};

export const verificationDocumentKindLabels: Record<VerificationDocumentKind, string> = {
  statutes: "Statuts",
  receipt: "Récépissé de déclaration",
  kbis: "Extrait Kbis",
  identity: "Pièce d'identité du responsable",
  other: "Autre justificatif",
};

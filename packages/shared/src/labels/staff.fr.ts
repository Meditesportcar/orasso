import type { CheckinMethod, StaffPresence } from "../enums";
import type { LocalScanDecision, ScanRefusal } from "../qr/pass";

// Accès et jour J : scans, entrées, présence du staff (lot 06).

/** Raison d'un scan refusé par l'appli du staff (ARCHITECTURE.md § 3.1, prototype « Refusé »). */
export const scanRefusalLabels: Record<ScanRefusal, string> = {
  unknown_qr: "QR inconnu",
  unknown_key: "Clé inconnue : synchronise",
  forged: "QR falsifié",
  other_event: "QR d'un autre événement",
  other_day: "Inscrit pour un autre jour",
  withdrawn: "Désisté",
  refused: "Non admis",
  cancelled: "Annulé",
  banned: "Non admis",
  replaced: "QR remplacé",
};

/** Résultat d'une lecture côté appli (écran ScanResult : « OK », « Déjà entré », « Refusé »). */
export const localScanDecisionLabels: Record<LocalScanDecision, string> = {
  ok: "OK",
  already: "Déjà entré",
  refused: "Refusé",
  override: "Accepté quand même",
  unknown_pass: "QR valide mais absent de ta liste : synchronise",
};

export const checkinMethodLabels: Record<CheckinMethod, string> = {
  scan: "Scan",
  manual: "Sans scan",
  plate: "Pointage par plaque",
  express: "Inscription express",
};

export const staffPresenceLabels: Record<StaffPresence, string> = {
  unknown: "Pas de réponse",
  present: "Je suis là",
  absent: "Pas là",
};

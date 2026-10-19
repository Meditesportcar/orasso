import type { CheckinMethod, StaffPresence } from "../enums";
import type { LocalScanDecision, ScanRefusal } from "../qr/pass";

// Accès et jour J : scans, entrées, présence du staff (lot 06).

/** Raison d'un scan refusé par l'appli du staff (ARCHITECTURE.md § 3.1, prototype « Refusé »). */
export const scanRefusalLabels: Record<ScanRefusal, string> = {
  unknown_qr: "QR inconnu",
  unknown_key: "Clé inconnue : synchronise",
  forged: "QR falsifié",
  expired: "Code périmé : demande à la personne de rafraîchir son écran",
  legacy_qr: "Ancien QR : demande d'ouvrir l'appli pour le code qui change",
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
  drive: "Accueil drive",
};

export const staffPresenceLabels: Record<StaffPresence, string> = {
  unknown: "Pas de réponse",
  present: "Je suis là",
  absent: "Pas là",
};

/** Mode staff v2, écran d'entrée (lot 48, prototype DA v2 `s-staff`, validé par Damien le 19/10/2026). */
export const staffHomeLabels = {
  title: "Mode staff",
  synced: (hour: string) => `Synchronisé à ${hour}`,
  inMemory: (n: number) => `${n} inscrit${n > 1 ? "s" : ""} en mémoire : le scan marche sans réseau`,
  neverSynced: "Pas encore synchronisé",
  syncFirst: "Synchronise avec du réseau avant l'ouverture des portes : la liste restera sur ton téléphone.",
  role: "Ton rôle",
  givenBy: (structure: string) => `Donné par ${structure} pour cet événement`,
  here: "Je suis là",
  notHere: "Pas là",
  scanner: "Scanner",
  scannerHint: "Caméra continue · résultat en 1 s",
  list: "Liste",
  listHint: (n: number) => `${n} inscrit${n > 1 ? "s" : ""} · pointage manuel`,
  placement: "Placement",
  placementHint: "Attendus et arrivés par zone",
  tickets: "Contrôle des billets",
  ticketsHint: "Public · compteur d'entrées",
  entered: "Entrés",
  enteredOf: (arrived: number, expected: number) => `${arrived} sur ${expected}`,
  closesNote: "Le mode staff se referme seul à J+1. Les scans faits hors ligne partent au retour du réseau.",
  alert: "Alerte",
  logbook: "Main courante",
  discussion: "Discussion",
} as const;

/** Accueil drive (lot 48, prototype DA v2 `s-drive`, idée retenue n° 1). */
export const driveLabels = {
  title: "Accueil drive",
  tile: "Accueil drive",
  tileHint: "La caméra lit la plaque, sans réseau",
  offline: (n: number, entered: number) =>
    `Hors ligne · ${n} inscrit${n > 1 ? "s" : ""} en mémoire · ${entered} entrés`,
  aim: "Caméra ouverte · vise la plaque avant",
  reading: "Lecture de la plaque…",
  noCamera: "Pas de caméra dans le navigateur : tape la plaque",
  noOcr: "Lecture de plaque absente de cette version : tape la plaque",
  typed: "Plaque lue (recette)",
  next: "Voiture suivante",
  unknown: "Plaque absente de la liste : plaque ou pseudo",
  choose: "Deux plaques lisibles : laquelle entre ?",
  revoked: "Désisté ou non admis",
  otherDay: "Inscrit pour un autre jour",
  searchOrPseudo: "Plaque ou pseudo",
  express: "Express",
  noScan: "Sans scan",
} as const;

/** « 2 min », « 45 s » : écart d'horloge arrondi. */
function gap(seconds: number): string {
  const s = Math.abs(seconds);
  return s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`;
}

/**
 * Code tournant périmé au MAC valide (relecture du lot 48) : l'écart avec l'heure du staff et le geste à faire. Un code
 * « de l'avenir » vient d'un téléphone en avance (ce n'est pas une capture) ; un code ancien peut être une capture ou
 * un téléphone en retard : dans les deux cas, le pointage à la main.
 */
export function expiredScanLabel(offsetSeconds: number): string {
  return offsetSeconds > 0
    ? `Téléphone en avance de ${gap(offsetSeconds)} : pointe à la main (plaque ou pseudo)`
    : `Code ancien de ${gap(offsetSeconds)} : capture ou téléphone en retard, pointe à la main si la personne est là`;
}

/** Code tournant d'un pass absent de la liste (relecture du lot 48). */
export const unverifiedScanLabels = {
  title: "Code tournant d'un pass absent de ta liste",
  superStaff:
    "Impossible à vérifier sans réseau. Super staff : tu peux l'accepter quand même, l'entrée sera vérifiée à la synchro.",
  refused: "Pass absent de ta liste : synchronise, ou appelle un super staff",
} as const;

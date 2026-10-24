// Le plateau d'un événement (lot R4b, maquette R4 validée par Damien le 24/10/2026) : qui vient, en voitures et en pros.
// Décision finale de Damien : visible de tous dès la première acceptation, tout retenu y apparaît d'office (sans case
// ni réglage), jamais d'heure d'arrivée, plaque toujours masquée. Un compte privé garde son profil fermé ; un visiteur
// sans compte ne voit aucun pseudo. Pures : l'API les applique, l'appli et le site affichent le résultat.

/** Avant la fin de l'événement : les voitures retenues ; ensuite, seulement les entrées pointées. */
export type LineupPhase = "accepted" | "present";

/**
 * Phase du plateau : même bascule que « À venir » / « Passées » de Mes sorties (fin de l'événement). Après, les absents
 * ne sont jamais montrés, même en nombre.
 */
export function lineupPhase(endsAt: Date | string, now: Date): LineupPhase {
  return new Date(endsAt).getTime() <= now.getTime() ? "present" : "accepted";
}

/** Vignettes par page du plateau en plein écran (« Voir plus » par 30). */
export const LINEUP_PAGE_SIZE = 30;
/** Vignettes du bloc compact de la fiche (appli) et de la section du site. */
export const LINEUP_BLOCK_SIZE = 6;
/** Mini-photos de la ligne « Le plateau » d'un ticket de Mes sorties. */
export const LINEUP_PREVIEW_PHOTOS = 3;

/**
 * Champs d'une vignette de voiture pour un visiteur sans compte : la photo (plaque masquée) et le modèle, sans pseudo
 * ni identifiant de compte (ni le champ `vehicleId` : sans compte, aucune fiche ne s'ouvre). L'adresse de la photo,
 * elle, contient l'identifiant du véhicule (choix du coordinateur, tour 2 : pas d'adresses opaques dans ce lot ; une
 * même photo reconnaît de toute façon une voiture d'un événement à l'autre). Liste blanche : l'API n'envoie rien
 * d'autre, les tests le vérifient.
 */
export const lineupCarVisitorFields = ["photoUrl", "label", "makeName", "modelName", "generationName"] as const;

/**
 * Champs d'une vignette pour une personne connectée : en plus, le véhicule (fiche), le pseudo, `private` (cadenas :
 * toucher n'ouvre jamais le profil) et `me` (« Toi »). Jamais d'identifiant de compte, d'heure, de zone, de créneau,
 * de plaque ni de département.
 */
export const lineupCarMemberFields = [...lineupCarVisitorFields, "vehicleId", "pseudo", "private", "me"] as const;

/** Champs d'une vignette de pro (prestataire retenu ou média accrédité) : jamais d'emplacement de stand. */
export const lineupProFields = ["id", "kind", "name", "job", "logoUrl", "officialMedia", "discount"] as const;

/**
 * Lot R4b, tour 2 : après la fin de l'événement, les réponses publiques ne disent plus ni le nombre de retenus ni les
 * places restantes (avec « N présentes », ils donneraient le nombre d'absents). L'organisation garde ses chiffres.
 */
export function publicCountsHidden(endsAt: Date | string, now: Date): boolean {
  return lineupPhase(endsAt, now) === "present";
}

/**
 * Lot R4b, tour 2 : la photo montrée hors du garage (plateau, voiture d'un compte privé) est la première photo dont la
 * plaque a été floutée ; pour un véhicule non immatriculé (sans plaque), la première photo. Sinon aucune (silhouette) :
 * « aucune plaque visible » n'est pas gardé en base, une photo non floutée peut montrer une plaque lisible.
 */
export function maskedPhoto<T extends { plateBlurred: boolean }>(
  photos: readonly T[],
  unregistered: boolean,
): T | null {
  if (unregistered) return photos[0] ?? null;
  return photos.find((p) => p.plateBlurred) ?? null;
}

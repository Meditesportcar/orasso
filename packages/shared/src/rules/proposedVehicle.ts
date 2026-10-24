// Modèle ou marque absents de la liste Orasso (lot R4a, maquette R4.8) : la personne tape le nom, sa fiche est créée
// tout de suite avec ce nom (« Peugeot 207 CC »), l'équipe l'ajoute ensuite à la liste depuis la file « Modèles
// proposés » de l'admin (R4.8b), qui regroupe les fiches par texte normalisé. Règles communes à l'API, l'appli et le site.
import { searchFold } from "./vehicleSearch";

/** Nom tapé : 2 à 40 caractères une fois nettoyé (« Continuer » s'active dès 2 caractères). */
export const PROPOSED_NAME_MIN = 2;
export const PROPOSED_NAME_MAX = 40;

/**
 * Nom tapé nettoyé : sans caractères de contrôle, espaces réduits, 40 caractères au plus ; null s'il en reste moins de
 * 2. La casse tapée est gardée (« 207 CC », « Exige »).
 */
export function cleanProposedName(text: string | null | undefined): string | null {
  const clean = (text ?? "")
    // Lot R4a, tour 2 : contrôles C0 et C1, marques de sens (bidi) et espaces de largeur nulle retirés.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: on retire justement les caractères de contrôle.
    .replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, " ")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PROPOSED_NAME_MAX)
    .trim();
  return clean.length >= PROPOSED_NAME_MIN ? clean : null;
}

/**
 * Texte normalisé d'un nom tapé, pour regrouper les fiches de la file admin : sans accents ni casse, espaces et
 * ponctuation retirés (« 207 CC », « 207cc » et « 207-CC » vont ensemble). Lot R4a, tour 2 : les lettres et chiffres de
 * toutes les écritures restent (« 丰田 », « Лада ») ; un nom sans lettre ni chiffre garde sa ponctuation, espaces
 * réduits, pour ne pas rejoindre un autre nom.
 */
export function proposalText(text: string): string {
  const folded = searchFold(text);
  return folded.replace(/[^\p{L}\p{N}]+/gu, "") || folded.replace(/\s+/g, " ").trim();
}

/**
 * Écriture sûre dans une adresse, sans collision : lettres latines minuscules et chiffres gardés, tout autre caractère
 * écrit `_<code hexadécimal>_` ; un texte vide s'écrit « - » (aucun autre texte ne donne ce signe).
 */
function keyPart(text: string): string {
  if (!text) return "-";
  return [...text].map((ch) => (/[a-z0-9]/.test(ch) ? ch : `_${(ch.codePointAt(0) ?? 0).toString(16)}_`)).join("");
}

/**
 * Clé d'un groupe de la file « Modèles proposés » : la marque connue et le modèle tapé (`model.<makeId>.<texte>`), ou la
 * marque et le modèle tapés (`make.<texte>.<texte>`). Sans caractère à échapper dans une adresse.
 */
export function proposalKey(v: {
  makeId: string;
  makeIsOther: boolean;
  proposedMake: string | null;
  proposedModel: string | null;
}) {
  const model = keyPart(proposalText(v.proposedModel ?? ""));
  return v.makeIsOther ? `make.${keyPart(proposalText(v.proposedMake ?? ""))}.${model}` : `model.${v.makeId}.${model}`;
}

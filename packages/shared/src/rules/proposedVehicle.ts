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
    // biome-ignore lint/suspicious/noControlCharactersInRegex: on retire justement les caractères de contrôle.
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PROPOSED_NAME_MAX)
    .trim();
  return clean.length >= PROPOSED_NAME_MIN ? clean : null;
}

/**
 * Texte normalisé d'un nom tapé, pour regrouper les fiches de la file admin : sans accents ni casse, espaces et
 * ponctuation retirés (« 207 CC », « 207cc » et « 207-CC » vont ensemble).
 */
export function proposalText(text: string): string {
  return searchFold(text).replace(/[^a-z0-9]+/g, "");
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
  const model = proposalText(v.proposedModel ?? "") || "_";
  return v.makeIsOther ? `make.${proposalText(v.proposedMake ?? "") || "_"}.${model}` : `model.${v.makeId}.${model}`;
}

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
  const clean = cleanTyped(text, PROPOSED_NAME_MAX);
  return clean.length >= PROPOSED_NAME_MIN ? clean : null;
}

/** Texte tapé nettoyé (contrôles, bidi, largeur nulle, espaces réduits), coupé à `max` caractères. */
function cleanTyped(text: string | null | undefined, max: number): string {
  return (
    (text ?? "")
      // Lot R4a, tour 2 : contrôles C0 et C1, marques de sens (bidi) et espaces de largeur nulle retirés.
      // biome-ignore lint/suspicious/noControlCharactersInRegex: on retire justement les caractères de contrôle.
      .replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, " ")
      .replace(/[​-‍﻿]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max)
      .trim()
  );
}

/**
 * Lot R4e (décision de Damien, 24/10) : la version du véhicule (« CC », « SW », « GTI », « Phase 2 »), affichée après le
 * modèle et la génération. Facultative, 1 à 30 caractères, même nettoyage que les noms tapés.
 */
export const VEHICLE_VERSION_MAX = 30;

/** Version nettoyée, ou null si rien ne reste. */
export function cleanVehicleVersion(text: string | null | undefined): string | null {
  return cleanTyped(text, VEHICLE_VERSION_MAX) || null;
}

/** « Golf », « Mk4 », « Série 3 » : les lettres et chiffres d'un nom, sans accents ni casse. */
const foldedChars = (text: string) => [...searchFold(text)].filter((ch) => /[\p{L}\p{N}]/u.test(ch));

/**
 * Le texte tapé après un nom de la liste qui l'ouvre, sans accents ni casse, espaces et ponctuation ignorés : « 207 CC »
 * après « 207 » → « CC », « 207CC » → « CC », « Golf IV GTI » après « Golf » → « IV GTI ». Null si le texte ne commence
 * pas par ce nom.
 */
function after(text: string, name: string): string | null {
  const want = foldedChars(name);
  if (!want.length) return null;
  let i = 0;
  let pos = 0;
  for (const ch of text) {
    if (i === want.length) break;
    pos += ch.length;
    const folded = [...searchFold(ch)].filter((c) => /[\p{L}\p{N}]/u.test(c));
    for (const c of folded) {
      if (c !== want[i]) return null;
      i++;
    }
  }
  return i === want.length ? text.slice(pos) : null;
}

/**
 * Lot R4e : la version tirée d'un nom tapé rattaché à la liste (`acceptProposal`). On retire du début du texte la marque
 * (si elle y est), le modèle de la liste, puis la génération (si elle y est) ; le reste, sans ponctuation en tête, est la
 * version. « 207 CC » rattaché à « 207 » → « CC » ; « 207CC » → « CC » ; « 207 » → null. Un texte qui ne commence pas
 * par le modèle ne donne rien (on ne devine pas).
 */
export function versionFromTyped(
  typed: string | null | undefined,
  names: { make?: string | null; model: string; generation?: string | null },
): string | null {
  let rest = cleanTyped(typed, PROPOSED_NAME_MAX);
  if (names.make) rest = after(rest, names.make) ?? rest;
  const model = after(rest, names.model);
  if (model === null) return null;
  rest = model;
  if (names.generation) rest = after(rest, names.generation) ?? rest;
  return cleanVehicleVersion(rest.replace(/^[^\p{L}\p{N}]+/u, ""));
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

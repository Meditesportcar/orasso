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

/**
 * Caractères invisibles retirés d'un texte tapé (lot R4e, tour 2) : largeur nulle (U+200B à U+200D, U+2060, U+FEFF),
 * marques de sens gauche-droite (U+200E, U+200F, U+061C), trait d'union conditionnel (U+00AD), lettre de remplissage
 * hangûl (U+3164).
 */
const INVISIBLE = /[\u200b-\u200f\u2060\ufeff\u061c\u00ad\u3164]/g;

/** Texte tapé nettoyé (contrôles, bidi, invisibles, espaces réduits), coupé à `max` caractères. */
function cleanTyped(text: string | null | undefined, max: number): string {
  return (
    (text ?? "")
      // Lot R4a, tour 2 : contrôles C0 et C1 et marques de sens (bidi) remplacés par une espace.
      // biome-ignore lint/suspicious/noControlCharactersInRegex: on retire justement les caractères de contrôle.
      .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
      .replace(INVISIBLE, "")
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

const ALNUM = /[\p{L}\p{N}]/u;
const DIGIT = /\p{N}/u;
/** Lettres et chiffres d'un texte, sans accents ni casse. */
const foldedChars = (text: string) => [...searchFold(text)].filter((ch) => ALNUM.test(ch));

/**
 * Le texte tapé après un nom de la liste qui l'ouvre, sans accents ni casse, espaces et ponctuation ignorés : « 207 CC »
 * après « 207 » → « CC », « 207CC » → « CC », « Golf IV GTI » après « Golf » → « IV GTI ». Null si le texte ne commence
 * pas par ce nom. Tour 2 : jamais au milieu d'un mot ou d'un nombre (« 2070 » après « 207 », « Golfe » après « Golf » →
 * null) ; un chiffre suivi d'une lettre (« 207CC ») est une coupure permise.
 */
function after(text: string, name: string): string | null {
  const want = foldedChars(name);
  if (!want.length) return null;
  let i = 0;
  let pos = 0;
  for (const ch of text) {
    if (i === want.length) break;
    pos += ch.length;
    for (const c of foldedChars(ch)) {
      if (c !== want[i]) return null;
      i++;
    }
  }
  if (i !== want.length) return null;
  const last = want[want.length - 1] as string;
  const next = foldedChars(text.slice(pos, pos + 2))[0];
  const nextRaw = text.slice(pos, pos + 1);
  if (next && ALNUM.test(nextRaw) && DIGIT.test(last) === DIGIT.test(next)) return null;
  return text.slice(pos);
}

/** Ponctuation et parenthèses retirées aux deux bords (« (CC) » → « CC »). */
const trimPunctuation = (text: string) => text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/**
 * Lot R4e : la version tirée d'un nom tapé rattaché à la liste (`acceptProposal`, `reassign`). Le modèle de la liste est
 * cherché au début du texte entier, puis (tour 2) après la marque si elle ouvre le texte (« DS 3 Racing » rattaché à
 * « DS 3 » → « Racing » ; « Mini Classic Sport » rattaché à Mini « Classic » → « Sport ») ; la génération qui suit est
 * retirée si elle y est ; le reste, sans ponctuation ni parenthèses aux bords, est la version. « 207 CC » → « CC » ;
 * « 207CC » → « CC » ; « 207 (CC) » → « CC » ; « 207 » et « 2070 » → null. Un texte qui ne commence pas par le modèle
 * ne donne rien (on ne devine pas).
 */
export function versionFromTyped(
  typed: string | null | undefined,
  names: { make?: string | null; model: string; generation?: string | null },
): string | null {
  const text = cleanTyped(typed, PROPOSED_NAME_MAX);
  const withoutMake = names.make ? after(text, names.make) : null;
  let rest = after(text, names.model) ?? (withoutMake === null ? null : after(withoutMake, names.model));
  if (rest === null) return null;
  if (names.generation) rest = after(rest, names.generation) ?? rest;
  return cleanVehicleVersion(trimPunctuation(rest));
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

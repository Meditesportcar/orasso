// « pour le Rassemblement du Lydia », « présent à la Nocturne de Canet », « sera aux Rencontres de Prades » : le verbe du
// rattachement d'une publication (rôle et phase) accordé avec le titre de l'événement (lot R8c2). La maquette écrit
// l'accord à la main ; ici, une règle pure, sans réseau ni horloge. Elle ne connaît pas la langue : l'article d'un titre
// est lu dans le titre, le genre se devine d'une liste de noms féminins courants. Limites (journal des choix, « À revoir
// avec Damien ») : un titre féminin hors de la liste (« Réunion de printemps ») s'écrit au masculin ; un titre pluriel
// sans article (« Rassemblements d'automne ») aussi ; un « h » muet n'est reconnu que pour une courte liste de mots français (`MUTE_H_WORDS`) : « Hot Rod Day » reste « au Hot Rod Day ».
import type { FeedAttachPhase, FeedEventRole } from "./feedAttach";

/** Premiers mots d'un titre qui se disent au féminin (sans accent, en minuscules : la comparaison les ignore). */
export const FEMININE_TITLE_WORDS = [
  "balade",
  "nocturne",
  "nuit",
  "sortie",
  "rencontre",
  "exposition",
  "expo",
  "montee",
  "course",
  "journee",
  "soiree",
  "fete",
  "bourse",
  "concentration",
  "viree",
  "parade",
  "matinale",
] as const;

type Gender = "m" | "f" | "p" | "elided";

/** Sans accents, en minuscules : « Montée » et « montee » sont le même mot. */
const plain = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Voyelle sonore (« y » n'en est pas une ici : « au Youngtimers »). */
const VOWEL = /^[aeiou]/;
/** « h » muet : seulement des mots français connus ; un titre anglais en « h » (« Hot Rod », « Harley Days ») reste au masculin. */
export const MUTE_H_WORDS = ["hivernale", "historique", "historiques", "heure", "heures", "hommage"] as const;

/** L'article que porte déjà le titre (« Le », « La », « Les », « L' »), et le reste du titre sans lui. */
function leadingArticle(title: string): { gender: Gender; rest: string } | null {
  const elided = /^l['’]\s*(.+)$/i.exec(title);
  if (elided?.[1]) return { gender: "elided", rest: elided[1] };
  const spaced = /^(le|la|les)\s+(.+)$/i.exec(title);
  if (!spaced?.[1] || !spaced[2]) return null;
  const word = spaced[1].toLowerCase();
  return { gender: word === "le" ? "m" : word === "la" ? "f" : "p", rest: spaced[2] };
}

/** Le genre d'un titre sans article : liste de noms féminins, voyelle ou « h » (élision), sinon masculin. */
function genderOf(title: string): Gender {
  const first = plain(title.split(/\s+/)[0] ?? "");
  // L'élision l'emporte aussi pour un nom féminin (« l'Exposition », « l'Expo »).
  if (VOWEL.test(first) || (MUTE_H_WORDS as readonly string[]).includes(first)) return "elided";
  if ((FEMININE_TITLE_WORDS as readonly string[]).includes(first)) return "f";
  return "m";
}

/** Préposition et article, contractés : « au », « à la », « aux », « à l' » (le dernier se colle au titre). */
const CONTRACTED: Record<Gender, string> = { m: "au", f: "à la", p: "aux", elided: "à l'" };
/** « pour » et l'article, sans contraction : « pour le », « pour la », « pour les », « pour l' ». */
const PLAIN: Record<Gender, string> = { m: "pour le", f: "pour la", p: "pour les", elided: "pour l'" };

/** Le verbe (avant la préposition) d'un rôle et d'une phase ; « pour » est déjà une préposition. */
function verbOf(role: FeedEventRole, phase: FeedAttachPhase): string | null {
  if (role === "organizer") return null;
  if (role === "on_site") return "présent";
  return phase === "after" ? "était" : phase === "running" ? "est" : "sera";
}

/**
 * La phrase du rattachement : rôle (déduit par l'API) et phase, puis le titre de l'événement. Sans rôle (passionné après
 * la fin, présence non validée) : le titre seul, sans verbe. Le titre n'est jamais tronqué ni changé, sauf son article
 * d'ouverture qui passe dans la préposition (« Le Mans Classic » → « au Mans Classic »).
 */
export function attachPhrase(role: FeedEventRole | null, phase: FeedAttachPhase, title: string): string {
  const clean = title.trim();
  if (!role || !clean) return clean;
  const article = leadingArticle(clean);
  const gender = article?.gender ?? genderOf(clean);
  const body = article?.rest ?? clean;
  const verb = verbOf(role, phase);
  const lead = verb ? `${verb} ${CONTRACTED[gender]}` : PLAIN[gender];
  return lead.endsWith("'") ? `${lead}${body}` : `${lead} ${body}`;
}

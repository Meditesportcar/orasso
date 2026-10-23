// Données et règles de l'ajout de véhicule refait (lot M1, maquettes 1.1 à 1.9) : le nuancier des couleurs de
// carrosserie, la préparation en pastilles, le seuil de photos et la longueur de la description. Ce sont des données
// (pas des jetons d'interface) : l'appli et le site les affichent, l'API stocke le nom de la teinte dans `color` et la
// préparation en texte lisible dans `preparation` (la fiche du tri l'affiche telle quelle).

// --- Couleurs de carrosserie ------------------------------------------------------------------------------------------

/** Familles du nuancier, dans l'ordre d'affichage. */
export const bodyColorFamilies = [
  "white",
  "grey",
  "black",
  "red",
  "blue",
  "green",
  "yellow",
  "brown",
  "purple",
  "special",
] as const;
export type BodyColorFamily = (typeof bodyColorFamilies)[number];

/**
 * Rendu d'une pastille : `gloss` vernis (reflet), `metal` métallisé (reflet et dégradé), `pearl` nacré (reflet irisé),
 * `matte` mat (sans reflet), `duo` bicolore (deux moitiés), `chameleon` caméléon (dégradé tournant).
 */
export type BodyColorFinish = "gloss" | "metal" | "pearl" | "matte" | "duo" | "chameleon";

export type BodyColor = {
  /** Nom affiché et stocké tel quel dans `color` (40 caractères au plus). */
  name: string;
  family: BodyColorFamily;
  hex: string;
  /** Seconde teinte : bicolore (moitié basse) ou caméléon (reflet). */
  hex2?: string;
  finish: BodyColorFinish;
};

/** Le nuancier Orasso : de vraies teintes de carrosserie, sans nom de marque (lot M1, correction de Damien). */
export const bodyColors: readonly BodyColor[] = [
  { name: "Blanc", family: "white", hex: "#f4f3ee", finish: "gloss" },
  { name: "Blanc glacier", family: "white", hex: "#e9eef0", finish: "gloss" },
  { name: "Blanc nacré", family: "white", hex: "#efe9dc", hex2: "#dfe6ef", finish: "pearl" },
  { name: "Blanc crème", family: "white", hex: "#ece2c6", finish: "gloss" },
  { name: "Blanc mat", family: "white", hex: "#e4e2dc", finish: "matte" },
  { name: "Argent", family: "grey", hex: "#c4c8cc", finish: "metal" },
  { name: "Gris clair", family: "grey", hex: "#a6abb0", finish: "metal" },
  { name: "Gris ciment", family: "grey", hex: "#8b8d88", finish: "gloss" },
  { name: "Gris acier", family: "grey", hex: "#6c7278", finish: "metal" },
  { name: "Gris anthracite", family: "grey", hex: "#3e4246", finish: "metal" },
  { name: "Gris mat", family: "grey", hex: "#64676a", finish: "matte" },
  { name: "Noir", family: "black", hex: "#111214", finish: "gloss" },
  { name: "Noir métallisé", family: "black", hex: "#1d2024", finish: "metal" },
  { name: "Noir nacré", family: "black", hex: "#1b1a22", hex2: "#3a3550", finish: "pearl" },
  { name: "Noir mat", family: "black", hex: "#1c1c1d", finish: "matte" },
  { name: "Rouge vif", family: "red", hex: "#d0202b", finish: "gloss" },
  { name: "Rouge course", family: "red", hex: "#b8141a", finish: "gloss" },
  { name: "Rouge cerise", family: "red", hex: "#9c1030", finish: "metal" },
  { name: "Bordeaux", family: "red", hex: "#5e1222", finish: "metal" },
  { name: "Rouge orangé", family: "red", hex: "#d8401f", finish: "gloss" },
  { name: "Bleu ciel", family: "blue", hex: "#8db6dc", finish: "gloss" },
  { name: "Bleu pastel", family: "blue", hex: "#a9c7d8", finish: "matte" },
  { name: "Bleu de France", family: "blue", hex: "#2f5fb8", finish: "gloss" },
  { name: "Bleu électrique", family: "blue", hex: "#1f5ef0", finish: "metal" },
  { name: "Bleu roi", family: "blue", hex: "#203f9a", finish: "metal" },
  { name: "Bleu marine", family: "blue", hex: "#18264a", finish: "metal" },
  { name: "Vert anglais", family: "green", hex: "#1d3b2a", finish: "metal" },
  { name: "Vert émeraude", family: "green", hex: "#0d7457", finish: "metal" },
  { name: "Vert pomme", family: "green", hex: "#79bb3a", finish: "gloss" },
  { name: "Vert kaki", family: "green", hex: "#5d6a44", finish: "matte" },
  { name: "Vert d'eau", family: "green", hex: "#9fcbb6", finish: "gloss" },
  { name: "Jaune", family: "yellow", hex: "#f1c21b", finish: "gloss" },
  { name: "Jaune citron", family: "yellow", hex: "#e3dc33", finish: "gloss" },
  { name: "Orange", family: "yellow", hex: "#ea6b1b", finish: "gloss" },
  { name: "Orange cuivré", family: "yellow", hex: "#bf5f2b", finish: "metal" },
  { name: "Or", family: "yellow", hex: "#c7a03a", finish: "metal" },
  { name: "Beige sable", family: "brown", hex: "#cbb690", finish: "gloss" },
  { name: "Champagne", family: "brown", hex: "#d4c39c", finish: "metal" },
  { name: "Bronze", family: "brown", hex: "#8a683c", finish: "metal" },
  { name: "Marron", family: "brown", hex: "#5a3a25", finish: "metal" },
  { name: "Chocolat", family: "brown", hex: "#3a2518", finish: "gloss" },
  { name: "Violet", family: "purple", hex: "#5a2c8a", finish: "metal" },
  { name: "Prune", family: "purple", hex: "#4a1e3c", finish: "metal" },
  { name: "Mauve", family: "purple", hex: "#9a7aa8", finish: "gloss" },
  { name: "Rose", family: "purple", hex: "#e48eb1", finish: "gloss" },
  { name: "Bicolore noir et blanc", family: "special", hex: "#f2f1ec", hex2: "#141517", finish: "duo" },
  { name: "Bicolore rouge et noir", family: "special", hex: "#c8202a", hex2: "#141517", finish: "duo" },
  { name: "Bicolore bleu et blanc", family: "special", hex: "#2f5fb8", hex2: "#f2f1ec", finish: "duo" },
  { name: "Caméléon", family: "special", hex: "#2a6f8f", hex2: "#7a3c9a", finish: "chameleon" },
  { name: "Chrome", family: "special", hex: "#d8dde2", hex2: "#7d858d", finish: "metal" },
];

/** La teinte du nuancier qui porte ce nom (sans casse ni accent, « Blanche » et « Blanc » se valent), ou null. */
export function bodyColorByName(name: string | null | undefined): BodyColor | null {
  const key = foldColor(name ?? "");
  if (!key) return null;
  return bodyColors.find((c) => foldColor(c.name) === key) ?? LEGACY_COLORS[key] ?? null;
}

const foldColor = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Anciens noms (avant le lot M1, accordés à « voiture ») rattachés à leur teinte du nuancier. */
const LEGACY_COLORS: Record<string, BodyColor> = Object.fromEntries(
  (
    [
      ["blanche", "Blanc"],
      ["noire", "Noir"],
      ["grise", "Gris ciment"],
      ["gris", "Gris ciment"],
      ["rouge", "Rouge vif"],
      ["bleue", "Bleu de France"],
      ["bleu", "Bleu de France"],
      ["verte", "Vert anglais"],
      ["vert", "Vert anglais"],
    ] as const
  ).map(([old, name]) => [old, bodyColors.find((c) => c.name === name) as BodyColor]),
);

// --- Préparation -----------------------------------------------------------------------------------------------------

/** Préparations proposées en pastilles (maquette 1.6), dans l'ordre d'affichage. */
export const vehiclePreparations = [
  "engine",
  "exhaust",
  "intake",
  "suspension",
  "wheels",
  "brakes",
  "body",
  "interior",
  "wrap",
] as const;
export type VehiclePreparation = (typeof vehiclePreparations)[number];

export const vehiclePreparationLabels: Record<VehiclePreparation, string> = {
  engine: "Moteur",
  exhaust: "Échappement",
  intake: "Admission",
  suspension: "Suspension",
  wheels: "Jantes",
  brakes: "Freins",
  body: "Carrosserie",
  interior: "Intérieur",
  wrap: "Covering",
};

const PREP_SEPARATOR = " · ";

/** Texte stocké dans `preparation` : « Échappement · Suspension · Jantes », puis la note libre éventuelle. */
export function formatPreparation(items: readonly VehiclePreparation[], note = ""): string | null {
  const known = vehiclePreparations.filter((p) => items.includes(p)).map((p) => vehiclePreparationLabels[p]);
  const text = [known.join(PREP_SEPARATOR), note.trim()].filter(Boolean).join("\n");
  return text || null;
}

/**
 * Lecture du texte `preparation` d'une fiche : les pastilles reconnues (première ligne, séparées par « · » ou des
 * virgules), et le reste en note libre (fiches d'avant le lot M1, saisies du site).
 */
export function parsePreparation(text: string | null | undefined): { items: VehiclePreparation[]; note: string } {
  const value = (text ?? "").trim();
  if (!value) return { items: [], note: "" };
  const [first = "", ...rest] = value.split("\n");
  const parts = first.split(/\s*[·,]\s*/).filter(Boolean);
  const byLabel = new Map(vehiclePreparations.map((p) => [foldColor(vehiclePreparationLabels[p]), p]));
  const items = parts.map((p) => byLabel.get(foldColor(p)));
  if (!items.length || items.some((x) => x === undefined)) return { items: [], note: value };
  return { items: items as VehiclePreparation[], note: rest.join("\n").trim() };
}

/** Catégorie « Préparée » : cochée d'office dès qu'une préparation est choisie (maquette 1.7). */
export const PREPARED_CATEGORY_SLUG = "preparee";

// --- Description -------------------------------------------------------------------------------------------------------
// (Photos conseillées : `CERTIFICATION_MIN_PHOTOS` de `garage.ts`, 3, nécessaires pour demander la certification.)

/** Longueur de la description dans l'ajout (maquette 1.6 : compteur « 142 / 600 ») ; l'API en accepte 2 000. */
export const VEHICLE_DESCRIPTION_MAX = 600;

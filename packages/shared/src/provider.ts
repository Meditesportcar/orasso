// Prestataires (food truck, barbier, photographe…) : types codés, libellés, correspondance avec les types attendus par
// un événement, complétude du profil, accréditation « média officiel » (docs/01 « Prestataires », ARCHITECTURE-SUITE § 6).
// Fonctions pures, communes à l'API, au site et à l'appli.

/**
 * Types de prestataires. `stand` n'est pas proposé à la création d'un profil : c'est le type du stand d'un pro
 * (profil lié à sa fiche pro). `other` = type libre (≤ 40 caractères) côté profil, « Autres » côté événement.
 */
export const vendorTypeCodes = [
  "food_truck",
  "barber",
  "tattoo",
  "photographer",
  "animation",
  "merch",
  "stand",
  "other",
] as const;
export type VendorTypeCode = (typeof vendorTypeCodes)[number];

export const vendorTypeLabels: Record<VendorTypeCode, string> = {
  food_truck: "Food truck",
  barber: "Barbier",
  tattoo: "Tatoueur",
  photographer: "Photographe",
  animation: "Animation",
  merch: "Vente de pièces",
  stand: "Stand de professionnel",
  other: "Autres",
};

/** Types qu'un prestataire peut choisir pour son profil (le stand vient de la fiche pro). */
export const providerSelectableTypes = vendorTypeCodes.filter((c) => c !== "stand");

/** Types proposés en cases à cocher à l'organisateur (« Autres » accepte aussi un texte libre ajouté avec « + »). */
export const vendorTypeChoices = vendorTypeCodes;

/** Anciennes formulations déjà enregistrées dans `events.vendor_types` (texte libre), rattachées à un code. */
const VENDOR_ALIASES: Record<string, VendorTypeCode> = {
  boutique: "merch",
  merchandising: "merch",
  "vente de pieces et accessoires": "merch",
  tatouage: "tattoo",
  tatoueuse: "tattoo",
  barbershop: "barber",
  foodtruck: "food_truck",
  photographie: "photographer",
  animations: "animation",
  stand: "stand",
  "stand pro": "stand",
  autre: "other",
  autres: "other",
};

/** Minuscules, sans accent ni ponctuation, espaces réduits : « Vente de pièces » = « vente de pieces ». */
export function normalizeVendorText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const CODE_BY_TEXT: ReadonlyMap<string, VendorTypeCode> = new Map<string, VendorTypeCode>([
  ...vendorTypeCodes.flatMap((c) => [
    [normalizeVendorText(c), c] as const,
    [normalizeVendorText(vendorTypeLabels[c]), c] as const,
  ]),
  ...Object.entries(VENDOR_ALIASES).map(([k, c]) => [normalizeVendorText(k), c] as const),
]);

/** Le code d'une entrée de `events.vendor_types` (par code, libellé ou alias), `null` pour un texte libre. */
export function vendorCodeOf(entry: string): VendorTypeCode | null {
  return CODE_BY_TEXT.get(normalizeVendorText(entry)) ?? null;
}

/** Libellé d'un type de profil : le libellé du code, ou le texte libre d'un type « autre ». */
export function providerTypeLabel(type: VendorTypeCode, customType?: string | null): string {
  return type === "other" && customType?.trim() ? customType.trim() : vendorTypeLabels[type];
}

/**
 * L'événement accepte-t-il ce type de prestataire ? Par code ou par libellé normalisé ; un type libre (« other »)
 * est accepté si l'organisateur a coché « Autres » ou saisi le même texte libre.
 */
export function eventAcceptsVendorType(
  vendorTypes: readonly string[],
  type: VendorTypeCode,
  customType?: string | null,
): boolean {
  if (vendorTypes.length === 0) return false;
  if (type !== "other") return vendorTypes.some((v) => vendorCodeOf(v) === type);
  const mine = customType ? normalizeVendorText(customType) : "";
  return vendorTypes.some((v) => {
    const code = vendorCodeOf(v);
    if (code === "other") return true;
    return code === null && mine !== "" && normalizeVendorText(v) === mine;
  });
}

/** Types libres (« + ») de l'événement, hors codes connus. */
export function customVendorTypes(vendorTypes: readonly string[]): string[] {
  return vendorTypes.filter((v) => vendorCodeOf(v) === null);
}

/** Photos du profil prestataire (comme `vehicle_photos`). */
export const PROVIDER_MAX_PHOTOS = 8;

/** Notifications de décision d'un prestataire : sa liste d'attente est manuelle, son écran n'est pas « Accès ». */
export const providerWaitlistNote = "L'organisateur te recontactera s'il y a de la place pour toi.";
export const providerApplicationsLink = { label: "Voir mes candidatures", path: "/app/prestataire" } as const;
export const providerTypeChangeBlocked =
  "Tu as une candidature en cours : retire-la ou attends la fin de l'événement pour changer d'activité.";

export type ProviderProfileDraft = {
  name: string;
  type: VendorTypeCode | null;
  photosCount: number;
  instagram: string | null;
  portfolioUrl: string | null;
};

/**
 * Profil complet pour candidater (§ 6.2) : nom, type, au moins une photo ou, pour un photographe, un Instagram ou un
 * portfolio. Renvoie le premier manque, ou `null`.
 */
export function providerProfileIssue(p: ProviderProfileDraft): string | null {
  if (!p.name.trim()) return "Indique le nom de ton activité.";
  if (!p.type) return "Choisis ton type d'activité.";
  const hasLink = Boolean(p.instagram?.trim() || p.portfolioUrl?.trim());
  if (p.photosCount === 0 && !(p.type === "photographer" && hasLink)) {
    return p.type === "photographer"
      ? "Ajoute une photo, ton Instagram ou ton portfolio."
      : "Ajoute au moins une photo de ton activité.";
  }
  return null;
}

/** L'accréditation « média officiel » ne concerne que les photographes retenus. */
export function canAccredit(provider: { type: VendorTypeCode }, status: string): boolean {
  return provider.type === "photographer" && status === "accepted";
}

// --- Prestataires v2 (lot 46, ARCHITECTURE-DA-V2 § 5.2) : missions, emplacement, vitrine, avis --------------------

/** Électricité : besoin d'un prestataire (vitrine) ou ce que fournit l'organisateur (mission). */
export const providerPowers = ["none", "a16", "a32", "generator_ok"] as const;
export type ProviderPower = (typeof providerPowers)[number];

/** Menu de la vitrine : 40 lignes au plus, libellé ≤ 60 caractères. */
export const PROVIDER_MENU_MAX_LINES = 40;
export const PROVIDER_MENU_LABEL_MAX = 60;
/** Rayon d'intervention par défaut (km) : celui du prototype (`s-vitrine`, « Jusqu'à 80 km »). */
export const PROVIDER_DEFAULT_RADIUS_KM = 80;
/** Besoin d'un événement : 1 à 9 prestataires du même métier. */
export const EVENT_NEED_MAX_QUANTITY = 9;

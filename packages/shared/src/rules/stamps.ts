// Passeport et tampons (lot 49, ARCHITECTURE-DA-V2 § 5.5, prototype DA v2 `s-passport`) : un tampon par événement
// pointé. La forme suit le format, l'encre suit le département, l'usure (angle, pression, bavure) est tirée d'un aléa
// déterministe dessiné par le client ; les rares sont en dorure. Fonctions pures, communes à l'API, au site et à l'appli.
import type { EventFormat } from "../enums";

/** Tampons ordinaires (au pointage, au scan d'un billet, à la présence du staff) puis rares (évalués au règlement). */
export const stampKinds = [
  "participation",
  "visit",
  "staff",
  "first_outing",
  "tenth_event",
  "full_moon",
  "audience_prize",
] as const;
export type StampKind = (typeof stampKinds)[number];

/** Les rares, en dorure : première sortie, 10e événement, nuit de pleine lune, prix du public. */
export const rareStampKinds = [
  "first_outing",
  "tenth_event",
  "full_moon",
  "audience_prize",
] as const satisfies readonly StampKind[];
/** Les tampons d'une présence (un par événement et par façon d'y être venu). */
export const baseStampKinds = ["participation", "visit", "staff"] as const satisfies readonly StampKind[];

export function isRare(kind: StampKind): boolean {
  return (rareStampKinds as readonly StampKind[]).includes(kind);
}

export const stampShapes = ["round", "rect", "octagon", "cup"] as const;
export type StampShape = (typeof stampShapes)[number];

/**
 * « Rond pour un rassemblement, rectangle pour une expo, octogone pour une nocturne, tasse pour un cars & coffee »
 * (prototype). Salon → rectangle (ARCHITECTURE-DA-V2 § 5.5) ; portes ouvertes → rectangle (choix du lot 49 : un lieu
 * qui reçoit, comme une expo).
 */
const SHAPE_BY_FORMAT: Record<EventFormat, StampShape> = {
  gathering: "round",
  exhibition: "rect",
  show: "rect",
  open_house: "rect",
  night: "octagon",
  cars_and_coffee: "cup",
};

export function stampShape(format: EventFormat): StampShape {
  return SHAPE_BY_FORMAT[format];
}

/**
 * Départements qui ont leur encre (`stamp-ink-<dept>` de `packages/design-system/tokens.v2.json`, lot 38) ; les autres
 * prennent `stamp-ink-default`. Une encre ajoutée aux jetons s'ajoute ici (un test compare les deux listes).
 */
export const STAMP_INK_DEPARTMENTS = ["66", "34", "31", "11"] as const;
export type StampInk = (typeof STAMP_INK_DEPARTMENTS)[number] | "default";

/** Encre d'un tampon : le département de l'événement s'il a la sienne, sinon `default`. */
export function stampInk(department: string | null | undefined): StampInk {
  return (STAMP_INK_DEPARTMENTS as readonly string[]).includes(department ?? "") ? (department as StampInk) : "default";
}

/** Nom du jeton de couleur de l'encre (`stamp-ink-66`, `stamp-ink-default`). */
export function stampInkToken(ink: StampInk): `stamp-ink-${StampInk}` {
  return `stamp-ink-${ink}`;
}

/** Aléa d'usure 0–9999 (angle, pression, bavure), toujours le même pour une personne, un événement et un genre. */
export const STAMP_SEED_MAX = 10_000;

export function stampSeed(userId: string, eventId: string, kind: StampKind = "participation"): number {
  // FNV-1a 32 bits : stable entre l'API, le site et l'appli, sans dépendance.
  let h = 0x811c9dc5;
  for (const ch of `${userId}:${eventId}:${kind}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % STAMP_SEED_MAX;
}

/**
 * Usure dérivée de l'aléa, pour que le site et l'appli dessinent le même tampon : angle −14° à +14°, pression 0,62 à 1
 * (opacité de l'encre), bavure 0 à 1 (flou du bord).
 */
export function stampWear(seed: number): { angle: number; pressure: number; smudge: number } {
  const a = seed % 100;
  const b = Math.floor(seed / 100) % 100;
  return {
    angle: Math.round(((a / 99) * 28 - 14) * 10) / 10,
    pressure: Math.round((0.62 + (b / 99) * 0.38) * 100) / 100,
    smudge: Math.round(((seed % 37) / 36) * 100) / 100,
  };
}

/** Pages du passeport : 8 tampons par page (prototype). */
export const PASSPORT_PAGE_SIZE = 8;

export function passportPages<T>(stamps: readonly T[], size = PASSPORT_PAGE_SIZE): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < stamps.length; i += size) pages.push(stamps.slice(i, i + size));
  return pages.length ? pages : [[]];
}

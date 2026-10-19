// Casquettes de l'appli (lot 16, ARCHITECTURE-SUITE § 7.1 ; six profils depuis le lot 40, ARCHITECTURE-DA-V2 § 3.1) :
// logique pure, sans React, testée seule. Une casquette = un groupe de routes Expo Router et une barre de cinq onglets
// (`tabSets` du système de design). La première casquette est l'exposant (`fan`, au moins un véhicule actif) **ou** le
// visiteur (`visitor`, sans véhicule), jamais les deux (V5) : c'est la « casquette de base », toujours là.
import type { TabSetName } from "@orasso/design-system";
import type { PersonaEntry, PersonaKind } from "@orasso/shared";
import { personaKindLabels as sharedKindLabels } from "@orasso/shared";

/**
 * Casquettes de l'appli : celles de `GET /me` → `personas` (exposant ou visiteur, organisateur, pro, prestataire, média)
 * et, lot 35d, l'Administration (modérateur et super admin), que l'appli ajoute elle-même d'après le rôle du compte.
 */
export type AppPersonaKind = PersonaKind | "admin";

/** Une ligne de casquette de l'appli. `assisted` : structure survolée en mode assistance (super admin, lot 35d), jamais renvoyée par l'API. */
export type AppPersonaEntry = Omit<PersonaEntry, "kind"> & { kind: AppPersonaKind; assisted?: boolean };

export type Persona =
  | { kind: "fan" }
  | { kind: "visitor" }
  | { kind: "organizer"; structureId: string }
  | { kind: "pro"; proProfileId: string }
  | { kind: "provider" }
  | { kind: "media"; mediaProfileId: string }
  | { kind: "admin" };

/** Les deux casquettes de base (une seule à la fois, selon les véhicules actifs). */
export type BaseKind = "fan" | "visitor";
export type BasePersona = { kind: BaseKind };

export const FAN: Persona = { kind: "fan" };
export const VISITOR: Persona = { kind: "visitor" };

/** L'exposant : ce qu'on suppose tant que l'API n'a pas répondu (ou avec un profil mis en cache avant le lot 16). */
export const FAN_ENTRY: AppPersonaEntry = { kind: "fan", id: "fan", label: "Passionné", logoUrl: null, badge: 0 };

/** Noms des profils : ceux du prototype (`@orasso/shared`, lot 38), plus l'Administration propre à l'appli. */
export const personaKindLabels: Record<AppPersonaKind, string> = { ...sharedKindLabels, admin: "Administration" };

/** Groupe de routes Expo Router de chaque casquette (`app/<groupe>/`). */
export const personaGroups: Record<AppPersonaKind, string> = {
  fan: "(tabs)",
  visitor: "(visitor)",
  media: "(media)",
  organizer: "(orga)",
  pro: "(pro)",
  provider: "(provider)",
  admin: "(admin)",
};

/** Barre de chaque casquette (`tabSets` v2 du système de design) ; l'Administration garde la sienne. */
export const personaTabSets: Record<Exclude<AppPersonaKind, "admin">, Exclude<TabSetName, "fan">> = {
  fan: "exhibitor",
  visitor: "visitor",
  pro: "pro",
  provider: "provider",
  media: "media",
  organizer: "organizer",
};

/**
 * Les cinq onglets de chaque casquette, dans l'ordre de la barre : nom de la route (fichier du groupe) → identifiant
 * d'onglet de `tabSets`. Le troisième est l'onglet central (le O) : Accueil, ou Direct pour l'organisateur.
 */
export const personaTabs = {
  fan: { explorer: "explore", sorties: "outings", accueil: "home", garage: "garage", profil: "profile" },
  visitor: { explorer: "explore", sorties: "outings", accueil: "home", passeport: "passport", profil: "profile" },
  pro: { scanner: "scanner", fiche: "card", accueil: "home", stats: "stats", profil: "profile" },
  provider: {
    missions: "missions",
    candidatures: "applications",
    accueil: "home",
    vitrine: "showcase",
    profil: "profile",
  },
  media: { explorer: "explore", presse: "press", accueil: "home", contenus: "contents", profil: "profile" },
  organizer: { evenements: "events", tri: "sort", direct: "live", equipe: "team", structure: "structure" },
} as const satisfies Record<Exclude<AppPersonaKind, "admin">, Record<string, string>>;

/** Premier écran de chaque casquette : l'onglet central de sa barre. */
export const personaHomes = {
  fan: "/(tabs)/accueil",
  visitor: "/(visitor)/accueil",
  media: "/(media)/accueil",
  organizer: "/(orga)/direct",
  pro: "/(pro)/accueil",
  provider: "/(provider)/accueil",
  admin: "/(admin)/administration",
} as const satisfies Record<AppPersonaKind, string>;

export function homeOf(persona: Persona): (typeof personaHomes)[AppPersonaKind] {
  return personaHomes[persona.kind];
}

/**
 * Où ouvrir une casquette (lancement, changement de casquette sans destination) : son Accueil, sauf tant qu'il est
 * « Bientôt » (lot 43) — le Scanner pour le pro, les Candidatures pour le prestataire. Le logotype mène toujours à
 * l'Accueil (`homeOf`).
 */
export function landingOf(persona: Persona): string {
  if (persona.kind === "pro") return "/(pro)/scanner";
  if (persona.kind === "provider") return "/(provider)/candidatures";
  return homeOf(persona);
}

/** Chemin d'un onglet de la casquette (`/(visitor)/sorties`), `null` si sa barre n'a pas cet onglet. */
export function tabHref(kind: AppPersonaKind, route: string): string | null {
  if (kind === "admin") return null;
  return route in personaTabs[kind] ? `/${personaGroups[kind]}/${route}` : null;
}

/** Est-ce une casquette de base (exposant ou visiteur) ? */
export function isBaseKind(kind: AppPersonaKind): kind is BaseKind {
  return kind === "fan" || kind === "visitor";
}

/** La casquette de base du compte : celle que renvoie l'API en premier (exposant par défaut, avant la réponse). */
export function baseOf(entries: readonly AppPersonaEntry[]): BasePersona {
  return entries.some((entry) => entry.kind === "visitor") ? { kind: "visitor" } : { kind: "fan" };
}

/** Casquette correspondant à une ligne de `GET /me` → `personas`. */
export function personaOfEntry(entry: AppPersonaEntry): Persona {
  switch (entry.kind) {
    case "organizer":
      return { kind: "organizer", structureId: entry.id };
    case "pro":
      return { kind: "pro", proProfileId: entry.id };
    case "media":
      return { kind: "media", mediaProfileId: entry.id };
    case "provider":
      return { kind: "provider" };
    case "admin":
      return { kind: "admin" };
    case "visitor":
      return VISITOR;
    default:
      return FAN;
  }
}

/** La ligne de `personas` que désigne cette casquette, `undefined` si elle n'existe plus. */
export function entryOfPersona(persona: Persona, entries: readonly AppPersonaEntry[]): AppPersonaEntry | undefined {
  return entries.find((entry) => {
    if (entry.kind !== persona.kind) return false;
    if (persona.kind === "organizer") return entry.id === persona.structureId;
    if (persona.kind === "pro") return entry.id === persona.proProfileId;
    if (persona.kind === "media") return entry.id === persona.mediaProfileId;
    return true;
  });
}

/**
 * Casquette à utiliser : la mémorisée si elle existe encore dans les casquettes du compte, sinon la casquette de base.
 * Un exposant mémorisé qui n'a plus de véhicule devient visiteur, et un visiteur qui en ajoute un devient exposant.
 */
export function resolvePersona(stored: Persona | null, entries: readonly AppPersonaEntry[]): Persona {
  const base = baseOf(entries);
  if (!stored || isBaseKind(stored.kind)) return base;
  return entryOfPersona(stored, entries) ? stored : base;
}

/** La casquette active est-elle cette ligne ? */
export function isActive(persona: Persona, entry: AppPersonaEntry): boolean {
  const found = entryOfPersona(persona, [entry]);
  return found !== undefined;
}

/** Total des pastilles « à traiter » des **autres** casquettes (celle qui est active ne compte pas). */
export function otherBadges(persona: Persona, entries: readonly AppPersonaEntry[]): number {
  return entries.reduce((sum, entry) => sum + (isActive(persona, entry) ? 0 : entry.badge), 0);
}

/** Groupe de routes que désigne le premier segment de l'URL, `null` si ce n'est pas un groupe de casquette. */
export function kindOfSegment(segment: string | undefined): AppPersonaKind | null {
  const found = (Object.entries(personaGroups) as [AppPersonaKind, string][]).find(([, group]) => group === segment);
  return found ? found[0] : null;
}

/**
 * Faut-il rediriger ? Vrai si l'URL est dans le groupe d'une autre casquette que l'active (retour arrière, lien
 * profond, casquette changée ailleurs, véhicule ajouté). Les écrans hors groupe (événement, candidature, jour J, Boîte…)
 * servent toutes les casquettes.
 */
export function misplacedGroup(persona: Persona, firstSegment: string | undefined): boolean {
  const kind = kindOfSegment(firstSegment);
  return kind !== null && kind !== persona.kind;
}

/**
 * Où rediriger quand l'URL est dans le groupe d'une autre casquette (`null` sinon). Exposant ↔ visiteur (la casquette
 * de base a changé : véhicule ajouté ou archivé) : le même onglet dans la nouvelle barre s'il existe, sinon son
 * Profil — on ne jette pas la personne sur l'Accueil. Autres cas : l'écran d'ouverture de la casquette active.
 */
export function misplacedTarget(persona: Persona, segments: readonly string[]): string | null {
  const from = kindOfSegment(segments[0]);
  if (from === null || from === persona.kind) return null;
  // Le même onglet existe dans la barre active : on y va. Les chemins des groupes ne portent pas le groupe (`/explorer`
  // existe chez l'exposant, le visiteur et le média) : un lien profond ou un rechargement peut tomber dans le groupe
  // d'une autre casquette.
  const same = tabHref(persona.kind, segments[1] ?? "");
  if (same) return same;
  if (isBaseKind(from) && isBaseKind(persona.kind)) return tabHref(persona.kind, "profil");
  return landingOf(persona);
}

export function serializePersona(persona: Persona): string {
  return JSON.stringify(persona);
}

/** Relit la casquette mémorisée ; toute valeur illisible vaut « pas de casquette mémorisée ». */
export function parsePersona(raw: string | null): Persona | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (v.kind === "fan") return FAN;
    if (v.kind === "visitor") return VISITOR;
    if (v.kind === "organizer" && typeof v.structureId === "string")
      return { kind: "organizer", structureId: v.structureId };
    if (v.kind === "pro" && typeof v.proProfileId === "string") return { kind: "pro", proProfileId: v.proProfileId };
    if (v.kind === "media" && typeof v.mediaProfileId === "string")
      return { kind: "media", mediaProfileId: v.mediaProfileId };
    if (v.kind === "provider") return { kind: "provider" };
    if (v.kind === "admin") return { kind: "admin" };
  } catch {
    // Valeur abîmée : on repart de la casquette de base.
  }
  return null;
}

/** Initiale à afficher dans l'avatar quand la casquette n'a pas de logo. */
export function initialOf(entry: AppPersonaEntry): string {
  return entry.label.trim().charAt(0).toUpperCase() || "?";
}

/** Où mène un ancien chemin d'onglet (liens profonds, notifications) : la route de l'onglet qui l'a remplacé. */
export const legacyTabRoutes: Record<string, string> = {
  acces: "sorties",
  moi: "profil",
};

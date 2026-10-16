// Casquettes de l'appli (lot 16, ARCHITECTURE-SUITE § 7.1) : logique pure, sans React, testée seule.
// Une casquette = un groupe de routes Expo Router et une barre d'onglets (`tabSets`). Le passionné est toujours là.
import type { PersonaEntry, PersonaKind } from "@orasso/shared";

export type Persona =
  | { kind: "fan" }
  | { kind: "organizer"; structureId: string }
  | { kind: "pro"; proProfileId: string }
  | { kind: "provider" };

export const FAN: Persona = { kind: "fan" };

/** Le passionné seul : ce qu'on suppose tant que l'API n'a pas répondu (ou avec un profil mis en cache avant le lot 16). */
export const FAN_ENTRY: PersonaEntry = { kind: "fan", id: "fan", label: "Passionné", logoUrl: null, badge: 0 };

export const personaKindLabels: Record<PersonaKind, string> = {
  fan: "Passionné",
  organizer: "Organisateur",
  pro: "Professionnel",
  provider: "Prestataire",
};

/** Groupe de routes Expo Router de chaque casquette (`app/<groupe>/`). */
export const personaGroups: Record<PersonaKind, string> = {
  fan: "(tabs)",
  organizer: "(orga)",
  pro: "(pro)",
  provider: "(provider)",
};

/** Premier écran de chaque casquette (l'onglet par défaut de sa barre). */
export const personaHomes = {
  fan: "/(tabs)/accueil",
  organizer: "/(orga)/direct",
  pro: "/(pro)/scanner",
  provider: "/(provider)/candidatures",
} as const satisfies Record<PersonaKind, string>;

export function homeOf(persona: Persona): (typeof personaHomes)[PersonaKind] {
  return personaHomes[persona.kind];
}

/** Casquette correspondant à une ligne de `GET /me` → `personas`. */
export function personaOfEntry(entry: PersonaEntry): Persona {
  switch (entry.kind) {
    case "organizer":
      return { kind: "organizer", structureId: entry.id };
    case "pro":
      return { kind: "pro", proProfileId: entry.id };
    case "provider":
      return { kind: "provider" };
    default:
      return FAN;
  }
}

/** La ligne de `personas` que désigne cette casquette, `undefined` si elle n'existe plus. */
export function entryOfPersona(persona: Persona, entries: readonly PersonaEntry[]): PersonaEntry | undefined {
  return entries.find((entry) => {
    if (entry.kind !== persona.kind) return false;
    if (persona.kind === "organizer") return entry.id === persona.structureId;
    if (persona.kind === "pro") return entry.id === persona.proProfileId;
    return true;
  });
}

/** Casquette à utiliser : la mémorisée si elle existe encore dans les casquettes du compte, sinon le passionné. */
export function resolvePersona(stored: Persona | null, entries: readonly PersonaEntry[]): Persona {
  if (!stored || stored.kind === "fan") return FAN;
  return entryOfPersona(stored, entries) ? stored : FAN;
}

/** La casquette active est-elle cette ligne ? */
export function isActive(persona: Persona, entry: PersonaEntry): boolean {
  const found = entryOfPersona(persona, [entry]);
  return found !== undefined;
}

/** Total des pastilles « à traiter » des **autres** casquettes (celle qui est active ne compte pas). */
export function otherBadges(persona: Persona, entries: readonly PersonaEntry[]): number {
  return entries.reduce((sum, entry) => sum + (isActive(persona, entry) ? 0 : entry.badge), 0);
}

/** Groupe de routes que désigne le premier segment de l'URL, `null` si ce n'est pas un groupe de casquette. */
export function kindOfSegment(segment: string | undefined): PersonaKind | null {
  const found = (Object.entries(personaGroups) as [PersonaKind, string][]).find(([, group]) => group === segment);
  return found ? found[0] : null;
}

/**
 * Faut-il rediriger ? Vrai si l'URL est dans le groupe d'une autre casquette que l'active (retour arrière, lien
 * profond, casquette changée ailleurs). Les écrans hors groupe (Moi, événement, candidature, jour J…) servent toutes
 * les casquettes.
 */
export function misplacedGroup(persona: Persona, firstSegment: string | undefined): boolean {
  const kind = kindOfSegment(firstSegment);
  return kind !== null && kind !== persona.kind;
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
    if (v.kind === "organizer" && typeof v.structureId === "string")
      return { kind: "organizer", structureId: v.structureId };
    if (v.kind === "pro" && typeof v.proProfileId === "string") return { kind: "pro", proProfileId: v.proProfileId };
    if (v.kind === "provider") return { kind: "provider" };
  } catch {
    // Valeur abîmée : on repart du passionné.
  }
  return null;
}

/** Initiale à afficher dans l'avatar quand la casquette n'a pas de logo. */
export function initialOf(entry: PersonaEntry): string {
  return entry.label.trim().charAt(0).toUpperCase() || "?";
}

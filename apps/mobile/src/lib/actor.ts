// L'acteur d'un appel (lot R9n, ARCHITECTURE-R8 § 2.9) : « moi », ou la page dont la casquette est active, désignée par la clé
// d'auteur de l'en-tête `X-Orasso-Actor` (`s:` structure, `p:` fiche pro, `v:` prestataire, `m:` média). Le passionné, le
// visiteur, l'administration et le survol en assistance (une structure qui n'est pas la sienne) n'agissent jamais au nom d'une
// page : clé nulle, pas d'en-tête. Le serveur ne croit pas l'en-tête (il relit les droits) ; ce fichier ne fait que le poser.
import { authorKeyOfPersona } from "@orasso/shared";

import { type AppPersonaEntry, entryOfPersona, type Persona } from "./personaModel";

/** La clé d'auteur de la casquette active, `null` quand on agit en son propre nom. */
export function actorKeyOf(persona: Persona, entries: readonly AppPersonaEntry[]): string | null {
  if (persona.kind === "fan" || persona.kind === "visitor" || persona.kind === "admin") return null;
  const entry = entryOfPersona(persona, entries);
  // Une structure suspendue (`suspended`, R9n tour 1) reste une casquette mais on ne lit ni n'agit au nom de sa page : pas d'en-tête.
  if (!entry || entry.assisted || entry.suspended) return null;
  return authorKeyOfPersona({ kind: entry.kind, id: entry.id });
}

/** Un 403 `persona_forbidden` concerne-t-il toujours la casquette active ? (un refus tardif d'une casquette quittée ne compte pas) */
export const forbiddenIsCurrent = (refused: string, persona: Persona, entries: readonly AppPersonaEntry[]): boolean =>
  actorKeyOf(persona, entries) === refused;

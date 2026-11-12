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
  if (!entry || entry.assisted) return null;
  return authorKeyOfPersona({ kind: entry.kind, id: entry.id });
}

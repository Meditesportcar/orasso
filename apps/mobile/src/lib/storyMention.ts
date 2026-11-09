// « Ajouter à ma story » depuis une ligne d'Activité (lot R7h, tour 2) : la structure visée est celle de la mention
// (`data.structureId`), jamais la structure active du moment, et seulement si la personne la gère (casquette organisateur :
// propriétaire ou co-organisateur). Sinon `null` : le bouton n'apparaît pas.
export function mentionStructure(
  personas: readonly { kind: string; id?: string; assisted?: boolean }[],
  structureId: string | null,
): string | null {
  if (!structureId) return null;
  return personas.some((p) => p.kind === "organizer" && !p.assisted && p.id === structureId) ? structureId : null;
}

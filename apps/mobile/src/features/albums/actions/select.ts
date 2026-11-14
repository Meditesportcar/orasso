// Quelles actions la visionneuse d'un album propose (fonction pure, testée sans l'interface). Deux sources distinctes :
// - les actions du **rôle** R9f (`tagViewerActions`) : le rôle de `albumViewerRoleOf` suit les droits du compte, pas la casquette ;
// - les actions de l'**organisateur** R9g (reprise, album officiel) : seulement si la casquette active est celle de l'événement (prop `organizer`).
// Le rôle `organizer` seul n'ouvre donc jamais une action R9g ; et une action n'est rendue qu'une fois (par `id`).
type Selectable<R extends string> = { id: string; roles: readonly R[] };

export function selectViewerActions<R extends string, A extends Selectable<R>>(
  byRole: readonly A[],
  organizerOnly: readonly A[],
  role: R,
  organizer: boolean,
  organizerRole: R,
): A[] {
  const picked = [
    ...byRole.filter((a) => a.roles.includes(role)),
    ...(organizer ? organizerOnly.filter((a) => a.roles.includes(organizerRole)) : []),
  ];
  return picked.filter((a, i) => picked.findIndex((b) => b.id === a.id) === i);
}

// Catalogue des styles de l'administration (lot R5a, tour 2) : la file « Styles proposés » se lit par pages de 50
// groupes ; « Charger la suite » ajoute la page suivante sans doublon (un groupe déjà montré n'est pas répété).

/** Les groupes déjà montrés, puis ceux de la page suivante qui n'y sont pas encore. */
export function mergeProposalPages<T extends { key: string }>(shown: readonly T[], next: readonly T[]): T[] {
  const keys = new Set(shown.map((g) => g.key));
  return [...shown, ...next.filter((g) => !keys.has(g.key))];
}

// Le libellé d'un onglet souligné (lot R8x) : « Événements · 7 » quand le nombre est connu ; jamais « · 0 » pour un nombre
// inconnu (`null`, `undefined`, pas un nombre fini : chargement en cours).
export function underTabLabel(label: string, count?: number | null): string {
  return typeof count === "number" && Number.isFinite(count) ? `${label} · ${count}` : label;
}

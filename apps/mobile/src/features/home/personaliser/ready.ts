// « Personnaliser » : peut-on éditer ? Seulement à partir du réglage FRAIS du compte (tour 2). Tant qu'il n'est pas arrivé
// (réseau lent, hors ligne, échec), les gestes et « Enregistrer » sont éteints : on ne part jamais des valeurs par défaut
// ni d'un cache, sinon un seul bloc masqué écraserait tout le réglage du compte.
export type PersonalizeReadiness = "loading" | "failed" | "ready";

export function personalizeReadiness(settings: {
  data: unknown | null;
  error: unknown | null;
  loading: boolean;
}): PersonalizeReadiness {
  if (settings.data) return "ready";
  return settings.error || !settings.loading ? "failed" : "loading";
}

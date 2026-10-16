/** Chaîne de requête à partir des paramètres renseignés (les vides sont omis). */
export const qs = (params: Record<string, string | number | undefined | null>) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return entries.length ? `?${entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}` : "";
};

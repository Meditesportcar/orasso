// Adresse de l'API, réglée par EXPO_PUBLIC_API_URL (ex. http://192.168.1.20:3001 en dev, https://dev.orasso.fr en test).
const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${baseUrl}${path}`;
}

/** Adresse du site (liens vers les pages web : créer une structure, clés d'accès…). Même hôte que l'API en ligne ; en local, EXPO_PUBLIC_SITE_URL. */
const siteBase = (process.env.EXPO_PUBLIC_SITE_URL ?? baseUrl).replace(/\/$/, "");

export function siteUrl(path: string): string {
  return `${siteBase}${path}`;
}

// Adresse de l'API, réglée par EXPO_PUBLIC_API_URL (ex. http://192.168.1.20:3001 en dev, https://dev.orasso.fr en test).
const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${baseUrl}${path}`;
}

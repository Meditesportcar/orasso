// Les URLs de fichiers de l'API (`/api/files/…`) sont relatives à l'hôte de l'API.
import { apiUrl } from "@/api";

/** Source d'image pour `Photo` ; `undefined` si la photo n'existe pas. */
export function mediaSource(url: string | null | undefined): { uri: string } | undefined {
  if (!url) return undefined;
  return { uri: /^https?:/.test(url) ? url : apiUrl(url) };
}

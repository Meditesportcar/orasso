// Liens des éléments du Journal et des notifications (lot 17) : seulement des écrans de l'appli connus (événement,
// profil, véhicule d'un autre). Jamais un chemin du site (`/app/acces`…) ni une adresse externe.
const APP_LINK = /^\/(e|u|v)\/[^/?#\s]+$/;

export function appLinkOf(value: unknown): string | null {
  return typeof value === "string" && APP_LINK.test(value) ? value : null;
}

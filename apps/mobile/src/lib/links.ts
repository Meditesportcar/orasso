// Liens des éléments du Journal et des notifications (lot 17) : seulement des écrans de l'appli connus (événement,
// profil, véhicule d'un autre). Jamais un chemin du site (`/app/acces`…) ni une adresse externe.
const APP_LINK = /^\/(e|u|v)\/[^/?#\s]+$/;
/**
 * Boîte (lot 18) : `/app/boite/<id>` (conversation) et `/app/boite/demandes` du site → écrans de l'appli. L'onglet Boîte
 * du passionné se nomme avec son groupe : `/boite` existe aussi dans les casquettes Organisateur et Prestataire.
 */
const INBOX_LINK = /^\/app\/boite(?:\/([0-9a-f-]{36}|demandes))?$/;

/** Lien d'avis d'un remerciement (lot 27) : `/app/acces?avis=<candidature>` → la feuille d'avis de l'onglet Accès. */
const REVIEW_LINK = /^\/app\/acces\?avis=([0-9a-f-]{36})$/;

export function appLinkOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (APP_LINK.test(value)) return value;
  const review = REVIEW_LINK.exec(value);
  if (review) return `/(tabs)/acces?avis=${review[1]}`;
  const inbox = INBOX_LINK.exec(value);
  if (inbox) return inbox[1] && inbox[1] !== "demandes" ? `/boite/${inbox[1]}` : "/(tabs)/boite";
  return null;
}

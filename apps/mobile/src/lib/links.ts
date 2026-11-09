// Liens des éléments du Journal et des notifications (lot 17) : seulement des écrans de l'appli connus (événement,
// profil, véhicule d'un autre). Jamais un chemin du site (`/app/acces`…) ni une adresse externe.
const APP_LINK = /^\/(e|u|v)\/[^/?#\s]+$/;
/**
 * Activité et Messages (lot R7c2, la Boîte a disparu) : `/app/activite[/demandes]` et `/app/messages[/demandes|/<id>]` du
 * site → `/activite…` et `/messages…`. Les anciennes adresses de la Boîte (`/app/boite[/demandes|/<id>]`, `/app/journal`),
 * gardées dans des notifications déjà envoyées, y mènent aussi.
 */
const INBOX_LINK = /^\/app\/(boite|messages|activite)(?:\/([0-9a-f-]{36}|demandes))?$/;

/** Écran de l'appli d'une adresse du site de l'Activité, des Messages ou de l'ancienne Boîte ; `null` si ce n'en est pas une. */
export function inboxPathOf(pathname: string): string | null {
  if (pathname === "/app/journal") return "/activite";
  const m = INBOX_LINK.exec(pathname);
  if (!m) return null;
  const [, area, rest] = m;
  if (area === "activite") return rest === undefined ? "/activite" : rest === "demandes" ? "/activite/demandes" : null;
  if (area === "messages") {
    return rest === undefined ? "/messages" : rest === "demandes" ? "/messages/demandes" : `/messages/${rest}`;
  }
  // Ancienne Boîte du site : `/app/boite` était la liste des messages, `/app/boite/demandes` les demandes, `/app/boite/<id>` une conversation.
  return rest === undefined ? "/messages" : rest === "demandes" ? "/activite/demandes" : `/messages/${rest}`;
}

/**
 * Lien d'avis d'un remerciement (lot 27) : `/app/acces?avis=<candidature>` → la feuille d'avis de l'onglet Sorties
 * (`/acces` y redirige depuis le lot 40).
 */
const REVIEW_LINK = /^\/app\/acces\?avis=([0-9a-f-]{36})$/;

/** Récap (lot 50, notifications `event_recap_ready` et `audience_prize_won`) et passeport (`stamp_received`). */
const RECAP_LINK = /^\/app\/recap\/([0-9a-f-]{36})$/;
const PASSPORT_LINK = "/app/passeport";
/** Lot R4c : « … et 2 autres personnes te suivent » mène aux abonnés (`/app/reseau` du site → `/reseau`). */
const NETWORK_LINK = "/app/reseau";
/**
 * Lot R5c2 : la page d'un crew (`/c/<adresse>` du site, `?onglet=sorties` pour une sortie du crew) → `/crew/<adresse>`.
 */
/** Lot R7i : un rendez-vous au spot (`/app/spot/<id>` du site, notification `spot_meetup_new` et `spot_meetup_reply`) → `/spot/<id>`. */
const SPOT_LINK = /^\/app\/spot\/([0-9a-f-]{36})$/;
const CREW_LINK = /^\/c\/([a-z0-9-]{1,80})(\?onglet=sorties)?$/;

export function appLinkOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (APP_LINK.test(value)) return value;
  const recap = RECAP_LINK.exec(value);
  if (recap) return `/recap/${recap[1]}`;
  if (value === PASSPORT_LINK) return "/mon-passeport";
  if (value === NETWORK_LINK) return "/reseau";
  const spot = SPOT_LINK.exec(value);
  if (spot) return `/spot/${spot[1]}`;
  const crew = CREW_LINK.exec(value);
  if (crew) return `/crew/${crew[1]}${crew[2] ?? ""}`;
  const review = REVIEW_LINK.exec(value);
  if (review) return `/acces?avis=${review[1]}`;
  return inboxPathOf(value);
}

/**
 * Notification « demande pour rejoindre le staff » (lot 24, `data.screen = "staff-requests"`) : la structure dont il
 * faut ouvrir l'écran Équipe (lot 35a). Sans identifiant valide, rien : la notification ne mène nulle part.
 */
export function teamRequestTarget(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const { screen, structureId } = data as Record<string, unknown>;
  if (screen !== "staff-requests") return null;
  return typeof structureId === "string" && /^[0-9a-f-]{36}$/i.test(structureId) ? structureId : null;
}

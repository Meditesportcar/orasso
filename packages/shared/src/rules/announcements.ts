// Système d'annonces unique de l'appli (lot M6, maquette 9.1, décision de Damien au retour 25) : tout ce qui arrive
// pendant qu'on utilise l'appli passe par un seul bandeau en haut de l'écran (même place, ~4 s, toucher = ouvrir,
// glisser = fermer). Deux tons : moutarde pour une bonne nouvelle, sobre pour une information. Règles pures, testées.
import { journalOnlyNotificationTypes } from "../enums";

/** Durée d'affichage du bandeau (la barre de temps se vide en autant). */
export const ANNOUNCE_MS = 4000;

export type AnnounceTone = "good" | "info";

/** Les bonnes nouvelles (bandeau moutarde) : retenue, place libérée, accréditation, certification, plaque… */
export const goodNewsNotificationTypes: readonly string[] = [
  "application_accepted",
  "offer_received",
  "accreditation_accepted",
  "certification_accepted",
  "crew_request_accepted",
  "plate_transfer_accepted",
  "provider_spot_assigned",
];

export const announceToneOf = (type: string): AnnounceTone =>
  goodNewsNotificationTypes.includes(type) ? "good" : "info";

/**
 * Une notification reçue pendant l'utilisation devient-elle un bandeau ? Non pour l'actualité du Journal (jamais
 * poussée), ni pour « Retenue » : l'appli l'annonce elle-même dès que la candidature passe « retenue » (avec
 * l'événement, la date et le véhicule), une seule fois par candidature.
 */
export function notificationAnnounced(type: string): boolean {
  if (journalOnlyNotificationTypes.includes(type)) return false;
  return type !== "application_accepted";
}

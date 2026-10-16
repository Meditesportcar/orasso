// Position de l'alerte du staff (lot 24, docs/01 : « une alerte prioritaire, avec la position »). Permission
// « pendant l'utilisation » seulement, demandée à l'ouverture du mode staff avec un texte explicatif, refusable. La
// position n'est lue qu'au moment où le staff touche « Envoyer l'alerte » ; elle n'est ni suivie, ni gardée par
// l'appli au-delà de l'envoi (effacée de la file dès l'alerte partie), ni envoyée ailleurs que dans l'alerte.
import * as Location from "expo-location";

export type LocationConsent = "undetermined" | "granted" | "denied";

/** État de la permission, sans rien demander. */
export async function locationConsent(): Promise<LocationConsent> {
  try {
    const p = await Location.getForegroundPermissionsAsync();
    return p.granted ? "granted" : p.canAskAgain ? "undetermined" : "denied";
  } catch {
    return "denied";
  }
}

/** Demande la permission (boîte du système) ; « refusée » n'empêche aucune alerte, elle part sans position. */
export async function askLocationConsent(): Promise<LocationConsent> {
  try {
    const p = await Location.requestForegroundPermissionsAsync();
    return p.granted ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

/** Délai maximal pour obtenir la position : une alerte urgente ne doit pas attendre un GPS capricieux. */
export const POSITION_TIMEOUT_MS = 3_000;

export type AlertPosition = { lat: number; lng: number };

/** Position de l'appareil à l'instant, si la permission est déjà accordée ; `null` sinon ou trop lent. Ne demande rien. */
export async function currentAlertPosition(timeoutMs = POSITION_TIMEOUT_MS): Promise<AlertPosition | null> {
  if ((await locationConsent()) !== "granted") return null;
  try {
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!fix) return null;
    // Précis (alerte : on doit retrouver la personne), arrondi à ~1 m.
    return { lat: Math.round(fix.coords.latitude * 1e5) / 1e5, lng: Math.round(fix.coords.longitude * 1e5) / 1e5 };
  } catch {
    return null;
  }
}

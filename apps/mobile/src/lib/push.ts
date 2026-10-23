// Notifications : l'autorisation se demande une seule fois, juste après une candidature (docs/01), jamais au premier
// lancement. L'appareil est enregistré auprès de l'API (avec son jeton Expo Push quand il existe).
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { api } from "./api";

export type PermissionState = "granted" | "denied" | "undetermined";

// Lot M6 (système d'annonces unique) : appli ouverte, la notification arrive par le bandeau de l'appli (ui/Announce),
// plus par la bannière du système en double ; elle reste dans le centre de notifications.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function notificationPermission(): Promise<PermissionState> {
  if (Platform.OS === "web") return "undetermined";
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status === "granted") return "granted";
    return status === "denied" && !canAskAgain ? "denied" : "undetermined";
  } catch {
    return "undetermined";
  }
}

/** Jeton Expo Push, s'il est disponible : il faut un projet EAS (lot 11) et une autorisation accordée. */
async function pushToken(): Promise<string | null> {
  if (Platform.OS === "web" || !Device.isDevice) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}

/** Enregistre cet appareil auprès de l'API (nécessaire aux appareils du staff, utile aux notifications). */
export async function registerThisDevice(): Promise<void> {
  const granted = (await notificationPermission()) === "granted";
  try {
    await api.registerDevice({
      platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web",
      expoPushToken: granted ? await pushToken() : null,
      name: Device.deviceName ?? Device.modelName ?? null,
      appVersion: Constants.expoConfig?.version ?? null,
    });
  } catch {
    // Hors ligne ou déjà enregistré : sans conséquence, repris au prochain lancement.
  }
}

/**
 * Lot M6, tour 3 (vie privée) : à la déconnexion (et avant d'ouvrir un autre compte), l'appareil se désinscrit des push
 * du compte : l'API retire son jeton (POST /me/devices/unregister). À appeler tant que la session est encore valide.
 * Sans jeton (web, Expo Go, autorisation refusée) : rien à retirer.
 */
export async function unregisterThisDevice(): Promise<void> {
  try {
    const token = await pushToken();
    if (token) await api.unregisterDevice({ expoPushToken: token });
  } catch {
    // Hors ligne : le destinataire opaque du push (recipient) empêche quand même toute annonce à un autre compte.
  }
}

/** Demande l'autorisation (fenêtre du système) puis enregistre l'appareil avec son jeton. */
export async function askNotificationPermission(): Promise<PermissionState> {
  if (Platform.OS === "web") return "undetermined";
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === "granted") {
      await registerThisDevice();
      return "granted";
    }
    return "denied";
  } catch {
    return "denied";
  }
}

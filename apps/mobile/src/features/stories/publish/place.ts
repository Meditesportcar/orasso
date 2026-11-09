// « Ma ville » pour le lieu d'une story (lot R7f3) : la ville du téléphone, lue au toucher, jamais gardée. Les coordonnées
// ne servent qu'à trouver le nom de la ville ici, sur l'appareil ; l'envoi ne contient que ce texte (`placeLabel`).
import { STORY_PLACE_MAX } from "@orasso/shared";
import * as Location from "expo-location";
import { Platform } from "react-native";

/** La ville où je suis, ou `null` (accès refusé, pas de réseau, navigateur). */
export async function currentCity(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") return null;
    const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const [place] = await Location.reverseGeocodeAsync({
      latitude: fix.coords.latitude,
      longitude: fix.coords.longitude,
    });
    const city = (place?.city ?? place?.subregion ?? place?.district ?? "").trim();
    return city ? city.slice(0, STORY_PLACE_MAX) : null;
  } catch {
    return null;
  }
}

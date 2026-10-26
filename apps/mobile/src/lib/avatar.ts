// Photo de profil : choisie dans la photothèque ou prise avec l'appareil (lot R5b, feuille « Ta photo de profil »),
// recadrée en carré, convertie en JPEG avant l'envoi (les photos HEIC d'iPhone ne passent pas partout ; l'API la
// recompresse en WebP 512 px).
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

export type PickedAvatar = { uri: string };

async function prepared(result: ImagePicker.ImagePickerResult): Promise<PickedAvatar | null> {
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > 1024) context.resize({ width: 1024 });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return { uri: saved.uri };
}

/** Ouvre la photothèque (recadrage carré) ; `null` si l'accès est refusé ou le choix annulé. */
export async function pickAvatar(): Promise<PickedAvatar | null> {
  return prepared(
    await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    }),
  );
}

/**
 * Lot R5b : « Prendre une photo », carrée, recadrée à l'étape suivante (recadreur du système). `null` si l'appareil est
 * refusé ou la prise annulée ; `"denied"` si la permission est refusée (l'écran le dit).
 */
export async function takeAvatar(): Promise<PickedAvatar | "denied" | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync().catch(() => null);
  if (permission && !permission.granted && Platform.OS !== "web") return "denied";
  return prepared(
    await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    }),
  );
}

/** Champ « avatar » du formulaire d'envoi (`POST /api/me/avatar`). */
export async function avatarForm(photo: PickedAvatar): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(photo.uri)).blob();
    form.append("avatar", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
  } else {
    form.append("avatar", { uri: photo.uri, name: "avatar.jpg", type: "image/jpeg" } as unknown as Blob);
  }
  return form;
}

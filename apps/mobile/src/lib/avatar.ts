// Photo de profil : choisie dans la photothèque, recadrée en carré, convertie en JPEG avant l'envoi (les photos HEIC
// d'iPhone ne passent pas partout ; l'API la recompresse en WebP 512 px).
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

export type PickedAvatar = { uri: string };

/** Ouvre la photothèque (recadrage carré) ; `null` si l'accès est refusé ou le choix annulé. */
export async function pickAvatar(): Promise<PickedAvatar | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > 1024) context.resize({ width: 1024 });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return { uri: saved.uri };
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

// Photos d'un véhicule : choisies dans la photothèque, converties en JPEG avant l'envoi (les photos HEIC d'iPhone
// ne passent pas partout ; l'API les recompresse en WebP), 8 au plus (règle de l'API).
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

export const MAX_PHOTOS = 8;
/** Côté le plus long envoyé : au-delà, la photo ne gagne rien à l'écran et pèse le triple. */
const MAX_SIDE = 2048;

export type PickedPhoto = { uri: string; width: number; height: number };

/** Cadres de recadrage (lot 36) : photo de véhicule (carte 4:3), logo (carré). */
export const CROP_VEHICLE: [number, number] = [4, 3];
export const CROP_SQUARE: [number, number] = [1, 1];

/**
 * Ouvre la photothèque ; liste vide si l'accès est refusé ou le choix annulé. Sans `crop` : plusieurs choix, sans
 * recadrage. Avec `crop` (lot 36) : une photo à la fois, recadrée dans le cadre donné par l'éditeur du système (le
 * recadrage n'existe pas en sélection multiple).
 */
export async function pickPhotos(limit: number, crop?: [number, number]): Promise<PickedPhoto[]> {
  if (limit <= 0) return [];
  const result = await ImagePicker.launchImageLibraryAsync(
    crop
      ? { mediaTypes: ["images"], allowsEditing: true, aspect: crop, quality: 1 }
      : { mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: limit, quality: 1 },
  );
  if (result.canceled) return [];
  const converted: PickedPhoto[] = [];
  for (const asset of result.assets.slice(0, limit)) converted.push(await toJpeg(asset));
  return converted;
}

async function toJpeg(asset: { uri: string; width: number; height: number }): Promise<PickedPhoto> {
  const context = ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(asset.width, asset.height);
  if (longest > MAX_SIDE) {
    context.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/**
 * Champ « photo » du formulaire d'envoi (`POST /api/me/vehicles/:id/photos`) ; `field: "logo"` pour le logo d'un pro
 * (`POST /api/pros/:id/logo`, lot 35c).
 */
export async function photoForm(
  photo: PickedPhoto,
  index: number,
  field: "photo" | "logo" = "photo",
): Promise<FormData> {
  const form = new FormData();
  const name = `${field}-${index + 1}.jpg`;
  if (Platform.OS === "web") {
    const blob = await (await fetch(photo.uri)).blob();
    form.append(field, new File([blob], name, { type: "image/jpeg" }));
  } else {
    // React Native accepte un objet { uri, name, type } à la place d'un fichier.
    form.append(field, { uri: photo.uri, name, type: "image/jpeg" } as unknown as Blob);
  }
  return form;
}

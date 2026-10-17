// Photo de la main courante (lot 24) : prise sur le terrain (appareil photo ou photothèque), gardée **sur le
// téléphone** tant que l'incident n'est pas parti (pas de réseau sur le parking), puis envoyée à son tour
// (`POST /me/uploads purpose=incident`, puis rattachement à l'incident) et effacée. Le fichier gardé est un JPEG réduit.
import { randomUUID } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

/** Côté le plus long gardé : assez pour une pièce d'assurance, léger à envoyer en 4G faible. */
const MAX_SIDE = 1600;

export type KeptPhoto = { uri: string };

/** Prend une photo (`camera`) ou en choisit une dans la photothèque ; `null` si refusé ou annulé. */
export async function takeIncidentPhoto(source: "camera" | "library"): Promise<KeptPhoto | null> {
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return null;
  }
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  return keepPhoto(asset);
}

/** Réduit la photo en JPEG et la copie dans le dossier de l'appli (le cache du sélecteur peut être vidé). */
export async function keepPhoto(asset: { uri: string; width: number; height: number }): Promise<KeptPhoto> {
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > MAX_SIDE) {
    context.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  // Navigateur (recette) : pas de dossier de l'appli, l'adresse du fichier travaillé suffit le temps de la session.
  if (Platform.OS === "web") return { uri: saved.uri };
  const folder = new Directory(Paths.document, "staff-photos");
  folder.create({ idempotent: true, intermediates: true });
  const target = new File(folder, `${randomUUID()}.jpg`);
  await new File(saved.uri).copy(target);
  return { uri: target.uri };
}

/** Formulaire d'envoi (`file` + `purpose`) d'une photo gardée sur le téléphone. */
export async function incidentPhotoForm(uri: string): Promise<FormData> {
  const form = new FormData();
  form.append("purpose", "incident");
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    // (`File` est ici celui d'expo-file-system : le fichier du navigateur est `globalThis.File`.)
    form.append("file", new globalThis.File([blob], "incident.jpg", { type: "image/jpeg" }));
  } else {
    // React Native accepte un objet { uri, name, type } à la place d'un fichier.
    form.append("file", { uri, name: "incident.jpg", type: "image/jpeg" } as unknown as Blob);
  }
  return form;
}

/** Efface la photo gardée une fois envoyée (ou refusée pour de bon). Sans effet si elle n'existe plus. */
export async function deleteLocalPhoto(uri: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Déjà effacée ou illisible : rien à faire.
  }
}

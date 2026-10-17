// Fichiers de la structure (lot 35a) : le logo (`POST /structures/:id/logo`, champ « logo ») et les justificatifs de
// vérification (`POST /structures/:id/verification/documents`, champs « file » et « kind »). Une photo choisie dans la
// photothèque, convertie en JPEG avant l'envoi (`pickPhotos`). Pas de sélecteur de PDF : aucune dépendance native de plus
// (le justificatif se photographie ou s'enregistre en image).
import { Platform } from "react-native";

import { type PickedPhoto, pickPhotos } from "./photos";

/** Ouvre la photothèque pour une seule image ; `null` si l'accès est refusé ou le choix annulé. */
export async function pickOneImage(): Promise<PickedPhoto | null> {
  const [photo] = await pickPhotos(1);
  return photo ?? null;
}

/** Formulaire d'envoi d'une image sous le champ donné, avec des champs texte en plus. */
export async function imageForm(
  photo: PickedPhoto,
  field: "logo" | "file",
  fileName: string,
  extra: Record<string, string> = {},
): Promise<FormData> {
  const form = new FormData();
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  if (Platform.OS === "web") {
    const blob = await (await fetch(photo.uri)).blob();
    form.append(field, new File([blob], fileName, { type: "image/jpeg" }));
  } else {
    // React Native accepte un objet { uri, name, type } à la place d'un fichier.
    form.append(field, { uri: photo.uri, name: fileName, type: "image/jpeg" } as unknown as Blob);
  }
  return form;
}

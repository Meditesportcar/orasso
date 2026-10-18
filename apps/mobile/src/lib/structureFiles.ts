// Fichiers de la structure (lot 35a) : le logo (`POST /structures/:id/logo`, champ « logo ») et les justificatifs de
// vérification (`POST /structures/:id/verification/documents`, champs « file » et « kind »). Une photo choisie dans la
// photothèque, convertie en JPEG avant l'envoi (`pickPhotos`), ou un PDF (lot 34, `expo-document-picker`).
import * as DocumentPicker from "expo-document-picker";
import { Platform } from "react-native";

import { type PickedPhoto, pickPhotos } from "./photos";

/** Une seule image (`crop` : recadrée dans ce cadre, lot 36) ; `null` si l'accès est refusé ou le choix annulé. */
export async function pickOneImage(crop?: [number, number]): Promise<PickedPhoto | null> {
  const [photo] = await pickPhotos(1, crop);
  return photo ?? null;
}

/** Formulaire d'envoi d'une image sous le champ donné, avec des champs texte en plus. */
export async function imageForm(
  photo: PickedPhoto,
  field: "logo" | "file" | "poster" | "image",
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

/** PDF choisi dans les fichiers du téléphone (justificatif de vérification, lot 34). */
export type PickedPdf = { uri: string; name: string; file?: File };

/** Ouvre le sélecteur de fichiers pour un seul PDF ; `null` si le choix est annulé. */
export async function pickOnePdf(): Promise<PickedPdf | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    multiple: false,
    copyToCacheDirectory: true,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const name = /\.pdf$/i.test(asset.name) ? asset.name : `${asset.name || "justificatif"}.pdf`;
  return { uri: asset.uri, name, file: asset.file };
}

/** Formulaire d'envoi d'un PDF sous le champ « file », avec des champs texte en plus. */
export async function pdfForm(pdf: PickedPdf, extra: Record<string, string> = {}): Promise<FormData> {
  const form = new FormData();
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  if (Platform.OS === "web") {
    const blob = pdf.file ?? (await (await fetch(pdf.uri)).blob());
    form.append("file", new File([blob], pdf.name, { type: "application/pdf" }));
  } else {
    form.append("file", { uri: pdf.uri, name: pdf.name, type: "application/pdf" } as unknown as Blob);
  }
  return form;
}

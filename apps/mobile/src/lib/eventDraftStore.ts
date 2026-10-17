// Brouillon de l'assistant d'événement gardé sur le téléphone (lot 35b) : un fichier JSON par structure dans le dossier
// de l'appli (`expo-file-system`, déjà présent ; le trousseau limite la taille d'une valeur et le règlement seul la
// dépasse), `localStorage` dans le navigateur (recette web). Lecture ou écriture qui échoue : ignorée, l'assistant
// marche sans brouillon gardé. Le brouillon est effacé à l'enregistrement de l'événement.
// Affiche (lot 34) : copiée à côté du brouillon (le cache du sélecteur d'images peut être vidé par le système) ; dans le
// navigateur, gardée seulement si c'est une adresse `data:` assez petite pour `localStorage`.
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import { parseStoredDraft, type StoredDraft, type StoredPoster, serializeDraft } from "./eventDraft";
import { kvKey } from "./kv";

const isWeb = Platform.OS === "web";
const keyOf = (structureId: string) => kvKey(`event-draft-${structureId}`);
const fileOf = (structureId: string) => new File(Paths.document, `${keyOf(structureId)}.json`);
const posterFileOf = (structureId: string) => new File(Paths.document, `${keyOf(structureId)}-poster.jpg`);
/** Au-delà, l'affiche n'est pas gardée dans le navigateur (quota de `localStorage`). */
const WEB_POSTER_MAX_CHARS = 1_500_000;

/**
 * Garde l'affiche choisie avec le brouillon et renvoie la photo à enregistrer dans le brouillon (`null` : pas gardée,
 * ou affiche retirée). Échec : `null`, l'affiche reste choisie pour cette session seulement.
 */
export async function keepEventDraftPoster(
  structureId: string,
  photo: StoredPoster | null,
): Promise<StoredPoster | null> {
  try {
    if (isWeb) return photo?.uri.startsWith("data:") && photo.uri.length <= WEB_POSTER_MAX_CHARS ? photo : null;
    const dest = posterFileOf(structureId);
    if (photo && photo.uri === dest.uri) return photo;
    if (dest.exists) dest.delete();
    if (!photo) return null;
    await new File(photo.uri).copy(dest);
    return { ...photo, uri: dest.uri };
  } catch {
    return null;
  }
}

export async function loadEventDraft(structureId: string): Promise<StoredDraft | null> {
  try {
    if (isWeb) return parseStoredDraft(globalThis.localStorage?.getItem(keyOf(structureId)) ?? null);
    const file = fileOf(structureId);
    if (!file.exists) return null;
    const stored = parseStoredDraft(await file.text());
    // Copie de l'affiche disparue (dossier vidé) : le brouillon revient sans elle plutôt que d'échouer à l'envoi.
    if (stored?.poster && !new File(stored.poster.uri).exists) return { ...stored, poster: null };
    return stored;
  } catch {
    return null;
  }
}

export async function saveEventDraft(structureId: string, value: Omit<StoredDraft, "v">): Promise<void> {
  try {
    const raw = serializeDraft(value);
    if (isWeb) {
      globalThis.localStorage?.setItem(keyOf(structureId), raw);
      return;
    }
    const file = fileOf(structureId);
    if (!file.exists) file.create();
    file.write(raw);
  } catch {
    // Ignoré : voir l'en-tête.
  }
}

export async function clearEventDraft(structureId: string): Promise<void> {
  try {
    if (isWeb) {
      globalThis.localStorage?.removeItem(keyOf(structureId));
      return;
    }
    const file = fileOf(structureId);
    if (file.exists) file.delete();
    const poster = posterFileOf(structureId);
    if (poster.exists) poster.delete();
  } catch {
    // Ignoré : voir l'en-tête.
  }
}

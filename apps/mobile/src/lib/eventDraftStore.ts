// Brouillon de l'assistant d'événement gardé sur le téléphone (lot 35b) : un fichier JSON par structure dans le dossier
// de l'appli (`expo-file-system`, déjà présent ; le trousseau limite la taille d'une valeur et le règlement seul la
// dépasse), `localStorage` dans le navigateur (recette web). Lecture ou écriture qui échoue : ignorée, l'assistant
// marche sans brouillon gardé. Le brouillon est effacé à l'enregistrement de l'événement.
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import { parseStoredDraft, type StoredDraft, serializeDraft } from "./eventDraft";
import { kvKey } from "./kv";

const isWeb = Platform.OS === "web";
const keyOf = (structureId: string) => kvKey(`event-draft-${structureId}`);
const fileOf = (structureId: string) => new File(Paths.document, `${keyOf(structureId)}.json`);

export async function loadEventDraft(structureId: string): Promise<StoredDraft | null> {
  try {
    if (isWeb) return parseStoredDraft(globalThis.localStorage?.getItem(keyOf(structureId)) ?? null);
    const file = fileOf(structureId);
    if (!file.exists) return null;
    return parseStoredDraft(await file.text());
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
  } catch {
    // Ignoré : voir l'en-tête.
  }
}

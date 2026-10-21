// Brouillon de l'assistant d'événement gardé sur le téléphone (lot 35b) : un fichier JSON par structure dans le dossier
// de l'appli (`expo-file-system`, déjà présent ; le trousseau limite la taille d'une valeur et le règlement seul la
// dépasse), `localStorage` dans le navigateur (recette web). Lecture ou écriture qui échoue : ignorée, l'assistant
// marche sans brouillon gardé. Le brouillon est effacé à l'enregistrement de l'événement.
// Affiche (lot 34) : copiée à côté du brouillon (le cache du sélecteur d'images peut être vidé par le système) ; dans le
// navigateur, gardée seulement si c'est une adresse `data:` assez petite pour `localStorage`.
import { parseWizardMemo, serializeWizardMemo, type WizardMemo } from "@orasso/shared";
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import { parseStoredDraft, type StoredDraft, type StoredPoster, serializeDraft } from "./eventDraft";
import { kvDel, kvGet, kvKey, kvSet } from "./kv";

const isWeb = Platform.OS === "web";
// Une création pas encore enregistrée : une saisie par structure ; un événement qui a un identifiant (brouillon créé,
// ou modification) : une saisie par événement, gardée tant qu'elle n'est pas synchronisée (relecture du lot 53).
const keyOf = (structureId: string, eventId?: string | null) =>
  kvKey(`event-draft-${structureId}${eventId ? `-${eventId}` : ""}`);
const fileOf = (structureId: string, eventId?: string | null) =>
  new File(Paths.document, `${keyOf(structureId, eventId)}.json`);
const posterFileOf = (structureId: string, eventId?: string | null) =>
  new File(Paths.document, `${keyOf(structureId, eventId)}-poster.jpg`);
/** Au-delà, l'affiche n'est pas gardée dans le navigateur (quota de `localStorage`). */
const WEB_POSTER_MAX_CHARS = 1_500_000;

/**
 * Garde l'affiche choisie avec le brouillon et renvoie la photo à enregistrer dans le brouillon (`null` : pas gardée,
 * ou affiche retirée). Échec : `null`, l'affiche reste choisie pour cette session seulement.
 */
export async function keepEventDraftPoster(
  structureId: string,
  photo: StoredPoster | null,
  eventId?: string | null,
): Promise<StoredPoster | null> {
  try {
    if (isWeb) return photo?.uri.startsWith("data:") && photo.uri.length <= WEB_POSTER_MAX_CHARS ? photo : null;
    const dest = posterFileOf(structureId, eventId);
    if (photo && photo.uri === dest.uri) return photo;
    if (dest.exists) dest.delete();
    if (!photo) return null;
    await new File(photo.uri).copy(dest);
    return { ...photo, uri: dest.uri };
  } catch {
    return null;
  }
}

export async function loadEventDraft(structureId: string, eventId?: string | null): Promise<StoredDraft | null> {
  try {
    if (isWeb) return parseStoredDraft(globalThis.localStorage?.getItem(keyOf(structureId, eventId)) ?? null);
    const file = fileOf(structureId, eventId);
    if (!file.exists) return null;
    const stored = parseStoredDraft(await file.text());
    // Copie de l'affiche disparue (dossier vidé) : le brouillon revient sans elle plutôt que d'échouer à l'envoi.
    if (stored?.poster && !new File(stored.poster.uri).exists) return { ...stored, poster: null };
    return stored;
  } catch {
    return null;
  }
}

export async function saveEventDraft(
  structureId: string,
  value: Omit<StoredDraft, "v">,
  eventId?: string | null,
): Promise<void> {
  try {
    const raw = serializeDraft(value);
    if (isWeb) {
      globalThis.localStorage?.setItem(keyOf(structureId, eventId), raw);
      return;
    }
    const file = fileOf(structureId, eventId);
    if (!file.exists) file.create();
    file.write(raw);
  } catch {
    // Ignoré : voir l'en-tête.
  }
}

export async function clearEventDraft(structureId: string, eventId?: string | null): Promise<void> {
  try {
    if (isWeb) {
      globalThis.localStorage?.removeItem(keyOf(structureId, eventId));
      return;
    }
    const file = fileOf(structureId, eventId);
    if (file.exists) file.delete();
    const poster = posterFileOf(structureId, eventId);
    if (poster.exists) poster.delete();
  } catch {
    // Ignoré : voir l'en-tête.
  }
}

/** Mémoire de l'assistant pour un brouillon (temps atteint, récurrence) : petite, dans le stockage clé/valeur. */
const memoKey = (eventId: string) => `event-wizard-memo-${eventId}`;

export const loadWizardMemo = async (eventId: string): Promise<WizardMemo | null> =>
  parseWizardMemo(await kvGet(memoKey(eventId)));

export async function saveWizardMemo(eventId: string, memo: WizardMemo | null): Promise<void> {
  if (memo) await kvSet(memoKey(eventId), serializeWizardMemo(memo));
  else await kvDel(memoKey(eventId));
}

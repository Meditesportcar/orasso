// Brouillons privés de l'assistant : cache du compte (lot 54b), purgé à la déconnexion.
// Sur appareil, le gros JSON et l'affiche restent dans des fichiers propres au compte : seule leur référence passe
// dans le trousseau, dont les valeurs sont limitées. Sans référence de cache, ces fichiers ne sont jamais relus.
// Les anciennes clés sans propriétaire ne sont pas reprises. Échec de stockage : l'assistant reste utilisable.
import { parseWizardMemo, serializeWizardMemo, type WizardMemo } from "@orasso/shared";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import { parseStoredDraft, type StoredDraft, type StoredPoster, serializeDraft } from "./eventDraft";
import { accountGuard, cacheGetJson, cacheSetJson, kvKey, onCacheScopeDropped } from "./kv";

type DraftAccount = ReturnType<typeof accountGuard>;
const isWeb = Platform.OS === "web";
const keyOf = (structureId: string, eventId?: string | null) =>
  `event-draft-${structureId}${eventId ? `-${eventId}` : ""}`;
const fileOf = (scope: string, key: string) => new File(Paths.document, `${kvKey(`draft.${scope}.${key}`)}.json`);
const posterFileOf = (scope: string, key: string) =>
  new File(Paths.document, `${kvKey(`draft.${scope}.${key}`)}-poster.jpg`);
const active = (account: DraftAccount) => Boolean(account.scope && account.current());
/**
 * Les écritures d'un même brouillon (fichier + référence de cache) passent une par une : effacer puis enregistrer sans
 * attendre ne laisse jamais une référence vers un fichier supprimé (la dernière demande gagne).
 */
const chains = new Map<string, Promise<unknown>>();
function serialized<T>(scope: string | null, key: string, task: () => Promise<T>): Promise<T> {
  const id = `${scope}|${key}`;
  const run = (chains.get(id) ?? Promise.resolve()).then(task, task);
  const tail = run.catch(() => undefined);
  chains.set(id, tail);
  void tail.then(() => {
    if (chains.get(id) === tail) chains.delete(id);
  });
  return run;
}

/** Fichiers de brouillon du compte (JSON et affiche) et, une fois par purge, ceux d'avant les caches par compte. */
async function purgeDraftFiles(scope: string): Promise<void> {
  if (isWeb) return;
  const mine = kvKey(`draft.${scope}.`);
  const legacy = kvKey("event-draft-");
  for (const entry of new Directory(Paths.document).list()) {
    const name = entry.name ?? "";
    if (name.startsWith(mine) || (name.startsWith(legacy) && name.endsWith(".json"))) {
      try {
        entry.delete();
      } catch {
        // Ignoré : voir l'en-tête.
      }
    }
  }
}
onCacheScopeDropped(purgeDraftFiles);

/** Au-delà, l'affiche n'est pas gardée dans le navigateur (quota de `localStorage`). */
const WEB_POSTER_MAX_CHARS = 1_500_000;

export async function keepEventDraftPoster(
  structureId: string,
  photo: StoredPoster | null,
  eventId?: string | null,
  account = accountGuard(),
): Promise<StoredPoster | null> {
  if (!active(account)) return null;
  return serialized(account.scope, keyOf(structureId, eventId), () => keepPoster(structureId, photo, eventId, account));
}

async function keepPoster(
  structureId: string,
  photo: StoredPoster | null,
  eventId: string | null | undefined,
  account: DraftAccount,
): Promise<StoredPoster | null> {
  if (!active(account)) return null;
  try {
    if (isWeb) return photo?.uri.startsWith("data:") && photo.uri.length <= WEB_POSTER_MAX_CHARS ? photo : null;
    const dest = posterFileOf(account.scope as string, keyOf(structureId, eventId));
    if (photo && photo.uri === dest.uri) return photo;
    if (dest.exists) dest.delete();
    if (!photo) return null;
    await new File(photo.uri).copy(dest);
    if (!active(account)) {
      if (dest.exists) dest.delete();
      return null;
    }
    return { ...photo, uri: dest.uri };
  } catch {
    return null;
  }
}

export async function loadEventDraft(
  structureId: string,
  eventId?: string | null,
  account = accountGuard(),
): Promise<StoredDraft | null> {
  if (!active(account)) return null;
  try {
    const value = await cacheGetJson<string | { file: true }>(keyOf(structureId, eventId));
    if (!active(account) || !value) return null;
    let raw: string | null = typeof value === "string" ? value : null;
    if (!isWeb && typeof value !== "string") {
      const file = fileOf(account.scope as string, keyOf(structureId, eventId));
      if (file.exists) raw = await file.text();
    }
    if (!active(account)) return null;
    const stored = parseStoredDraft(raw);
    if (!isWeb && stored?.poster && !new File(stored.poster.uri).exists) return { ...stored, poster: null };
    return stored;
  } catch {
    return null;
  }
}

export async function saveEventDraft(
  structureId: string,
  value: Omit<StoredDraft, "v">,
  eventId?: string | null,
  account = accountGuard(),
): Promise<void> {
  if (!active(account)) return;
  return serialized(account.scope, keyOf(structureId, eventId), () => writeDraft(structureId, value, eventId, account));
}

async function writeDraft(
  structureId: string,
  value: Omit<StoredDraft, "v">,
  eventId: string | null | undefined,
  account: DraftAccount,
): Promise<void> {
  if (!active(account)) return;
  try {
    const raw = serializeDraft(value);
    const key = keyOf(structureId, eventId);
    if (isWeb) {
      await cacheSetJson(key, raw, account.scope);
      return;
    }
    const file = fileOf(account.scope as string, key);
    if (!file.exists) file.create();
    file.write(raw);
    await cacheSetJson(key, { file: true }, account.scope);
  } catch {
    // Ignoré : voir l'en-tête.
  }
}

export async function clearEventDraft(
  structureId: string,
  eventId?: string | null,
  account = accountGuard(),
): Promise<void> {
  if (!active(account)) return;
  return serialized(account.scope, keyOf(structureId, eventId), () => removeDraft(structureId, eventId, account));
}

async function removeDraft(
  structureId: string,
  eventId: string | null | undefined,
  account: DraftAccount,
): Promise<void> {
  if (!active(account)) return;
  try {
    const key = keyOf(structureId, eventId);
    // Pas de cacheDel : une valeur nulle reste indexée et sera effacée par purgeCaches.
    await cacheSetJson(key, null, account.scope);
    if (isWeb || !active(account)) return;
    const file = fileOf(account.scope as string, key);
    if (file.exists) file.delete();
    const poster = posterFileOf(account.scope as string, key);
    if (poster.exists) poster.delete();
  } catch {
    // Ignoré : voir l'en-tête.
  }
}

const memoKey = (eventId: string) => `event-wizard-memo-${eventId}`;

export async function loadWizardMemo(eventId: string, account = accountGuard()): Promise<WizardMemo | null> {
  if (!active(account)) return null;
  const raw = await cacheGetJson<string>(memoKey(eventId));
  return active(account) ? parseWizardMemo(raw) : null;
}

export async function saveWizardMemo(
  eventId: string,
  memo: WizardMemo | null,
  account = accountGuard(),
): Promise<void> {
  if (!active(account)) return;
  await cacheSetJson(memoKey(eventId), memo ? serializeWizardMemo(memo) : null, account.scope);
}

/** Lie aussi les minuteries et les callbacks de démontage au compte qui a ouvert l'assistant. */
export function eventDraftStoreForAccount(account = accountGuard()) {
  return {
    loadEventDraft: (structureId: string, eventId?: string | null) => loadEventDraft(structureId, eventId, account),
    saveEventDraft: (structureId: string, value: Omit<StoredDraft, "v">, eventId?: string | null) =>
      saveEventDraft(structureId, value, eventId, account),
    clearEventDraft: (structureId: string, eventId?: string | null) => clearEventDraft(structureId, eventId, account),
    keepEventDraftPoster: (structureId: string, photo: StoredPoster | null, eventId?: string | null) =>
      keepEventDraftPoster(structureId, photo, eventId, account),
    loadWizardMemo: (eventId: string) => loadWizardMemo(eventId, account),
    saveWizardMemo: (eventId: string, memo: WizardMemo | null) => saveWizardMemo(eventId, memo, account),
  };
}

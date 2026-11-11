// Copie hors ligne d'une lecture, propre au compte (lot R8c2) : le dernier contenu reçu est gardé pour l'afficher sans
// réseau (le Fil, l'onglet « Publications » du profil), avec la date de la copie.
// Rangement : le trousseau limite la taille de ses valeurs (une première page de 40 cartes pèse de l'ordre de 100 Ko),
// donc sur appareil le contenu va dans un fichier propre au compte et seule sa référence passe par `cacheSetJson` (index
// du compte, purge à la déconnexion et au changement de compte : `onCacheScopeDropped` efface les fichiers). Dans le
// navigateur (recette web), la valeur est rangée telle quelle dans le cache du compte. Sans compte lié, rien n'est lu
// ni écrit : un compte ne lit jamais la copie d'un autre. Toute erreur de stockage est ignorée : l'écran s'affiche sans copie.
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import { accountGuard, cacheGetJson, cacheScope, cacheSetJson, kvKey, onCacheScopeDropped } from "./kv";

const isWeb = Platform.OS === "web";
const refKey = (key: string) => `copy.${key}`;
const fileOf = (scope: string, key: string) => new File(Paths.document, `${kvKey(`copy.${scope}.${key}`)}.json`);
const filePrefix = (scope: string) => kvKey(`copy.${scope}.`);
const anyPrefix = kvKey("copy.");

/** Ce que le cache du compte retient d'une copie : sa date, et la valeur elle-même seulement dans le navigateur. */
type CopyRef = { savedAt: string; file?: true; value?: unknown };

export type OfflineCopy<T> = { value: T; savedAt: string };

/** Les écritures d'une même copie passent une par une : la dernière demande gagne. */
const chains = new Map<string, Promise<unknown>>();
function serialized<T>(id: string, task: () => Promise<T>): Promise<T> {
  const run = (chains.get(id) ?? Promise.resolve()).then(task, task);
  const tail = run.catch(() => undefined);
  chains.set(id, tail);
  void tail.then(() => {
    if (chains.get(id) === tail) chains.delete(id);
  });
  return run;
}

/**
 * Fichiers de copie effacés à chaque purge : ceux du compte purgé, et tout fichier `copy.*` dont le compte n'est plus lié
 * (un fichier orphelin laissé par une écriture tardive pendant un changement de compte).
 */
async function purgeCopyFiles(scope: string): Promise<void> {
  if (isWeb) return;
  const linked = cacheScope();
  const keep = linked && linked !== scope ? filePrefix(linked) : null;
  for (const entry of new Directory(Paths.document).list()) {
    const name = entry.name ?? "";
    if (!name.startsWith(anyPrefix) || (keep && name.startsWith(keep))) continue;
    try {
      entry.delete();
    } catch {
      // Ignoré : voir l'en-tête.
    }
  }
}
onCacheScopeDropped(purgeCopyFiles);

/**
 * Garde `value` comme copie hors ligne de `key` pour le compte connecté (`now` : la date de la copie, passée par
 * l'appelant). `account` : le compte sous lequel la lecture a été lancée ; s'il a changé depuis, la réponse est
 * étrangère et rien n'est écrit.
 */
export async function saveCopy(
  key: string,
  value: unknown,
  now: Date = new Date(),
  account = accountGuard(),
): Promise<void> {
  const scope = account.scope;
  if (!scope || !account.current()) return;
  return serialized(`${scope}|${key}`, async () => {
    if (!account.current()) return;
    try {
      const savedAt = now.toISOString();
      if (isWeb) {
        await cacheSetJson(refKey(key), { savedAt, value } satisfies CopyRef, scope);
        return;
      }
      const file = fileOf(scope, key);
      // Le compte peut avoir changé pendant l'attente : on vérifie juste avant d'écrire (pas de fichier orphelin).
      if (!account.current()) return;
      if (!file.exists) file.create();
      file.write(JSON.stringify({ savedAt, value }));
      await cacheSetJson(refKey(key), { savedAt, file: true } satisfies CopyRef, scope);
    } catch {
      // Ignoré : voir l'en-tête.
    }
  });
}

/** La copie de `key` du compte connecté, ou `null` (aucune, illisible, ou un autre compte est lié). */
export async function readCopy<T>(key: string, account = accountGuard()): Promise<OfflineCopy<T> | null> {
  const scope = account.scope;
  if (!scope || !account.current()) return null;
  try {
    const ref = await cacheGetJson<CopyRef>(refKey(key));
    if (!ref || typeof ref.savedAt !== "string" || !account.current()) return null;
    if (isWeb) return ref.value === undefined ? null : { value: ref.value as T, savedAt: ref.savedAt };
    if (!ref.file) return null;
    const file = fileOf(scope, key);
    if (!file.exists) return null;
    const parsed = JSON.parse(await file.text()) as { savedAt?: unknown; value?: unknown };
    if (!account.current() || typeof parsed.savedAt !== "string" || parsed.value === undefined) return null;
    return { value: parsed.value as T, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

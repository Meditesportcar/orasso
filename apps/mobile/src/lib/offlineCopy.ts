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

// --- Photos de la copie (R8c2, tour 2) -------------------------------------------------------------------------------------
// La première photo d'une carte de la copie, **déjà reçue en ligne** (aucun préchargement, aucune requête de plus), est gardée
// pour s'afficher sans réseau. Fichiers du compte sous le préfixe de la copie (`copy.<compte>.photo.<empreinte>.<date>.json`) :
// effacés avec la copie à la déconnexion et au changement de compte. Chaque photo s'efface d'elle-même au bout de 7 jours ;
// celles dont la carte a quitté la copie sont retirées (`prunePhotos`). Dans le navigateur (recette), au plus 8 photos.

export const PHOTO_MAX_AGE_MS = 7 * 86_400_000;
const WEB_PHOTO_MAX = 8;
const WEB_INDEX = "copyphotos";

/** Empreinte courte et stable d'une adresse de photo (nom de fichier). */
export function photoHash(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const photoPrefix = (scope: string) => kvKey(`copy.${scope}.photo.`);
const photoFileName = (scope: string, hash: string, ms: number) => `${photoPrefix(scope)}${hash}.${ms}.json`;
type WebPhoto = { hash: string; ms: number };
const webKey = (hash: string) => `copyphoto.${hash}`;

/** Les fichiers photo du compte : empreinte et date d'écriture lues dans le nom. */
function photoEntries(scope: string): { entry: { name?: string; delete: () => void }; hash: string; ms: number }[] {
  const prefix = photoPrefix(scope);
  const out: { entry: { name?: string; delete: () => void }; hash: string; ms: number }[] = [];
  for (const entry of new Directory(Paths.document).list()) {
    const name = entry.name ?? "";
    if (!name.startsWith(prefix)) continue;
    const m = /^([^.]+)\.(\d+)\.json$/.exec(name.slice(prefix.length));
    out.push({ entry, hash: m?.[1] ?? "", ms: Number(m?.[2] ?? 0) });
  }
  return out;
}

/** Garde la photo (`dataUrl`) de l'adresse `url`, écrite maintenant (`now`). */
export async function savePhoto(
  url: string,
  dataUrl: string,
  now: Date = new Date(),
  account = accountGuard(),
): Promise<void> {
  const scope = account.scope;
  if (!scope || !account.current()) return;
  return serialized(`${scope}|photo|${photoHash(url)}`, async () => {
    if (!account.current()) return;
    try {
      const hash = photoHash(url);
      const ms = now.getTime();
      if (isWeb) {
        const index = (await cacheGetJson<WebPhoto[]>(WEB_INDEX)) ?? [];
        const rest = index.filter((p) => p.hash !== hash);
        if (rest.length >= WEB_PHOTO_MAX) return;
        await cacheSetJson(webKey(hash), { ms, data: dataUrl }, scope);
        await cacheSetJson(WEB_INDEX, [...rest, { hash, ms }], scope);
        return;
      }
      for (const p of photoEntries(scope)) if (p.hash === hash) p.entry.delete();
      if (!account.current()) return;
      const file = new File(Paths.document, photoFileName(scope, hash, ms));
      file.create();
      file.write(dataUrl);
    } catch {
      // Ignoré : voir l'en-tête.
    }
  });
}

/** La photo gardée de `url` (adresse de données), ou `null` : absente, de plus de 7 jours, ou d'un autre compte. */
export async function readPhoto(url: string, now: Date = new Date(), account = accountGuard()): Promise<string | null> {
  const scope = account.scope;
  if (!scope || !account.current()) return null;
  try {
    const hash = photoHash(url);
    if (isWeb) {
      const index = (await cacheGetJson<WebPhoto[]>(WEB_INDEX)) ?? [];
      const hit = index.find((p) => p.hash === hash);
      if (!hit || now.getTime() - hit.ms >= PHOTO_MAX_AGE_MS) return null;
      const saved = await cacheGetJson<{ data?: string }>(webKey(hash));
      return account.current() && typeof saved?.data === "string" ? saved.data : null;
    }
    const hit = photoEntries(scope).find((p) => p.hash === hash);
    if (!hit || now.getTime() - hit.ms >= PHOTO_MAX_AGE_MS) return null;
    const data = await new File(Paths.document, photoFileName(scope, hash, hit.ms)).text();
    return account.current() && data.startsWith("data:") ? data : null;
  } catch {
    return null;
  }
}

/**
 * Retire les photos de plus de 7 jours et, si `keep` est donné, celles dont l'adresse n'y est pas (carte sortie de la copie).
 * Appelée à chaque `saveCopy` du Fil et au démarrage.
 */
export async function prunePhotos(
  keep: ReadonlySet<string> | null,
  now: Date = new Date(),
  account = accountGuard(),
): Promise<void> {
  const scope = account.scope;
  if (!scope || !account.current()) return;
  const keepHashes = keep ? new Set([...keep].map(photoHash)) : null;
  const drop = (hash: string, ms: number) =>
    now.getTime() - ms >= PHOTO_MAX_AGE_MS || (keepHashes !== null && !keepHashes.has(hash));
  try {
    if (isWeb) {
      const index = (await cacheGetJson<WebPhoto[]>(WEB_INDEX)) ?? [];
      const left = index.filter((p) => !drop(p.hash, p.ms));
      for (const p of index) if (!left.includes(p)) await cacheSetJson(webKey(p.hash), null, scope);
      if (left.length !== index.length) await cacheSetJson(WEB_INDEX, left, scope);
      return;
    }
    for (const p of photoEntries(scope)) if (!p.hash || drop(p.hash, p.ms)) p.entry.delete();
  } catch {
    // Ignoré : voir l'en-tête.
  }
}

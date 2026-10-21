// Stockage clé/valeur de l'appli : le trousseau sécurisé de l'appareil (expo-secure-store) sur iOS et Android,
// localStorage dans le navigateur (recette web seulement). Toute lecture ou écriture qui échoue est ignorée :
// l'appli doit s'afficher même sans stockage (fenêtre privée, trousseau verrouillé).
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

/** Les clés du trousseau n'acceptent que lettres, chiffres, « . », « - » et « _ ». */
export const kvKey = (key: string) => `orasso.${key}`.replace(/[^A-Za-z0-9._-]/g, "_");

export async function kvGet(key: string): Promise<string | null> {
  try {
    if (isWeb) return globalThis.localStorage?.getItem(kvKey(key)) ?? null;
    return await SecureStore.getItemAsync(kvKey(key));
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: string): Promise<void> {
  try {
    if (isWeb) globalThis.localStorage?.setItem(kvKey(key), value);
    else await SecureStore.setItemAsync(kvKey(key), value);
  } catch {
    // Ignoré : voir l'en-tête.
  }
}

export async function kvDel(key: string): Promise<void> {
  try {
    if (isWeb) globalThis.localStorage?.removeItem(kvKey(key));
    else await SecureStore.deleteItemAsync(kvKey(key));
  } catch {
    // Ignoré : voir l'en-tête.
  }
}

export async function kvGetJson<T>(key: string): Promise<T | null> {
  const raw = await kvGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const kvSetJson = (key: string, value: unknown) => kvSet(key, JSON.stringify(value));

// --- Caches de lecture, propres au compte -------------------------------------------------------------------------
// Les réponses de l'API gardées pour l'affichage hors ligne (`useApi` avec `cacheKey`, candidatures) sont rangées sous
// l'identifiant du compte connecté : sur un téléphone partagé, un autre compte ne les lit jamais, en ligne ou non.
// Les clés d'un compte sont listées dans un index pour que la déconnexion puisse toutes les effacer (le trousseau
// ne sait pas lister ses clés). Sans compte lié, rien n'est lu ni écrit.

const CACHE_SCOPE_KEY = "cache-scope";
let cacheScopeId: string | null = null;
let cacheQueue: Promise<unknown> = Promise.resolve();

const indexKeyOf = (scope: string) => `cache-index.${scope}`;
const cacheKeyOf = (scope: string, key: string) => `cache.${scope}.${key}`;

/** Les écritures de l'index passent une par une : deux lectures qui répondent en même temps ne s'écrasent pas. */
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = cacheQueue.then(task, task);
  cacheQueue = run.catch(() => undefined);
  return run;
}

/** Compte dont les caches sont lus et écrits en ce moment (`null` : personne n'est lié). */
export const cacheScope = () => cacheScopeId;

async function dropScope(scope: string): Promise<void> {
  const keys = (await kvGetJson<string[]>(indexKeyOf(scope))) ?? [];
  await Promise.all(keys.map((key) => kvDel(cacheKeyOf(scope, key))));
  await kvDel(indexKeyOf(scope));
}

/**
 * Lie les caches au compte connecté. Si l'appareil gardait ceux d'un autre compte (déconnexion jamais allée au bout),
 * ils sont effacés d'abord.
 */
export function bindCacheScope(accountId: string): Promise<void> {
  if (cacheScopeId === accountId) return Promise.resolve();
  return serial(async () => {
    const previous = (await kvGet(CACHE_SCOPE_KEY)) ?? cacheScopeId;
    if (previous && previous !== accountId) await dropScope(previous);
    await kvSet(CACHE_SCOPE_KEY, accountId);
    cacheScopeId = accountId;
  });
}

/** Déconnexion : efface les caches du compte lié et délie. */
export function purgeCaches(): Promise<void> {
  return serial(async () => {
    const scope = cacheScopeId ?? (await kvGet(CACHE_SCOPE_KEY));
    cacheScopeId = null;
    if (scope) await dropScope(scope);
    await kvDel(CACHE_SCOPE_KEY);
  });
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const scope = cacheScopeId;
  if (!scope) return null;
  const value = await kvGetJson<T>(cacheKeyOf(scope, key));
  // Le compte a changé pendant la lecture : la valeur n'est plus la sienne.
  return cacheScopeId === scope ? value : null;
}

export function cacheSetJson(key: string, value: unknown): Promise<void> {
  const scope = cacheScopeId;
  if (!scope) return Promise.resolve();
  return serial(async () => {
    if (cacheScopeId !== scope) return;
    const index = (await kvGetJson<string[]>(indexKeyOf(scope))) ?? [];
    if (!index.includes(key)) await kvSetJson(indexKeyOf(scope), [...index, key]);
    await kvSetJson(cacheKeyOf(scope, key), value);
  });
}

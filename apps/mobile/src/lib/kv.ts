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

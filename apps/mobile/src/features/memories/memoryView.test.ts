// Lot R7j, tour 3 : un refus définitif efface la page et sa copie ; une panne réseau garde la copie, annoncée hors ligne.
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => store.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void store.set(key, value),
  deleteItemAsync: async (key: string) => void store.delete(key),
}));

import { bindCacheScope, cacheGetJson, cacheSetJson, purgeCaches } from "../../lib/kv";
import { forgetMemory, isRefusal, memoryCacheKey, memoryView } from "./memoryView";

const copy = { eventId: "e1", title: "Rassemblement" };

beforeEach(async () => {
  await purgeCaches();
  store.clear();
});

describe("memoryView", () => {
  it("refus définitif (404, 403) : « pas disponible », même avec une copie en mémoire", () => {
    expect(memoryView({ data: copy, error: { status: 404 }, offline: false })).toEqual({ kind: "unavailable" });
    expect(memoryView({ data: copy, error: { status: 403 }, offline: false })).toEqual({ kind: "unavailable" });
    expect(memoryView({ data: null, error: { status: 404 }, offline: false })).toEqual({ kind: "unavailable" });
    expect(isRefusal({ status: 500 })).toBe(false);
    expect(isRefusal(null)).toBe(false);
  });

  it("panne réseau avec une copie : la copie, annoncée hors ligne ; sans copie : l'erreur de chargement", () => {
    expect(memoryView({ data: copy, error: { status: 0 }, offline: true })).toEqual({ kind: "ready", offline: true });
    expect(memoryView({ data: null, error: { status: 0 }, offline: true })).toEqual({ kind: "error" });
  });

  it("en ligne : la page sans mention ; au chargement : l'attente", () => {
    expect(memoryView({ data: copy, error: null, offline: false })).toEqual({ kind: "ready", offline: false });
    expect(memoryView({ data: null, error: null, offline: false })).toEqual({ kind: "loading" });
  });
});

describe("forgetMemory", () => {
  it("efface la copie du téléphone : elle ne se relit plus", async () => {
    await bindCacheScope("compte-a");
    await cacheSetJson(memoryCacheKey("e1"), copy);
    expect(await cacheGetJson(memoryCacheKey("e1"))).toEqual(copy);
    await forgetMemory("e1");
    expect(await cacheGetJson(memoryCacheKey("e1"))).toBeNull();
  });
});

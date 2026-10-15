// Ouverture de la base locale du mode staff (`orasso-staff.db`, expo-sqlite). Sur le web (recette seulement),
// expo-sqlite tourne en WebAssembly et demande une page isolée (en-têtes posés par metro.config.js).
import * as SQLite from "expo-sqlite";

import { StaffStore } from "./store";

let opening: Promise<StaffStore> | null = null;

export function staffStore(): Promise<StaffStore> {
  opening ??= (async () => {
    const db = await SQLite.openDatabaseAsync("orasso-staff.db");
    // Journal WAL : écritures courtes pendant le scan ; ignoré là où il n'existe pas (web).
    await db.execAsync("pragma journal_mode = wal").catch(() => undefined);
    const store = new StaffStore(db);
    await store.init();
    return store;
  })().catch((error) => {
    opening = null;
    throw error;
  });
  return opening;
}

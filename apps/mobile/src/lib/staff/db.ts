// Ouverture de la base locale du mode staff (`orasso-staff.db`, expo-sqlite). Sur le web (recette seulement),
// expo-sqlite tourne en WebAssembly et demande une page isolée (en-têtes posés par metro.config.js).
// Lot 48 : sur le web, la base ne s'ouvre qu'à l'entrée du mode staff (runtime.ts, `webIdle`) et se referme quand la
// page part (`pagehide`) : la page suivante retrouve le fichier libre.
import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";

import { StaffStore } from "./store";

let opening: Promise<StaffStore> | null = null;

/** La base a-t-elle été ouverte dans cette page ? */
export const staffStoreOpened = () => opening !== null;

export function staffStore(): Promise<StaffStore> {
  opening ??= (async () => {
    const db = await SQLite.openDatabaseAsync("orasso-staff.db");
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener(
        "pagehide",
        () => {
          try {
            db.closeSync();
          } catch {
            // Déjà fermée.
          }
        },
        { once: true },
      );
    }
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

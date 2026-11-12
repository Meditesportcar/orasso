// Le Fil affiche-t-il la copie gardée (sans réseau) ? Les cartes posent « Pas de réseau » sur leurs actions (lot R8c2, tour 3).
import { createContext, useContext } from "react";

export const FilOfflineContext = createContext(false);
export const useFilOffline = (): boolean => useContext(FilOfflineContext);

// Casquette active de l'appli (lot 16, ARCHITECTURE-SUITE § 7.1) : mémorisée dans le trousseau, remise à « passionné »
// si elle n'existe plus dans `GET /me` → `personas` (structure quittée, fiche pro supprimée). Changer de casquette garde
// la session ; seule la barre d'onglets (le groupe de routes) change. La logique pure est dans `personaModel.ts`.
import type { PersonaEntry } from "@orasso/shared";
import { useRouter } from "expo-router";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { kvDel, kvGet, kvSet } from "./kv";
import {
  entryOfPersona,
  FAN,
  FAN_ENTRY,
  homeOf,
  otherBadges,
  type Persona,
  parsePersona,
  resolvePersona,
  serializePersona,
} from "./personaModel";
import { useSession } from "./session";

const KEY = "persona";

type PersonaValue = {
  /** La casquette mémorisée est lue (avant, on ne sait pas encore où ouvrir l'appli). */
  ready: boolean;
  /** Casquette active (jamais une casquette disparue). */
  persona: Persona;
  /** Les casquettes du compte, le passionné en premier. */
  entries: PersonaEntry[];
  /** La ligne de la casquette active (logo, nom). */
  active: PersonaEntry;
  /** Pastilles « à traiter » des autres casquettes : l'avatar porte un point moutarde si > 0. */
  elsewhere: number;
  /** Passe à une casquette et ouvre son premier écran (ou `to`, un écran de cette casquette : lien profond, lot 35a). */
  choose: (persona: Persona, to?: string) => void;
  /** Appui long sur l'avatar : retour au passionné. */
  backToFan: () => void;
};

const PersonaContext = createContext<PersonaValue | null>(null);

export function PersonaProvider({ children }: { children: ReactNode }) {
  const { status, me } = useSession();
  const router = useRouter();
  /** `undefined` : le trousseau n'a pas encore été lu. */
  const [stored, setStored] = useState<Persona | null | undefined>(undefined);

  useEffect(() => {
    void kvGet(KEY).then((raw) => setStored(parsePersona(raw)));
  }, []);

  const entries = useMemo<PersonaEntry[]>(() => (me?.personas?.length ? me.personas : [FAN_ENTRY]), [me]);
  const persona = useMemo(() => resolvePersona(stored ?? null, entries), [stored, entries]);

  // Déconnexion : la casquette appartient au compte, pas à l'appareil.
  useEffect(() => {
    if (status !== "out") return;
    setStored(null);
    void kvDel(KEY);
  }, [status]);

  // La casquette mémorisée a disparu : repli sur le passionné, une fois les casquettes connues.
  useEffect(() => {
    if (status !== "in" || !me || !stored || stored.kind === "fan") return;
    if (!entryOfPersona(stored, entries)) {
      setStored(FAN);
      void kvSet(KEY, serializePersona(FAN));
    }
  }, [status, me, stored, entries]);

  const choose = useCallback(
    (next: Persona, to?: string) => {
      setStored(next);
      void kvSet(KEY, serializePersona(next));
      router.replace((to ?? homeOf(next)) as never);
    },
    [router],
  );

  const value = useMemo<PersonaValue>(
    () => ({
      ready: stored !== undefined,
      persona,
      entries,
      active: entryOfPersona(persona, entries) ?? FAN_ENTRY,
      elsewhere: otherBadges(persona, entries),
      choose,
      backToFan: () => choose(FAN),
    }),
    [stored, persona, entries, choose],
  );

  return <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>;
}

export function usePersona(): PersonaValue {
  const value = useContext(PersonaContext);
  if (!value) throw new Error("usePersona doit être utilisé dans un <PersonaProvider>.");
  return value;
}

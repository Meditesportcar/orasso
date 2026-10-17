// Casquette active de l'appli (lot 16, ARCHITECTURE-SUITE § 7.1) : mémorisée dans le trousseau, remise à « passionné »
// si elle n'existe plus dans `GET /me` → `personas` (structure quittée, fiche pro supprimée). Changer de casquette garde
// la session ; seule la barre d'onglets (le groupe de routes) change. La logique pure est dans `personaModel.ts`.
// Lot 35d : l'Administration est une casquette ajoutée par l'appli pour les rôles `moderator` et `super_admin`, et le
// mode assistance (« Survoler l'espace ») ouvre la casquette Organisateur d'une structure qui n'est pas la sienne, sans
// la mémoriser : au lancement suivant on retrouve la casquette d'avant.
import { useRouter } from "expo-router";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { type AssistedStructure, adminEntryOf } from "./adminModel";
import { kvDel, kvGet, kvSet } from "./kv";
import {
  type AppPersonaEntry,
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
  entries: AppPersonaEntry[];
  /** La ligne de la casquette active (logo, nom). */
  active: AppPersonaEntry;
  /** Pastilles « à traiter » des autres casquettes : l'avatar porte un point moutarde si > 0. */
  elsewhere: number;
  /** Passe à une casquette et ouvre son premier écran (ou `to`, un écran de cette casquette : lien profond, lot 35a). */
  choose: (persona: Persona, to?: string) => void;
  /** Appui long sur l'avatar : retour au passionné. */
  backToFan: () => void;
  /** Lot 35d : ouvre l'espace organisateur d'une structure en mode assistance (super admin, lecture seule). */
  survey: (structure: AssistedStructure) => void;
  /** Lot 35d : quitte le survol et revient à l'Administration. */
  leaveSurvey: () => void;
};

const PersonaContext = createContext<PersonaValue | null>(null);

export function PersonaProvider({ children }: { children: ReactNode }) {
  const { status, me } = useSession();
  const router = useRouter();
  /** `undefined` : le trousseau n'a pas encore été lu. */
  const [stored, setStored] = useState<Persona | null | undefined>(undefined);
  /** Structure survolée en mode assistance (en mémoire seulement). */
  const [assisted, setAssisted] = useState<AssistedStructure | null>(null);

  useEffect(() => {
    void kvGet(KEY).then((raw) => setStored(parsePersona(raw)));
  }, []);

  const role = me?.profile.platformRole;
  const entries = useMemo<AppPersonaEntry[]>(() => {
    const base: AppPersonaEntry[] = me?.personas?.length ? me.personas : [FAN_ENTRY];
    const admin = adminEntryOf(role);
    const list = admin ? [...base, admin] : [...base];
    // Un survol ne s'ajoute que si la structure n'est pas déjà une des siennes.
    if (assisted && admin && !list.some((e) => e.kind === "organizer" && e.id === assisted.id)) {
      list.push({ kind: "organizer", id: assisted.id, label: assisted.name, logoUrl: null, badge: 0, assisted: true });
    }
    return list;
  }, [me, role, assisted]);
  const persona = useMemo(() => resolvePersona(stored ?? null, entries), [stored, entries]);

  // Déconnexion : la casquette appartient au compte, pas à l'appareil.
  useEffect(() => {
    if (status !== "out") return;
    setStored(null);
    setAssisted(null);
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
      const target = (to ?? homeOf(next)) as never;
      // Lot 35d : la navigation attend que la nouvelle casquette soit posée ; sinon la redirection « mauvais groupe »
      // de la racine voit l'ancienne casquette et renvoie vers son écran d'accueil (venant du survol d'une structure).
      if (to) setTimeout(() => router.replace(target), 0);
      else router.replace(target);
    },
    [router],
  );

  const survey = useCallback(
    (structure: AssistedStructure) => {
      const next: Persona = { kind: "organizer", structureId: structure.id };
      setAssisted(structure);
      // Pas de `kvSet` : le survol ne survit pas à un redémarrage de l'appli.
      setStored(next);
      router.replace(homeOf(next) as never);
    },
    [router],
  );

  const leaveSurvey = useCallback(() => choose({ kind: "admin" }), [choose]);

  const value = useMemo<PersonaValue>(
    () => ({
      ready: stored !== undefined,
      persona,
      entries,
      active: entryOfPersona(persona, entries) ?? FAN_ENTRY,
      elsewhere: otherBadges(persona, entries),
      choose,
      backToFan: () => choose(FAN),
      survey,
      leaveSurvey,
    }),
    [stored, persona, entries, choose, survey, leaveSurvey],
  );

  return <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>;
}

export function usePersona(): PersonaValue {
  const value = useContext(PersonaContext);
  if (!value) throw new Error("usePersona doit être utilisé dans un <PersonaProvider>.");
  return value;
}

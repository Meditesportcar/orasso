// Casquette active de l'appli (lot 16, ARCHITECTURE-SUITE § 7.1 ; six profils au lot 40) : mémorisée dans le trousseau,
// remise à la casquette de base (exposant ou visiteur selon les véhicules actifs) si elle n'existe plus dans `GET /me` →
// `personas` (structure quittée, fiche pro supprimée). Changer de casquette garde la session ; seule la barre d'onglets
// (le groupe de routes) change. La logique pure est dans `personaModel.ts`.
// Lot 35d : l'Administration est une casquette ajoutée par l'appli pour les rôles `moderator` et `super_admin`, et le
// mode assistance (« Survoler l'espace ») ouvre la casquette Organisateur d'une structure qui n'est pas la sienne, sans
// la mémoriser : au lancement suivant on retrouve la casquette d'avant.
import { useRouter } from "expo-router";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { type AssistedStructure, adminEntryOf } from "./adminModel";
import { kvDel, kvGet, kvSet } from "./kv";
import {
  type AppPersonaEntry,
  type BasePersona,
  baseOf,
  entryOfPersona,
  FAN_ENTRY,
  homeOf,
  isBaseKind,
  landingOf,
  otherBadges,
  type Persona,
  parsePersona,
  resolvePersona,
  serializePersona,
  tabHref,
} from "./personaModel";
import { useSession } from "./session";

const KEY = "persona";

type PersonaValue = {
  /** La casquette mémorisée est lue (avant, on ne sait pas encore où ouvrir l'appli). */
  ready: boolean;
  /** Casquette active (jamais une casquette disparue). */
  persona: Persona;
  /** La casquette de base du compte : exposant (au moins un véhicule actif) ou visiteur. */
  base: BasePersona;
  /** Les casquettes du compte, la casquette de base en premier. */
  entries: AppPersonaEntry[];
  /** La ligne de la casquette active (logo, nom). */
  active: AppPersonaEntry;
  /** Pastilles « à traiter » des autres casquettes. */
  elsewhere: number;
  /** Passe à une casquette et ouvre son premier écran (ou `to`, un écran de cette casquette : lien profond, lot 35a). */
  choose: (persona: Persona, to?: string) => void;
  /** Appui long sur le logotype : retour à la casquette de base (exposant ou visiteur), sur son Accueil. */
  backToBase: () => void;
  /**
   * Ouvre l'onglet `route` (« sorties », « profil », « explorer »…) : celui de la casquette active si sa barre l'a,
   * sinon celui de la casquette de base (on y bascule), sinon l'Accueil de la casquette active.
   */
  goTab: (route: string) => void;
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
    const list: AppPersonaEntry[] = me?.personas?.length ? [...me.personas] : [FAN_ENTRY];
    const admin = adminEntryOf(role);
    if (admin) list.push(admin);
    // Un survol ne s'ajoute que si la structure n'est pas déjà une des siennes.
    if (assisted && admin && !list.some((e) => e.kind === "organizer" && e.id === assisted.id)) {
      list.push({ kind: "organizer", id: assisted.id, label: assisted.name, logoUrl: null, badge: 0, assisted: true });
    }
    return list;
  }, [me, role, assisted]);
  const base = useMemo(() => baseOf(entries), [entries]);
  const persona = useMemo(() => resolvePersona(stored ?? null, entries), [stored, entries]);

  // Déconnexion : la casquette appartient au compte, pas à l'appareil.
  useEffect(() => {
    if (status !== "out") return;
    setStored(null);
    setAssisted(null);
    void kvDel(KEY);
  }, [status]);

  // La casquette mémorisée a disparu (ou l'exposant est devenu visiteur, et inversement) : on mémorise la casquette
  // de base, une fois les casquettes connues. La barre change sans redémarrer : la racine voit le mauvais groupe.
  useEffect(() => {
    if (status !== "in" || !me || !stored) return;
    const gone = isBaseKind(stored.kind) ? stored.kind !== base.kind : !entryOfPersona(stored, entries);
    if (gone) {
      setStored(base);
      void kvSet(KEY, serializePersona(base));
    }
  }, [status, me, stored, entries, base]);

  const choose = useCallback(
    (next: Persona, to?: string) => {
      setStored(next);
      void kvSet(KEY, serializePersona(next));
      const target = (to ?? landingOf(next)) as never;
      // Lot 35d : la navigation attend que la nouvelle casquette soit posée ; sinon la redirection « mauvais groupe »
      // de la racine voit l'ancienne casquette et renvoie vers son écran d'accueil (venant du survol d'une structure).
      // Lot 40 : toujours différée, la redirection ramenant au même onglet de la casquette active (sans attendre, le
      // Scanner du pro serait vu depuis la casquette précédente).
      setTimeout(() => router.replace(target), 0);
    },
    [router],
  );

  const goTab = useCallback(
    (route: string) => {
      const own = tabHref(persona.kind, route);
      if (own) {
        router.navigate(own as never);
        return;
      }
      const fallback = tabHref(base.kind, route);
      if (fallback) choose(base, fallback);
      else router.navigate(homeOf(persona) as never);
    },
    [persona, base, router, choose],
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
      base,
      entries,
      active: entryOfPersona(persona, entries) ?? entries[0] ?? FAN_ENTRY,
      elsewhere: otherBadges(persona, entries),
      choose,
      backToBase: () => choose(base),
      goTab,
      survey,
      leaveSurvey,
    }),
    [stored, persona, base, entries, choose, goTab, survey, leaveSurvey],
  );

  return <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>;
}

export function usePersona(): PersonaValue {
  const value = useContext(PersonaContext);
  if (!value) throw new Error("usePersona doit être utilisé dans un <PersonaProvider>.");
  return value;
}

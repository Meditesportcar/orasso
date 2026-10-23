// Garde de la casquette Organisateur (lot 22) : chaque onglet passe par ici. Rien ne s'affiche sans casquette
// Organisateur active (la redirection de la racine ramène au passionné), et rien ne se charge tant que la session n'a
// pas prouvé la double authentification : l'API refuse (`403 two_factor_required`) et l'appli explique quoi faire
// (activer la double authentification, ou se reconnecter avec son code). Les données sont celles de la structure active
// seulement : l'identifiant vient de la casquette, jamais d'un paramètre d'écran.
import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { orgaLabels } from "@orasso/shared";
import { Redirect, useRouter } from "expo-router";
import { createContext, type ReactNode, useContext } from "react";
import { StyleSheet } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { gateKind, isTwoFactorError } from "@/lib/orga";
import { usePersona } from "@/lib/persona";
import { landingOf } from "@/lib/personaModel";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, TabScreen } from "@/ui/Screens";

type OrgaValue = { structureId: string; structureName: string };
const OrgaContext = createContext<OrgaValue | null>(null);

/** La structure de la casquette active (à utiliser sous une `OrgaGate`). */
export function useOrga(): OrgaValue {
  const value = useContext(OrgaContext);
  if (!value) throw new Error("useOrga doit être utilisé sous une <OrgaGate>.");
  return value;
}

/** Que faire quand la double authentification manque : l'activer, ou se reconnecter avec son code. */
export function TwoFactorGate({ primary = true }: { primary?: boolean } = {}) {
  const { t } = useTheme();
  const router = useRouter();
  const { me, signOut } = useSession();
  const kind = gateKind(me?.twoFactorHint);
  return (
    <Plate kind="note" style={styles.gate} testID="orga-two-factor">
      <Text variant="posterM" color={t.color.plateInk}>
        {orgaLabels.gateTitle}
      </Text>
      <Text variant="body" color={t.color.plateMuted}>
        {kind === "setup" ? orgaLabels.gateSetup : orgaLabels.gateSignIn}
      </Text>
      {kind === "setup" ? (
        <>
          <Button
            variant={primary ? "primary" : "plate"}
            icon="profile"
            onPress={() => router.push("/reglages/securite")}
            fullWidth
          >
            {orgaLabels.gateOpenSecurity}
          </Button>
          <Button variant="plate" icon="back" onPress={() => void signOut()} fullWidth>
            {orgaLabels.gateSignInAgain}
          </Button>
        </>
      ) : (
        <>
          <Button variant={primary ? "primary" : "plate"} icon="back" onPress={() => void signOut()} fullWidth>
            {orgaLabels.gateSignInAgain}
          </Button>
          <Button variant="plate" icon="profile" onPress={() => router.push("/reglages/securite")} fullWidth>
            {orgaLabels.gateOpenSecurity}
          </Button>
        </>
      )}
    </Plate>
  );
}

/** Erreur d'un appel organisateur : la garde de la double authentification, ou le message de l'API. */
export function OrgaFailure({ error }: { error: unknown }) {
  if (!error) return null;
  if (isTwoFactorError(error)) return <TwoFactorGate />;
  return <Notice tone="error">{errorMessage(error)}</Notice>;
}

/**
 * Écran d'attente ou d'erreur de la garde. Lot M7 : celui d'une page masquée du groupe qui est en mode B (`page` :
 * bannissements, modèles, notes) en garde l'en-tête de fiche ; sinon le gabarit d'onglet (mode B de lui-même hors du
 * groupe d'onglets).
 */
function GateScreen({
  title,
  facts,
  page,
  children,
}: {
  title: string;
  facts?: string;
  page: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  if (!page) {
    return (
      <TabScreen title={title} facts={facts}>
        {children}
      </TabScreen>
    );
  }
  return (
    <FlowScreen
      title={title}
      facts={facts}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/(orga)/equipe"))}
    >
      {children}
    </FlowScreen>
  );
}

/**
 * `GET /me` dit « double authentification exigée » même quand l'API est réglée pour la laisser passer (développement,
 * `DEV_SKIP_2FA`) : on demande donc à l'API elle-même, par un appel léger (le résumé de la Boîte, protégé comme toutes
 * les routes de l'espace). Refus pour double authentification → l'écran qui explique quoi faire ; sinon l'espace s'ouvre.
 */
function TwoFactorProbe({ title, page, children }: { title: string; page: boolean; children: ReactNode }) {
  const { structureId, structureName } = useOrga();
  const probe = useApi(() => api.orgInboxSummary(structureId), [structureId]);
  if (isTwoFactorError(probe.error)) {
    return (
      <GateScreen title={title} facts={structureName} page={page}>
        <TwoFactorGate />
      </GateScreen>
    );
  }
  if (!probe.data && !probe.error) {
    return (
      <GateScreen title={title} facts={structureName} page={page}>
        <Muted variant="body">Chargement…</Muted>
      </GateScreen>
    );
  }
  return <>{children}</>;
}

export function OrgaGate({
  title,
  page = false,
  children,
}: {
  title: string;
  /** Lot M7 : page masquée du groupe en mode B (en-tête de fiche) : ses écrans d'attente le gardent. */
  page?: boolean;
  children: ReactNode;
}) {
  const { persona, active, ready } = usePersona();
  const { me } = useSession();
  // Hors casquette Organisateur : aucun appel, aucune donnée. Les pages sorties du groupe (orga) au lot C4a (page d'un
  // événement, assistant) échappent à la garde de la racine : on renvoie au premier écran de la casquette active,
  // jamais un écran vide (tour 2).
  if (persona.kind !== "organizer") return ready ? <Redirect href={landingOf(persona) as never} /> : null;
  if (active.kind !== "organizer" || active.id !== persona.structureId) {
    return (
      <GateScreen title={title} page={page}>
        <Notice tone="error">{orgaLabels.noStructure}</Notice>
      </GateScreen>
    );
  }
  return (
    <OrgaContext.Provider value={{ structureId: persona.structureId, structureName: active.label }}>
      {me?.twoFactorRequired ? (
        <TwoFactorProbe title={title} page={page}>
          {children}
        </TwoFactorProbe>
      ) : (
        children
      )}
    </OrgaContext.Provider>
  );
}

const { space3 } = tokens.spacing;

const styles = StyleSheet.create({
  gate: { gap: space3 },
});

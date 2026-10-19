// Garde de la casquette Organisateur (lot 22) : chaque onglet passe par ici. Rien ne s'affiche sans casquette
// Organisateur active (la redirection de la racine ramène au passionné), et rien ne se charge tant que la session n'a
// pas prouvé la double authentification : l'API refuse (`403 two_factor_required`) et l'appli explique quoi faire
// (activer la double authentification, ou se reconnecter avec son code). Les données sont celles de la structure active
// seulement : l'identifiant vient de la casquette, jamais d'un paramètre d'écran.
import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { orgaLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { createContext, type ReactNode, useContext } from "react";
import { StyleSheet } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { gateKind, isTwoFactorError } from "@/lib/orga";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";

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
 * `GET /me` dit « double authentification exigée » même quand l'API est réglée pour la laisser passer (développement,
 * `DEV_SKIP_2FA`) : on demande donc à l'API elle-même, par un appel léger (le résumé de la Boîte, protégé comme toutes
 * les routes de l'espace). Refus pour double authentification → l'écran qui explique quoi faire ; sinon l'espace s'ouvre.
 */
function TwoFactorProbe({ title, children }: { title: string; children: ReactNode }) {
  const { structureId, structureName } = useOrga();
  const probe = useApi(() => api.orgInboxSummary(structureId), [structureId]);
  if (isTwoFactorError(probe.error)) {
    return (
      <TabScreen title={title} facts={structureName}>
        <TwoFactorGate />
      </TabScreen>
    );
  }
  if (!probe.data && !probe.error) {
    return (
      <TabScreen title={title} facts={structureName}>
        <Muted variant="body">Chargement…</Muted>
      </TabScreen>
    );
  }
  return <>{children}</>;
}

export function OrgaGate({ title, children }: { title: string; children: ReactNode }) {
  const { persona, active } = usePersona();
  const { me } = useSession();
  // Hors casquette Organisateur : la racine redirige déjà, on n'affiche rien en attendant (aucun appel, aucune donnée).
  if (persona.kind !== "organizer") return null;
  if (active.kind !== "organizer" || active.id !== persona.structureId) {
    return (
      <TabScreen title={title}>
        <Notice tone="error">{orgaLabels.noStructure}</Notice>
      </TabScreen>
    );
  }
  return (
    <OrgaContext.Provider value={{ structureId: persona.structureId, structureName: active.label }}>
      {me?.twoFactorRequired ? <TwoFactorProbe title={title}>{children}</TwoFactorProbe> : children}
    </OrgaContext.Provider>
  );
}

const { space3 } = tokens.spacing;

const styles = StyleSheet.create({
  gate: { gap: space3 },
});

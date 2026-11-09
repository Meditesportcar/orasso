// « Je suis sur place » (lot R7d2, maquette R7.13) : la feuille qui valide la présence d'un visiteur par la position du
// téléphone, pendant l'événement (`live.phase = running`). Appli seulement : le site n'a pas de position fiable.
//
// LA POSITION N'EST JAMAIS GARDÉE (invariant du direct) : elle est lue, envoyée à l'API (qui la compare à la zone puis
// l'oublie) et abandonnée dans la même fonction. Ni état React, ni référence, ni stockage de l'appareil (`kv`), ni journal,
// ni rapport d'erreur : seul un résultat (validé, ou le code d'un refus) sort de `measureAndSend`. Les messages sont les
// libellés de `labels/presence.fr.ts` : l'écran ne réinvente aucun refus.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { presenceLabels as L, type PresenceRefusal } from "@orasso/shared";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { SmButton } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";

const { space2 } = tokens.spacing;

/** Une position qui ne vient pas : on rend la main plutôt qu'une attente sans fin. */
export const PRESENCE_POSITION_TIMEOUT_MS = 20_000;

/** Le résultat d'une tentative : jamais la position, seulement ce qui s'est passé. */
export type PresenceOutcome =
  | { kind: "validated" }
  | { kind: "denied" }
  | { kind: "no_position" }
  | { kind: "refused"; message: string; code: string }
  | { kind: "failed"; message: string };

/** Le refus de l'API en français : le libellé du code, sinon le message de l'API (429, 5xx, réseau). */
export function refusalMessage(error: unknown): { message: string; code: string; refusal: boolean } {
  if (error instanceof ApiRequestError) {
    const known = Object.hasOwn(L.errors, error.code) ? (L.errors as Record<string, string>)[error.code] : undefined;
    if (known) return { message: known, code: error.code, refusal: true };
    return { message: error.isNetwork ? error.message : errorMessage(error), code: error.code, refusal: false };
  }
  return { message: L.genericFailure, code: "unknown", refusal: false };
}

/**
 * Demande la permission, mesure la position et l'envoie. La position vit dans cette fonction seulement (variable locale,
 * jamais renvoyée, jamais écrite) : quand elle rend, plus rien ne la porte.
 */
export async function measureAndSend(eventId: string): Promise<PresenceOutcome> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") return { kind: "denied" };
  } catch {
    return { kind: "denied" };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("no position")), PRESENCE_POSITION_TIMEOUT_MS);
      }),
    ]);
    await api.validatePresence(eventId, {
      lat: fix.coords.latitude,
      lng: fix.coords.longitude,
      accuracyM: fix.coords.accuracy ?? null,
    });
    return { kind: "validated" };
  } catch (error) {
    // Une erreur de l'API (refus, limite, réseau) porte un code ; tout le reste est une position qui ne vient pas. Rien
    // de la position n'est dans l'erreur : on ne garde que son code.
    if (error instanceof ApiRequestError) {
      const { message, code, refusal } = refusalMessage(error);
      return refusal ? { kind: "refused", message, code } : { kind: "failed", message };
    }
    return { kind: "no_position" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type Phase = "idle" | "locating" | "validated" | "denied" | "no_position" | "refused" | "failed";

/** Les refus qu'un nouvel essai ne change pas : « Réessayer » n'a pas de sens, on ne le propose pas. */
const FINAL_REFUSALS: PresenceRefusal[] = [
  "closed",
  "use_qr",
  "scan_ticket",
  "ticket_required",
  "pay_at_entry",
  "closed_to_public",
  "already_present",
  "no_zone",
];

export function PresenceSheet({
  eventId,
  visible,
  onClose,
  onValidated,
}: {
  eventId: string;
  visible: boolean;
  onClose: () => void;
  /** Présence validée : la fiche se relit (le bouton « Votes · N ouverts » apparaît). */
  onValidated: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [final, setFinal] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (visible) {
      setPhase("idle");
      setMessage(null);
      setFinal(false);
    }
  }, [visible]);

  async function validate() {
    setPhase("locating");
    setMessage(null);
    const outcome = await measureAndSend(eventId);
    if (!mounted.current) return;
    if (outcome.kind === "validated") {
      setPhase("validated");
      onValidated();
    } else if (outcome.kind === "denied") {
      setPhase("denied");
      setMessage(L.permissionDenied);
    } else if (outcome.kind === "no_position") {
      setPhase("no_position");
      setMessage(L.locationFailed);
    } else if (outcome.kind === "refused") {
      setPhase("refused");
      setMessage(outcome.message);
      setFinal(FINAL_REFUSALS.includes(outcome.code as PresenceRefusal));
    } else {
      setPhase("failed");
      setMessage(outcome.message);
    }
  }

  const locating = phase === "locating";
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={L.sheetTitle}>
      <View style={styles.stack} testID="presence-sheet">
        <Text variant="posterM" color={c.ink} style={styles.title}>
          {L.sheetTitle}
        </Text>
        {phase === "validated" ? (
          <>
            <Text variant="bodyStrong" color={c.ink} testID="presence-validated">
              {L.validated}
            </Text>
            <Text variant="caption" color={c.inkMuted}>
              {L.stampPlaced}
            </Text>
            <SmButton kind="s" big wide icon="check" onPress={onClose} testID="presence-close">
              {L.sheetClose}
            </SmButton>
          </>
        ) : (
          <>
            <Text variant="body" color={c.inkMuted} testID="presence-explain">
              {L.explain}
            </Text>
            {message ? (
              <Text variant="bodyStrong" color={c.winText} accessibilityRole="alert" testID="presence-error">
                {message}
              </Text>
            ) : null}
            {phase === "denied" ? (
              <SmButton
                kind="s"
                big
                wide
                icon="gear"
                onPress={() => void Linking.openSettings().catch(() => undefined)}
                testID="presence-settings"
              >
                {L.openSettings}
              </SmButton>
            ) : null}
            {final ? null : (
              <SmButton
                kind="p"
                big
                wide
                icon="target"
                disabled={locating}
                onPress={() => void validate()}
                testID="presence-validate"
              >
                {locating ? L.sheetLocating : phase === "idle" ? L.sheetAction : L.sheetRetry}
              </SmButton>
            )}
            {final ? (
              <SmButton kind="s" big wide icon="close" onPress={onClose} testID="presence-close">
                {L.sheetClose}
              </SmButton>
            ) : null}
          </>
        )}
      </View>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space2 + 4 },
  title: { fontSize: 18, lineHeight: 19 },
});

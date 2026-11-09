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
import { ApiRequestError, getSessionToken } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";

import { type AttemptGuard, attemptGuard } from "./presenceGuard";
import { approximateOnly } from "./presencePermission";
import { refusalMeansPresent, refusalMessage } from "./presenceRefusal";

export { refusalMessage };

const { space2 } = tokens.spacing;

/** Une position qui ne vient pas : on rend la main plutôt qu'une attente sans fin. */
export const PRESENCE_POSITION_TIMEOUT_MS = 20_000;

/** Le résultat d'une tentative : jamais la position, seulement ce qui s'est passé. */
export type PresenceOutcome =
  | { kind: "validated"; canVote: boolean; stampPlaced: boolean }
  | { kind: "cancelled" }
  | { kind: "denied" }
  | { kind: "approximate" }
  | { kind: "no_position" }
  | { kind: "refused"; message: string; code: string }
  | { kind: "failed"; message: string };

/**
 * Demande la permission, mesure la position et l'envoie. La position vit dans cette fonction seulement (variable locale,
 * jamais renvoyée, jamais écrite) : quand elle rend, plus rien ne la porte.
 */
export async function measureAndSend(eventId: string, guard: AttemptGuard): Promise<PresenceOutcome> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") return { kind: "denied" };
    // Position approximative seulement : trop floue pour prouver quoi que ce soit, on ne mesure rien.
    if (approximateOnly(permission)) return { kind: "approximate" };
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
    // Tour 2 : la session est revérifiée juste avant l'envoi (une autre personne s'est peut-être connectée pendant la
    // mesure) ; feuille fermée ou démontée : rien ne part.
    if (!guard.valid()) return { kind: "cancelled" };
    const result = await api.validatePresence(eventId, {
      lat: fix.coords.latitude,
      lng: fix.coords.longitude,
      accuracyM: fix.coords.accuracy ?? null,
    });
    return { kind: "validated", canVote: result.canVote, stampPlaced: Boolean(result.stampId) };
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

type Phase = "idle" | "locating" | "validated" | "denied" | "approximate" | "no_position" | "refused" | "failed";

/**
 * Les refus qu'un nouvel essai ne change pas : « Réessayer » n'a pas de sens, on ne le propose pas. `closed` n'en fait
 * pas partie : entre deux jours, la personne peut réessayer à l'ouverture suivante.
 */
const FINAL_REFUSALS: PresenceRefusal[] = [
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
  const [voteOk, setVoteOk] = useState(true);
  const [stamped, setStamped] = useState(true);
  const mounted = useRef(true);
  const attempt = useRef<AttemptGuard | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      attempt.current?.cancel();
    };
  }, []);
  useEffect(() => {
    // Feuille fermée : la tentative en cours ne partira plus.
    if (!visible) attempt.current?.cancel();
    if (visible) {
      setPhase("idle");
      setMessage(null);
      setFinal(false);
    }
  }, [visible]);

  async function validate() {
    setPhase("locating");
    setMessage(null);
    attempt.current?.cancel();
    const guard = attemptGuard(getSessionToken);
    attempt.current = guard;
    const outcome = await measureAndSend(eventId, guard);
    if (!mounted.current) return;
    if (outcome.kind === "cancelled") {
      // Tentative annulée (session changée, feuille fermée) : si c'est encore la tentative courante, retour à l'état
      // initial (jamais bloqué sur « Position en cours… »). Une ancienne tentative ne touche pas à la nouvelle.
      if (attempt.current === guard) setPhase("idle");
      return;
    }
    if (outcome.kind === "validated") {
      setPhase("validated");
      setVoteOk(outcome.canVote);
      setStamped(outcome.stampPlaced);
      onValidated();
    } else if (outcome.kind === "denied") {
      setPhase("denied");
      setMessage(L.permissionDenied);
    } else if (outcome.kind === "approximate") {
      setPhase("approximate");
      setMessage(L.permissionApproximate);
    } else if (outcome.kind === "no_position") {
      setPhase("no_position");
      setMessage(L.locationFailed);
    } else if (outcome.kind === "refused") {
      setPhase("refused");
      setMessage(outcome.message);
      setFinal(FINAL_REFUSALS.includes(outcome.code as PresenceRefusal));
      // Réponse perdue puis nouvel essai : le serveur a déjà la présence, la fiche se relit pour montrer l'état « présent ».
      if (refusalMeansPresent(outcome.code)) onValidated();
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
              {voteOk ? L.validated : L.validatedNoVote}
            </Text>
            {stamped ? (
              <Text variant="caption" color={c.inkMuted}>
                {L.stampPlaced}
              </Text>
            ) : null}
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
            {phase === "denied" || phase === "approximate" ? (
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

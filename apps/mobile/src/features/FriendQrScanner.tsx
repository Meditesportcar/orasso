// Scanner le QR de compte d'un ami (lot 17) : la caméra lit le QR dynamique de l'autre (`OA1…`), l'API vérifie le code
// (fenêtre d'une minute, jamais présenté deux fois) et envoie la demande d'ami. Résultat : « Demande envoyée à <pseudo> ».
import { Button, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { socialLabels } from "@orasso/shared";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

const { space2, space3 } = tokens.spacing;

/** Un même QR lu plusieurs fois par la caméra n'est envoyé qu'une fois dans cet intervalle (ms). */
const REPEAT_MS = 4_000;

type Outcome = { state: "ok"; text: string } | { state: "refused"; text: string };

export function FriendQrScanner({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { t } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const seen = useRef<{ payload: string; at: number } | null>(null);

  useEffect(() => {
    if (!visible) {
      setOutcome(null);
      seen.current = null;
    }
  }, [visible]);

  const handle = useCallback(
    async (raw: string) => {
      const payload = raw.trim();
      if (!payload) return;
      const last = seen.current;
      if (last && last.payload === payload && Date.now() - last.at < REPEAT_MS) return;
      seen.current = { payload, at: Date.now() };
      setBusy(true);
      try {
        const result = await api.requestFriendByQr(payload);
        setOutcome({
          state: "ok",
          text:
            result.status === "accepted"
              ? `Vous êtes amis avec ${result.pseudo}.`
              : socialLabels.requestSentTo(result.pseudo),
        });
        onDone?.();
      } catch (e) {
        setOutcome({ state: "refused", text: errorMessage(e) });
      } finally {
        setBusy(false);
      }
    },
    [onDone],
  );

  // Recette seulement (pas de caméra dans le navigateur de test) : injection d'une charge utile.
  useEffect(() => {
    if (!__DEV__) return;
    const g = globalThis as { __orassoFriendScan?: (p: string) => void };
    g.__orassoFriendScan = (payload) => void handle(payload);
    return () => {
      g.__orassoFriendScan = undefined;
    };
  }, [handle]);

  const cameraOk = permission?.granted && Platform.OS !== "web";
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={socialLabels.scanFriend}>
      <Text variant="title" color={t.color.ink}>
        {socialLabels.scanFriend}
      </Text>
      <Muted variant="caption">{socialLabels.scanFriendHint}</Muted>
      <View style={[styles.camera, { backgroundColor: t.color.night, borderRadius: tokens.radius.radiusLg }]}>
        {cameraOk && visible ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => void handle(data)}
          />
        ) : null}
        <View pointerEvents="none" style={styles.aim}>
          <Text variant="label" color={t.color.nightInk} style={styles.center}>
            {cameraOk
              ? busy
                ? "Vérification…"
                : "Caméra ouverte · vise le QR de compte"
              : Platform.OS === "web"
                ? "Pas de caméra dans le navigateur"
                : "Caméra non autorisée"}
          </Text>
        </View>
        {!cameraOk && Platform.OS !== "web" ? (
          <View style={styles.permission}>
            <Button variant="plate" icon="qr" onPress={() => void requestPermission()}>
              Autoriser la caméra
            </Button>
          </View>
        ) : null}
      </View>
      {outcome ? (
        <View
          testID="friend-scan-result"
          accessibilityLabel={outcome.state === "ok" ? "Demande envoyée" : "Scan refusé"}
        >
          <Notice tone={outcome.state === "ok" ? "info" : "error"}>{outcome.text}</Notice>
        </View>
      ) : null}
      {__DEV__ ? <DevInject onInject={(p) => void handle(p)} busy={busy} /> : null}
      <Button variant="secondary" icon="close" onPress={onClose} fullWidth>
        Fermer
      </Button>
    </AppSheet>
  );
}

/** Recette (développement seulement) : simule la lecture d'un QR de compte, faute de caméra dans le navigateur. */
function DevInject({ onInject, busy }: { onInject: (payload: string) => void; busy: boolean }) {
  const [text, setText] = useState("");
  return (
    <TextField
      label={`Recette · charge utile${busy ? " · vérification…" : ""}`}
      value={text}
      onChangeText={setText}
      autoCapitalize="none"
      autoCorrect={false}
      onSubmitEditing={() => onInject(text)}
    />
  );
}

const styles = StyleSheet.create({
  camera: { height: 240, overflow: "hidden", justifyContent: "flex-end" },
  aim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: space3,
  },
  center: { textAlign: "center" },
  permission: { position: "absolute", top: space3, left: space3, right: space3 },
  spacing: { gap: space2 },
});
